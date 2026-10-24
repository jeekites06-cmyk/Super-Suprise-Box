import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';

async function verifyNeonConnection() {
  console.log('========================================================');
  console.log('   SUPER SURPRISE BOX: SECURE NEON POSTGRESQL CHECK');
  console.log('========================================================\n');

  const rawUrl = process.env.DATABASE_URL?.trim();

  if (!rawUrl) {
    console.log('STATUS: [DATABASE_URL NOT CONFIGURED]');
    console.log('Next Step: Paste your Neon pooled connection string into the AI Studio');
    console.log('Secrets / Environment panel under DATABASE_URL.\n');
    process.exit(1);
  }

  // Parse connection details securely without leaking passwords
  let host = 'unknown';
  let database = 'unknown';
  let port = '5432';
  let isNeon = false;

  try {
    const parsed = new URL(rawUrl);
    host = parsed.hostname;
    database = parsed.pathname ? parsed.pathname.replace('/', '') : 'neondb';
    port = parsed.port || '5432';
    isNeon = parsed.hostname.includes('neon.tech');
  } catch (e) {
    console.error('STATUS: [INVALID DATABASE_URL FORMAT]');
    console.error('Please verify that DATABASE_URL follows standard URI format:');
    console.error('postgresql://user:password@host/database?sslmode=require\n');
    process.exit(1);
  }

  console.log('Connection Parameters (Sanitized):');
  console.log(`  - Target Host:     ${host}`);
  console.log(`  - Port:            ${port}`);
  console.log(`  - Database:        ${database}`);
  console.log(`  - Neon Provider:   ${isNeon ? 'YES (Verified Neon Cloud)' : 'Custom PostgreSQL'}`);
  console.log(`  - SSL Mode:        require`);
  console.log('\nTesting live connection to Neon PostgreSQL...');

  const pool = new Pool({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('  -> Connection handshake: SUCCESSFUL!');

    // 1. Check version
    const versionRes = await client.query('SELECT version();');
    const versionStr = versionRes.rows[0]?.version || 'PostgreSQL';
    console.log(`  -> PostgreSQL Engine:   ${versionStr.split(',')[0]}`);

    // 2. Check current time on database server
    const timeRes = await client.query('SELECT NOW() as db_time;');
    console.log(`  -> Database Timestamp:   ${timeRes.rows[0]?.db_time}`);

    // 3. Inspect existing tables in neondb
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = tablesRes.rows.map((r: { table_name: string }) => r.table_name);
    console.log(`  -> Existing Tables:     [${tableNames.length > 0 ? tableNames.join(', ') : 'None yet (Clean Database)'}]`);

    client.release();
    await pool.end();

    console.log('\n========================================================');
    console.log('   RESULT: NEON POSTGRESQL IS READY FOR MIGRATION!');
    console.log('========================================================\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\nSTATUS: [CONNECTION FAILED]');
    console.error(`Error message: ${msg}`);
    console.error('\nPlease verify your password, user permissions, and IP allowances in Neon Console.\n');
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

verifyNeonConnection().catch((err) => {
  console.error('Unexpected script error:', err);
  process.exit(1);
});
