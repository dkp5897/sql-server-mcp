# SQL Server MCP Server

A **Model Context Protocol (MCP) server** for SQL Server — built for development debugging and data issue resolution.
Connects to Antigravity (the AI agent) so you can diagnose and fix data problems directly from your IDE chat.

---

## 🚀 Setup & Configuration

Configure the server directly inside your Antigravity (or any MCP client) configuration using environment variables:

```json
{
  "mcpServers": {
    "sql-server-mcp": {
      "command": "npx",
      "args": ["-y", "sql-server-mcp"],
      "env": {
        "DB_SERVER": "localhost",
        "DB_NAME": "YourDatabaseName",
        "DB_USER": "sa",
        "DB_PASSWORD": "your_password",
        "DB_PORT": "1433",
        "DB_TRUST_CERT": "true"
      }
    }
  }
}
```

### Environment Variables Reference
| Variable | Description | Default |
|---|---|---|
| `DB_SERVER` / `SQL_SERVER` | SQL Server host / instance name | `localhost` |
| `DB_NAME` / `SQL_DATABASE` | Database name | `master` |
| `DB_USER` / `SQL_USER` | SQL Server username | `sa` |
| `DB_PASSWORD` / `SQL_PASSWORD` | SQL Server password | `""` |
| `DB_PORT` / `SQL_PORT` | SQL Server port | `1433` |
| `DB_TRUST_CERT` / `SQL_TRUST_CERT` | Trust self-signed certificate | `true` |
| `DB_ENCRYPT` | Enable TLS encryption | `false` |

---

## 🛠️ Available Tools (13 total)

### Query Execution
| Tool | Description |
|---|---|
| `sql_run_query` | Run a SELECT query — executes immediately |
| `sql_run_write` | Run INSERT/UPDATE/DELETE/DDL — **shows preview first, requires confirm=true to execute** |

### Schema Inspection
| Tool | Description |
|---|---|
| `sql_list_tables` | List all tables (with row counts) |
| `sql_inspect_table` | Full table details: columns, PKs, FKs, indexes |
| `sql_list_stored_procs` | List all stored procedures |
| `sql_get_stored_proc_def` | Get the source code of a stored procedure |

### Data Diagnostics
| Tool | Description |
|---|---|
| `sql_find_data` | Search for a value across all columns in a table |
| `sql_check_foreign_keys` | Find orphaned records / FK violations |
| `sql_count_and_sample` | Row count + sample rows from a table |
| `sql_check_nulls` | Find NULL values in specified columns |
| `sql_compare_counts` | Compare parent/child table counts to find gaps |
| `sql_diagnose_issue` | Full diagnostic report on a table |
| `sql_get_query_plan` | Get execution plan for a slow query |

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

- *"List all tables in the database"*
- *"Inspect the Orders table"*
- *"Find all rows in OrderItems where ProductId is NULL"*
- *"Are there any foreign key violations in the Payments table?"*
- *"Show me 10 sample rows from Customers where IsActive = 0"*
- *"Run a full diagnostic on the Orders table"*
- *"Update the 3 orders with NULL CustomerId — set them to CustomerId = 1"*

---

## 📦 Publishing to npm

To publish your own version to npm:
```bash
npm login
npm publish --access public
```
