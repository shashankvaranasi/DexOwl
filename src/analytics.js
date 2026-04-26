const { getDB } = require('./database');

/**
 * User-Centric Analytics Module
 * Maintains a single document per user for maximum space efficiency
 */

function getCollection() {
    return getDB().collection('user_stats');
}

/**
 * Increments a specific metric for a user
 * @param {string|number} chatId - Telegram Chat ID
 * @param {string} metric - 'alertsReceived' | 'requestsMade'
 */
async function incrementUserMetric(chatId, metric) {
    try {
        const collection = getCollection();
        await collection.updateOne(
            { _id: String(chatId) },
            { 
                $inc: { [metric]: 1 },
                $set: { lastActive: new Date() }
            },
            { upsert: true }
        );
    } catch (error) {
        console.error(`[Analytics] Error updating ${metric} for ${chatId}:`, error.message);
    }
}

/**
 * Updates the current token count for a user
 * @param {string|number} chatId - Telegram Chat ID
 * @param {number} count - Current number of tokens in watchlist
 */
async function updateUserTokenCount(chatId, count) {
    try {
        const collection = getCollection();
        await collection.updateOne(
            { _id: String(chatId) },
            { 
                $set: { 
                    tokensCount: count,
                    lastActive: new Date()
                }
            },
            { upsert: true }
        );
    } catch (error) {
        console.error(`[Analytics] Error updating token count for ${chatId}:`, error.message);
    }
}

module.exports = {
    incrementUserMetric,
    updateUserTokenCount
};
