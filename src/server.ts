import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS } from "@x402/svm";
import express from "express";
import { z } from "zod";

const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
const solanaAddress = process.env.SOLANA_WALLET_ADDRESS!;

if (!solanaAddress) {
  console.error("Error: SOLANA_WALLET_ADDRESS is required");
  process.exit(1);
}

async function main() {
  console.log("🚀 Starting x402 MCP Server...");
  console.log(`   Network:      ${SOLANA_DEVNET_CAIP2}`);
  console.log(`   USDC Mint:    ${USDC_DEVNET_ADDRESS}`);
  console.log(`   Pay To:       ${solanaAddress}`);
  console.log(`   Facilitator:  ${facilitatorUrl}`);

  // 1. MCP サーバーを作成
  const mcpServer = new McpServer({
    name: "x402-solana-mcp-demo",
    version: "1.0.0",
  });

  // 2. Facilitator クライアントを作成
  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });

  // 3. x402 リソースサーバーを初期化
  //    重要: サーバー側は @x402/svm/exact/server の ExactSvmScheme を使う
  const resourceServer = new x402ResourceServer(facilitatorClient);
  resourceServer.register(SOLANA_DEVNET_CAIP2, new ExactSvmScheme());
  await resourceServer.initialize();
  console.log("✅ x402 ResourceServer initialized");

  // 4. 支払い条件を構築
  //    price: "$0.001" → amount は SDK が自動計算
  const paymentAccepts = await resourceServer.buildPaymentRequirements({
    scheme: "exact",
    network: SOLANA_DEVNET_CAIP2,
    payTo: solanaAddress,
    price: "$0.001",
  });
  console.log("✅ Payment requirements built:");
  console.log(JSON.stringify(paymentAccepts[0], null, 2));

  // 5. Payment Wrapper を作成
  const wrapWithPayment = createPaymentWrapper(resourceServer, {
    accepts: paymentAccepts,
  });

  // 6. 無料ツール
  mcpServer.tool(
    "ping",
    "Health check (free)",
    {},
    async () => ({
      content: [{ type: "text", text: "pong" }],
    }),
  );

  // 7. 有料ツール（Solana USDC $0.001）
  mcpServer.tool(
    "premium_weather",
    "Premium weather data ($0.001 USDC on Solana Devnet)",
    { city: z.string().describe("City name") },
    wrapWithPayment(async (args: { city: string }) => {
      const data = {
        city: args.city,
        temperature: Math.round(Math.random() * 30 + 10),
        humidity: Math.round(Math.random() * 60 + 30),
        condition: ["sunny", "cloudy", "rainy", "snowy"][
          Math.floor(Math.random() * 4)
        ],
        timestamp: new Date().toISOString(),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }),
  );

  // 8. SSE トランスポートで起動
  const app = express();
  let transport: SSEServerTransport;

  app.get("/sse", async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await mcpServer.connect(transport);
    console.log("📡 MCP client connected via SSE");
  });

  app.post("/messages", async (req, res) => {
    await transport.handlePostMessage(req, res);
  });

  const port = process.env.PORT ?? 4022;
  app.listen(port, () => {
    console.log(`\n✅ x402 MCP Server running on http://localhost:${port}/sse`);
    console.log(`   Free tool:  ping`);
    console.log(`   Paid tool:  premium_weather ($0.001 USDC)`);
  });
}

main().catch((err) => {
  console.error("❌ Server failed to start:", err);
  process.exit(1);
});
