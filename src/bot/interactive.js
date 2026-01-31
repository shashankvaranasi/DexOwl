/**
 * Interactive command handlers and conversation flow
 * Handles commands without arguments (e.g., just /add) and guides users step by step
 */

const { SUPPORTED_CHAINS } = require('./constants');
const { processAdd, processRemove, processPrice, processSearch, processThreshold } = require('./processors');

let bot = null;

/**
 * Conversation states for interactive command flow
 * Maps chatId -> { command, step, data }
 */
const conversationState = new Map();

/**
 * Sets the bot instance
 */
function setBot(botInstance) {
    bot = botInstance;
}

/**
 * Gets the conversation state map (for external handlers)
 */
function getConversationState() {
    return conversationState;
}

/**
 * Creates inline keyboard with chain options
 */
function createChainKeyboard(command) {
    const rows = [];
    for (let i = 0; i < SUPPORTED_CHAINS.length; i += 2) {
        const row = [
            { text: SUPPORTED_CHAINS[i].label, callback_data: `${command}:chain:${SUPPORTED_CHAINS[i].id}` }
        ];
        if (SUPPORTED_CHAINS[i + 1]) {
            row.push({ text: SUPPORTED_CHAINS[i + 1].label, callback_data: `${command}:chain:${SUPPORTED_CHAINS[i + 1].id}` });
        }
        rows.push(row);
    }
    rows.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
    return { inline_keyboard: rows };
}

/**
 * Handles /add command without arguments (interactive mode)
 */
async function handleAddInteractive(msg) {
    const chatId = msg.chat.id;
    conversationState.set(chatId, { command: 'add', step: 'chain', data: {} });

    await bot.sendMessage(chatId, '➕ *Add Token to Watchlist*\n\nSelect the chain:', {
        parse_mode: 'Markdown',
        reply_markup: createChainKeyboard('add')
    });
}

/**
 * Handles /remove command without arguments (interactive mode)
 */
async function handleRemoveInteractive(msg) {
    const chatId = msg.chat.id;
    conversationState.set(chatId, { command: 'remove', step: 'chain', data: {} });

    await bot.sendMessage(chatId, '➖ *Remove Token from Watchlist*\n\nSelect the chain:', {
        parse_mode: 'Markdown',
        reply_markup: createChainKeyboard('remove')
    });
}

/**
 * Handles /price command without arguments (interactive mode)
 */
async function handlePriceInteractive(msg) {
    const chatId = msg.chat.id;
    conversationState.set(chatId, { command: 'price', step: 'chain', data: {} });

    await bot.sendMessage(chatId, '💰 *Get Token Price*\n\nSelect the chain:', {
        parse_mode: 'Markdown',
        reply_markup: createChainKeyboard('price')
    });
}

/**
 * Handles /search command without arguments (interactive mode)
 */
async function handleSearchInteractive(msg) {
    const chatId = msg.chat.id;
    conversationState.set(chatId, { command: 'search', step: 'query', data: {} });

    await bot.sendMessage(chatId, '🔍 *Search for Tokens*\n\nPlease enter the token name or symbol to search:', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel' }]]
        }
    });
}

/**
 * Handles /threshold command without arguments (interactive mode)
 */
async function handleThresholdInteractive(msg) {
    const chatId = msg.chat.id;
    conversationState.set(chatId, { command: 'threshold', step: 'chain', data: {} });

    await bot.sendMessage(chatId, '⚡ *Update Alert Threshold*\n\nSelect the chain:', {
        parse_mode: 'Markdown',
        reply_markup: createChainKeyboard('threshold')
    });
}

/**
 * Handles /cancel command
 */
async function handleCancel(msg) {
    const chatId = msg.chat.id;
    conversationState.delete(chatId);
    await bot.sendMessage(chatId, '❌ Operation cancelled.');
}

/**
 * Handles callback queries from inline keyboards
 */
