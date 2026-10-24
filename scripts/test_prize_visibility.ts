import { Pool } from 'pg';

async function runTests() {
  console.log('=== STARTING END-TO-END PRIZE VISIBILITY TESTS ===\n');

  // 1. Admin login
  console.log('[TEST 1] Logging into admin portal...');
  const loginRes = await fetch('http://localhost:3000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: 'Box@2026' }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }
  const token = loginData.token;
  console.log('✔ Admin login successful.\n');

  // 2. Fetch admin prizes
  console.log('[TEST 2] Verifying all 100 winning prizes in admin portal...');
  const adminPrizesRes = await fetch('http://localhost:3000/api/admin/prizes', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminPrizesData = await adminPrizesRes.json();
  if (!adminPrizesRes.ok || adminPrizesData.totalPrizes !== 100 || adminPrizesData.prizes.length !== 100) {
    throw new Error(`Expected 100 admin prizes, got: ${adminPrizesData.totalPrizes}`);
  }
  console.log(`✔ Admin prizes loaded: ${adminPrizesData.totalPrizes} records intact.\n`);

  // 3. Verify public prizes endpoint
  console.log('[TEST 3] Checking baseline public prizes endpoint...');
  const publicPrizesRes1 = await fetch('http://localhost:3000/api/prizes');
  const publicPrizesData1 = await publicPrizesRes1.json();
  const baselineVisibleCount = publicPrizesData1.prizes.length;
  console.log(`✔ Public prizes loaded: ${baselineVisibleCount} visible (showcaseHidden: ${publicPrizesData1.showcaseHidden}).\n`);

  // Ensure testSerial is currently unhidden before we begin
  const testSerial = 'SS00003075';
  await fetch('http://localhost:3000/api/admin/prizes/visibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ serial: testSerial, isHidden: false }),
  });

  const checkInitialRes = await fetch('http://localhost:3000/api/prizes');
  const checkInitialData = await checkInitialRes.json();
  const initialCount = checkInitialData.prizes.length;
  console.log(`Initial count with ${testSerial} visible: ${initialCount}`);

  // 4. Hide an individual prize card (SS00003075)
  console.log(`[TEST 4] Hiding prize card for ${testSerial} (iPhone 17 Pro Max)...`);
  const hideRes = await fetch('http://localhost:3000/api/admin/prizes/visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ serial: testSerial, isHidden: true }),
  });
  const hideData = await hideRes.json();
  if (!hideRes.ok || !hideData.success || !hideData.isCardHidden) {
    throw new Error(`Failed to hide card: ${JSON.stringify(hideData)}`);
  }
  console.log(`✔ Backend confirmed card hidden: isCardHidden=${hideData.isCardHidden}.\n`);

  // 5. Verify public prizes strictly excludes SS00003075
  console.log('[TEST 5] Checking public prizes to ensure hidden prize is NOT present...');
  const publicPrizesRes2 = await fetch('http://localhost:3000/api/prizes');
  const publicPrizesData2 = await publicPrizesRes2.json();
  const foundHiddenInPublic = publicPrizesData2.prizes.find((p: any) => p.serial === testSerial);
  if (foundHiddenInPublic) {
    throw new Error(`CRITICAL ERROR: Hidden prize ${testSerial} was found in public API!`);
  }
  const publicStr2 = JSON.stringify(publicPrizesData2);
  if (publicStr2.includes(testSerial)) {
    throw new Error(`CRITICAL ERROR: Serial ${testSerial} leaked in public API payload!`);
  }
  if (publicPrizesData2.prizes.length !== initialCount - 1) {
    throw new Error(`Expected ${initialCount - 1} visible prizes, got ${publicPrizesData2.prizes.length}`);
  }
  console.log(`✔ Public API verified: ${testSerial} is completely absent. Total visible prizes: ${publicPrizesData2.prizes.length} (expected ${initialCount - 1}).\n`);

  // 6. Check database directly (Neon PostgreSQL)
  console.log('[TEST 6] Checking Neon database directly for persistence...');
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const dbPrize = await pool.query('SELECT serial, prize_name, is_card_hidden FROM public.prizes WHERE serial = $1', [testSerial]);
    if (dbPrize.rows.length === 0 || dbPrize.rows[0].is_card_hidden !== true) {
      throw new Error(`Database check failed: ${JSON.stringify(dbPrize.rows)}`);
    }
    console.log(`✔ Neon PostgreSQL verified: public.prizes.is_card_hidden = ${dbPrize.rows[0].is_card_hidden}`);
    await pool.end();
  }
  console.log('');

  // 7. Master Showcase Toggle: HIDE ENTIRE SHOWCASE
  console.log('[TEST 7] Hiding entire winning prizes showcase...');
  const hideShowcaseRes = await fetch('http://localhost:3000/api/admin/prizes/showcase-visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isHidden: true }),
  });
  const hideShowcaseData = await hideShowcaseRes.json();
  if (!hideShowcaseRes.ok || !hideShowcaseData.success || !hideShowcaseData.isShowcaseHidden) {
    throw new Error(`Failed to hide showcase: ${JSON.stringify(hideShowcaseData)}`);
  }
  console.log(`✔ Showcase visibility updated in backend: isShowcaseHidden=${hideShowcaseData.isShowcaseHidden}.\n`);

  // 8. Verify public prizes returns empty array and showcaseHidden=true
  console.log('[TEST 8] Checking public prizes when showcase is hidden...');
  const publicPrizesRes3 = await fetch('http://localhost:3000/api/prizes');
  const publicPrizesData3 = await publicPrizesRes3.json();
  if (!publicPrizesData3.showcaseHidden || publicPrizesData3.prizes.length !== 0) {
    throw new Error(`Expected showcaseHidden: true and 0 prizes, got: ${JSON.stringify(publicPrizesData3)}`);
  }
  console.log(`✔ Public API strictly returned empty prizes array: length = ${publicPrizesData3.prizes.length}, showcaseHidden = ${publicPrizesData3.showcaseHidden}.\n`);

  // 9. Master Showcase Toggle: UNHIDE ENTIRE SHOWCASE
  console.log('[TEST 9] Unhiding winning prizes showcase...');
  const unhideShowcaseRes = await fetch('http://localhost:3000/api/admin/prizes/showcase-visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isHidden: false }),
  });
  const unhideShowcaseData = await unhideShowcaseRes.json();
  if (!unhideShowcaseRes.ok || !unhideShowcaseData.success || unhideShowcaseData.isShowcaseHidden !== false) {
    throw new Error(`Failed to unhide showcase: ${JSON.stringify(unhideShowcaseData)}`);
  }
  console.log(`✔ Showcase visibility restored: isShowcaseHidden=false.\n`);

  // 10. Unhide the single card (SS00003075)
  console.log(`[TEST 10] Unhiding prize card for ${testSerial}...`);
  const unhideCardRes = await fetch('http://localhost:3000/api/admin/prizes/visibility', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ serial: testSerial, isHidden: false }),
  });
  const unhideCardData = await unhideCardRes.json();
  if (!unhideCardRes.ok || !unhideCardData.success || unhideCardData.isCardHidden !== false) {
    throw new Error(`Failed to unhide card: ${JSON.stringify(unhideCardData)}`);
  }
  console.log(`✔ Prize card restored: isCardHidden=false.\n`);

  // 11. Final verification: Public prizes restored
  console.log('[TEST 11] Verifying public prizes restored count...');
  const publicPrizesRes4 = await fetch('http://localhost:3000/api/prizes');
  const publicPrizesData4 = await publicPrizesRes4.json();
  if (publicPrizesData4.prizes.length !== initialCount) {
    throw new Error(`Expected ${initialCount} prizes, got: ${publicPrizesData4.prizes.length}`);
  }
  const restoredPrize = publicPrizesData4.prizes.find((p: any) => p.serial === testSerial);
  if (!restoredPrize) {
    throw new Error(`Restored prize ${testSerial} missing from public API!`);
  }
  console.log(`✔ Verified: visible count returned to ${initialCount}, including ${testSerial} (${restoredPrize.prizeName}).\n`);

  // 12. Check diagnostic to confirm all 15,051 boxes intact
  console.log('[TEST 12] Running inventory diagnostic to verify 15,051 boxes integrity...');
  const diagRes = await fetch('http://localhost:3000/api/inventory/diagnostic');
  const diagData = await diagRes.json();
  if (diagData.totalRecords !== 15051 || diagData.uniqueSerialNumbers !== 15051 || diagData.missingSerialNumbers !== 0) {
    throw new Error(`Diagnostic failed: ${JSON.stringify(diagData)}`);
  }
  console.log(`✔ Diagnostic verified: 15,051 total boxes, 15,051 unique serials, 0 missing serials.`);
  console.log(`✔ Authoritative database: ${diagData.authoritativeSourceOfTruth} (${diagData.databaseConnectionStatus})`);

  console.log('\n=== ALL 12 PRIZE VISIBILITY TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
