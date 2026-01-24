require('dotenv').config();

const { initBot } = require('./bot');
const priceMonitor = require('./priceMonitor');

// Validate environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS) || 60000;

if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set in .env file');
    console.error('Please create a .env file with your Telegram bot token.');
    console.error('You can get a token from @BotFather on Telegram.');
    process.exit(1);
}

// Initialize bot
console.log('🚀 Starting Memecoin Price Alert Bot...');

const bot = initBot(TELEGRAM_BOT_TOKEN);

// Start price monitoring
priceMonitor.startMonitor(bot, CHECK_INTERVAL_MS);

console.log('✅ Bot is running!');
console.log(`📊 Checking prices every ${CHECK_INTERVAL_MS / 1000} seconds`);
console.log('');
console.log('Press Ctrl+C to stop the bot.');

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    priceMonitor.stopMonitor();
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    priceMonitor.stopMonitor();
    bot.stopPolling();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
