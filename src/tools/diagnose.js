// tools/diagnose.js — Data diagnostic tools
// sql_find_data, sql_check_foreign_keys, sql_count_and_sample,
// sql_check_nulls, sql_compare_counts, sql_diagnose_issue, sql_get_query_plan

const { runQuery } = require("../db/connection");
const { toMarkdownTable } = require("../utils/formatter");

const TOOLS = [
  {
    name: "sql_find_data",
    description:
      "Search for a value across all (or specific) columns in a table. Useful when you know a value exists but don't know which column it's in.",
    inputSchema: {
      type: "object",
      required: ["table", "value"],
      properties: {
        table: { type: "string", description: "Table to search in (e.g. 'Orders' or 'dbo.Orders')" },
        value: { type: "string", description: "Value to search for (will search as text across all varchar/nvarchar/int columns)" },
      },
    },
  },
  {
    name: "sql_check_foreign_keys",
    description:
      "Find foreign key violations in a table — records that reference non-existent parent rows (orphaned data). Very useful for diagnosing referential integrity issues.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Specific table to check. If omitted, checks ALL tables." },
      },
    },
  },
  {
    name: "sql_count_and_sample",
    description:
      "Get the row count and a sample of rows from a table. Useful for quickly understanding what data exists without writing a full query.",
    inputSchema: {
      type: "object",
      required: ["table"],
      properties: {
        table: { type: "string", description: "Table name" },
        sampleSize: { type: "number", description: "Number of sample rows to show (default: 10)" },
        where: { type: "string", description: "Optional WHERE clause to filter (e.g. 'Status = 1')" },
      },
    },
  },
  {
    name: "sql_check_nulls",
    description:
      "Find rows with NULL values in specified columns. Useful for finding missing/incomplete data that might be causing bugs.",
    inputSchema: {
      type: "object",
      required: ["table", "columns"],
      properties: {
        table: { type: "string", description: "Table name" },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "List of column names to check for NULLs",
        },
      },
    },
  },
  {
    name: "sql_compare_counts",
    description:
      "Compare row counts between a parent and child table (joined by FK) to detect missing or extra records. Useful for finding data gaps.",
    inputSchema: {
      type: "object",
      required: ["parentTable", "childTable", "joinColumn"],
      properties: {
        parentTable: { type: "string", description: "Parent/reference table (e.g. 'Customers')" },
        childTable: { type: "string", description: "Child table (e.g. 'Orders')" },
        joinColumn: { type: "string", description: "The FK column name that links them (e.g. 'CustomerId')" },
      },
    },
  },
  {
    name: "sql_diagnose_issue",
    description:
      "Run a comprehensive diagnostic on a table: counts, NULLs in all columns, FK violations, and recent rows. Great starting point when you notice something wrong.",
    inputSchema: {
      type: "object",
      required: ["table"],
      properties: {
        table: { type: "string", description: "Table to diagnose" },
      },
    },
  },
  {
    name: "sql_get_query_plan",
    description: "Get the estimated execution plan for a SELECT query as text (SET SHOWPLAN_ALL). Useful for diagnosing slow queries.",
    inputSchema: {
      type: "object",
      required: ["sql"],
      properties: {
        sql: { type: "string", description: "The SELECT query to analyse" },
      },
    },
  },
];

