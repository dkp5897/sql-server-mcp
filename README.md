# SQL Server MCP Server

A **Model Context Protocol (MCP) server** for SQL Server — built for development debugging and multi-database data repair.
Connects to Antigravity (the AI agent) so you can inspect schemas, run queries, and diagnose data problems across multiple databases directly from your IDE chat.

---

## 🚀 Setup & Configuration

You can configure single or multiple SQL Server databases directly in your Antigravity (or any MCP client) configuration:

### Option A: Multiple Databases (`DB_CONNECTIONS` JSON Array)
Pass a JSON array in `DB_CONNECTIONS` to register multiple database connections on startup:

```json
{
  "mcpServers": {
    "sql-server-mcp": {
      "command": "npx",
      "args": ["-y", "@dkp5897/sql-server-mcp"],
      "env": {
        "DB_CONNECTIONS": "[{\"name\":\"sweet-shop\",\"label\":\"PradeepSweetShop Dev\",\"server\":\"localhost\",\"database\":\"PradeepSweetShopDb\",\"user\":\"sa\",\"password\":\"dkp@5897\"},{\"name\":\"ecommerce\",\"label\":\"ECommerce Dev\",\"server\":\"localhost\",\"database\":\"ECommerceDB\",\"user\":\"sa\",\"password\":\"dkp@5897\"}]"
      }
    }
  }
}
```

### Option B: Single Database Configuration
```json
{
  "mcpServers": {
    "sql-server-mcp": {
      "command": "npx",
      "args": ["-y", "@dkp5897/sql-server-mcp"],
      "env": {
        "DB_SERVER": "localhost",
        "DB_NAME": "PradeepSweetShopDb",
        "DB_USER": "sa",
        "DB_PASSWORD": "your_password",
        "DB_PORT": "1433",
        "DB_TRUST_CERT": "true"
      }
    }
  }
}
```

---

## 🛠️ Available Tools (17 total)

### Connection Management
| Tool | Description |
|---|---|
| `sql_list_connections` | List all loaded SQL Server connection profiles and see which one is active |
| `sql_switch_connection` | Switch default active connection to another loaded profile by name |
| `sql_add_connection` | Dynamically add or update a named connection profile during chat session |
| `sql_remove_connection` | Remove a connection profile |

### Query Execution
| Tool | Description |
|---|---|
| `sql_run_query` | Run a SELECT query (accepts optional `connection` name parameter) |
| `sql_run_write` | Run INSERT/UPDATE/DELETE/DDL — **shows preview first, requires confirm=true to execute** |

### Schema Inspection
| Tool | Description |
|---|---|
| `sql_list_tables` | List all tables with row counts |
| `sql_inspect_table` | Full table details: columns, PKs, FKs, indexes |
| `sql_list_stored_procs` | List all stored procedures |
| `sql_get_stored_proc_def` | Get stored procedure source code |

### Data Diagnostics
| Tool | Description |
|---|---|
| `sql_find_data` | Search for a value across all columns in a table |
| `sql_check_foreign_keys` | Find orphaned records / FK violations |
| `sql_count_and_sample` | Row count + sample rows from a table |
| `sql_check_nulls` | Find NULL values in specified columns |
| `sql_compare_counts` | Compare parent/child table counts to find gaps |
| `sql_diagnose_issue` | Full diagnostic report on a table |
| `sql_get_query_plan` | Get execution plan for a query |

---

## 🔐 Permission Model

| Query Type | Behaviour |
|---|---|
| `SELECT` | Runs immediately, no confirmation needed |
| `INSERT / UPDATE / DELETE` | Shows **preview** first. Must call again with `confirm: true` |
| `DROP TABLE / ALTER / CREATE` | Shows **preview** first. Must call again with `confirm: true` |
| `DROP DATABASE / xp_cmdshell / BULK INSERT` | **Always blocked**, cannot be executed |

---

## 💡 Example Questions to Ask the Agent

- *"List all configured SQL connections"*
- *"Switch SQL connection to ecommerce"*
- *"Run a query `SELECT TOP 5 * FROM Payments` on connection ecommerce"*
- *"Compare row counts between Products and Categories in sweet-shop"*
- *"Run a full diagnostic on the Orders table"*

---

## 📦 Publishing to npm

To publish updates to npm:
```bash
npm login
npm publish --access public
```
