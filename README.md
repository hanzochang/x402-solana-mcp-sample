# x402-solana-mcp-sample

A sample MCP server and client that enables micropayments via x402 V2 + Solana USDC.

## Overview

A demo of [x402](https://github.com/coinbase/x402) protocol-based micropayments for MCP tool calls using Solana USDC.

| Component | Description |
|---|---|
| **MCP Server** (`src/server.ts`) | Provides a free tool `ping` and a paid tool `premium_weather` ($0.001 USDC). StreamableHTTP transport |
| **Agent Client** (`src/client.ts`) | Connects to the server and automatically pays with Solana Devnet USDC for paid tool calls |
| **Keypair Generator** (`src/gen-keypair.ts`) | Utility to generate a test Solana wallet |

## Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

```env
SOLANA_WALLET_ADDRESS=your-solana-wallet-address
SOLANA_PRIVATE_KEY=your-base58-encoded-private-key
FACILITATOR_URL=https://x402.org/facilitator
```

To generate a test keypair:

```bash
npx tsx src/gen-keypair.ts
```

## Local Development

### Start the Server

```bash
pnpm server
# or: npx tsx src/server.ts
```

On startup, the server fetches metadata from the Facilitator and listens on port 4022.

```
✅ x402 MCP Server running on http://localhost:4022/mcp
   Free tool:  ping
   Paid tool:  premium_weather ($0.001 USDC)
```

### Run the Agent Client

In a separate terminal:

```bash
pnpm client
# or: npx tsx src/client.ts
```

The `createx402MCPClient` from `@x402/mcp` automatically detects 402 responses and handles Solana USDC transaction construction, signing, and retry.

- `ping` → returns `"pong"` immediately (`paymentMade: false`)
- `premium_weather` → 402 → auto-payment → result (`paymentMade: true`)

> **Note:** Both SOL (for gas) and USDC (for payment) are required on Devnet. See "Getting Test Tokens" below. Without sufficient balance, you'll get `transaction_simulation_failed`, but the payment flow itself is working correctly.

### Verify with curl

With the server running, you can test the MCP protocol directly:

```bash
curl -s -D - -X POST http://localhost:4022/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Use the mcp-session-id from the response header for subsequent requests
```

## Connecting from MCP Clients

### MCP Configuration

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "x402-weather": {
      "type": "http",
      "url": "http://localhost:4022/mcp"
    }
  }
}
```

### Current Limitations

Major MCP clients (Claude Code, Cursor, Gemini, etc.) **do not natively support x402 payment flows**. As a result:

- **Free tools (`ping`)** → work normally
- **Paid tools (`premium_weather`)** → return 402 Payment Required and stop

To test the full payment flow, use `pnpm client` (`src/client.ts`).

### Automate Payments with x402 Plugins

You can add MCP plugins to enable x402 payments from existing clients.

| Plugin | Solana Support | Description |
|---|---|---|
| [Payments MCP](https://docs.cdp.coinbase.com/payments-mcp/welcome) (Coinbase) | Yes | `npx @coinbase/payments-mcp` to install. Easiest option |
| [@civic/x402-mcp](https://www.npmjs.com/package/@civic/x402-mcp) | No (EVM only) | Proxy that transparently handles 402 responses |
| [x402 MCP Client](https://github.com/coinbase/x402/tree/main/examples/typescript/clients/mcp) | Yes | Build from x402 repo. Advanced |

**For this project (Solana USDC), Payments MCP is the easiest option.**

## Devnet vs Mainnet

### Devnet (Default)

The current code runs on Solana Devnet.

- Network: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- USDC Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Facilitator: `https://x402.org/facilitator` (Coinbase CDP, Devnet supported)

### Getting Test Tokens

The client wallet needs both **SOL** (for gas) and **USDC** (for payment).

**SOL (gas):**

```bash
# Via CLI (requires Solana CLI)
solana airdrop 2 <YOUR_WALLET_ADDRESS> --url devnet

# Or use the Web Faucet
# https://faucet.solana.com/
```

**USDC (payment):**

Get it from [Circle Testnet Faucet](https://faucet.circle.com/):

1. Go to https://faucet.circle.com/
2. Select **USDC**
3. Choose **Solana Devnet**
4. Enter your wallet address
5. Complete reCAPTCHA and submit

> Up to 20 USDC every 2 hours. No account required.

Even without USDC balance, calling `premium_weather` will show the full flow: 402 → payment attempt → `transaction_simulation_failed`. The flow itself is working correctly.

### Migrating to Mainnet

Replace the constants in `src/server.ts`:

```typescript
// Devnet → Mainnet
import { SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS } from "@x402/svm";

resourceServer.register(SOLANA_MAINNET_CAIP2, new ExactSvmScheme());

const paymentAccepts = await resourceServer.buildPaymentRequirements({
  scheme: "exact",
  network: SOLANA_MAINNET_CAIP2,
  payTo: solanaAddress,
  price: "$0.01",  // production price
});
```

Update the client similarly to use `SOLANA_MAINNET_CAIP2`.

## Tools

| Tool | Price | Description |
|---|---|---|
| `ping` | Free | Health check. Returns `"pong"` |
| `premium_weather` | $0.001 USDC | Returns weather data for a given city |

## Tech Stack

- **MCP SDK**: `@modelcontextprotocol/sdk` v1.27+ (StreamableHTTP)
- **x402**: `@x402/mcp` + `@x402/core` + `@x402/svm` v2.5
- **Solana**: `@solana/kit` v6 (keypair signing)
- **Runtime**: Node.js + tsx
- **Server**: Express v5

## Related Articles

- [x402 × Solana Implementation Guide | Building a Payment-Enabled MCP Server in TypeScript](https://hanzochang.com/articles/50)
- [What is x402? The HTTP Auto-Payment Protocol at the Intersection of AI Agents, MCP, and Crypto](https://hanzochang.com/articles/48)
- [x402 V2 Deep Dive](https://hanzochang.com/articles/49)

## License

ISC