async function handle(toolName, args) {
  switch (toolName) {
    case "sql_find_data": {
      const { table, value } = args;
      const parts = table.split(".");
      const tableName = parts[parts.length - 1].replace(/'/g, "''");
      const schemaName = parts.length > 1 ? parts[0].replace(/'/g, "''") : "dbo";

      const colSql = `
        SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA='${schemaName}' AND TABLE_NAME='${tableName}'
          AND DATA_TYPE IN ('varchar','nvarchar','char','nchar','text','ntext','int','bigint','smallint','tinyint','uniqueidentifier')
      `;
      const colResult = await runQuery(colSql);
      if (!colResult.recordset.length) return `No searchable columns found in \`${table}\`.`;

      const safeValue = value.replace(/'/g, "''");
      const conditions = colResult.recordset.map((c) => {
        if (["int", "bigint", "smallint", "tinyint"].includes(c.DATA_TYPE)) {
          return isNaN(Number(value)) ? null : `CAST([${c.COLUMN_NAME}] AS VARCHAR) = '${safeValue}'`;
        }
        return `[${c.COLUMN_NAME}] LIKE '%${safeValue}%'`;
      }).filter(Boolean);

      const searchSql = `SELECT TOP 50 * FROM [${schemaName}].[${tableName}] WHERE ${conditions.join(" OR ")}`;
      const result = await runQuery(searchSql);
      if (!result.recordset.length) return `🔍 No rows found in \`${table}\` matching **"${value}"**.`;
      return `🔍 Found **${result.recordset.length}** row(s) in \`${table}\` matching **"${value}"**:\n\n${toMarkdownTable(result.recordset)}`;
    }

    case "sql_check_foreign_keys": {
      const { table } = args;
      const tableFilter = table ? `AND OBJECT_NAME(fk.parent_object_id) = '${table.replace(/'/g, "''")}'` : "";

      const fkSql = `
        SELECT
          fk.name AS [FKName],
          OBJECT_NAME(fk.parent_object_id) AS [ChildTable],
          cp.name AS [ChildColumn],
          OBJECT_NAME(fk.referenced_object_id) AS [ParentTable],
          cr.name AS [ParentColumn]
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
        JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
        WHERE fk.is_disabled = 0 ${tableFilter}
      `;
      const fkList = await runQuery(fkSql);
      if (!fkList.recordset.length) return "_No foreign keys found to check._";

      const violations = [];
      for (const fk of fkList.recordset) {
        const checkSql = `
          SELECT TOP 20
            child.[${fk.ChildColumn}] AS [OrphanedValue],
            '${fk.ChildTable}' AS [ChildTable],
            '${fk.ParentTable}' AS [ParentTable]
          FROM [${fk.ChildTable}] child
          LEFT JOIN [${fk.ParentTable}] parent ON child.[${fk.ChildColumn}] = parent.[${fk.ParentColumn}]
          WHERE child.[${fk.ChildColumn}] IS NOT NULL AND parent.[${fk.ParentColumn}] IS NULL
        `;
        try {
          const vResult = await runQuery(checkSql);
          if (vResult.recordset.length > 0) {
            violations.push({ fk: fk.FKName, rows: vResult.recordset });
          }
        } catch { /* Skip broken FKs */ }
      }

      if (!violations.length) {
        return `✅ No foreign key violations found${table ? ` in \`${table}\`` : " across all tables"}.`;
      }

      let out = `## ⚠️ FK Violations Found\n\n`;
      for (const v of violations) {
        out += `### FK: \`${v.fk}\`\n${toMarkdownTable(v.rows)}\n\n`;
      }
      return out;
    }

    case "sql_count_and_sample": {
      const { table, sampleSize = 10, where } = args;
      const parts = table.split(".");
      const tableName = parts[parts.length - 1].replace(/'/g, "''");
      const schemaName = parts.length > 1 ? parts[0].replace(/'/g, "''") : "dbo";
      const whereClause = where ? `WHERE ${where}` : "";

      const countSql = `SELECT COUNT(1) AS [TotalRows] FROM [${schemaName}].[${tableName}] ${whereClause}`;
      const sampleSql = `SELECT TOP ${sampleSize} * FROM [${schemaName}].[${tableName}] ${whereClause}`;

      const [countResult, sampleResult] = await Promise.all([
        runQuery(countSql),
        runQuery(sampleSql),
      ]);

      const total = countResult.recordset[0]?.TotalRows ?? 0;
      const filterNote = where ? ` (filtered: \`WHERE ${where}\`)` : "";

      return (
        `## 📊 \`${schemaName}.${tableName}\`${filterNote}\n\n` +
        `- **Total Rows:** ${total}\n\n` +
        `### Sample (${Math.min(sampleSize, sampleResult.recordset.length)} rows)\n\n` +
        toMarkdownTable(sampleResult.recordset)
      );
    }

    case "sql_check_nulls": {
      const { table, columns } = args;
      const parts = table.split(".");
      const tableName = parts[parts.length - 1].replace(/'/g, "''");
      const schemaName = parts.length > 1 ? parts[0].replace(/'/g, "''") : "dbo";

      const nullConditions = columns.map((c) => `[${c}] IS NULL`).join(" OR ");
      const colList = columns.map((c) => `[${c}]`).join(", ");
      const sql = `
        SELECT TOP 100 ${colList}${columns.length < 5 ? ", *" : ""}
        FROM [${schemaName}].[${tableName}]
        WHERE ${nullConditions}
      `;

      const [nullResult, countResult] = await Promise.all([
        runQuery(sql),
        runQuery(`SELECT COUNT(1) AS [NullRowCount] FROM [${schemaName}].[${tableName}] WHERE ${nullConditions}`),
      ]);

      const nullCount = countResult.recordset[0]?.NullRowCount ?? 0;
      if (nullCount === 0) {
        return `✅ No NULL values found in columns [${columns.join(", ")}] of \`${table}\`.`;
      }

      return (
        `## 🚨 NULL Check: \`${table}\`\n\n` +
        `- **Rows with NULLs:** ${nullCount}\n` +
        `- **Columns checked:** ${columns.join(", ")}\n\n` +
        `### Sample Rows with NULLs\n\n` +
        toMarkdownTable(nullResult.recordset)
      );
    }

    case "sql_compare_counts": {
      const { parentTable, childTable, joinColumn } = args;
      const sql = `
        SELECT
          (SELECT COUNT(1) FROM [${parentTable}]) AS [ParentCount],
          (SELECT COUNT(1) FROM [${childTable}]) AS [ChildCount],
          (SELECT COUNT(DISTINCT [${joinColumn}]) FROM [${childTable}]) AS [DistinctFKValuesInChild],
          (SELECT COUNT(1) FROM [${parentTable}] p
            LEFT JOIN [${childTable}] c ON c.[${joinColumn}] = p.[${joinColumn}]
            WHERE c.[${joinColumn}] IS NULL) AS [ParentsWithNoChildren],
          (SELECT COUNT(1) FROM [${childTable}] c
            LEFT JOIN [${parentTable}] p ON c.[${joinColumn}] = p.[${joinColumn}]
            WHERE p.[${joinColumn}] IS NULL) AS [OrphanedChildren]
      `;
      const result = await runQuery(sql);
      const row = result.recordset[0];
      const hasIssues = row.ParentsWithNoChildren > 0 || row.OrphanedChildren > 0;

      return (
        `## 🔢 Count Comparison: \`${parentTable}\` ↔ \`${childTable}\`\n\n` +
        `| Metric | Value |\n| --- | --- |\n` +
        `| ${parentTable} rows | ${row.ParentCount} |\n` +
        `| ${childTable} rows | ${row.ChildCount} |\n` +
        `| Distinct \`${joinColumn}\` in ${childTable} | ${row.DistinctFKValuesInChild} |\n` +
        `| ${parentTable} rows with NO children | ${row.ParentsWithNoChildren} |\n` +
        `| ${childTable} orphaned (no parent) | ${row.OrphanedChildren} |\n\n` +
        (hasIssues
          ? `> ⚠️ **Issues detected!** There are data gaps between these tables.`
          : `> ✅ No obvious gaps detected.`)
      );
    }

    case "sql_diagnose_issue": {
      const { table } = args;
      const parts = table.split(".");
      const tableName = parts[parts.length - 1].replace(/'/g, "''");
      const schemaName = parts.length > 1 ? parts[0].replace(/'/g, "''") : "dbo";

      const colSql = `
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA='${schemaName}' AND TABLE_NAME='${tableName}'
        ORDER BY ORDINAL_POSITION
      `;
      const [countRes, sampleRes, colRes] = await Promise.all([
        runQuery(`SELECT COUNT(1) AS [Total] FROM [${schemaName}].[${tableName}]`),
        runQuery(`SELECT TOP 5 * FROM [${schemaName}].[${tableName}]`),
        runQuery(colSql),
      ]);

      const total = countRes.recordset[0]?.Total ?? 0;
      const columns = colRes.recordset.map((r) => r.COLUMN_NAME);

      const nullChecks = columns.map(async (col) => {
        const r = await runQuery(
          `SELECT COUNT(1) AS [NullCount] FROM [${schemaName}].[${tableName}] WHERE [${col}] IS NULL`
        );
        return { column: col, nullCount: r.recordset[0]?.NullCount ?? 0 };
      });
      const nullResults = await Promise.all(nullChecks);
      const nullIssues = nullResults.filter((r) => r.nullCount > 0);

      let out = `## 🩺 Diagnostic Report: \`${schemaName}.${tableName}\`\n\n`;
      out += `- **Total Rows:** ${total}\n\n`;

      out += `### Sample Data (5 rows)\n\n`;
      out += total > 0 ? toMarkdownTable(sampleRes.recordset) : "_Table is empty._";
      out += `\n\n`;

      out += `### NULL Summary\n\n`;
      if (nullIssues.length === 0) {
        out += `✅ No NULLs found in any column.\n\n`;
      } else {
        out += `| Column | NULL Count |\n| --- | --- |\n`;
        out += nullIssues.map((r) => `| \`${r.column}\` | **${r.nullCount}** |`).join("\n");
        out += `\n\n`;
      }

      out += `> 💡 Run \`sql_check_foreign_keys\` with table='${table}' to check for FK violations.`;
      return out;
    }

    case "sql_get_query_plan": {
      const { sql: sqlText } = args;
      const planSql = `SET SHOWPLAN_TEXT ON;\n${sqlText};\nSET SHOWPLAN_TEXT OFF;`;
      try {
        const result = await runQuery(planSql);
        const planRows = result.recordsets?.[0] || result.recordset || [];
        if (!planRows.length) return "_No query plan returned._";
        const plan = planRows.map((r) => Object.values(r)[0]).join("\n");
        return `### Query Execution Plan\n\n\`\`\`\n${plan}\n\`\`\``;
      } catch (err) {
        return `❌ Could not get query plan: ${err.message}\n\nTry running the query directly with \`sql_run_query\`.`;
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { TOOLS, handle };
