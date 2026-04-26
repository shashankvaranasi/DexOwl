/**
 * Utility functions for bot
 */

/**
 * Escapes special markdown characters for Telegram
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
    if (typeof text !== 'string') return String(text);
    // For legacy Markdown mode, only escape: _ * ` [
    return text.replace(/[_*`\[]/g, '\\$&');
}

/**
 * Formats a timestamp into a "Time Ago" string (e.g., 2d, 5h)
 * @param {number} timestamp - Epoch timestamp in ms
 * @returns {string} Formatted age
 */
function formatAge(timestamp) {
    if (!timestamp) return 'N/A';
    const now = Date.now();
    const diffMs = now - timestamp;
    
    if (diffMs < 0) return 'Just now';
    
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) return `${diffDay}d`;
    if (diffHour > 0) return `${diffHour}h`;
    if (diffMin > 0) return `${diffMin}m`;
    return 'Just now';
}

module.exports = {
    escapeMarkdown,
    formatAge
};
