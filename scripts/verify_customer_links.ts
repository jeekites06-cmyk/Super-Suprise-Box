import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = 'Box@2026';

async function runTests() {
  console.log('====================================================');
  console.log('SUPER SURPRISE BOX: SECURE ONE-TIME LINK VERIFICATION');
  console.log('====================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      testPassed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      testFailed++;
    }
  }

  // 1. Check Database connection & 15,051 boxes and 100 prizes intact
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const countRes = await pool.query('SELECT COUNT(*)::int as count, status FROM public.boxes GROUP BY status');
  console.log('Database box counts:', countRes.rows);
  const totalRes = await pool.query('SELECT COUNT(*)::int as count FROM public.boxes');
  assert(totalRes.rows[0].count === 15051, `Total boxes in database is exactly 15,051 (found: ${totalRes.rows[0].count})`);

  const prizeCountRes = await pool.query('SELECT COUNT(*)::int as count FROM public.prizes');
  assert(prizeCountRes.rows[0].count === 100, `Winning prize assignments in database is exactly 100 (found: ${prizeCountRes.rows[0].count})`);

  // Wait for server to be responsive
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/boxes?page=1&limit=1`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  if (!ready) {
    throw new Error('Server at ' + BASE_URL + ' is not ready after 12 seconds');
  }

  // 2. Unauthenticated link generation MUST fail (401)
  console.log('\n--- TEST 1: Unauthenticated Admin Rejection ---');
  const unauthGen = await fetch(`${BASE_URL}/api/admin/links/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxSerial: 'SS00000001' })
  });
  assert(unauthGen.status === 401, `Unauthenticated link generation returns 401 (got ${unauthGen.status})`);

  const unauthList = await fetch(`${BASE_URL}/api/admin/links`);
  assert(unauthList.status === 401, `Unauthenticated link listing returns 401 (got ${unauthList.status})`);

  // 3. Admin Login & Authenticated Link Generation
  console.log('\n--- TEST 2: Admin Login & Link Generation ---');
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: ADMIN_PIN })
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200 && !!loginData.token, 'Admin login succeeded with session token');
  const adminToken = loginData.token;

  // Generate a link for SS00000100
  const genRes = await fetch(`${BASE_URL}/api/admin/links/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ boxSerial: 'SS00000100', note: 'VIP Customer Test #1' })
  });
  const genData = await genRes.json();
  assert(genRes.status === 200, 'Link generation returned 200');
  assert(genData.link?.boxSerial === 'SS00000100', 'Link assigned correctly to SS00000100');
  assert(genData.link?.status === 'UNUSED', 'Link status is initially UNUSED');
  const generatedUrl = genData.url || genData.link?.url;
  assert(!!generatedUrl && generatedUrl.includes('?token='), `Generated URL contains valid token: ${generatedUrl}`);

  const rawToken1 = genData.rawToken || genData.link?.rawToken;
  assert(rawToken1 && rawToken1.length >= 30, 'Raw token is high-entropy 192-bit string');

  // 4. Validate customer session with the link
  console.log('\n--- TEST 3: First Valid Customer Open ---');
  const sessRes1 = await fetch(`${BASE_URL}/api/customer/session?token=${encodeURIComponent(rawToken1)}`);
  const sessData1 = await sessRes1.json();
  assert(sessRes1.status === 200, 'Customer session with valid unused token returns 200');
  assert(sessData1.valid === true, 'Session is marked valid');
  assert(sessData1.assignedBox === 'SS00000100', 'Session assigns box SS00000100');
  assert(sessData1.hasClaimed === true, 'Session is ready to open');
  assert(sessData1.alreadyUsed !== true, 'Session is not yet used');

  // Customer opens the box
  const openRes1 = await fetch(`${BASE_URL}/api/customer/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: rawToken1,
      name: 'Alice Tester',
      phone: '+15551234567'
    })
  });
  const openData1 = await openRes1.json();
  assert(openRes1.status === 200, `First box open succeeded with 200 (got ${openRes1.status})`);
  assert(openData1.success === true, 'openData1.success is true');
  assert((openData1.boxSerial || openData1.box?.serial) === 'SS00000100', 'Opened box serial matches SS00000100');

  // 5. Strict One-Time Use: Second Open Attempt MUST return EXACT string
  console.log('\n--- TEST 4: Strict One-Time Use Rejection ---');
  const openRes2 = await fetch(`${BASE_URL}/api/customer/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: rawToken1,
      name: 'Alice Impostor',
      phone: '+15559999999'
    })
  });
  const openData2 = await openRes2.json();
  assert(openRes2.status === 403, `Second open attempt returns HTTP 403 (got ${openRes2.status})`);
  assert(
    openData2.error === 'THIS LINK HAS ALREADY BEEN USED.',
    `Exact error message returned: "${openData2.error}"`
  );

  // Subsequent session check also marks alreadyUsed
  const sessRes2 = await fetch(`${BASE_URL}/api/customer/session?token=${encodeURIComponent(rawToken1)}`);
  const sessData2 = await sessRes2.json();
  assert(sessData2.alreadyUsed === true || sessData2.used === true, 'Subsequent session marks link as already used');

  // 6. Concurrency Safety Test: 5 simultaneous opens on a fresh link
  console.log('\n--- TEST 5: Simultaneous Concurrency Test ---');
  const genResConcurrent = await fetch(`${BASE_URL}/api/admin/links/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ boxSerial: 'SS00000101', note: 'Concurrency Test' })
  });
  const genDataConcurrent = await genResConcurrent.json();
  const concurrentToken = genDataConcurrent.rawToken || genDataConcurrent.link?.rawToken;

  // Send 5 requests at the exact same moment
  const promises = [1, 2, 3, 4, 5].map((i) =>
    fetch(`${BASE_URL}/api/customer/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: concurrentToken,
        name: `Concurrent User ${i}`,
        phone: `+1555000000${i}`
      })
    }).then(async (r) => ({ status: r.status, data: await r.json() }))
  );

  const results = await Promise.all(promises);
  const successes = results.filter((r) => r.status === 200 && r.data.success);
  const rejectedAlreadyUsed = results.filter(
    (r) => r.status === 403 && r.data.error === 'THIS LINK HAS ALREADY BEEN USED.'
  );

  console.log(`Concurrent results: ${successes.length} succeeded, ${rejectedAlreadyUsed.length} rejected with "THIS LINK HAS ALREADY BEEN USED."`);
  assert(successes.length === 1, `Exactly 1 concurrent request succeeded (found ${successes.length})`);
  assert(
    rejectedAlreadyUsed.length === 4,
    `Remaining 4 concurrent requests rejected with "THIS LINK HAS ALREADY BEEN USED." (found ${rejectedAlreadyUsed.length})`
  );

  // 7. Revocation & Replacement Test
  console.log('\n--- TEST 6: Admin Revocation & Replacement ---');
  const genResRevoke = await fetch(`${BASE_URL}/api/admin/links/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ boxSerial: 'SS00000102', note: 'To be revoked' })
  });
  const genDataRevoke = await genResRevoke.json();
  const revokeLinkId = genDataRevoke.link?.id || genDataRevoke.id;
  const revokeToken = genDataRevoke.rawToken || genDataRevoke.link?.rawToken;

  // Revoke it
  const revokeRes = await fetch(`${BASE_URL}/api/admin/links/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ linkId: revokeLinkId })
  });
  const revokeData = await revokeRes.json();
  assert(revokeRes.status === 200 && (revokeData.link?.status === 'REVOKED' || revokeData.status === 'REVOKED'), 'Admin link revocation succeeded and status is REVOKED');

  // Customer tries to use revoked link
  const revokedSessRes = await fetch(`${BASE_URL}/api/customer/session?token=${encodeURIComponent(revokeToken)}`);
  const revokedSessData = await revokedSessRes.json();
  assert(revokedSessRes.status === 403, `Customer session with revoked token returns 403 (got ${revokedSessRes.status})`);
  assert(revokedSessData.revoked === true, 'Revoked link rejected with revoked: true');

  // Replace the revoked link
  const replaceRes = await fetch(`${BASE_URL}/api/admin/links/replace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ linkId: revokeLinkId, note: 'Replacement link' })
  });
  const replaceData = await replaceRes.json();
  assert(replaceRes.status === 200, 'Admin link replacement succeeded with 200');
  const newLinkObj = replaceData.newLink || replaceData.link;
  assert(newLinkObj?.status === 'UNUSED', 'Replacement link is UNUSED');
  assert(newLinkObj?.boxSerial === 'SS00000102', 'Replacement link points to same box SS00000102');

  // 8. Public API Security Check: Zero token leaks & Zero secret prize leaks
  console.log('\n--- TEST 7: Public API Leak Prevention ---');
  const publicBoxesRes = await fetch(`${BASE_URL}/api/boxes?page=1&limit=50`);
  const publicBoxesData = await publicBoxesRes.json();
  const sampleBox = publicBoxesData.boxes[0];
  assert(sampleBox.token === undefined, 'Public boxes list does not expose token');
  assert(sampleBox.raw_token === undefined, 'Public boxes list does not expose raw_token');
  assert(sampleBox.token_hash === undefined, 'Public boxes list does not expose token_hash');
  assert(sampleBox.prizeAmount === undefined, 'Public boxes list does not expose winning prize amount');

  // 9. CLEANUP TEST BOXES: Reset test boxes to AVAILABLE to guarantee pre-launch state
  console.log('\n--- CLEANUP: Preserving Pre-Launch State (Total 15,051, Available 15,051) ---');
  await pool.query(`
    UPDATE public.boxes 
    SET status = 'AVAILABLE', claimed = FALSE, claimed_by = NULL, claimed_at = NULL, 
        opened = FALSE, opened_at = NULL, result = NULL, prize_name = NULL, claim_code = NULL
    WHERE serial IN ('SS00000100', 'SS00000101', 'SS00000102')
  `);

  // Verify DB state
  const finalDbCounts = await pool.query('SELECT COUNT(*)::int as count, status FROM public.boxes GROUP BY status');
  console.log('Final Database box counts:', finalDbCounts.rows);
  assert(
    finalDbCounts.rows.length === 1 && finalDbCounts.rows[0].status === 'AVAILABLE' && finalDbCounts.rows[0].count === 15051,
    'All 15,051 boxes are 100% AVAILABLE in database'
  );

  console.log('\n====================================================');
  console.log(`SUMMARY: ${testPassed} tests passed, ${testFailed} tests failed.`);
  console.log('====================================================');

  await pool.end();

  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
