const axios = require('axios');
const proxyManager = require('./proxyManager');

const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const RATE_LIMIT_DELAY_MS = 2000; // gecko terminal free limit is 30 calls / min. 1 call per 2 seconds is safe.
let lastCallTime = 0;
let throttleQueue = Promise.resolve();

// Removed individual proxy logging as it's now handled by ProxyManager

/**
 * Throttle requests to respect the rate limit of 30 calls/min (1 every 2s)
 * Uses a promise queue to properly serialize concurrent requests
 */
async function throttle() {
    return new Promise(resolve => {
        throttleQueue = throttleQueue.then(async () => {
            const now = Date.now();
            const timeSinceLastCall = now - lastCallTime;

            if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
                await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS - timeSinceLastCall));
            }

            lastCallTime = Date.now();
            resolve();
        }).catch(() => resolve()); // Ensure queue never gets stuck
    });
}

/**
 * Helper to fetch with retry and exponential backoff
 */
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 2000) {
    try {
        await throttle();

        // Add rotating proxy agent if enabled
        const agent = proxyManager.getNextAgent();
        if (agent) {
            options.httpsAgent = agent;
            options.proxy = false;
        } else {
            delete options.httpsAgent;
        }

        return await axios.get(url, options);
    } catch (error) {
        const status = error.response?.status;

        // Handle 429 Rate Limit
        if (status === 429 && retries > 0) {
            console.warn(`[GeckoTerminal] ⚠️ Rate limited (429). Waiting ${backoff / 1000}s before retry... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }

        // FALLBACK: If proxy fails (network error), retry WITHOUT proxy
        if (!status && options.httpsAgent) {
            console.warn(`[GeckoTerminal] 🌐 Proxy failed (${error.message}), retrying WITHOUT proxy...`);
            const optionsNoProxy = { ...options };
            delete optionsNoProxy.httpsAgent;
            return fetchWithRetry(url, optionsNoProxy, retries, backoff);
        }

        throw error;
    }
}
function mapChainId(chainId) {
    const chainMap = {
        'solana': 'solana',
        'ethereum': 'eth',
        'bsc': 'bsc',
        'polygon': 'polygon_pos',
        'arbitrum': 'arbitrum',
        'optimism': 'optimism',
        'base': 'base',
        'avalanche': 'avax'
    };
    return chainMap[chainId.toLowerCase()] || chainId.toLowerCase();
}

/**
 * Fetches token data from GeckoTerminal API
 * @param {string} chainId - The blockchain chain ID (e.g., 'solana', 'ethereum', 'bsc')
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object|null>} Token data or null if not found
 */
async function getTokenData(chainId, tokenAddress) {
    try {
        const network = mapChainId(chainId);
        const url = `${BASE_URL}/networks/${network}/tokens/${tokenAddress}/pools?page=1`;

        const response = await fetchWithRetry(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const pools = response.data.data;

            // Get the pool with highest liquidity
            const bestPool = pools.reduce((best, current) => {
                const currentLiquidity = parseFloat(current.attributes?.reserve_in_usd) || 0;
                const bestLiquidity = parseFloat(best.attributes?.reserve_in_usd) || 0;
                return currentLiquidity > bestLiquidity ? current : best;
            }, pools[0]);

            const attrs = bestPool.attributes;
            const tokenSymbol = attrs.name ? attrs.name.split('/')[0].trim() : 'UNKNOWN';

            return {
                name: attrs.name || 'Unknown',
                symbol: tokenSymbol,
                priceUsd: parseFloat(attrs.base_token_price_usd) || 0,
                marketCap: parseFloat(attrs.market_cap_usd || attrs.fdv_usd) || 0,
                liquidity: parseFloat(attrs.reserve_in_usd) || 0,
                priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
                dexId: bestPool.relationships?.dex?.data?.id || 'unknown',
                pairAddress: attrs.address || '',
                url: `https://geckoterminal.com/${network}/pools/${attrs.address}`
            };
        }

        return null;
    } catch (error) {
        console.error(`[GeckoTerminal] Error fetching token data for ${chainId}/${tokenAddress}:`, error.message);
        return null;
    }
}

/**
 * Fetches data for multiple tokens at once (up to 30)
 * gecko token endpoint supports up to 30 addresses like: /networks/{network}/tokens/multi/{addresses}
 * but that doesn't return liquidity and price change as easily, so we fallback to sequential or batch pools if needed.
 * For simplicity and exact matching, we can use multi endpoint to get prices, or fetch pools sequentially.
 * Let's try the multi endpoint.
 * @param {string} chainId - The blockchain chain ID
 * @param {string[]} tokenAddresses - Array of token addresses
 * @returns {Promise<Map<string, Object>>} Map of address to token data
 */
async function getMultipleTokensData(chainId, tokenAddresses) {
    const results = new Map();
    const network = mapChainId(chainId);

    // GeckoTerminal allows up to 30 addresses per request on the multi tokens endpoint
    const batchSize = 30;

    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
        const batch = tokenAddresses.slice(i, i + batchSize);
        const addressList = batch.join(',');

        try {
            const url = `${BASE_URL}/networks/${network}/tokens/multi/${addressList}`;
            const response = await fetchWithRetry(url, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.data && response.data.data) {
                for (const token of response.data.data) {
                    const addr = token.attributes?.address?.toLowerCase();
                    const attrs = token.attributes;

                    if (addr && attrs) {
                        results.set(addr, {
                            name: attrs.name || 'Unknown',
                            symbol: attrs.symbol || 'UNKNOWN',
                            priceUsd: parseFloat(attrs.price_usd) || 0,
                            marketCap: parseFloat(attrs.total_reserve_in_usd) || parseFloat(attrs.fdv_usd) || 0, // Approx
                            liquidity: parseFloat(attrs.total_reserve_in_usd) || 0, // total_reserve is often close to liquidity
                            priceChange24h: 0, // The multi token endpoint might lack 24h change, but it's okay for fallback
                            dexId: 'unknown',
                            pairAddress: '',
                            url: `https://geckoterminal.com/${network}/tokens/${addr}`
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`[GeckoTerminal] Error fetching batch token data:`, error.message);
        }
    }

    return results;
}

module.exports = {
    getTokenData,
    getMultipleTokensData
};
