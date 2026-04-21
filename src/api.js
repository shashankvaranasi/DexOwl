const express = require('express');
const watchlist = require('./watchlist');
const dexscreener = require('./dexscreener');
const geckoterminal = require('./geckoterminal');

const router = express.Router();

// Track app start time for uptime
const startTime = Date.now();

/**
 * GET /api/stats
 * Returns bot statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const allTokens = await watchlist.getAllWatchlist();

        // Count unique chat IDs
        const uniqueChats = new Set(allTokens.map(t => t.chatId));

        res.json({
            uptime: Math.floor((Date.now() - startTime) / 1000),
            totalTokens: allTokens.length,
            activeUsers: uniqueChats.size,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/watchlist
 * Returns all tokens with current prices
 */
router.get('/watchlist', async (req, res) => {
    try {
        const allTokens = await watchlist.getAllWatchlist();

        if (allTokens.length === 0) {
            return res.json([]);
        }

        // Group by chain for batch API calls
        const entriesByChain = new Map();
        for (const entry of allTokens) {
            if (!entriesByChain.has(entry.chainId)) {
                entriesByChain.set(entry.chainId, []);
            }
            entriesByChain.get(entry.chainId).push(entry);
        }

        // Fetch current prices for all tokens
        const enrichedTokens = [];

        for (const [chainId, entries] of entriesByChain) {
            const addresses = entries.map(e => e.tokenAddress);
            let tokenDataMap = await dexscreener.getMultipleTokensData(chainId, addresses);

            // Fallback to GeckoTerminal for missing tokens
            const missingAddresses = addresses.filter(addr => !tokenDataMap.has(addr.toLowerCase()));
            if (missingAddresses.length > 0) {
                try {
                    const fallbackDataMap = await geckoterminal.getMultipleTokensData(chainId, missingAddresses);
                    for (const [addr, data] of fallbackDataMap.entries()) {
                        tokenDataMap.set(addr, data);
                    }
                } catch (error) {
                    console.error('API /watchlist Fallback to GeckoTerminal failed:', error.message);
                }
            }

            for (const entry of entries) {
                const tokenData = tokenDataMap.get(entry.tokenAddress.toLowerCase());

                // Only expose non-sensitive token data (no chatId, thresholds, or user-specific prices)
                enrichedTokens.push({
                    tokenAddress: entry.tokenAddress,
                    chainId: entry.chainId,
                    name: entry.name,
                    symbol: entry.symbol,
                    addedAt: entry.addedAt,
                    currentPrice: tokenData?.priceUsd || null,
                    marketCap: tokenData?.marketCap || null,
                    liquidity: tokenData?.liquidity || null,
                    priceChange24h: tokenData?.priceChange24h || null,
                    dexUrl: tokenData?.url || `https://dexscreener.com/${entry.chainId}/${entry.tokenAddress}`
                });
            }
        }

        res.json(enrichedTokens);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/tokens/:chainId/:address
 * Returns single token data
 */
router.get('/tokens/:chainId/:address', async (req, res) => {
    try {
        const { chainId, address } = req.params;
        let tokenData = await dexscreener.getTokenData(chainId, address);

        if (!tokenData) {
            // Fallback to GeckoTerminal
            tokenData = await geckoterminal.getTokenData(chainId, address);
        }

        if (!tokenData) {
            return res.status(404).json({ error: 'Token not found' });
        }

        res.json(tokenData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
