// formatter.js — Format SQL query results as readable markdown

/**
 * Format a mssql result set as a markdown table.
 * @param {import('mssql').IRecordSet} recordset
 * @param {number} maxRows - truncate after this many rows
 */
function toMarkdownTable(recordset, maxRows = 200) {
  if (!recordset || recordset.length === 0) {
    return "_No rows returned._";
  }

  const rows = recordset.slice(0, maxRows);
  const columns = Object.keys(rows[0]);

  // Header
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;

  // Rows
  const body = rows.map((row) => {
    const cells = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "_null_";
      if (val instanceof Date) return val.toISOString();
      const str = String(val).replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
      return str.length > 80 ? str.substring(0, 77) + "..." : str;
    });
    return `| ${cells.join(" | ")} |`;
  });

  let output = [header, divider, ...body].join("\n");

  if (recordset.length > maxRows) {
    output += `\n\n> ⚠️ Showing first **${maxRows}** of **${recordset.length}** rows. Refine your query to see more.`;
  }

  return output;
}

/**
 * Format multiple result sets (e.g. from stored procs)
 */
function formatResults(result, label = "") {
  const sets = result.recordsets || (result.recordset ? [result.recordset] : []);
  if (sets.length === 0) {
    const affected = result.rowsAffected ? result.rowsAffected.join(", ") : "0";
    return `✅ Query executed. Rows affected: **${affected}**`;
  }

  if (sets.length === 1) {
    const count = sets[0].length;
    return `**${count} row(s) returned${label ? ` — ${label}` : ""}**\n\n${toMarkdownTable(sets[0])}`;
  }

  return sets
    .map((rs, i) => `### Result Set ${i + 1} (${rs.length} rows)\n\n${toMarkdownTable(rs)}`)
    .join("\n\n---\n\n");
}

/**
 * Format a single scalar or key-value object as a definition list
 */
function formatKeyValue(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `- **${k}**: ${v === null ? "_null_" : v}`)
    .join("\n");
}

module.exports = { toMarkdownTable, formatResults, formatKeyValue };
