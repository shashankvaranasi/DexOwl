const dexscreener = require('./dexscreener');
const watchlist = require('./watchlist');

let monitorInterval = null;
let bot = null;

/**
 * Initializes the price monitor
 * @param {Object} telegramBot - The Telegram bot instance
 * @param {number} intervalMs - Check interval in milliseconds
 */
function startMonitor(telegramBot, intervalMs = 60000) {
    bot = telegramBot;

    if (monitorInterval) {
        clearInterval(monitorInterval);
    }

    console.log(`📊 Price monitor started (checking every ${intervalMs / 1000}s)`);

    // Initial check after a short delay
    setTimeout(() => checkPrices(), 5000);

    // Regular interval checks
    monitorInterval = setInterval(() => checkPrices(), intervalMs);
}

/**
 * Stops the price monitor
 */
function stopMonitor() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('📊 Price monitor stopped');
    }
}

/**
 * Checks prices for all tokens in the watchlist
 */
async function checkPrices() {
    const allEntries = await watchlist.getAllWatchlist();

    if (allEntries.length === 0) {
        return;
    }

    console.log(`🔍 Checking prices for ${allEntries.length} token(s)...`);

    // Group entries by chain for batch fetching
    const entriesByChain = new Map();
    for (const entry of allEntries) {
        if (!entriesByChain.has(entry.chainId)) {
            entriesByChain.set(entry.chainId, []);
        }
        entriesByChain.get(entry.chainId).push(entry);
    }

    // Process each chain
    for (const [chainId, entries] of entriesByChain) {
        const addresses = entries.map(e => e.tokenAddress);
        const tokenDataMap = await dexscreener.getMultipleTokensData(chainId, addresses);

        for (const entry of entries) {
            const tokenData = tokenDataMap.get(entry.tokenAddress.toLowerCase());

            if (!tokenData) {
                console.log(`⚠️ No data for ${entry.symbol} (${entry.chainId})`);
                continue;
            }

            const currentPrice = tokenData.priceUsd;
            const lastAlertPrice = entry.lastAlertPrice;

            if (lastAlertPrice <= 0 || currentPrice <= 0) {
                continue;
            }

            // Calculate percentage change from last alert price
            const percentChange = ((currentPrice - lastAlertPrice) / lastAlertPrice) * 100;
            const absChange = Math.abs(percentChange);

            // Check if price changed by threshold or more (up OR down)
            if (absChange >= entry.dropThreshold) {
                const direction = percentChange > 0 ? 'up' : 'down';
                const emoji = percentChange > 0 ? '🟢' : '🔴';
                console.log(`${emoji} Price ${direction} detected for ${entry.symbol}: ${percentChange.toFixed(2)}%`);

                // Send alert
                await sendPriceAlert(entry, tokenData, percentChange);

                // Update last alert price for recursive alerts
                await watchlist.updateLastAlertPrice(
                    entry.tokenAddress,
                    entry.chainId,
                    entry.chatId,
                    currentPrice
                );
            }
        }
    }
}

/**
 * Sends a price drop alert to Telegram
 * @param {Object} entry - Watchlist entry
 * @param {Object} tokenData - Current token data
 * @param {number} percentChange - Percentage change from last alert
 */
async function sendPriceAlert(entry, tokenData, percentChange) {
    if (!bot) {
        console.error('Bot not initialized');
        return;
    }

    const priceFormatted = dexscreener.formatPrice(tokenData.priceUsd);
    const marketCapFormatted = dexscreener.formatMarketCap(tokenData.marketCap);
    const lastPriceFormatted = dexscreener.formatPrice(entry.lastAlertPrice);
    const initialPriceFormatted = dexscreener.formatPrice(entry.initialPrice);

    // Calculate total change from initial price
    const totalChangePercent = ((tokenData.priceUsd - entry.initialPrice) / entry.initialPrice) * 100;

    // Determine direction
    const isUp = percentChange > 0;
    const alertEmoji = isUp ? '🟢' : '🔴';
    const changeEmoji = isUp ? '📈' : '📉';
    const changeText = isUp ? 'Gain' : 'Drop';

    const message = `
${alertEmoji} *PRICE ALERT: $${escapeMarkdown(entry.symbol)}*

💰 *Current Price:* ${escapeMarkdown(priceFormatted)}
${changeEmoji} *${changeText}:* ${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}% from last alert
📊 *Market Cap:* ${escapeMarkdown(marketCapFormatted)}

━━━━━━━━━━━━━━━━━
📌 *Last Alert Price:* ${escapeMarkdown(lastPriceFormatted)}
📍 *Initial Price:* ${escapeMarkdown(initialPriceFormatted)}
📈 *Total Change:* ${totalChangePercent > 0 ? '+' : ''}${totalChangePercent.toFixed(2)}%
⚡ *Alert Threshold:* ${entry.dropThreshold}%

🔗 *Chain:* ${escapeMarkdown(entry.chainId)}
📝 *Address:* \`${entry.tokenAddress}\`

[View on DexScreener](${tokenData.url})
`.trim();

    try {
        await bot.sendMessage(entry.chatId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
    } catch (error) {
        console.error(`Error sending alert to chat ${entry.chatId}:`, error.message);
    }
}

/**
 * Escapes special markdown characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
    if (typeof text !== 'string') return String(text);
    // For legacy Markdown mode, only escape: _ * ` [
    return text.replace(/[_*`\[]/g, '\\$&');
}

module.exports = {
    startMonitor,
    stopMonitor,
    checkPrices
};
