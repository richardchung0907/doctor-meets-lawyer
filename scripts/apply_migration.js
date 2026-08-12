const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.xxtmeuabohgvcqzyphtx',
  password: 'YfKMiw96UlA0E8gD',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('Connecting to PostgreSQL database pooler...');
  await client.connect();
  console.log('Connected!');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260812000000_init_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying migration 20260812000000_init_schema.sql...');
  await client.query(sql);
  console.log('Migration successfully applied!');

  // Verify created tables
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('Public tables in DB:', res.rows.map(r => r.table_name));

  await client.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
