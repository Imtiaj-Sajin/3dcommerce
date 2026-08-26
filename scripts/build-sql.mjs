// Concatenates the schema and seed into one importable file for phpMyAdmin.
//   node scripts/build-sql.mjs  ->  sql/metamart_full.sql
import { readFileSync, writeFileSync } from 'fs';

const header = `-- ============================================================
--  METAMART - complete database
--  Import this file into an EMPTY database (e.g. metama_db).
--
--  phpMyAdmin:  select the database -> Import -> choose this file -> Go
--  CLI:         mysql -u USER -p DBNAME < metamart_full.sql
--
--  WARNING: the schema section drops these tables if they already exist.
--
--  After importing, sign in to /admin with:
--      admin@metamart.local  /  ChangeMe!2026
--  and change that password immediately under Settings.
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
START TRANSACTION;

`;

const schema = readFileSync('sql/01_schema.sql', 'utf8');
const seed = readFileSync('sql/02_seed.sql', 'utf8');

const out = `${header}${schema}\n\n${seed}\n\nCOMMIT;\n`;
writeFileSync('sql/metamart_full.sql', out, 'utf8');
console.log(`wrote sql/metamart_full.sql (${(out.length / 1024).toFixed(1)} KB, ${out.split('\n').length} lines)`);
