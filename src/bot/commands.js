/**
 * Direct command handlers (commands with inline arguments)
 * e.g., /add sol TokenAddress 5
 */

const dexscreener = require('../dexscreener');
const watchlistManager = require('../watchlist');
const { CHAIN_ALIASES } = require('./constants');
const { escapeMarkdown, formatAge } = require('./utils');

let bot = null;

/**
 * Sets the bot instance
 */
function setBot(botInstance) {
    bot = botInstance;
}

/**
 * Handles /start command
 */
async function handleStart(msg) {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🚀 *Welcome to Memecoin Price Alert Bot!*

I'll notify you when your tracked memecoins drop in price.

*Commands:*
/add <chain> <address> [threshold] - Add token to watchlist
/remove <chain> <address> - Remove token from watchlist
/list - Show your watchlist
/price <chain> <address> - Get current price
/search <query> - Search for tokens
/threshold <chain> <address> <percent> - Update alert threshold
/help - Show detailed help

*Supported Chains:*
solana (sol), ethereum (eth), bsc (bnb), arbitrum (arb), polygon, base, avalanche (avax), sui, ton, tron

*Example:*
\`/add sol EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 10\`

This adds USDC on Solana with 10% drop alerts.
`.trim();

    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
}

/**
 * Handles /help command
 */
async function handleHelp(msg) {
    const chatId = msg.chat.id;
    const helpMessage = `
📖 *Detailed Help*

*Adding a Token:*
\`/add <chain> <address> [threshold]\`
• chain: solana, ethereum, bsc, etc.
• address: Token contract address
• threshold: Alert on X% drops (default: 5%)

*How Alerts Work:*
When you add a token, I record the current price. If the price drops by your threshold percentage, I'll send you an alert. After each alert, I update the reference price to the new price, so you'll get another alert if it drops another X%.

*Example Alert Flow (5% threshold):*
1. Added at $1.00
2. Drops to $0.94 → 🔴 ALERT! (6% drop)
3. Drops to $0.89 → 🔴 ALERT! (5.3% from $0.94)
4. Rises to $0.92 → No alert
5. Drops to $0.84 → 🔴 ALERT! (8.7% from $0.89)

*Updating Threshold:*
\`/threshold sol <address> 3\`
Changes alert threshold to 3%

*Finding Token Address:*
Use \`/search <token name>\` to find addresses
`.trim();

    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
}

/**
 * Handles /add command with arguments
 */
async function handleAddDirect(msg, match) {
    const chatId = msg.chat.id;
    const args = match[1].trim().split(/\s+/);

    if (args.length < 2) {
        await bot.sendMessage(chatId, '❌ Usage: `/add <chain> <address> [threshold]`\nExample: `/add sol TokenAddress 5`', { parse_mode: 'Markdown' });
        return;
    }

    const chainInput = args[0].toLowerCase();
    const chainId = CHAIN_ALIASES[chainInput];

    if (!chainId) {
        await bot.sendMessage(chatId, `❌ Unknown chain: ${chainInput}\n\nSupported: solana, ethereum, bsc, arbitrum, polygon, base, avalanche, sui, ton, tron`);
        return;
    }

    const tokenAddress = args[1];
    const threshold = args[2] ? parseFloat(args[2]) : 5;

    if (isNaN(threshold) || threshold <= 0 || threshold > 100) {
        await bot.sendMessage(chatId, '❌ Threshold must be a number between 0 and 100');
        return;
    }

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
}

/**
 * Handles /remove command with arguments
 */
async function handleRemoveDirect(msg, match) {
    const chatId = msg.chat.id;
    const args = match[1].trim().split(/\s+/);

    if (args.length < 2) {
        await bot.sendMessage(chatId, '❌ Usage: `/remove <chain> <address>`', { parse_mode: 'Markdown' });
        return;
    }

    const chainInput = args[0].toLowerCase();
    const chainId = CHAIN_ALIASES[chainInput];

    if (!chainId) {
        await bot.sendMessage(chatId, `❌ Unknown chain: ${chainInput}`);
        return;
    }

    const tokenAddress = args[1];
    const removed = await watchlistManager.removeFromWatchlist(tokenAddress, chainId, String(chatId));

    if (removed) {
        await bot.sendMessage(chatId, '✅ Token removed from your watchlist.');
    } else {
        await bot.sendMessage(chatId, '❌ Token not found in your watchlist.');
    }
}

/**
 * Handles /list command
 */
