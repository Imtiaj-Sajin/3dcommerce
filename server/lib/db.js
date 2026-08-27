// MySQL connection pool + small query helpers.
import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
  charset: 'utf8mb4',
  timezone: 'Z',
  // A remote MySQL will drop connections that have been idle a while. Without
  // keepalive the pool keeps handing out sockets the server already closed,
  // and the first query after a quiet spell dies with ECONNRESET.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Errors on a pooled connection must not reach the process as an unhandled
// event - the pool discards the connection and the next query gets a fresh one.
pool.on('error', (e) => console.warn('[db] pool connection error:', e.code || e.message));

// Failures that mean "this socket is dead", not "your query is wrong".
const TRANSIENT = new Set([
  'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ETIMEDOUT',
  'ECONNREFUSED', 'ER_CON_COUNT_ERROR', 'POOL_CLOSED',
]);

/** Run a query, retrying once on a dropped connection. */
async function run(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    if (!TRANSIENT.has(e.code)) throw e;
    console.warn(`[db] ${e.code} - retrying once on a fresh connection`);
    return pool.query(sql, params);
  }
}

/** Rows for a SELECT. */
export async function q(sql, params = []) {
  const [rows] = await run(sql, params);
  return rows;
}

/** First row, or null. */
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows.length ? rows[0] : null;
}

/** Result header for INSERT/UPDATE/DELETE (insertId, affectedRows). */
export async function exec(sql, params = []) {
  const [res] = await run(sql, params);
  return res;
}

/** Run fn inside a transaction, rolling back on any throw. */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function ping() {
  const r = await one('SELECT 1 AS ok');
  return r?.ok === 1;
}
