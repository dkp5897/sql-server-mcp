// connection.js — Multi-Connection SQL Server Pool & Profile Manager
// Configured via environment variables (DB1_*/DB2_* prefixes, DB_CONNECTIONS JSON array, or single DB_SERVER/DB_NAME/etc.)
// Supports active connection switching and multi-database execution.

const sql = require("mssql");

// In-memory state
const pools = new Map();      // connectionName -> ConnectionPool
const profiles = new Map();   // connectionName -> profile object
let activeConnectionName = "";

// Initialize profiles from environment variables on startup
function initFromEnv() {
  profiles.clear();

  // 1. Check for JSON array string in process.env.DB_CONNECTIONS or process.env.SQL_CONNECTIONS
  const jsonConns = process.env.DB_CONNECTIONS || process.env.SQL_CONNECTIONS;
  if (jsonConns) {
    try {
      const parsed = JSON.parse(jsonConns);
      const connList = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of connList) {
        const name = item.name || item.id || item.database || `conn-${profiles.size + 1}`;
        profiles.set(name, {
          name,
          label: item.label || `${name} (${item.server || "localhost"} → ${item.database})`,
          server: item.server || "localhost",
          port: parseInt(item.port || "1433", 10),
          database: item.database || "master",
          user: item.user || item.username || "sa",
          password: item.password || "",
          options: {
            trustServerCertificate: item.trustServerCertificate !== false && item.trustCert !== false,
            encrypt: item.encrypt === true,
          },
        });
        if (!activeConnectionName) activeConnectionName = name;
      }
    } catch (err) {
      process.stderr.write(`Warning: Failed to parse DB_CONNECTIONS JSON: ${err.message}\n`);
    }
  }

  // 2. Check for numbered environment variables (DB1_SERVER, DB2_SERVER, etc.)
  for (let i = 1; i <= 20; i++) {
    const s = process.env[`DB${i}_SERVER`] || process.env[`SQL${i}_SERVER`];
    if (s) {
      const connName = process.env[`DB${i}_NAME`] || process.env[`SQL${i}_NAME`] || `db${i}`;
      profiles.set(connName, {
        name: connName,
        label: process.env[`DB${i}_LABEL`] || `${connName} (${s} → ${process.env[`DB${i}_DATABASE`] || process.env[`DB${i}_DB`] || "master"})`,
        server: s,
        port: parseInt(process.env[`DB${i}_PORT`] || process.env[`SQL${i}_PORT`] || "1433", 10),
        database: process.env[`DB${i}_DATABASE`] || process.env[`DB${i}_DB`] || process.env[`SQL${i}_DATABASE`] || "master",
        user: process.env[`DB${i}_USER`] || process.env[`SQL${i}_USER`] || "sa",
        password: process.env[`DB${i}_PASSWORD`] || process.env[`SQL${i}_PASSWORD`] || "",
        options: {
          trustServerCertificate: process.env[`DB${i}_TRUST_CERT`] !== "false",
          encrypt: process.env[`DB${i}_ENCRYPT`] === "true",
        },
      });
      if (!activeConnectionName) activeConnectionName = connName;
    }
  }

  // 3. Check for single environment variables (DB_SERVER / SQL_SERVER)
  const envServer = process.env.DB_SERVER || process.env.SQL_SERVER;
  if (envServer && !profiles.has("default")) {
    const defaultProfile = {
      name: "default",
      label: process.env.DB_LABEL || `default (${envServer} → ${process.env.DB_NAME || "master"})`,
      server: envServer,
      port: parseInt(process.env.DB_PORT || process.env.SQL_PORT || "1433", 10),
      database: process.env.DB_NAME || process.env.SQL_DATABASE || "master",
      user: process.env.DB_USER || process.env.SQL_USER || "sa",
      password: process.env.DB_PASSWORD || process.env.SQL_PASSWORD || "",
      options: {
        trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
        encrypt: process.env.DB_ENCRYPT === "true",
      },
    };
    profiles.set("default", defaultProfile);
    if (!activeConnectionName) activeConnectionName = "default";
  }

  // 4. Fallback default if nothing was provided
  if (profiles.size === 0) {
    profiles.set("default", {
      name: "default",
      label: "default (localhost → master)",
      server: "localhost",
      port: 1433,
      database: "master",
      user: "sa",
      password: "",
      options: { trustServerCertificate: true, encrypt: false },
    });
    activeConnectionName = "default";
  }
}

