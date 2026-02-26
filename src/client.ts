import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createx402MCPClient } from "@x402/mcp";
import { ExactSvmScheme, SOLANA_DEVNET_CAIP2 } from "@x402/svm";
import { createKeyPairSignerFromBytes } from "@solana/kit";

async function main() {
  const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("Error: SOLANA_PRIVATE_KEY is required (base58 encoded)");
    process.exit(1);
  }

  console.log("🔑 Setting up Solana signer...");
  const { base58 } = await import("@scure/base");
  const privateKeyBytes = base58.decode(privateKeyBase58);
  const signer = await createKeyPairSignerFromBytes(privateKeyBytes);
  console.log(`   Address: ${signer.address}`);

  // x402 MCP クライアント
  const client = createx402MCPClient({
    name: "x402-solana-client",
    version: "1.0.0",
    schemes: [
      {
        network: SOLANA_DEVNET_CAIP2,
        client: new ExactSvmScheme(signer),
      },
    ],
    autoPayment: true,
    onPaymentRequested: async (context) => {
      const price = context.paymentRequired.accepts?.[0];
      console.log(`\n💰 Payment requested:`);
      console.log(`   Network: ${price?.network}`);
      console.log(`   Amount:  ${price?.amount} (smallest units)`);
      console.log(`   Asset:   ${price?.asset}`);
      return true;
    },
  });

  const serverUrl = process.env.MCP_SERVER_URL ?? "http://localhost:4022/mcp";
  console.log(`\n📡 Connecting to ${serverUrl}...`);
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  await client.connect(transport);
  console.log("✅ Connected!");

  // ツール一覧
  const tools = await client.listTools();
  console.log(`\n📋 Available tools:`);
  for (const tool of tools.tools) {
    console.log(`   - ${tool.name}: ${tool.description}`);
  }

  // 無料ツール
  console.log(`\n--- Calling free tool: ping ---`);
  const pingResult = await client.callTool("ping", {});
  console.log("Result:", JSON.stringify(pingResult, null, 2));

  // 有料ツール
  console.log(`\n--- Calling paid tool: premium_weather ---`);
  try {
    const weatherResult = await client.callTool("premium_weather", {
      city: "Tokyo",
    });
    console.log("Result:", JSON.stringify(weatherResult, null, 2));
  } catch (err: any) {
    console.log("Payment flow:", err.message || err);
  }

  await client.close();
  console.log("\n✅ Done!");
}

main().catch((err) => {
  console.error("❌ Client error:", err);
  process.exit(1);
});
