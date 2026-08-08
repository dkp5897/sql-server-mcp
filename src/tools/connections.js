// tools/connections.js — Connection management tools
// sql_list_connections, sql_switch_connection, sql_add_connection, sql_remove_connection

const {
  listConnections,
  setActiveConnection,
  addConnection,
  removeConnection,
  getActiveConnectionName,
} = require("../db/connection");

const TOOLS = [
  {
    name: "sql_list_connections",
    description: "List all loaded SQL Server connection profiles and display which connection is currently active.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sql_switch_connection",
    description: "Switch the default active SQL Server connection to a different named connection profile.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Name of the connection profile to activate" },
      },
    },
  },
  {
    name: "sql_add_connection",
    description:
      "Dynamically add or update a named SQL Server connection profile for the current MCP session.",
    inputSchema: {
      type: "object",
      required: ["name", "server", "database", "user"],
      properties: {
        name: { type: "string", description: "Unique name identifier for this connection, e.g. 'ecommerce' or 'sweet-shop'" },
        label: { type: "string", description: "Human-friendly label, e.g. 'ECommerce Staging DB'" },
        server: { type: "string", description: "SQL Server hostname, IP, or instance name (e.g. 'localhost' or 'DEEPAK\\SQLEXPRESS')" },
        port: { type: "number", description: "Port number (default: 1433)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "SQL Server login username" },
        password: { type: "string", description: "SQL Server login password" },
        trustServerCertificate: { type: "boolean", description: "Trust self-signed certificates (default: true)" },
        encrypt: { type: "boolean", description: "Encrypt TLS connection (default: false)" },
        setAsActive: { type: "boolean", description: "Set this connection as the active default connection immediately (default: true)" },
      },
    },
  },
  {
    name: "sql_remove_connection",
    description: "Remove a connection profile from the active session.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Name of the connection profile to remove" },
      },
    },
  },
];

async function handle(toolName, args) {
  switch (toolName) {
    case "sql_list_connections": {
      const conns = listConnections();
      if (conns.length === 0) {
        return "No connections configured yet. Use `sql_add_connection` or set `DB_CONNECTIONS` in environment variables.";
      }
      const rows = conns.map((c) => {
        const flags = c.isActive ? "🟢 **ACTIVE**" : "";
        return `| \`${c.name}\` | ${c.label} | \`${c.server}\` | \`${c.database}\` | ${flags} |`;
      });
      return (
        `## SQL Server Connections\n\n` +
        `| Name | Label | Server | Database | Status |\n` +
        `| --- | --- | --- | --- | --- |\n` +
        rows.join("\n")
      );
    }

    case "sql_switch_connection": {
      const { name } = args;
      setActiveConnection(name);
      const activeName = getActiveConnectionName();
      return `🟢 Switched active default connection to **'${activeName}'**.`;
    }

    case "sql_add_connection": {
      const { name, label, server, port, database, user, password, trustServerCertificate, encrypt, setAsActive = true } = args;
      const conn = addConnection(
        {
          name,
          label: label || `${name} (${server} → ${database})`,
          server,
          port: port || 1433,
          database,
          user,
          password: password || "",
          trustServerCertificate: trustServerCertificate !== false,
          encrypt: encrypt === true,
        },
        setAsActive
      );
      return (
        `✅ Connection profile **'${conn.name}'** saved successfully.\n\n` +
        `- **Server:** \`${conn.server}:${conn.port}\`\n` +
        `- **Database:** \`${conn.database}\`\n` +
        (setAsActive ? `- 🔵 Set as current active connection.` : "")
      );
    }

    case "sql_remove_connection": {
      const { name } = args;
      await removeConnection(name);
      return `🗑️ Connection profile **'${name}'** has been removed.`;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { TOOLS, handle };
