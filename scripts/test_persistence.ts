import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

async function testPersistence() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const adminPin = process.env.ADMIN_PIN || 'Box@2026';

  console.log('1. Testing Admin Login...');
  const loginRes = await fetch('http://localhost:3000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: adminPin }),
  });
  const loginData = (await loginRes.json()) as any;
  if (!loginData.success || !loginData.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.token;
  console.log('   Admin Login SUCCESS. Session active.');

  console.log('\n2. Testing Admin Hide Box SS00000005...');
  const hideRes = await fetch('http://localhost:3000/api/admin/boxes/visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ serial: 'SS00000005', isHidden: true }),
  });
  const hideData = (await hideRes.json()) as any;
  console.log('   Admin visibility response:', hideData.message);

  console.log('\n3. Direct SQL Verification on Neon PostgreSQL...');
  const sqlRes1 = await pool.query('SELECT serial, is_hidden FROM public.boxes WHERE serial = $1;', ['SS00000005']);
  console.log('   Neon DB row state:', sqlRes1.rows[0]);
  if (!sqlRes1.rows[0]?.is_hidden) {
    throw new Error('Neon database was not updated with is_hidden=true!');
  }

  console.log('\n4. Verifying Public API excludes hidden box...');
  const pubRes = await fetch('http://localhost:3000/api/boxes?search=SS00000005');
  const pubData = (await pubRes.json()) as any;
  console.log('   Public search results count:', pubData.boxes.length);
  if (pubData.boxes.some((b: any) => b.serial === 'SS00000005')) {
    throw new Error('Hidden box was returned in public search!');
  }

  console.log('\n5. Testing Admin Unhide Box SS00000005...');
  const unhideRes = await fetch('http://localhost:3000/api/admin/boxes/visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ serial: 'SS00000005', isHidden: false }),
  });
  const unhideData = (await unhideRes.json()) as any;
  console.log('   Admin visibility response:', unhideData.message);

  const sqlRes2 = await pool.query('SELECT serial, is_hidden FROM public.boxes WHERE serial = $1;', ['SS00000005']);
  console.log('   Neon DB row restored state:', sqlRes2.rows[0]);
  if (sqlRes2.rows[0]?.is_hidden) {
    throw new Error('Neon database was not updated with is_hidden=false!');
  }

  const diagRes = await fetch('http://localhost:3000/api/inventory/diagnostic');
  const diag = (await diagRes.json()) as any;
  console.log('\n6. Diagnostic verification after restore:');
  console.log('   Total Records:', diag.totalRecords);
  console.log('   Available Boxes:', diag.availableBoxes);
  console.log('   Hidden Boxes:', diag.hiddenBoxes);

  await pool.end();
  console.log('\nALL NEON DATABASE PERSISTENCE TESTS PASSED CLEANLY!');
}

testPersistence().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
