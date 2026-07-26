// connection.js — Clean SQL Server Connection Pool Manager
// Configured via environment variables (DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD, etc.)

const sql = require("mssql");

let pool = null;

async function getPool() {
  if (pool && pool.connected) {
    return pool;
  }

  const server = process.env.DB_SERVER || process.env.SQL_SERVER || "localhost";
  const database = process.env.DB_NAME || process.env.SQL_DATABASE || "master";
  const user = process.env.DB_USER || process.env.SQL_USER || "sa";
  const password = process.env.DB_PASSWORD || process.env.SQL_PASSWORD || "";
  const port = parseInt(process.env.DB_PORT || process.env.SQL_PORT || "1433", 10);
  const trustServerCertificate = process.env.DB_TRUST_CERT !== "false";
  const encrypt = process.env.DB_ENCRYPT === "true";

  const config = {
    server,
    port,
    database,
    user,
    password,
    options: {
      trustServerCertificate,
      encrypt,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 60000,
    connectionTimeout: 15000,
  };

  pool = new sql.ConnectionPool(config);
  await pool.connect();
  return pool;
}

// Run a query against the pool
async function runQuery(queryText) {
  const p = await getPool();
  return await p.request().query(queryText);
}

// Close the pool on server shutdown
async function closeAllPools() {
  if (pool) {
    try {
      await pool.close();
    } catch { }
    pool = null;
  }
}

// Return active server & database info for display
function getActiveProfile() {
  const server = process.env.DB_SERVER || process.env.SQL_SERVER || "localhost";
  const database = process.env.DB_NAME || process.env.SQL_DATABASE || "master";
  return { label: `${server} → ${database}`, server, database };
}

module.exports = {
  getPool,
  runQuery,
  closeAllPools,
  getActiveProfile,
};
