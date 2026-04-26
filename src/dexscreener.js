const axios = require('axios');
const proxyManager = require('./proxyManager');

const BASE_URL = 'https://api.dexscreener.com';

// Rate limiting and throttling
const RATE_LIMIT_DELAY_MS = 1000; // 1 request per second to be safe
let lastCallTime = 0;
let throttleQueue = Promise.resolve();

// Removed individual proxy logging as it's now handled by ProxyManager

/**
 * Throttle requests to respect DexScreener rate limits
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
        }).catch(() => resolve());
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
        }

        return await axios.get(url, options);
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;

        // Handle 429 Rate Limit
        if (status === 429 && retries > 0) {
            // Check for retry-after in headers or response data (Cloudflare error 1015 provides it in data)
            const retryAfterSec = parseInt(error.response.headers['retry-after']) || data?.retry_after || 0;
            const waitTime = retryAfterSec > 0 ? (retryAfterSec * 1000) + 1000 : backoff;

            console.warn(`[DexScreener] ⚠️ Rate limited (429). Waiting ${waitTime / 1000}s before retry... (${retries} retries left)`);

            await new Promise(resolve => setTimeout(resolve, waitTime));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }

        // FALLBACK: If proxy fails (network error), retry WITHOUT proxy
        if (!status && options.httpsAgent) {
            console.warn(`[DexScreener] 🌐 Proxy failed (${error.message}), retrying WITHOUT proxy...`);
            const optionsNoProxy = { ...options };
            delete optionsNoProxy.httpsAgent;
            return fetchWithRetry(url, optionsNoProxy, retries, backoff);
        }

        throw error;
    }
}

/**
 * Fetches token data from DexScreener API
 * @param {string} chainId - The blockchain chain ID (e.g., 'solana', 'ethereum', 'bsc')
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object|null>} Token data or null if not found
 */
async function getTokenData(chainId, tokenAddress) {
    try {
        const url = `${BASE_URL}/tokens/v1/${chainId}/${tokenAddress}`;
        const response = await fetchWithRetry(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.data && response.data.length > 0) {
            // Get the pair with highest liquidity
            const pairs = response.data;
            const bestPair = pairs.reduce((best, current) => {
                const currentLiquidity = current.liquidity?.usd || 0;
                const bestLiquidity = best.liquidity?.usd || 0;
                return currentLiquidity > bestLiquidity ? current : best;
            }, pairs[0]);

            return {
                name: bestPair.baseToken?.name || 'Unknown',
                symbol: bestPair.baseToken?.symbol || 'UNKNOWN',
                priceUsd: parseFloat(bestPair.priceUsd) || 0,
                marketCap: bestPair.marketCap || bestPair.fdv || 0,
                liquidity: bestPair.liquidity?.usd || 0,
                priceChange24h: bestPair.priceChange?.h24 || 0,
                dexId: bestPair.dexId || 'unknown',
                pairAddress: bestPair.pairAddress || '',
                url: bestPair.url || `https://dexscreener.com/${chainId}/${tokenAddress}`
            };
        }

        return null;
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error(`[DexScreener] Error fetching token data for ${chainId}/${tokenAddress}:`, {
            message: error.message,
            status,
            data,
            url: `${BASE_URL}/tokens/v1/${chainId}/${tokenAddress}`
        });
        return null;
    }
}

/**
 * Fetches data for multiple tokens at once (up to 30)
 * @param {string} chainId - The blockchain chain ID
 * @param {string[]} tokenAddresses - Array of token addresses
 * @returns {Promise<Map<string, Object>>} Map of address to token data
 */
async function getMultipleTokensData(chainId, tokenAddresses) {
    const results = new Map();

    // DexScreener allows up to 30 addresses per request
    const batchSize = 30;

    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
        const batch = tokenAddresses.slice(i, i + batchSize);
        const addressList = batch.join(',');

        try {
            const url = `${BASE_URL}/tokens/v1/${chainId}/${addressList}`.trim();
            const response = await fetchWithRetry(url, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.data && response.data.length > 0) {
                // Group pairs by base token address
                const pairsByToken = new Map();

                for (const pair of response.data) {
                    const addr = pair.baseToken?.address?.toLowerCase();
                    if (addr) {
                        if (!pairsByToken.has(addr)) {
                            pairsByToken.set(addr, []);
                        }
                        pairsByToken.get(addr).push(pair);
                    }
                }

                // Get best pair for each token
                for (const [addr, pairs] of pairsByToken) {
                    const bestPair = pairs.reduce((best, current) => {
                        const currentLiquidity = current.liquidity?.usd || 0;
                        const bestLiquidity = best.liquidity?.usd || 0;
                        return currentLiquidity > bestLiquidity ? current : best;
                    }, pairs[0]);

                    results.set(addr, {
                        name: bestPair.baseToken?.name || 'Unknown',
                        symbol: bestPair.baseToken?.symbol || 'UNKNOWN',
                        priceUsd: parseFloat(bestPair.priceUsd) || 0,
                        marketCap: bestPair.marketCap || bestPair.fdv || 0,
                        liquidity: bestPair.liquidity?.usd || 0,
                        priceChange24h: bestPair.priceChange?.h24 || 0,
                        dexId: bestPair.dexId || 'unknown',
                        pairAddress: bestPair.pairAddress || '',
                        url: bestPair.url || `https://dexscreener.com/${chainId}/${addr}`
                    });
                }
            }
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            console.error(`[DexScreener] Error fetching batch token data for ${chainId}:`, {
                message: error.message,
                status,
                data,
                url: `${BASE_URL}/tokens/v1/${chainId}/${addressList}`
            });
        }

        // Small delay between batches to respect rate limits
        if (i + batchSize < tokenAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    return results;
}

/**
 * Searches for tokens by name or symbol
 * @param {string} query - Search query (name, symbol, or address)
 * @returns {Promise<Array>} Array of matching pairs
 */
async function searchTokens(query) {
    try {
        const url = `${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`;
        const response = await fetchWithRetry(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.data && response.data.pairs) {
            return response.data.pairs.slice(0, 10).map(pair => ({
                name: pair.baseToken?.name || 'Unknown',
                symbol: pair.baseToken?.symbol || 'UNKNOWN',
                address: pair.baseToken?.address || '',
                chainId: pair.chainId || '',
                priceUsd: parseFloat(pair.priceUsd) || 0,
                marketCap: pair.marketCap || pair.fdv || 0,
                url: pair.url || '',
                createdAt: pair.pairCreatedAt || 0
            }));
        }

        return [];
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error(`[DexScreener] Error searching tokens for "${query}":`, {
            message: error.message,
            status,
            data,
            url: `${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`
        });
        return [];
    }
}

/**
 * Formats a number as a readable price
 * @param {number} price - The price to format
 * @returns {string} Formatted price string
 */
function formatPrice(price) {
    if (price === 0) return '$0.00';
    if (price < 0.00000001) return `$${price.toExponential(4)}`;
    if (price < 0.0001) return `$${price.toFixed(10).replace(/\.?0+$/, '')}`;
    if (price < 1) return `$${price.toFixed(6).replace(/\.?0+$/, '')}`;
    if (price < 1000) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats market cap in a readable format
 * @param {number} marketCap - The market cap value
 * @returns {string} Formatted market cap string
 */
function formatMarketCap(marketCap) {
    if (!marketCap || marketCap === 0) return 'N/A';
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(2)}K`;
    return `$${marketCap.toFixed(2)}`;
}

module.exports = {
    getTokenData,
    getMultipleTokensData,
    searchTokens,
    formatPrice,
    formatMarketCap
};
