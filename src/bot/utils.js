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

module.exports = {
    escapeMarkdown
};
