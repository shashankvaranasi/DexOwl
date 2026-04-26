require('dotenv').config();

const express = require('express');
const path = require('path');
const { connectDB, disconnectDB } = require('./database');
const { initBot } = require('./bot');
const priceMonitor = require('./priceMonitor');
const apiRouter = require('./api');
const proxyManager = require('./proxyManager');

// Validate environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS) || 60000;
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set in .env file');
    console.error('Please create a .env file with your Telegram bot token.');
    console.error('You can get a token from @BotFather on Telegram.');
    process.exit(1);
}

// Setup Express server for health checks (keeps Render alive)
const app = express();

// CORS middleware for dashboard
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Mount API router
app.use('/api', apiRouter);

// Serve dashboard static files
const dashboardPath = path.join(__dirname, '../public/dashboard');
app.use('/dashboard', express.static(dashboardPath));

// Handle client-side routing for dashboard
app.get('/dashboard/*', (req, res) => {
    res.sendFile(path.join(dashboardPath, 'index.html'));
});

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Telegram Memecoin Bot',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

let bot = null;

// Main startup function
async function main() {
    try {
        // Connect to MongoDB first
        await connectDB();

        // Initialize Proxy Manager (fetches remote lists if PROXY_LINK is set)
        await proxyManager.initialize();

        // Start Express server
        app.listen(PORT, () => {
            console.log(`🌐 HTTP server listening on port ${PORT}`);
        });

        // Initialize bot
        console.log('🚀 Starting Memecoin Price Alert Bot...');
        bot = initBot(TELEGRAM_BOT_TOKEN);

        // Start price monitoring
        priceMonitor.startMonitor(bot, CHECK_INTERVAL_MS);

        console.log('✅ Bot is running!');
        console.log(`📊 Checking prices every ${CHECK_INTERVAL_MS / 1000} seconds`);
        console.log('');
        console.log('Press Ctrl+C to stop the bot.');
    } catch (error) {
        console.error('❌ Failed to start:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
async function shutdown() {
    console.log('\n🛑 Shutting down...');
    priceMonitor.stopMonitor();
    if (bot) {
        bot.stopPolling();
    }
    await disconnectDB();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
main();

