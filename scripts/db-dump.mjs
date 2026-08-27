// Dumps the live database to one importable .sql file.
//
//   node scripts/db-dump.mjs [outfile]
//
// Written in Node rather than shelling out to mysqldump so it works anywhere
// the app runs, and so the output always matches what the app actually reads.

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const OUT = process.argv[2] || 'sql/metamart_full.sql';

// Parents before children, so foreign keys resolve on a straight import.
const ORDER = [
  'architectures', 'spaces', 'categories', 'products', 'product_images',
  'product_variants', 'tags', 'product_tags', 'product_search',
  'highlights', 'highlight_items', 'discounts', 'admin_users', 'settings',
  'ai_jobs', 'audit_log',
];

// Log tables are operational noise, not content worth shipping.
const SKIP_ROWS = new Set(['ai_jobs', 'audit_log']);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 20000,
  // keep DATE/DATETIME as strings so they round-trip exactly
  dateStrings: true,
});

const quote = (s) =>
  `'${String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(//g, '\\Z')}'`;

/**
 * mysql2 hands back JSON columns already parsed, so a JSON string like
 * "METAMART" arrives as a plain JS string. Emitting that directly produces
 * SQL text MySQL will not accept back into a JSON column - it has to be
 * re-serialised. Hence the column-type awareness.
 */
function esc(v, isJson = false) {
  if (v === null || v === undefined) return 'NULL';
  if (isJson) return quote(JSON.stringify(v));
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (typeof v === 'object') return quote(JSON.stringify(v));
  return quote(v);
}

/** Column name -> true for every JSON column on a table. */
async function jsonColumns(table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND DATA_TYPE = 'json'`,
    [process.env.DB_NAME, table]
  );
  return new Set(rows.map((r) => r.COLUMN_NAME));
}

const out = [];
const w = (s = '') => out.push(s);

w('-- ============================================================');
w('--  METAMART - complete database dump');
w(`--  Generated ${new Date().toISOString()} by scripts/db-dump.mjs`);
w('--');
w('--  Import into an EMPTY database (e.g. metama_db).');
w('--  phpMyAdmin:  select the database -> Import -> choose this file -> Go');
w('--  CLI:         mysql -u USER -p DBNAME < metamart_full.sql');
w('--');
w('--  WARNING: this DROPS each table before recreating it.');
w('--');
w('--  Default admin login is whatever it is in your live database. If this');
w('--  came from a fresh seed it is admin@metamart.local / ChangeMe!2026 -');
w('--  change it under /admin -> Settings after importing.');
w('-- ============================================================');
w('');
w('SET NAMES utf8mb4;');
w('SET FOREIGN_KEY_CHECKS = 0;');
w('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
w('SET time_zone = "+00:00";');
w('START TRANSACTION;');
w('');

let totalRows = 0;
const summary = [];

for (const table of ORDER) {
  const [[created]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
  w(`-- ------------------------------------------------------------`);
  w(`-- ${table}`);
  w(`-- ------------------------------------------------------------`);
  w(`DROP TABLE IF EXISTS \`${table}\`;`);
  w(`${created['Create Table']};`);
  w('');

  if (SKIP_ROWS.has(table)) {
    summary.push(`${table}: structure only`);
    w(`-- (rows intentionally not exported - operational log)`);
    w('');
    continue;
  }

  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  summary.push(`${table}: ${rows.length}`);
  totalRows += rows.length;
  if (!rows.length) {
    w(`-- (no rows)`);
    w('');
    continue;
  }

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `\`${c}\``).join(', ');
  const jsonCols = await jsonColumns(table);

  // Batch inserts so a large table does not become one enormous statement.
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    w(`INSERT INTO \`${table}\` (${colList}) VALUES`);
    w(chunk.map((r) => `  (${cols.map((c) => esc(r[c], jsonCols.has(c))).join(', ')})`).join(',\n') + ';');
  }
  w('');
}

w('SET FOREIGN_KEY_CHECKS = 1;');
w('COMMIT;');
w('');
w('-- end of dump');

const text = out.join('\n');
writeFileSync(OUT, text, 'utf8');
await conn.end();

console.log(`wrote ${OUT} (${(text.length / 1024).toFixed(1)} KB, ${out.length} lines)`);
console.log(`${totalRows} rows across ${ORDER.length} tables:`);
for (const s of summary) console.log(`  ${s}`);
