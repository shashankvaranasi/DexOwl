/**
 * Shared processing functions for bot commands
 * Used by both direct and interactive command handlers
 */

const dexscreener = require('../dexscreener');
const watchlistManager = require('../watchlist');
const { escapeMarkdown, formatAge } = require('./utils');
const analytics = require('../analytics');

let bot = null;

/**
 * Sets the bot instance for processors to use
 * @param {TelegramBot} botInstance 
 */
function setBot(botInstance) {
    bot = botInstance;
}

/**
 * Process adding a token to watchlist
 */
async function processAdd(chatId, chainId, tokenAddress, threshold) {
    await bot.sendMessage(chatId, '🔍 Fetching token data...');

    const tokenData = await dexscreener.getTokenData(chainId, tokenAddress);

    if (!tokenData) {
        await bot.sendMessage(chatId, '❌ Token not found. Please check the chain and address.');
        return;
    }

    const entry = await watchlistManager.addToWatchlist({
        tokenAddress,
        chainId,
        name: tokenData.name,
        symbol: tokenData.symbol,
        currentPrice: tokenData.priceUsd,
        dropThreshold: threshold,
        chatId: String(chatId)
    });

    if (!entry) {
        await bot.sendMessage(chatId, '⚠️ This token is already in your watchlist.');
        return;
    }

    const priceFormatted = dexscreener.formatPrice(tokenData.priceUsd);
    const marketCapFormatted = dexscreener.formatMarketCap(tokenData.marketCap);

    const successMessage = `
✅ *Token Added to Watchlist!*

📌 *${escapeMarkdown(tokenData.name)}* ($${escapeMarkdown(tokenData.symbol)})
💰 Current Price: ${escapeMarkdown(priceFormatted)}
📊 Market Cap: ${escapeMarkdown(marketCapFormatted)}
⚡ Alert Threshold: ${threshold}%

🔗 Chain: ${escapeMarkdown(chainId)}

You'll be notified when price drops by ${threshold}% or more.
`.trim();

    await bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

    // Update analytics
    await analytics.incrementUserMetric(chatId, 'requestsMade');
    const userWatchlist = await watchlistManager.getWatchlistForChat(String(chatId));
    await analytics.updateUserTokenCount(chatId, userWatchlist.length);
}

/**
 * Process removing a token from watchlist
 */
async function processRemove(chatId, chainId, tokenAddress) {
    const removed = await watchlistManager.removeFromWatchlist(tokenAddress, chainId, String(chatId));

    if (removed) {
        await bot.sendMessage(chatId, '✅ Token removed from your watchlist.');
        
        // Update analytics
        const userWatchlist = await watchlistManager.getWatchlistForChat(String(chatId));
        await analytics.updateUserTokenCount(chatId, userWatchlist.length);
    } else {
        await bot.sendMessage(chatId, '❌ Token not found in your watchlist.');
    }
}

/**
 * Process getting token price
 */
async function processPrice(chatId, chainId, tokenAddress) {
    await bot.sendMessage(chatId, '🔍 Fetching price data...');

    const tokenData = await dexscreener.getTokenData(chainId, tokenAddress);

    if (!tokenData) {
        await bot.sendMessage(chatId, '❌ Token not found. Please check the chain and address.');
        return;
    }

    const priceFormatted = dexscreener.formatPrice(tokenData.priceUsd);
    const marketCapFormatted = dexscreener.formatMarketCap(tokenData.marketCap);
    const liquidityFormatted = dexscreener.formatMarketCap(tokenData.liquidity);

    const priceMessage = `
💎 *${escapeMarkdown(tokenData.name)}* ($${escapeMarkdown(tokenData.symbol)})

💰 *Price:* ${escapeMarkdown(priceFormatted)}
📊 *Market Cap:* ${escapeMarkdown(marketCapFormatted)}
💧 *Liquidity:* ${escapeMarkdown(liquidityFormatted)}
📈 *24h Change:* ${tokenData.priceChange24h > 0 ? '+' : ''}${tokenData.priceChange24h.toFixed(2)}%

🔗 Chain: ${escapeMarkdown(chainId)}
🏦 DEX: ${escapeMarkdown(tokenData.dexId)}

[View on DexScreener](${tokenData.url})
`.trim();

    await bot.sendMessage(chatId, priceMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    });

    // Log request for analytics
    await analytics.incrementUserMetric(chatId, 'requestsMade');
}

/**
 * Process searching for tokens
 */
async function processSearch(chatId, query) {
    await bot.sendMessage(chatId, '🔍 Searching...');

    const results = await dexscreener.searchTokens(query);

    if (results.length === 0) {
        await bot.sendMessage(chatId, '❌ No tokens found matching your query.');
        return;
    }

    let message = `🔎 *Search Results for "${escapeMarkdown(query)}"*\n\n`;

    for (const token of results) {
        const priceFormatted = dexscreener.formatPrice(token.priceUsd);
        const marketCapFormatted = dexscreener.formatMarketCap(token.marketCap);
        const age = formatAge(token.createdAt);

        message += `*${escapeMarkdown(token.name)}* ($${escapeMarkdown(token.symbol)})\n`;
        message += `💰 ${escapeMarkdown(priceFormatted)} | 📊 ${escapeMarkdown(marketCapFormatted)}\n`;
        message += `⏳ Age: ${age} | 🔗 ${escapeMarkdown(token.chainId)}\n`;
        message += `📝 \`${token.address}\`\n\n`;
    }

    message += `Use \`/add <chain> <address>\` to add a token.`;

    await bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });

    // Log request for analytics
    await analytics.incrementUserMetric(chatId, 'requestsMade');
}

/**
 * Process updating threshold
 */
async function processThreshold(chatId, chainId, tokenAddress, newThreshold) {
    const updated = await watchlistManager.updateThreshold(tokenAddress, chainId, String(chatId), newThreshold);

    if (updated) {
        await bot.sendMessage(chatId, `✅ Alert threshold updated to ${newThreshold}%`);
    } else {
        await bot.sendMessage(chatId, '❌ Token not found in your watchlist.');
    }
}

module.exports = {
    setBot,
    processAdd,
    processRemove,
    processPrice,
    processSearch,
    processThreshold
};
