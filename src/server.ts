import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS } from "@x402/svm";
import { z } from "zod";
import { randomUUID } from "node:crypto";

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

  // 1. Facilitator + ResourceServer
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitatorClient);
  resourceServer.register(SOLANA_DEVNET_CAIP2, new ExactSvmScheme());
  await resourceServer.initialize();
  console.log("✅ x402 ResourceServer initialized");

  // 2. Payment requirements
  const paymentAccepts = await resourceServer.buildPaymentRequirements({
    scheme: "exact",
    network: SOLANA_DEVNET_CAIP2,
    payTo: solanaAddress,
    price: "$0.001",
  });
  console.log("✅ Payment requirements built:");
  console.log(JSON.stringify(paymentAccepts[0], null, 2));

  // 3. Session management
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  function createMcpServer() {
    const server = new McpServer({
      name: "x402-solana-mcp-demo",
      version: "1.0.0",
    });

    const wrapWithPayment = createPaymentWrapper(resourceServer, {
      accepts: paymentAccepts,
    });

    // Free tool
    server.tool("ping", "Health check (free)", {}, async () => ({
      content: [{ type: "text", text: "pong" }],
    }));

    // Paid tool ($0.001 USDC)
    server.tool(
      "premium_weather",
      "Premium weather data ($0.001 USDC on Solana Devnet)",
      { city: z.string().describe("City name") },
      wrapWithPayment(async (args: { city: string }) => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                city: args.city,
                temperature: Math.round(Math.random() * 30 + 10),
                humidity: Math.round(Math.random() * 60 + 30),
                condition: ["sunny", "cloudy", "rainy", "snowy"][
                  Math.floor(Math.random() * 4)
                ],
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      }))
    );

    return server;
  }

  // 4. Express app (using SDK helper)
  const app = createMcpExpressApp();

  // POST /mcp - handle JSON-RPC requests
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Existing session
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
            console.log(`📡 Client connected: ${sid}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`📡 Client disconnected: ${sid}`);
            delete transports[sid];
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET /mcp - SSE streams
  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // DELETE /mcp - session termination
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  });

  const port = process.env.PORT ?? 4022;
  app.listen(port, () => {
    console.log(`\n✅ x402 MCP Server running on http://localhost:${port}/mcp`);
    console.log(`   Free tool:  ping`);
    console.log(`   Paid tool:  premium_weather ($0.001 USDC)`);
  });
}

main().catch((err) => {
  console.error("❌ Server failed to start:", err);
  process.exit(1);
});
