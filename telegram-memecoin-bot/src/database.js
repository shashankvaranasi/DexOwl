const { MongoClient } = require('mongodb');

let client = null;
let db = null;

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Delays execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Connects to MongoDB using the MONGODB_URI environment variable
 * Includes retry logic with exponential backoff
 * @returns {Promise<void>}
 */
async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ Error: MONGODB_URI is not set in environment variables');
        console.error('Please add your MongoDB connection string to .env file');
        process.exit(1);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`🔄 MongoDB connection attempt ${attempt}/${MAX_RETRIES}...`);

            client = new MongoClient(uri, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
            });

            await client.connect();

            // Use database name from URI or default to 'memecoin-bot'
            db = client.db('memecoin-bot');

            // Create index for efficient watchlist lookups
            await db.collection('watchlist').createIndex(
                { tokenAddress: 1, chainId: 1, chatId: 1 },
                { unique: true }
            );

            // Set up connection event handlers
            client.on('close', () => {
                console.log('⚠️ MongoDB connection closed');
            });

            client.on('error', (error) => {
                console.error('❌ MongoDB connection error:', error.message);
            });

            client.on('reconnect', () => {
                console.log('✅ MongoDB reconnected');
            });

            console.log('✅ Connected to MongoDB');
            return;

        } catch (error) {
            lastError = error;
            console.error(`❌ MongoDB connection attempt ${attempt} failed:`, error.message);

            if (attempt < MAX_RETRIES) {
                const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`⏳ Retrying in ${delayMs / 1000}s...`);
                await delay(delayMs);
            }
        }
    }

    console.error(`❌ Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
    throw lastError;
}

/**
 * Gets the database instance
 * @returns {import('mongodb').Db} The database instance
 */
function getDB() {
    if (!db) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return db;
}

/**
 * Checks if database is connected
 * @returns {boolean} True if connected
 */
function isConnected() {
    return client !== null && db !== null;
}

/**
 * Closes the MongoDB connection
 * @returns {Promise<void>}
 */
async function disconnectDB() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('🔌 Disconnected from MongoDB');
    }
}

module.exports = {
    connectDB,
    getDB,
    disconnectDB,
    isConnected
};

