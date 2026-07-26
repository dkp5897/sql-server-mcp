// tools/query.js — Query execution tools
// sql_run_query  → SELECT only, runs immediately
// sql_run_write  → INSERT/UPDATE/DELETE/DDL, preview-first with confirm flag

const { runQuery, getActiveProfile } = require("../db/connection");
const { classifyQuery, buildWritePreview, addSelectTopGuard } = require("../db/guard");
const { formatResults } = require("../utils/formatter");

const TOOLS = [
  {
    name: "sql_run_query",
    description:
      "Execute a SELECT query against the configured SQL Server database and return formatted results. Only SELECT statements are allowed here — for writes, use sql_run_write.",
    inputSchema: {
      type: "object",
      required: ["sql"],
      properties: {
        sql: { type: "string", description: "The SELECT SQL query to execute" },
        maxRows: { type: "number", description: "Max rows to display (default: 500). Query will auto-add TOP N if not present." },
      },
    },
  },
  {
    name: "sql_run_write",
    description:
      "Execute a write SQL statement (INSERT, UPDATE, DELETE, DROP TABLE, ALTER TABLE, CREATE, TRUNCATE, EXEC stored proc, etc.).\n\n" +
      "**IMPORTANT PERMISSION RULE:**\n" +
      "- When `confirm` is false (default): returns a DRY-RUN PREVIEW — nothing is executed.\n" +
      "- When `confirm` is true: actually executes the statement.\n\n" +
      "Always call with confirm=false first to show the user what will happen, then call again with confirm=true only after the user explicitly approves.",
    inputSchema: {
      type: "object",
      required: ["sql"],
      properties: {
        sql: { type: "string", description: "The SQL statement to execute (INSERT/UPDATE/DELETE/DDL/EXEC etc.)" },
        confirm: {
          type: "boolean",
          description: "Set to true ONLY after the user has seen the preview and explicitly approved execution. Default: false.",
        },
      },
    },
  },
];

async function handle(toolName, args) {
  switch (toolName) {
    case "sql_run_query": {
      const { sql: sqlText, maxRows = 500 } = args;

      const { allowed, isReadOnly, blockedReason } = classifyQuery(sqlText);
      if (!allowed) return `❌ **Blocked:** ${blockedReason}`;
      if (!isReadOnly) {
        return (
          `❌ \`sql_run_query\` only accepts SELECT statements.\n\n` +
          `For write operations, use **\`sql_run_write\`** (which will show you a preview first).`
        );
      }

      const guarded = addSelectTopGuard(sqlText, maxRows);
      const result = await runQuery(guarded);
      const profile = getActiveProfile();

      return `**Database:** \`${profile.label}\`\n\n${formatResults(result)}`;
    }

    case "sql_run_write": {
      const { sql: sqlText, confirm = false } = args;

      const { allowed, isReadOnly, blockedReason } = classifyQuery(sqlText);
      if (!allowed) return `❌ **Blocked:** ${blockedReason}`;

      if (isReadOnly) {
        return (
          `ℹ️ This looks like a SELECT query. Use **\`sql_run_query\`** instead for reads.`
        );
      }

      const profile = getActiveProfile();

      // DRY RUN — show preview only
      if (!confirm) {
        return buildWritePreview(sqlText, profile.label);
      }

      // EXECUTE — user confirmed
      const result = await runQuery(sqlText);
      const affected = (result.rowsAffected || []).reduce((a, b) => a + b, 0);
      return (
        `✅ **Executed on \`${profile.label}\`**\n\n` +
        `- **Rows affected:** ${affected}\n\n` +
        (result.recordset && result.recordset.length > 0
          ? `**Returned data:**\n\n${formatResults(result)}`
          : "")
      );
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { TOOLS, handle };
