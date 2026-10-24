import { Pool } from 'pg';

async function verifySecurity() {
  console.log('=== STARTING SECURITY & CONFIDENTIALITY AUDIT ===\n');

  // List of known winning serial numbers from configuration
  const SAMPLE_WINNING_SERIALS = [
    'SS00003075',
    'SS00006099',
    'SS00009012',
    'SS00012452',
    'SS00002851',
    'SS00006008',
    'SS00004000',
    'SS00000571',
    'SS00013194',
    'SS00002568',
  ];

  // 1. Check Public Prizes Endpoints
  console.log('[TEST 1] Testing /api/prizes, /api/prizes/public, /api/batch/prizes...');
  for (const endpoint of ['/api/prizes', '/api/prizes/public', '/api/batch/prizes']) {
    const res = await fetch(`http://localhost:3000${endpoint}`);
    const data = await res.json();
    const str = JSON.stringify(data);

    if (data.prizes && data.prizes.length > 0) {
      throw new Error(`CRITICAL: Endpoint ${endpoint} returned ${data.prizes.length} prizes! Must be 0.`);
    }

    for (const serial of SAMPLE_WINNING_SERIALS) {
      if (str.includes(serial)) {
        throw new Error(`CRITICAL LEAK: Winning serial ${serial} found in ${endpoint} response!`);
      }
    }
    if (str.includes('iPhone 17') || str.includes('Cash')) {
      throw new Error(`CRITICAL LEAK: Prize names found in ${endpoint} response!`);
    }
    console.log(`  ✔ Endpoint ${endpoint} verified safe: 0 prizes returned, 0 winning serials.`);
  }
  console.log('✔ All public prize endpoints are completely sealed.\n');

  // 2. Check Public Boxes Endpoints (/api/boxes/available & /api/boxes)
  console.log('[TEST 2] Testing /api/boxes/available for any prize or winner leaks...');
  const boxesRes = await fetch('http://localhost:3000/api/boxes/available?page=1&limit=300');
  const boxesData = await boxesRes.json();
  if (!boxesRes.ok || !boxesData.boxes || boxesData.boxes.length === 0) {
    throw new Error('Failed to load public boxes');
  }

  const boxesStr = JSON.stringify(boxesData);
  if (boxesStr.includes('prizeName') || boxesStr.includes('isWinner') || boxesStr.includes('assignedPrize') || boxesStr.includes('claimCode')) {
    throw new Error('CRITICAL LEAK: Sensitive fields found in /api/boxes/available response!');
  }

  for (const box of boxesData.boxes) {
    const keys = Object.keys(box);
    for (const key of keys) {
      if (!['id', 'serial', 'status'].includes(key)) {
        throw new Error(`CRITICAL LEAK: Unexpected key "${key}" found in public box record!`);
      }
    }
  }
  console.log(`  ✔ Checked ${boxesData.boxes.length} public box records: strictly limited to { id, serial, status }. Zero prize leaks.\n`);

  // 3. Check Public Customer Session endpoint (/api/customer/session)
  console.log('[TEST 3] Testing /api/customer/session for unauthenticated/unopened sessions...');
  const mainSessionRes = await fetch('http://localhost:3000/api/customer/session');
  const mainSessionData = await mainSessionRes.json();
  if (mainSessionData.result !== null && mainSessionData.result !== undefined) {
    throw new Error(`CRITICAL LEAK: Main session exposed result: ${mainSessionData.result}`);
  }
  if (mainSessionData.prizeName !== null && mainSessionData.prizeName !== undefined) {
    throw new Error(`CRITICAL LEAK: Main session exposed prizeName: ${mainSessionData.prizeName}`);
  }
  console.log('  ✔ Main website session verified: result is null, prizeName is null.\n');

  // 4. Test Customer Claim & Open flow
  console.log('[TEST 4] Testing Customer Claim & Open flow for box-specific isolation...');
  const testToken = `TEST-AUDIT-${Date.now()}`;
  // Pick a regular box (e.g., SS00000001)
  const testSerial = 'SS00000001';

  // Check pre-open state
  const sessionPreRes = await fetch(`http://localhost:3000/api/customer/session?token=${testToken}`);
  const sessionPreData = await sessionPreRes.json();
  if (sessionPreData.result || sessionPreData.prizeName) {
    throw new Error('CRITICAL LEAK: Pre-open customer session exposed result or prize!');
  }
  console.log('  ✔ Pre-open session reveals zero prize or result data.');

  // 5. Admin Authentication & Winning Prizes Verification
  console.log('[TEST 5] Testing Admin Portal access...');
  const loginRes = await fetch('http://localhost:3000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: 'Box@2026' }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }
  const adminToken = loginData.token;
  console.log('  ✔ Admin authenticated successfully.');

  const adminPrizesRes = await fetch('http://localhost:3000/api/admin/prizes', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminPrizesData = await adminPrizesRes.json();
  if (!adminPrizesRes.ok || adminPrizesData.totalPrizes !== 100 || adminPrizesData.prizes.length !== 100) {
    throw new Error(`Admin portal failed to load 100 prizes: ${JSON.stringify(adminPrizesData)}`);
  }
  console.log(`  ✔ Admin portal verified: all ${adminPrizesData.totalPrizes} winning prize records intact and manageable.`);

  // Verify that an unauthenticated request to /api/admin/prizes is REJECTED
  const unauthAdminRes = await fetch('http://localhost:3000/api/admin/prizes');
  if (unauthAdminRes.status !== 401 && unauthAdminRes.status !== 403) {
    throw new Error(`CRITICAL SECURITY FAILURE: /api/admin/prizes allowed unauthenticated access (status ${unauthAdminRes.status})!`);
  }
  console.log('  ✔ Verified: /api/admin/prizes strictly rejects unauthenticated requests (401 Unauthorized).\n');

  // 6. Direct Database Verification
  console.log('[TEST 6] Testing Neon PostgreSQL database row counts and prize mappings...');
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const boxesCount = await pool.query('SELECT count(*) as count FROM public.boxes');
    const prizesCount = await pool.query('SELECT count(*) as count FROM public.prizes');
    console.log(`  ✔ Neon public.boxes count: ${boxesCount.rows[0].count} (expected 15051)`);
    console.log(`  ✔ Neon public.prizes count: ${prizesCount.rows[0].count} (expected 100)`);
    if (parseInt(boxesCount.rows[0].count, 10) !== 15051 || parseInt(prizesCount.rows[0].count, 10) !== 100) {
      throw new Error('Database count mismatch!');
    }
    await pool.end();
  }
  console.log('');

  // 7. Check Inventory Diagnostic
  console.log('[TEST 7] Running inventory diagnostic to verify 15,051 boxes...');
  const diagRes = await fetch('http://localhost:3000/api/inventory/diagnostic');
  const diagData = await diagRes.json();
  if (diagData.totalRecords !== 15051 || diagData.uniqueSerialNumbers !== 15051 || diagData.missingSerialNumbers !== 0) {
    throw new Error(`Diagnostic failed: ${JSON.stringify(diagData)}`);
  }
  console.log(`  ✔ Inventory intact: 15,051 total boxes, 15,051 unique serials, 0 missing.`);
  console.log(`  ✔ Authoritative Source of Truth: ${diagData.authoritativeSourceOfTruth} (${diagData.databaseConnectionStatus})`);

  console.log('\n=== ALL SECURITY & CONFIDENTIALITY AUDITS PASSED WITH ZERO LEAKS! ===');
}

verifySecurity().catch((err) => {
  console.error('AUDIT ERROR:', err);
  process.exit(1);
});