async function handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    // Answer callback to remove loading state
    await bot.answerCallbackQuery(callbackQuery.id);

    // Handle cancel
    if (data === 'cancel') {
        conversationState.delete(chatId);
        await bot.editMessageText('❌ Operation cancelled.', { chat_id: chatId, message_id: messageId });
        return;
    }

    // Parse callback data: command:action:value
    const [command, action, value] = data.split(':');
    const state = conversationState.get(chatId);

    if (!state || state.command !== command) {
        await bot.editMessageText('⚠️ Session expired. Please start the command again.', { chat_id: chatId, message_id: messageId });
        return;
    }

    if (action === 'chain') {
        state.data.chain = value;

        // Move to next step based on command
        if (command === 'add') {
            state.step = 'address';
            await bot.editMessageText(
                `➕ *Add Token to Watchlist*\n\n✅ Chain: *${value}*\n\nNow please enter the token contract address:`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );
        } else if (command === 'remove') {
            state.step = 'address';
            await bot.editMessageText(
                `➖ *Remove Token*\n\n✅ Chain: *${value}*\n\nNow please enter the token contract address:`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );
        } else if (command === 'price') {
            state.step = 'address';
            await bot.editMessageText(
                `💰 *Get Token Price*\n\n✅ Chain: *${value}*\n\nNow please enter the token contract address:`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );
        } else if (command === 'threshold') {
            state.step = 'address';
            await bot.editMessageText(
                `⚡ *Update Threshold*\n\n✅ Chain: *${value}*\n\nNow please enter the token contract address:`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            );
        }

        conversationState.set(chatId, state);
    }
}

/**
 * Handles text messages for conversation flow
 */
async function handleConversationMessage(msg) {
    // Ignore commands - they're handled by onText
    if (msg.text && msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const state = conversationState.get(chatId);

    // No active conversation
    if (!state) return;

    const text = msg.text?.trim();
    if (!text) return;

    if (state.command === 'add') {
        if (state.step === 'address') {
            state.data.address = text;
            state.step = 'threshold';
            conversationState.set(chatId, state);

            await bot.sendMessage(chatId,
                `✅ Address received!\n\nNow enter the alert threshold percentage (1-100):\n\n_or type "skip" to use default 5%_`,
                { parse_mode: 'Markdown' }
            );
        } else if (state.step === 'threshold') {
            let threshold = 5;
            if (text.toLowerCase() !== 'skip') {
                threshold = parseFloat(text);
                if (isNaN(threshold) || threshold <= 0 || threshold > 100) {
                    await bot.sendMessage(chatId, '❌ Invalid threshold. Please enter a number between 1 and 100, or "skip":');
                    return;
                }
            }

            // Process the add
            conversationState.delete(chatId);
            await processAdd(chatId, state.data.chain, state.data.address, threshold);
        }
    } else if (state.command === 'remove') {
        if (state.step === 'address') {
            conversationState.delete(chatId);
            await processRemove(chatId, state.data.chain, text);
        }
    } else if (state.command === 'price') {
        if (state.step === 'address') {
            conversationState.delete(chatId);
            await processPrice(chatId, state.data.chain, text);
        }
    } else if (state.command === 'search') {
        if (state.step === 'query') {
            conversationState.delete(chatId);
            await processSearch(chatId, text);
        }
    } else if (state.command === 'threshold') {
        if (state.step === 'address') {
            state.data.address = text;
            state.step = 'percent';
            conversationState.set(chatId, state);

            await bot.sendMessage(chatId, '✅ Address received!\n\nNow enter the new threshold percentage (1-100):');
        } else if (state.step === 'percent') {
            const percent = parseFloat(text);
            if (isNaN(percent) || percent <= 0 || percent > 100) {
                await bot.sendMessage(chatId, '❌ Invalid threshold. Please enter a number between 1 and 100:');
                return;
            }

            conversationState.delete(chatId);
            await processThreshold(chatId, state.data.chain, state.data.address, percent);
        }
    }
}

module.exports = {
    setBot,
    getConversationState,
    handleAddInteractive,
    handleRemoveInteractive,
    handlePriceInteractive,
    handleSearchInteractive,
    handleThresholdInteractive,
    handleCancel,
    handleCallbackQuery,
    handleConversationMessage
};
