const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// 数据库凭据不硬编码进仓库：密码从环境变量读取，其次从 supabase keys.txt 读取，
// 最后从 keys.txt 兜底，缺省时报错退出
// 用法示例（Windows PowerShell）：
//   $env:SUPABASE_DB_PASSWORD='<密码>'; node scripts/apply_migration.js
// 或将密码写入 supabase keys.txt 的 `password to Postgres database` 键（推荐）
function loadKeysFromFile(...paths) {
  const keys = {};
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx > 0) keys[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    } catch { /* 文件不存在则跳过 */ }
  }
  return keys;
}

const DB_PASSWORD =
  process.env.SUPABASE_DB_PASSWORD ||
  loadKeysFromFile('supabase keys.txt')['password to Postgres database'] ||
  loadKeysFromFile('keys.txt')['Supabase DB password'];
if (!DB_PASSWORD) {
  console.error('FATAL: 未找到数据库密码，请任选其一设置：');
  console.error('  1) 环境变量：$env:SUPABASE_DB_PASSWORD="<密码>" 再运行本脚本');
  console.error('  2) supabase keys.txt 的 `password to Postgres database` 键（推荐）');
  console.error('  3) keys.txt 的 `Supabase DB password` 键（兜底）');
  process.exit(1);
}

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.xxtmeuabohgvcqzyphtx',
  password: DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('Connecting to PostgreSQL database pooler...');
  await client.connect();
  console.log('Connected!');

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    await client.end();
    return;
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    await client.query(sql);
    console.log(`Applied ${file}`);
  }

  // Verify created tables
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('Public tables in DB:', res.rows.map((r) => r.table_name).join(', '));

  await client.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
