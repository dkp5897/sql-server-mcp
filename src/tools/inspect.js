// tools/inspect.js — Schema and structure inspection tools
// sql_list_tables, sql_inspect_table, sql_list_stored_procs, sql_get_stored_proc_def

const { runQuery } = require("../db/connection");
const { toMarkdownTable } = require("../utils/formatter");

const TOOLS = [
  {
    name: "sql_list_tables",
    description: "List all user tables (and optionally views) in the active database, with row counts.",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Filter by schema name (e.g. 'dbo'). Default: all schemas." },
        includeViews: { type: "boolean", description: "Also list views (default: false)" },
      },
    },
  },
  {
    name: "sql_inspect_table",
    description:
      "Show full details about a table: columns with types/nullability/defaults, primary keys, foreign keys, indexes, and row count.",
    inputSchema: {
      type: "object",
      required: ["table"],
      properties: {
        table: { type: "string", description: "Table name (e.g. 'Orders' or 'dbo.Orders')" },
      },
    },
  },
  {
    name: "sql_list_stored_procs",
    description: "List all stored procedures in the active database.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Optional: filter by name pattern (e.g. 'Get%')" },
      },
    },
  },
  {
    name: "sql_get_stored_proc_def",
    description: "Get the full definition (source code) of a stored procedure.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Stored procedure name" },
      },
    },
  },
];

async function handle(toolName, args) {
  switch (toolName) {
    case "sql_list_tables": {
      const { schema, includeViews = false } = args;
      const typeFilter = includeViews ? `('U','V')` : `('U')`;
      const schemaFilter = schema ? `AND s.name = '${schema.replace(/'/g, "''")}'` : "";

      const sql = `
        SELECT
          s.name AS [Schema],
          t.name AS [Table],
          t.type_desc AS [Type],
          p.rows AS [RowCount],
          t.create_date AS [CreatedAt],
          t.modify_date AS [ModifiedAt]
        FROM sys.objects t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
        WHERE t.type IN ${typeFilter}
          AND t.is_ms_shipped = 0
          ${schemaFilter}
        ORDER BY s.name, t.name
      `;
      const result = await runQuery(sql);
      if (!result.recordset.length) return "_No tables found._";
      return `**${result.recordset.length} table(s) found**\n\n${toMarkdownTable(result.recordset)}`;
    }

    case "sql_inspect_table": {
      const { table } = args;
      const parts = table.split(".");
      const tableName = parts[parts.length - 1].replace(/'/g, "''");
      const schemaName = parts.length > 1 ? parts[0].replace(/'/g, "''") : "dbo";

      const colSql = `
        SELECT
          c.COLUMN_NAME AS [Column],
          c.DATA_TYPE AS [Type],
          CASE WHEN c.CHARACTER_MAXIMUM_LENGTH IS NOT NULL
               THEN c.DATA_TYPE + '(' + CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR) + ')'
               WHEN c.NUMERIC_PRECISION IS NOT NULL AND c.DATA_TYPE IN ('decimal','numeric')
               THEN c.DATA_TYPE + '(' + CAST(c.NUMERIC_PRECISION AS VARCHAR) + ',' + CAST(c.NUMERIC_SCALE AS VARCHAR) + ')'
               ELSE c.DATA_TYPE END AS [FullType],
          c.IS_NULLABLE AS [Nullable],
          c.COLUMN_DEFAULT AS [Default],
          COLUMNPROPERTY(OBJECT_ID('${schemaName}.${tableName}'), c.COLUMN_NAME, 'IsIdentity') AS [IsIdentity]
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = '${schemaName}' AND c.TABLE_NAME = '${tableName}'
        ORDER BY c.ORDINAL_POSITION
      `;

      const pkSql = `
        SELECT c.COLUMN_NAME AS [PKColumn]
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE c
          ON tc.CONSTRAINT_NAME = c.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = c.TABLE_SCHEMA
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND tc.TABLE_SCHEMA = '${schemaName}' AND tc.TABLE_NAME = '${tableName}'
        ORDER BY c.ORDINAL_POSITION
      `;

      const fkSql = `
        SELECT
          fk.name AS [FKName],
          cp.name AS [Column],
          OBJECT_NAME(fk.referenced_object_id) AS [ReferencedTable],
          cr.name AS [ReferencedColumn]
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
        JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
        WHERE OBJECT_NAME(fk.parent_object_id) = '${tableName}'
          AND OBJECT_SCHEMA_NAME(fk.parent_object_id) = '${schemaName}'
      `;

      const idxSql = `
        SELECT
          i.name AS [IndexName],
          i.type_desc AS [Type],
          i.is_unique AS [IsUnique],
          i.is_primary_key AS [IsPK],
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS [Columns]
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID('${schemaName}.${tableName}') AND i.name IS NOT NULL
        GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
      `;

      const countSql = `SELECT COUNT(1) AS [RowCount] FROM [${schemaName}].[${tableName}]`;

      const [cols, pks, fks, idxs, cnt] = await Promise.all([
        runQuery(colSql),
        runQuery(pkSql),
        runQuery(fkSql),
        runQuery(idxSql),
        runQuery(countSql),
      ]);

      const rowCount = cnt.recordset[0]?.RowCount ?? "?";
      const pkCols = pks.recordset.map((r) => r.PKColumn).join(", ");

      let out = `## 🗂️ Table: \`${schemaName}.${tableName}\`\n`;
      out += `- **Row Count:** ${rowCount}\n`;
      out += `- **Primary Key:** ${pkCols || "_none_"}\n\n`;

      out += `### Columns\n\n${toMarkdownTable(cols.recordset)}\n\n`;

      if (fks.recordset.length) {
        out += `### Foreign Keys\n\n${toMarkdownTable(fks.recordset)}\n\n`;
      }
      if (idxs.recordset.length) {
        out += `### Indexes\n\n${toMarkdownTable(idxs.recordset)}\n\n`;
      }

      return out;
    }

    case "sql_list_stored_procs": {
      const { filter } = args;
      const likeFilter = filter ? `AND p.name LIKE '${filter.replace(/'/g, "''")}'` : "";
      const sql = `
        SELECT
          s.name AS [Schema],
          p.name AS [ProcedureName],
          p.create_date AS [Created],
          p.modify_date AS [Modified]
        FROM sys.procedures p
        JOIN sys.schemas s ON p.schema_id = s.schema_id
        WHERE p.is_ms_shipped = 0 ${likeFilter}
        ORDER BY s.name, p.name
      `;
      const result = await runQuery(sql);
      if (!result.recordset.length) return "_No stored procedures found._";
      return `**${result.recordset.length} stored procedure(s)**\n\n${toMarkdownTable(result.recordset)}`;
    }

    case "sql_get_stored_proc_def": {
      const { name } = args;
      const sql = `
        SELECT OBJECT_DEFINITION(OBJECT_ID('${name.replace(/'/g, "''")}')) AS [Definition]
      `;
      const result = await runQuery(sql);
      const def = result.recordset[0]?.Definition;
      if (!def) return `❌ Stored procedure '${name}' not found or has no definition.`;
      return `### Stored Procedure: \`${name}\`\n\n\`\`\`sql\n${def}\n\`\`\``;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { TOOLS, handle };