// Load env configurations on module load
initFromEnv();

function getActiveConnectionName() {
  if (!activeConnectionName || !profiles.has(activeConnectionName)) {
    activeConnectionName = profiles.keys().next().value || "default";
  }
  return activeConnectionName;
}

function setActiveConnection(name) {
  if (!profiles.has(name)) {
    const available = Array.from(profiles.keys()).join(", ") || "none";
    throw new Error(`Connection profile '${name}' does not exist. Available connections: ${available}`);
  }
  activeConnectionName = name;
}

async function getPool(name) {
  const connName = name || getActiveConnectionName();
  const profile = profiles.get(connName);
  if (!profile) {
    const available = Array.from(profiles.keys()).join(", ") || "none";
    throw new Error(`Connection profile '${connName}' not found. Available connections: ${available}`);
  }

  if (pools.has(connName)) {
    const existing = pools.get(connName);
    if (existing.connected) return existing;
    pools.delete(connName);
  }

  const rawServer = profile.server;
  let server = rawServer;
  let instanceName = profile.instanceName || null;
  if (rawServer.includes("\\")) {
    const parts = rawServer.split("\\");
    server = parts[0];
    instanceName = parts[1];
  }

  const config = {
    server,
    database: profile.database,
    user: profile.user,
    password: profile.password,
    options: {
      trustServerCertificate: profile.options?.trustServerCertificate !== false,
      encrypt: profile.options?.encrypt === true,
      ...(instanceName ? { instanceName } : {}),
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 60000,
    connectionTimeout: 15000,
  };

  if (profile.port && !instanceName) {
    config.port = profile.port;
  }

  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  pools.set(connName, pool);
  return pool;
}

async function runQuery(queryText, connectionName) {
  const pool = await getPool(connectionName);
  return await pool.request().query(queryText);
}

async function closeAllPools() {
  for (const [, p] of pools) {
    try { await p.close(); } catch {}
  }
  pools.clear();
}

function listConnections() {
  const active = getActiveConnectionName();
  return Array.from(profiles.values()).map((p) => ({
    name: p.name,
    label: p.label,
    server: p.server,
    database: p.database,
    isDefault: p.name === active,
    isActive: p.name === active,
  }));
}

function addConnection(profile, setAsActive = false) {
  if (!profile.name) throw new Error("Connection profile must have a 'name'.");
  const p = {
    name: profile.name,
    label: profile.label || `${profile.name} (${profile.server || "localhost"} → ${profile.database || "master"})`,
    server: profile.server || "localhost",
    port: parseInt(profile.port || "1433", 10),
    database: profile.database || "master",
    user: profile.user || "sa",
    password: profile.password || "",
    options: {
      trustServerCertificate: profile.trustServerCertificate !== false,
      encrypt: profile.encrypt === true,
    },
  };
  profiles.set(p.name, p);
  if (setAsActive || !activeConnectionName) {
    activeConnectionName = p.name;
  }
  return p;
}

async function removeConnection(name) {
  if (pools.has(name)) {
    try { await pools.get(name).close(); } catch {}
    pools.delete(name);
  }
  profiles.delete(name);
  if (activeConnectionName === name) {
    activeConnectionName = profiles.keys().next().value || "";
  }
}

function getActiveProfile(connectionName) {
  const name = connectionName || getActiveConnectionName();
  const profile = profiles.get(name);
  if (!profile) return { label: name, server: "?", database: "?" };
  return { label: profile.label || `${profile.name} (${profile.server} → ${profile.database})`, server: profile.server, database: profile.database };
}

module.exports = {
  getPool,
  runQuery,
  closeAllPools,
  getActiveProfile,
  getActiveConnectionName,
  setActiveConnection,
  listConnections,
  addConnection,
  removeConnection,
};
