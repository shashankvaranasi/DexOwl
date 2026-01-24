const fs = require('fs');
const path = require('path');

const WATCHLIST_PATH = path.join(__dirname, '..', 'data', 'watchlist.json');

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
 * Loads the watchlist from disk
 * @returns {WatchlistEntry[]} Array of watchlist entries
 */
function loadWatchlist() {
    try {
        if (fs.existsSync(WATCHLIST_PATH)) {
            const data = fs.readFileSync(WATCHLIST_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading watchlist:', error.message);
    }
    return [];
}

/**
 * Saves the watchlist to disk
 * @param {WatchlistEntry[]} watchlist - The watchlist to save
 */
function saveWatchlist(watchlist) {
    try {
        const dir = path.dirname(WATCHLIST_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
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
 * @returns {WatchlistEntry|null} The added entry or null if already exists
 */
function addToWatchlist({ tokenAddress, chainId, name, symbol, currentPrice, dropThreshold = 5, chatId }) {
    const watchlist = loadWatchlist();

    // Check if already exists
    const normalizedAddress = tokenAddress.toLowerCase();
    const exists = watchlist.some(
        entry => entry.tokenAddress.toLowerCase() === normalizedAddress &&
            entry.chainId.toLowerCase() === chainId.toLowerCase() &&
            entry.chatId === chatId
    );

    if (exists) {
        return null;
    }

    const entry = {
        tokenAddress: normalizedAddress,
        chainId: chainId.toLowerCase(),
        name,
        symbol,
        dropThreshold,
        lastAlertPrice: currentPrice,
        initialPrice: currentPrice,
        addedAt: new Date().toISOString(),
        chatId
    };

    watchlist.push(entry);
    saveWatchlist(watchlist);

    return entry;
}

/**
 * Removes a token from the watchlist
 * @param {string} tokenAddress - Token contract address
 * @param {string} chainId - Blockchain chain ID
 * @param {string} chatId - Telegram chat ID
 * @returns {boolean} True if removed, false if not found
 */
function removeFromWatchlist(tokenAddress, chainId, chatId) {
    const watchlist = loadWatchlist();
    const normalizedAddress = tokenAddress.toLowerCase();

    const initialLength = watchlist.length;
    const filtered = watchlist.filter(
        entry => !(entry.tokenAddress.toLowerCase() === normalizedAddress &&
            entry.chainId.toLowerCase() === chainId.toLowerCase() &&
            entry.chatId === chatId)
    );

    if (filtered.length < initialLength) {
        saveWatchlist(filtered);
        return true;
    }

    return false;
}

/**
 * Gets all watchlist entries for a specific chat
 * @param {string} chatId - Telegram chat ID
 * @returns {WatchlistEntry[]} Array of watchlist entries for the chat
 */
function getWatchlistForChat(chatId) {
    const watchlist = loadWatchlist();
    return watchlist.filter(entry => entry.chatId === chatId);
}

/**
 * Gets all watchlist entries (for monitoring)
 * @returns {WatchlistEntry[]} All watchlist entries
 */
function getAllWatchlist() {
    return loadWatchlist();
}

/**
 * Updates the last alert price for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chainId - Blockchain chain ID
 * @param {string} chatId - Telegram chat ID
 * @param {number} newPrice - New last alert price
 */
function updateLastAlertPrice(tokenAddress, chainId, chatId, newPrice) {
    const watchlist = loadWatchlist();
    const normalizedAddress = tokenAddress.toLowerCase();

    const entry = watchlist.find(
        e => e.tokenAddress.toLowerCase() === normalizedAddress &&
            e.chainId.toLowerCase() === chainId.toLowerCase() &&
            e.chatId === chatId
    );

    if (entry) {
        entry.lastAlertPrice = newPrice;
        saveWatchlist(watchlist);
    }
}

/**
 * Updates the drop threshold for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chainId - Blockchain chain ID
 * @param {string} chatId - Telegram chat ID
 * @param {number} newThreshold - New percentage threshold
 * @returns {boolean} True if updated, false if not found
 */
function updateThreshold(tokenAddress, chainId, chatId, newThreshold) {
    const watchlist = loadWatchlist();
    const normalizedAddress = tokenAddress.toLowerCase();

    const entry = watchlist.find(
        e => e.tokenAddress.toLowerCase() === normalizedAddress &&
            e.chainId.toLowerCase() === chainId.toLowerCase() &&
            e.chatId === chatId
    );

    if (entry) {
        entry.dropThreshold = newThreshold;
        saveWatchlist(watchlist);
        return true;
    }

    return false;
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
