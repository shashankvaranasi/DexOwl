# Telegram Memecoin Price Alert Bot 🚀

A Node.js Telegram bot that monitors memecoin prices using the DexScreener API and sends alerts when prices drop below configured thresholds.

## Features

- 📊 **Real-time price monitoring** via DexScreener API
- 🔴 **Recursive drop alerts** - Get notified on each consecutive percentage drop
- 📈 **Market cap included** in every alert
- 🔗 **Multi-chain support** - Solana, Ethereum, BSC, Arbitrum, Polygon, Base, Avalanche, Sui, TON, Tron
- 💾 **Persistent watchlist** - Your tokens are saved across restarts

## Quick Start

### 1. Get a Telegram Bot Token

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token you receive

### 2. Setup

```bash
# Install dependencies
npm install

# Create your .env file
cp .env.example .env

# Edit .env and add your bot token
# TELEGRAM_BOT_TOKEN=your_token_here
```

### 3. Run

```bash
npm start
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and instructions |
| `/add <chain> <address> [threshold]` | Add token to watchlist (default 5% threshold) |
| `/remove <chain> <address>` | Remove token from watchlist |
| `/list` | Show your watchlist with current prices |
| `/price <chain> <address>` | Get current price and market cap |
| `/search <query>` | Search for tokens by name or symbol |
| `/threshold <chain> <address> <percent>` | Update alert threshold |
| `/help` | Detailed help |

## How Alerts Work

When you add a token, the bot records the current price. If the price drops by your threshold percentage, you'll receive an alert. After each alert, the reference price updates to the new price, enabling recursive alerts for continuous drops.

**Example (5% threshold):**
1. ✅ Added at $1.00
2. 🔴 Drops to $0.94 (6% drop) → **ALERT!** Reference = $0.94
3. 🔴 Drops to $0.89 (5.3% from $0.94) → **ALERT!** Reference = $0.89
4. ✅ Rises to $0.92 → No alert
5. 🔴 Drops to $0.84 (5.6% from $0.89) → **ALERT!**

## Supported Chains

| Chain | Aliases |
|-------|---------|
| Solana | `solana`, `sol` |
| Ethereum | `ethereum`, `eth` |
| BNB Chain | `bsc`, `bnb` |
| Arbitrum | `arbitrum`, `arb` |
| Polygon | `polygon`, `matic` |
| Base | `base` |
| Avalanche | `avalanche`, `avax` |
| Sui | `sui` |
| TON | `ton` |
| Tron | `tron` |

## Configuration

Edit `.env` to configure:

```env
# Required: Your Telegram bot token
TELEGRAM_BOT_TOKEN=your_token_here

# Optional: Price check interval in milliseconds (default: 60000 = 1 minute)
CHECK_INTERVAL_MS=60000
```

## Example Usage

```
# Add BONK on Solana with 10% drop alerts
/add sol DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 10

# Check current price
/price sol DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263

# Search for a token
/search pepe

# View your watchlist
/list
```

## License

MIT
