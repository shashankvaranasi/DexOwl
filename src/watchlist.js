const { getDB } = require('./database');

/**
 * Watchlist entry structure
 * @typedef {Object} WatchlistEntry
 * @property {string} tokenAddress - Token contract address
 * @property {string} chainId - Blockchain chain ID (e.g., 'solana', 'ethereum')
 * @property {string} name - Token name
 * @property {string} symbol - Token symbol
 * @property {number} dropThreshold - Percentage drop to trigger alert
 * @property {number} lastAlertPrice - Price when last alert was sent
 * @property {number} initialPrice - Price when token was added
 * @property {string} addedAt - ISO timestamp when added
 * @property {string} chatId - Telegram chat ID for notifications
 */

/**
 * Gets the watchlist collection
 * @returns {import('mongodb').Collection}
 */
function getCollection() {
    return getDB().collection('watchlist');
}

/**
 * Loads all watchlist entries from database
 * @returns {Promise<WatchlistEntry[]>} Array of watchlist entries
 */
async function loadWatchlist() {
    try {
        return await getCollection().find({}).toArray();
    } catch (error) {
        console.error('Error loading watchlist:', error.message);
        return [];
    }
}

/**
 * Saves/replaces the entire watchlist (for bulk operations)
 * @param {WatchlistEntry[]} watchlist - The watchlist to save
 */
async function saveWatchlist(watchlist) {
    try {
        const collection = getCollection();
        await collection.deleteMany({});
        if (watchlist.length > 0) {
            await collection.insertMany(watchlist);
        }
    } catch (error) {
        console.error('Error saving watchlist:', error.message);
    }
}

/**
 * Adds a token to the watchlist
 * @param {Object} params - Token parameters
 * @param {string} params.tokenAddress - Token contract address
 * @param {string} params.chainId - Blockchain chain ID
 * @param {string} params.name - Token name
 * @param {string} params.symbol - Token symbol
 * @param {number} params.currentPrice - Current token price
 * @param {number} params.dropThreshold - Percentage drop threshold (default: 5)
 * @param {string} params.chatId - Telegram chat ID
 * @returns {Promise<WatchlistEntry|null>} The added entry or null if already exists
 */
async function addToWatchlist({ tokenAddress, chainId, name, symbol, currentPrice, dropThreshold = 5, chatId }) {
    const normalizedAddress = tokenAddress.toLowerCase();
    const normalizedChainId = chainId.toLowerCase();

    const entry = {
        tokenAddress: normalizedAddress,
        chainId: normalizedChainId,
        name,
        symbol,
        dropThreshold,
        lastAlertPrice: currentPrice,
        initialPrice: currentPrice,
        addedAt: new Date().toISOString(),
        chatId
    };

    try {
        await getCollection().insertOne(entry);
        return entry;
    } catch (error) {
        // Duplicate key error (already exists)
        if (error.code === 11000) {
            return null;
        }
        console.error('Error adding to watchlist:', error.message);
        return null;
    }
}

/**
 * Removes a token from the watchlist
 * @param {string} tokenAddress - Token contract address
 * @param {string} chainId - Blockchain chain ID
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<boolean>} True if removed, false if not found
 */
async function removeFromWatchlist(tokenAddress, chainId, chatId) {
    const normalizedAddress = tokenAddress.toLowerCase();
    const normalizedChainId = chainId.toLowerCase();

    try {
        const result = await getCollection().deleteOne({
            tokenAddress: normalizedAddress,
            chainId: normalizedChainId,
            chatId
        });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error removing from watchlist:', error.message);
        return false;
    }
}

/**
 * Gets all watchlist entries for a specific chat
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<WatchlistEntry[]>} Array of watchlist entries for the chat
 */
async function getWatchlistForChat(chatId) {
    try {
        return await getCollection().find({ chatId }).toArray();
    } catch (error) {
        console.error('Error getting watchlist for chat:', error.message);
        return [];
    }
}

/**
 * Gets all watchlist entries (for monitoring)
 * @returns {Promise<WatchlistEntry[]>} All watchlist entries
 */
async function getAllWatchlist() {
    return loadWatchlist();
}

/**
 * Updates the last alert price for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chainId - Blockchain chain ID
 * @param {string} chatId - Telegram chat ID
 * @param {number} newPrice - New last alert price
 */
async function updateLastAlertPrice(tokenAddress, chainId, chatId, newPrice) {
    const normalizedAddress = tokenAddress.toLowerCase();
    const normalizedChainId = chainId.toLowerCase();

    try {
        await getCollection().updateOne(
            {
                tokenAddress: normalizedAddress,
                chainId: normalizedChainId,
                chatId
            },
            { $set: { lastAlertPrice: newPrice } }
        );
    } catch (error) {
        console.error('Error updating last alert price:', error.message);
    }
}

/**
 * Updates the drop threshold for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chainId - Blockchain chain ID
 * @param {string} chatId - Telegram chat ID
 * @param {number} newThreshold - New percentage threshold
 * @returns {Promise<boolean>} True if updated, false if not found
 */
async function updateThreshold(tokenAddress, chainId, chatId, newThreshold) {
    const normalizedAddress = tokenAddress.toLowerCase();
    const normalizedChainId = chainId.toLowerCase();

    try {
        const result = await getCollection().updateOne(
            {
                tokenAddress: normalizedAddress,
                chainId: normalizedChainId,
                chatId
            },
            { $set: { dropThreshold: newThreshold } }
        );
        return result.matchedCount > 0;
    } catch (error) {
        console.error('Error updating threshold:', error.message);
        return false;
    }
}

module.exports = {
    loadWatchlist,
    saveWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    getWatchlistForChat,
    getAllWatchlist,
    updateLastAlertPrice,
    updateThreshold
};
