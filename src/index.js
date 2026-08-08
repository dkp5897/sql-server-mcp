#!/usr/bin/env node
// index.js — SQL Server MCP Server entry point
// Communicates over stdio (standard MCP transport)

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const connectionsTools = require("./tools/connections");
const queryTools = require("./tools/query");
const inspectTools = require("./tools/inspect");
const diagnoseTools = require("./tools/diagnose");

const { closeAllPools } = require("./db/connection");

// ─── Aggregate all tools ───────────────────────────────────────────────────────
const ALL_TOOLS = [
  ...connectionsTools.TOOLS,
  ...queryTools.TOOLS,
  ...inspectTools.TOOLS,
  ...diagnoseTools.TOOLS,
];

// ─── Tool dispatcher ───────────────────────────────────────────────────────────
async function dispatchTool(name, args) {
  if (connectionsTools.TOOLS.some((t) => t.name === name)) return connectionsTools.handle(name, args);
  if (queryTools.TOOLS.some((t) => t.name === name)) return queryTools.handle(name, args);
  if (inspectTools.TOOLS.some((t) => t.name === name)) return inspectTools.handle(name, args);
  if (diagnoseTools.TOOLS.some((t) => t.name === name)) return diagnoseTools.handle(name, args);
  throw new Error(`Unknown tool: ${name}`);
}

// ─── Create MCP Server ─────────────────────────────────────────────────────────
const server = new Server(
  { name: "sql-server-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: ALL_TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await dispatchTool(name, args || {});
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `❌ **Error in \`${name}\`:** ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Start server ──────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("✅ sql-server-mcp started\n");

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await closeAllPools();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await closeAllPools();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
