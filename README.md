# x402-solana

x402 V2 + Solana + MCP Server demo.

Payment-enabled MCP server using `@x402/mcp` with Solana USDC on Devnet.

## Setup

```bash
pnpm install
cp .env.example .env  # Set your wallet address and private key
```

## Run

```bash
# Start server
pnpm server

# In another terminal
pnpm client
```

## Architecture

- **Server**: StreamableHTTP MCP server with x402 payment wrapper
- **Client**: x402-aware MCP client with auto-payment
- **Payment**: Solana Devnet USDC ($0.001 per paid tool call)
- **Facilitator**: Coinbase CDP (`https://x402.org/facilitator`)

## Tools

| Tool | Price | Description |
|------|-------|-------------|
| `ping` | Free | Health check |
| `premium_weather` | $0.001 USDC | Weather data |

## Article

[x402 × Solana実装ガイド](https://hanzochang.com/articles/50)
