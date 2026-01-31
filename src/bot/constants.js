/**
 * Chain constants and configuration
 */

/**
 * Supported chains for inline keyboard
 */
const SUPPORTED_CHAINS = [
    { id: 'solana', label: '◎ Solana' },
    { id: 'ethereum', label: 'Ξ Ethereum' },
    { id: 'bsc', label: '⬡ BSC' },
    { id: 'base', label: '🔵 Base' },
    { id: 'arbitrum', label: '🔷 Arbitrum' },
    { id: 'polygon', label: '⬡ Polygon' },
    { id: 'avalanche', label: '🔺 Avalanche' },
    { id: 'sui', label: '💧 Sui' },
    { id: 'ton', label: '💎 TON' },
    { id: 'tron', label: '⚡ Tron' }
];

/**
 * Chain name aliases for user input
 */
const CHAIN_ALIASES = {
    'sol': 'solana',
    'eth': 'ethereum',
    'bsc': 'bsc',
    'bnb': 'bsc',
    'arb': 'arbitrum',
    'arbitrum': 'arbitrum',
    'polygon': 'polygon',
    'matic': 'polygon',
    'avax': 'avalanche',
    'avalanche': 'avalanche',
    'base': 'base',
    'solana': 'solana',
    'ethereum': 'ethereum',
    'sui': 'sui',
    'ton': 'ton',
    'tron': 'tron'
};

module.exports = {
    SUPPORTED_CHAINS,
    CHAIN_ALIASES
};
