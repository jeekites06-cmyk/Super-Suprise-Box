import { Pool } from 'pg';
import fs from 'fs';

async function verifyFullInventory() {
  console.log('=== VERIFYING SUPER SURPRISE BOX INVENTORY & DISPLAY ===\n');

  // 1. Inspect data/boxes.json
  console.log('[STEP 1] Inspecting data/boxes.json...');
  const rawBoxes = fs.readFileSync('data/boxes.json', 'utf8');
  const jsonBoxes = JSON.parse(rawBoxes);
  console.log(`  ✔ JSON boxes count: ${jsonBoxes.length}`);
  const jsonSerials = new Set<string>();
  for (const b of jsonBoxes) {
    jsonSerials.add(b.serial);
  }
  if (jsonBoxes.length !== 15051 || jsonSerials.size !== 15051) {
    throw new Error(`data/boxes.json has ${jsonBoxes.length} records and ${jsonSerials.size} unique serials! Expected 15051.`);
  }
  if (jsonBoxes[0].serial !== 'SS00000001' || jsonBoxes[15050].serial !== 'SS00015051') {
    throw new Error(`data/boxes.json range mismatch: ${jsonBoxes[0].serial} to ${jsonBoxes[15050].serial}`);
  }
  console.log(`  ✔ JSON file intact: exactly 15,051 unique serials from SS00000001 to SS00015051.\n`);

  // 2. Inspect Neon PostgreSQL public.boxes
  console.log('[STEP 2] Inspecting Neon PostgreSQL database (public.boxes)...');
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const countRes = await pool.query('SELECT count(*) as count, count(DISTINCT serial) as distinct_serials, min(serial) as min_serial, max(serial) as max_serial, min(id) as min_id, max(id) as max_id FROM public.boxes;');
    const row = countRes.rows[0];
    console.log(`  ✔ Neon row count: ${row.count}, distinct serials: ${row.distinct_serials}`);
    console.log(`  ✔ Neon serial range: ${row.min_serial} (id ${row.min_id}) to ${row.max_serial} (id ${row.max_id})`);

    if (parseInt(row.count, 10) !== 15051 || parseInt(row.distinct_serials, 10) !== 15051) {
      throw new Error(`Neon count mismatch: ${row.count} total, ${row.distinct_serials} distinct.`);
    }

    // Check gaps in Neon
    const gapsRes = await pool.query(`
      SELECT s.num, 'SS' || LPAD(s.num::text, 8, '0') as missing_serial
      FROM generate_series(1, 15051) s(num)
      LEFT JOIN public.boxes b ON b.id = s.num
      WHERE b.id IS NULL
    `);
    if (gapsRes.rows.length > 0) {
      throw new Error(`Found ${gapsRes.rows.length} missing serial numbers in Neon database!`);
    }
    console.log(`  ✔ Zero gaps detected in Neon sequence 1 to 15,051.`);

    // Inspect statuses in Neon
    const statusRes = await pool.query('SELECT status, is_hidden, count(*) FROM public.boxes GROUP BY status, is_hidden;');
    console.log('  ✔ Neon status breakdown:', statusRes.rows);

    await pool.end();
  }
  console.log('');

  // 3. Inspect API Pagination (All 51 pages)
  console.log('[STEP 3] Testing all 51 pages from public API (/api/boxes/available)...');
  let cumulativeBoxes = 0;
  const pageSerials = new Set<string>();

  for (let p = 1; p <= 51; p++) {
    const res = await fetch(`http://localhost:3000/api/boxes/available?page=${p}&limit=300`);
    if (!res.ok) {
      throw new Error(`Page ${p} failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    const expectedPageSize = (p === 51) ? 51 : 300;

    if (data.boxes.length !== expectedPageSize) {
      throw new Error(`Page ${p} returned ${data.boxes.length} boxes (expected ${expectedPageSize})!`);
    }

    cumulativeBoxes += data.boxes.length;
    for (const b of data.boxes) {
      if (pageSerials.has(b.serial)) {
        throw new Error(`Duplicate serial ${b.serial} found across pages at page ${p}!`);
      }
      pageSerials.add(b.serial);
    }
  }

  console.log(`  ✔ All 51 pages verified successfully.`);
  console.log(`  ✔ Total boxes retrieved: ${cumulativeBoxes} (Pages 1–50: 300 each, Page 51: 51).`);
  console.log(`  ✔ Unique serial numbers across all pages: ${pageSerials.size}.\n`);

  // 4. Test Dynamic Counts in API
  console.log('[STEP 4] Verifying dynamic counts from /api/boxes/available...');
  const sampleRes = await fetch('http://localhost:3000/api/boxes/available?page=1&limit=300');
  const sampleData = await sampleRes.json();
  console.log('  ✔ Dynamic counts returned:', {
    totalInventory: sampleData.totalInventory,
    totalAvailable: sampleData.totalAvailable,
    openedCount: sampleData.openedCount,
    claimedCount: sampleData.claimedCount,
    reservedCount: sampleData.reservedCount,
    hiddenCount: sampleData.hiddenCount,
    totalPages: sampleData.totalPages,
  });
  if (sampleData.totalInventory !== 15051) {
    throw new Error(`Expected totalInventory 15051, got ${sampleData.totalInventory}`);
  }
  if (sampleData.totalPages !== 51) {
    throw new Error(`Expected totalPages 51, got ${sampleData.totalPages}`);
  }
  console.log('');

  // 5. Test Diagnostic Endpoint
  console.log('[STEP 5] Testing /api/inventory/diagnostic...');
  const diagRes = await fetch('http://localhost:3000/api/inventory/diagnostic');
  const diagData = await diagRes.json();
  if (diagData.totalRecords !== 15051 || diagData.uniqueSerialNumbers !== 15051 || diagData.missingSerialNumbers !== 0) {
    throw new Error(`Diagnostic failed: ${JSON.stringify(diagData)}`);
  }
  console.log(`  ✔ Authoritative Source of Truth: ${diagData.authoritativeSourceOfTruth} (${diagData.databaseConnectionStatus})`);
  console.log(`  ✔ Verified: 0 missing serials, 0 duplicate serials.\n`);

  // 6. Test Admin Portal access to 100 winning prizes
  console.log('[STEP 6] Testing Admin Portal access...');
  const loginRes = await fetch('http://localhost:3000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: 'Box@2026' }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    throw new Error('Admin login failed');
  }
  const adminPrizesRes = await fetch('http://localhost:3000/api/admin/prizes', {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const adminPrizesData = await adminPrizesRes.json();
  if (adminPrizesData.totalPrizes !== 100 || adminPrizesData.prizes.length !== 100) {
    throw new Error(`Admin prizes count: ${adminPrizesData.totalPrizes} (expected 100)`);
  }
  console.log(`  ✔ Admin portal intact: all 100 winning prize records preserved and accessible.`);

  const adminStatsRes = await fetch('http://localhost:3000/api/admin/stats', {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const adminStatsData = await adminStatsRes.json();
  console.log('  ✔ Admin dynamic stats:', {
    totalBoxes: adminStatsData.totalBoxes,
    availableBoxes: adminStatsData.availableBoxes,
    reservedBoxes: adminStatsData.reservedBoxes,
    hiddenBoxes: adminStatsData.hiddenBoxes,
    claimedBoxes: adminStatsData.claimedBoxes,
    openedBoxes: adminStatsData.openedBoxes,
    winningBoxes: adminStatsData.winningBoxes,
  });
  console.log('');

  // 7. Verify Public Security (Zero prize leakage)
  console.log('[STEP 7] Verifying public endpoint security...');
  const publicPrizesRes = await fetch('http://localhost:3000/api/prizes');
  const publicPrizesData = await publicPrizesRes.json();
  if (publicPrizesData.prizes && publicPrizesData.prizes.length > 0) {
    throw new Error('Public prizes leaked!');
  }
  console.log(`  ✔ Public /api/prizes safely returns 0 prizes to unauthenticated users.\n`);

  console.log('=== ALL INVENTORY RESTORATION AND INTEGRITY CHECKS PASSED! ===');
}

verifyFullInventory().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
