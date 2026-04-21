const axios = require('axios');

const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const RATE_LIMIT_DELAY_MS = 2000; // gecko terminal free limit is 30 calls / min. 1 call per 2 seconds is safe.
let lastCallTime = 0;

/**
 * Throttle requests to respect the rate limit
 */
async function throttle() {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS - timeSinceLastCall));
    }
    lastCallTime = Date.now();
}

/**
 * Maps DexScreener chain IDs to GeckoTerminal network IDs
 */
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
        await throttle();
        const network = mapChainId(chainId);
        const url = `${BASE_URL}/networks/${network}/tokens/${tokenAddress}/pools?page=1`;
        
        const response = await axios.get(url, {
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
            await throttle();
            const url = `${BASE_URL}/networks/${network}/tokens/multi/${addressList}`;
            const response = await axios.get(url, {
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
