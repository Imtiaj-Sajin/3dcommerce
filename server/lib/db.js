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
});

/** Rows for a SELECT. */
export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** First row, or null. */
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows.length ? rows[0] : null;
}

/** Result header for INSERT/UPDATE/DELETE (insertId, affectedRows). */
export async function exec(sql, params = []) {
  const [res] = await pool.query(sql, params);
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
