/**
 * Bot module - main entry point
 * Initializes and configures the Telegram bot
 */

const TelegramBot = require('node-telegram-bot-api');
const commands = require('./commands');
const interactive = require('./interactive');
const processors = require('./processors');

let bot = null;

/**
 * Initializes the Telegram bot
 * @param {string} token - Telegram bot token
 * @returns {TelegramBot} The bot instance
 */
function initBot(token) {
    bot = new TelegramBot(token, { polling: true });

    // Share bot instance with all modules
    commands.setBot(bot);
    interactive.setBot(bot);
    processors.setBot(bot);

    // Register bot commands menu
    bot.setMyCommands([
        { command: 'start', description: '🚀 Welcome & quick start guide' },
        { command: 'help', description: '📖 Detailed help & instructions' },
        { command: 'add', description: '➕ Add token to watchlist' },
        { command: 'remove', description: '➖ Remove token from watchlist' },
        { command: 'list', description: '📋 Show your watchlist' },
        { command: 'price', description: '💰 Get current token price' },
        { command: 'search', description: '🔍 Search for tokens' },
        { command: 'threshold', description: '⚡ Update alert threshold' },
        { command: 'cancel', description: '❌ Cancel current operation' }
    ]).then(() => {
        console.log('📋 Bot menu commands registered');
    }).catch((error) => {
        console.error('Failed to set bot commands:', error.message);
    });

    // Register command handlers - with args (direct mode)
    bot.onText(/\/start/, commands.handleStart);
    bot.onText(/\/help/, commands.handleHelp);
    bot.onText(/\/add (.+)/, commands.handleAddDirect);
    bot.onText(/\/remove (.+)/, commands.handleRemoveDirect);
    bot.onText(/\/list/, commands.handleList);
    bot.onText(/\/price (.+)/, commands.handlePriceDirect);
    bot.onText(/\/search (.+)/, commands.handleSearchDirect);
    bot.onText(/\/threshold (.+)/, commands.handleThresholdDirect);
    bot.onText(/\/cancel/, interactive.handleCancel);

    // Register command handlers - without args (interactive mode)
    bot.onText(/^\/add$/, interactive.handleAddInteractive);
    bot.onText(/^\/remove$/, interactive.handleRemoveInteractive);
    bot.onText(/^\/price$/, interactive.handlePriceInteractive);
    bot.onText(/^\/search$/, interactive.handleSearchInteractive);
    bot.onText(/^\/threshold$/, interactive.handleThresholdInteractive);

    // Handle callback queries (inline keyboard button presses)
    bot.on('callback_query', interactive.handleCallbackQuery);

    // Handle text messages for conversation flow
    bot.on('message', interactive.handleConversationMessage);

    // Handle errors
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.message);
    });

    console.log('🤖 Telegram bot initialized');
    return bot;
}

/**
 * Gets the bot instance
 */
function getBot() {
    return bot;
}

module.exports = {
    initBot,
    getBot
};