async function handleList(msg) {
    const chatId = msg.chat.id;
    const entries = await watchlistManager.getWatchlistForChat(String(chatId));

    if (entries.length === 0) {
        await bot.sendMessage(chatId, '📋 Your watchlist is empty.\n\nUse `/add <chain> <address>` to add tokens.', { parse_mode: 'Markdown' });
        return;
    }

    await bot.sendMessage(chatId, '🔍 Fetching current prices...');

    // Group by chain for batch fetching
    const entriesByChain = new Map();
    for (const entry of entries) {
        if (!entriesByChain.has(entry.chainId)) {
            entriesByChain.set(entry.chainId, []);
        }
        entriesByChain.get(entry.chainId).push(entry);
    }

    let message = '📋 *Your Watchlist*\n\n';

    for (const [chainId, chainEntries] of entriesByChain) {
        const addresses = chainEntries.map(e => e.tokenAddress);
        const tokenDataMap = await dexscreener.getMultipleTokensData(chainId, addresses);

        for (const entry of chainEntries) {
            const tokenData = tokenDataMap.get(entry.tokenAddress.toLowerCase());

            if (tokenData) {
                const priceFormatted = dexscreener.formatPrice(tokenData.priceUsd);
                const marketCapFormatted = dexscreener.formatMarketCap(tokenData.marketCap);
                const changeFromAlert = ((tokenData.priceUsd - entry.lastAlertPrice) / entry.lastAlertPrice * 100).toFixed(2);
                const changeFromInitial = ((tokenData.priceUsd - entry.initialPrice) / entry.initialPrice * 100).toFixed(2);
                const changeEmoji = parseFloat(changeFromAlert) >= 0 ? '📈' : '📉';

                message += `*${escapeMarkdown(tokenData.symbol)}* (${escapeMarkdown(entry.chainId)})\n`;
                message += `💰 ${escapeMarkdown(priceFormatted)} | 📊 ${escapeMarkdown(marketCapFormatted)}\n`;
                message += `${changeEmoji} ${changeFromAlert}% from last alert | ${changeFromInitial}% total\n`;
                message += `⚡ Threshold: ${entry.dropThreshold}%\n`;
                message += `📝 \`${entry.tokenAddress}\`\n\n`;
            } else {
                message += `*${escapeMarkdown(entry.symbol)}* (${escapeMarkdown(entry.chainId)})\n`;
                message += `⚠️ Unable to fetch data\n\n`;
            }
        }
    }

    await bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
}

/**
 * Handles /price command with arguments
 */
async function handlePriceDirect(msg, match) {
    const chatId = msg.chat.id;
    const args = match[1].trim().split(/\s+/);

    if (args.length < 2) {
        await bot.sendMessage(chatId, '❌ Usage: `/price <chain> <address>`', { parse_mode: 'Markdown' });
        return;
    }

    const chainInput = args[0].toLowerCase();
    const chainId = CHAIN_ALIASES[chainInput];

    if (!chainId) {
        await bot.sendMessage(chatId, `❌ Unknown chain: ${chainInput}`);
        return;
    }

    const tokenAddress = args[1];

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
}

/**
 * Handles /search command with arguments
 */
async function handleSearchDirect(msg, match) {
    const chatId = msg.chat.id;
    const query = match[1].trim();

    if (!query) {
        await bot.sendMessage(chatId, '❌ Usage: `/search <token name or symbol>`', { parse_mode: 'Markdown' });
        return;
    }

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
}

/**
 * Handles /threshold command with arguments
 */
async function handleThresholdDirect(msg, match) {
    const chatId = msg.chat.id;
    const args = match[1].trim().split(/\s+/);

    if (args.length < 3) {
        await bot.sendMessage(chatId, '❌ Usage: `/threshold <chain> <address> <percent>`\nExample: `/threshold sol TokenAddress 3`', { parse_mode: 'Markdown' });
        return;
    }

    const chainInput = args[0].toLowerCase();
    const chainId = CHAIN_ALIASES[chainInput];

    if (!chainId) {
        await bot.sendMessage(chatId, `❌ Unknown chain: ${chainInput}`);
        return;
    }

    const tokenAddress = args[1];
    const newThreshold = parseFloat(args[2]);

    if (isNaN(newThreshold) || newThreshold <= 0 || newThreshold > 100) {
        await bot.sendMessage(chatId, '❌ Threshold must be a number between 0 and 100');
        return;
    }

    const updated = await watchlistManager.updateThreshold(tokenAddress, chainId, String(chatId), newThreshold);

    if (updated) {
        await bot.sendMessage(chatId, `✅ Alert threshold updated to ${newThreshold}%`);
    } else {
        await bot.sendMessage(chatId, '❌ Token not found in your watchlist.');
    }
}

module.exports = {
    setBot,
    handleStart,
    handleHelp,
    handleAddDirect,
    handleRemoveDirect,
    handleList,
    handlePriceDirect,
    handleSearchDirect,
    handleThresholdDirect
};
