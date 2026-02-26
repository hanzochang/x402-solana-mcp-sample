# x402-solana-mcp-sample

x402 V2 + Solana USDC で課金できる MCP サーバーとクライアントのサンプル実装。

## 概要

[x402](https://github.com/coinbase/x402) プロトコルを使って、MCP ツール呼び出しに対してSolana USDC でマイクロペイメントを行うデモです。

| コンポーネント | 説明 |
|---|---|
| **MCPサーバー** (`src/server.ts`) | 無料ツール `ping` と有料ツール `premium_weather`（$0.001 USDC）を提供。StreamableHTTP トランスポート |
| **MCPクライアント** (`src/client.ts`) | サーバーに接続し、有料ツール呼び出し時に Solana Devnet 上の USDC で自動決済 |
| **キーペア生成** (`src/gen-keypair.ts`) | テスト用 Solana ウォレットの生成ユーティリティ |

## セットアップ

```bash
pnpm install
cp .env.example .env
```

`.env` を編集:

```env
SOLANA_WALLET_ADDRESS=your-solana-wallet-address
SOLANA_PRIVATE_KEY=your-base58-encoded-private-key
FACILITATOR_URL=https://x402.org/facilitator
```

テスト用キーペアが必要な場合:

```bash
npx tsx src/gen-keypair.ts
```

## ローカル動作確認

### サーバー起動

```bash
pnpm server
# or: npx tsx src/server.ts
```

起動すると Facilitator からメタデータが自動取得され、ポート 4022 で待ち受けます。

```
✅ x402 MCP Server running on http://localhost:4022/mcp
   Free tool:  ping
   Paid tool:  premium_weather ($0.001 USDC)
```

### クライアントでテスト

別ターミナルで:

```bash
pnpm client
# or: npx tsx src/client.ts
```

- `ping` → 即座に `"pong"` が返る（`paymentMade: false`）
- `premium_weather` → 402 → 自動決済 → 結果取得（`paymentMade: true`）

> **Note:** Devnet では SOL（ガス代）と USDC（決済用）の残高が必要です。取得方法は下記「テストトークンの取得」を参照してください。残高がない場合 `transaction_simulation_failed` になりますが、決済フロー自体は正しく動作しています。

### curl で疎通確認

サーバーが起動した状態で、MCP プロトコルを直接叩いて確認できます。

```bash
# Initialize
curl -s -D - -X POST http://localhost:4022/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# レスポンスヘッダーの mcp-session-id を使って後続リクエスト
```

## Claude Code から使う（MCP接続）

### 設定

プロジェクトの `.mcp.json` に追加:

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

または CLI で:

```bash
claude mcp add x402-weather --transport http http://localhost:4022/mcp
```

### 使い方

1. サーバーを起動: `pnpm server`
2. Claude Code を開いて自然言語で質問

```
> ping を呼んで
> 今日の天気を教えて
```

### 現時点の制限

Claude Code の内蔵 MCP クライアントは **x402 の決済フローに対応していません**。そのため:

- **無料ツール（`ping`）** → 正常に動作
- **有料ツール（`premium_weather`）** → 402 Payment Required が返されて止まる

有料ツールの完全な決済フローを確認するには、`pnpm client`（`src/client.ts`）を使用してください。こちらは `@x402/mcp` の `createx402MCPClient` により自動決済が処理されます。

### x402 対応エージェントで決済を自動化する

Claude Code 単体では 402 で止まりますが、以下のツールを追加すれば x402 決済を自動処理できます。

#### 方法1: Payments MCP（Coinbase）— 最も簡単

ウォレット作成・USDC購入・x402決済をワンパッケージで提供。Solana Devnet/Mainnet 両対応。

```bash
npx @coinbase/payments-mcp --client claude-code --auto-config
```

これだけで Claude Code に x402 決済機能が追加されます。初回はメール認証でエンベデッドウォレットが自動作成されます。APIキー不要。

```bash
# 管理コマンド
npx @coinbase/payments-mcp status       # 状態確認
npx @coinbase/payments-mcp uninstall    # アンインストール
```

> 詳細: [Payments MCP ドキュメント](https://docs.cdp.coinbase.com/payments-mcp/welcome) / [GitHub](https://github.com/coinbase/payments-mcp)

#### 方法2: @civic/x402-mcp（Proxy方式）— EVM のみ

x402 未対応の MCP クライアントと x402 対応サーバーの間にプロキシを立てる方式。**注意: 現時点では EVM（Base 等）のみ対応で、Solana は非対応です。**

`.mcp.json`:

```json
{
  "mcpServers": {
    "x402-proxy": {
      "command": "npx",
      "args": ["@civic/x402-mcp", "client-proxy"],
      "env": {
        "TARGET_URL": "https://x402-mcp.fly.dev/mcp",
        "PRIVATE_KEY": "0xYOUR_EVM_PRIVATE_KEY",
        "NETWORK": "baseSepolia"
      }
    }
  }
}
```

| NETWORK 値 | ネットワーク |
|---|---|
| `baseSepolia` | Base Sepolia テストネット（デフォルト） |
| `base` | Base メインネット |
| `sepolia` | Ethereum Sepolia |
| `mainnet` | Ethereum メインネット |

> 詳細: [@civic/x402-mcp (npm)](https://www.npmjs.com/package/@civic/x402-mcp) / [Civic ドキュメント](https://docs.civic.com/labs/private/x402-mcp)

#### 方法3: x402 MCP Client（Coinbase リポジトリ）— 上級者向け

EVM + Solana 両対応。リポジトリからビルドして使います。

```bash
git clone https://github.com/coinbase/x402.git
cd x402/examples/typescript
pnpm install && pnpm build
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "x402-client": {
      "command": "pnpm",
      "args": ["--silent", "-C", "/path/to/x402/examples/typescript/clients/mcp", "dev"],
      "env": {
        "SVM_PRIVATE_KEY": "YOUR_BASE58_SOLANA_KEY",
        "RESOURCE_SERVER_URL": "http://localhost:4022",
        "ENDPOINT_PATH": "/mcp"
      }
    }
  }
}
```

| 環境変数 | 説明 |
|---|---|
| `SVM_PRIVATE_KEY` | Solana 秘密鍵（base58） |
| `EVM_PRIVATE_KEY` | EVM 秘密鍵（0x プレフィックス） |
| `RESOURCE_SERVER_URL` | x402 サーバーの URL |
| `ENDPOINT_PATH` | エンドポイントパス |

> 詳細: [GitHub](https://github.com/coinbase/x402/tree/main/examples/typescript/clients/mcp)

#### 比較

| 項目 | Payments MCP | @civic/x402-mcp | x402 MCP Client |
|---|---|---|---|
| セットアップ | `npx` 一発 | `.mcp.json` 追加 | リポジトリクローン |
| Solana 対応 | Yes | No（EVM のみ） | Yes |
| ウォレット管理 | 自動 | 秘密鍵を自分で管理 | 秘密鍵を自分で管理 |
| Bazaar 統合 | 内蔵 | なし | なし |

**このプロジェクト（Solana USDC）で試すなら Payments MCP が最も手軽です。**

## Devnet vs Mainnet

### Devnet（デフォルト）

現在のコードは Solana Devnet で動作します。

- ネットワーク: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- USDC Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Facilitator: `https://x402.org/facilitator`（Coinbase CDP、Devnet対応）

### テストトークンの取得

クライアント側のウォレットに **SOL**（ガス代）と **USDC**（決済用）の両方が必要です。

**SOL（ガス代）:**

```bash
# CLI から（Solana CLI が必要）
solana airdrop 2 <YOUR_WALLET_ADDRESS> --url devnet

# または Web Faucet
# https://faucet.solana.com/
```

**USDC（決済用）:**

[Circle Testnet Faucet](https://faucet.circle.com/) から取得します。

1. https://faucet.circle.com/ にアクセス
2. **USDC** を選択
3. ネットワークで **Solana Devnet** を選択
4. ウォレットアドレスを入力
5. reCAPTCHA を完了して送信

> 2時間ごとに最大 20 USDC を取得可能。アカウント登録不要。

USDC 残高がない状態でも `premium_weather` を呼ぶと 402 → 決済フロー → `transaction_simulation_failed` という流れを確認できます。フロー自体は正しく動作しています。

### Mainnet への移行

`src/server.ts` の定数を差し替えます:

```typescript
// Devnet → Mainnet
import { SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS } from "@x402/svm";

resourceServer.register(SOLANA_MAINNET_CAIP2, new ExactSvmScheme());

const paymentAccepts = await resourceServer.buildPaymentRequirements({
  scheme: "exact",
  network: SOLANA_MAINNET_CAIP2,
  payTo: solanaAddress,
  price: "$0.01",  // 本番価格
});
```

クライアント側も同様に `SOLANA_MAINNET_CAIP2` を使用します。

## ツール一覧

| ツール | 価格 | 説明 |
|---|---|---|
| `ping` | 無料 | ヘルスチェック。`"pong"` を返す |
| `premium_weather` | $0.001 USDC | 指定都市の天気データを返す |

## 技術スタック

- **MCP SDK**: `@modelcontextprotocol/sdk` v1.27+（StreamableHTTP）
- **x402**: `@x402/mcp` + `@x402/core` + `@x402/svm` v2.5
- **Solana**: `@solana/kit` v6（キーペア署名）
- **Runtime**: Node.js + tsx
- **Server**: Express v5

## 関連記事

- [x402 × Solana実装ガイド | 支払い対応MCPサーバーをTypeScriptで構築する](https://hanzochang.com/articles/50)
- [x402とは？ AIエージェント × MCP × 暗号資産が交差するHTTP自動決済プロトコル](https://hanzochang.com/articles/48)
- [x402 V2 解説](https://hanzochang.com/articles/49)

## License

ISC
