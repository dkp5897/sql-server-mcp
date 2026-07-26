// guard.js — Permission model for write operations
//
// RULES:
//   SELECT / sp_help / sp_columns / sys views  →  runs immediately, no confirmation
//   INSERT / UPDATE / DELETE / DDL / EXEC procs →  dry-run preview first
//       → caller must pass confirm=true to actually execute
//
// HARD BLOCKED (never allowed):
//   DROP DATABASE, xp_cmdshell, BULK INSERT, KILL, etc.

const SELECT_PATTERN = /^\s*(SELECT|WITH\b|EXEC\s+sp_help|EXEC\s+sp_columns|EXEC\s+sp_tables|EXEC\s+sp_stored_procedures|EXEC\s+sp_pkeys|EXEC\s+sp_fkeys|EXEC\s+sp_helpconstraint|SET\s+STATISTICS|DBCC\s+SHOW_STATISTICS)/i;

const BLOCKED_PATTERNS = [
  { re: /\bDROP\s+DATABASE\b/i, reason: "DROP DATABASE is not allowed." },
  { re: /\bDROP\s+SERVER\b/i, reason: "DROP SERVER is not allowed." },
  { re: /\bxp_cmdshell\b/i, reason: "xp_cmdshell (OS shell access) is blocked." },
  { re: /\bOPENROWSET\b/i, reason: "OPENROWSET is blocked." },
  { re: /\bBULK\s+INSERT\b/i, reason: "BULK INSERT from files is blocked." },
  { re: /\bKILL\s+\d+/i, reason: "KILL (terminate connection) is blocked." },
  { re: /\bALTER\s+LOGIN\s+\S+\s+DISABLE\b/i, reason: "Disabling logins is blocked." },
  { re: /\bDROP\s+LOGIN\b/i, reason: "DROP LOGIN is blocked." },
];

/**
 * Classify a SQL statement.
 * Returns: { allowed, isReadOnly, requiresConfirm, blockedReason }
 */
function classifyQuery(sqlText) {
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(sqlText)) {
      return { allowed: false, isReadOnly: false, requiresConfirm: false, blockedReason: reason };
    }
  }
  const isReadOnly = SELECT_PATTERN.test(sqlText);
  return { allowed: true, isReadOnly, requiresConfirm: !isReadOnly };
}

/**
 * Build a dry-run preview message for write operations.
 * This is shown to the user BEFORE they confirm execution.
 */
function buildWritePreview(sqlText, connectionLabel) {
  return [
    `## ⚠️ Write Operation — Preview (Not Executed)`,
    ``,
    `**Connection:** \`${connectionLabel}\``,
    ``,
    `**SQL to be executed:**`,
    "```sql",
    sqlText.trim(),
    "```",
    ``,
    `> Nothing has been executed yet.`,
    `> To run this, call the tool again with **\`"confirm": true\`**.`,
  ].join("\n");
}

/**
 * Auto-add TOP N to SELECT queries that don't already limit rows,
 * to prevent accidentally dumping huge tables.
 */
function addSelectTopGuard(sqlText, maxRows = 500) {
  if (/SELECT\s+TOP\s+/i.test(sqlText)) return sqlText;         // already has TOP
  if (/OFFSET\s+\d+\s+ROWS/i.test(sqlText)) return sqlText;    // uses OFFSET/FETCH
  if (/COUNT\s*\(/i.test(sqlText)) return sqlText;              // aggregate only
  return sqlText.replace(/SELECT\s+/i, `SELECT TOP ${maxRows} `);
}

module.exports = { classifyQuery, buildWritePreview, addSelectTopGuard };
