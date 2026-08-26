// Applies .sql files to the configured database, in order.
//   node scripts/db-apply.mjs sql/01_schema.sql sql/02_seed.sql
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/db-apply.mjs <file.sql> [more.sql ...]');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  connectTimeout: 20000,
});

try {
  for (const f of files) {
    const sql = readFileSync(f, 'utf8');
    process.stdout.write(`applying ${f} (${(sql.length / 1024).toFixed(1)} KB) ... `);
    await conn.query(sql);
    console.log('ok');
  }

  const [tables] = await conn.query('SHOW TABLES');
  console.log(`\ntables now: ${tables.length}`);
  for (const t of tables) {
    const name = Object.values(t)[0];
    const [[{ c }]] = await conn.query(`SELECT COUNT(*) c FROM \`${name}\``);
    console.log(`  ${name.padEnd(20)} ${c}`);
  }
} catch (e) {
  console.error('\nFAILED:', e.sqlMessage || e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
