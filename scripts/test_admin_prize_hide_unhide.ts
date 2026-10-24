import { Pool } from 'pg';

const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = 'Box@2026';

async function runTests() {
  console.log('================================================================');
  console.log('  SUPER SURPRISE BOX: PRIZE HIDE / UNHIDE VERIFICATION TEST');
  console.log('================================================================\n');

  // 1. Admin login
  console.log('[STEP 1] Logging into Admin Portal...');
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: ADMIN_PIN }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }
  const token = loginData.token;
  console.log('✔ Admin authenticated successfully.\n');

  // 2. Fetch admin prizes
  console.log('[STEP 2] Verifying Admin Portal loaded all 100 winning prizes...');
  const adminPrizesRes = await fetch(`${BASE_URL}/api/admin/prizes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminPrizesData = await adminPrizesRes.json();
  if (!adminPrizesRes.ok || adminPrizesData.totalPrizes !== 100 || adminPrizesData.prizes.length !== 100) {
    throw new Error(`Expected 100 admin prizes, received: ${adminPrizesData.totalPrizes}`);
  }
  console.log(`✔ Admin Portal displays all ${adminPrizesData.totalPrizes} winning prize records.`);
  console.log(`  Sample prize: ${adminPrizesData.prizes[0].serial} (ID: ${adminPrizesData.prizes[0].id}) -> ${adminPrizesData.prizes[0].prizeName}\n`);

  // Ensure all test prizes start in unhidden (visible) state
  const testCases = [
    { type: 'iPhone Prize', serial: 'SS00003075', id: 3075, name: 'iPhone 17 Pro Max' },
    { type: 'High Cash Prize', serial: 'SS00002851', id: 2851, name: '₹30,000 Cash' },
    { type: 'Medium Cash Prize', serial: 'SS00002568', id: 2568, name: '₹2,000 Cash' },
    { type: 'Standard Cash Prize', serial: 'SS00010310', id: 10310, name: '₹100 Cash' },
  ];

  for (const tc of testCases) {
    await fetch(`${BASE_URL}/api/admin/prizes/visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ serial: tc.serial, isHidden: false }),
    });
  }

  // Get initial public prizes count
  const initialPublicRes = await fetch(`${BASE_URL}/api/prizes`);
  const initialPublicData = await initialPublicRes.json();
  const baselineCount = initialPublicData.prizes.length;
  console.log(`[STEP 3] Initial Public Customer Page: ${baselineCount} active prize cards visible.\n`);

  // 4. Test HIDE & UNHIDE for each test case
  const neonPool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : null;

  for (let idx = 0; idx < testCases.length; idx++) {
    const tc = testCases[idx];
    console.log(`----------------------------------------------------------------`);
    console.log(`[TEST ${idx + 1}] Testing ${tc.type}: ${tc.serial} (${tc.name})`);
    console.log(`----------------------------------------------------------------`);

    // A. Verify it is initially present in public prizes
    const preCheckRes = await fetch(`${BASE_URL}/api/prizes`);
    const preCheckData = await preCheckRes.json();
    const foundBeforeHide = preCheckData.prizes.find((p: any) => p.serial === tc.serial);
    if (!foundBeforeHide) {
      throw new Error(`Prize ${tc.serial} should be visible before test!`);
    }
    console.log(`1. Pre-check: ${tc.serial} is currently visible in public showcase.`);

    // B. Trigger HIDE via Admin API using SERIAL
    console.log(`2. Hiding prize card via Admin API (using serial "${tc.serial}")...`);
    const hideRes = await fetch(`${BASE_URL}/api/admin/prizes/visibility`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ serial: tc.serial, isHidden: true }),
    });
    const hideData = await hideRes.json();
    if (!hideRes.ok || !hideData.success || hideData.isCardHidden !== true) {
      throw new Error(`Hide API failed for ${tc.serial}: ${JSON.stringify(hideData)}`);
    }
    console.log(`   ✔ Admin API confirmed: isCardHidden=true for ${tc.serial}.`);

    // C. Verify prize disappeared from public customer page API
    const postHideRes = await fetch(`${BASE_URL}/api/prizes`);
    const postHideData = await postHideRes.json();
    const foundInPublicAfterHide = postHideData.prizes.find((p: any) => p.serial === tc.serial);
    if (foundInPublicAfterHide) {
      throw new Error(`CRITICAL FAILURE: ${tc.serial} was found in public API after clicking HIDE!`);
    }
    console.log(`3. Verified on Public Customer Page: ${tc.serial} (${tc.name}) has DISAPPEARED.`);
    console.log(`   Public active cards: ${postHideData.prizes.length} (was ${preCheckData.prizes.length})`);

    // D. Verify hidden prize remains visible in Admin Portal with CARD HIDDEN status
    const adminCheckRes = await fetch(`${BASE_URL}/api/admin/prizes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const adminCheckData = await adminCheckRes.json();
    const adminPrizeRecord = adminCheckData.prizes.find((p: any) => p.serial === tc.serial);
    if (!adminPrizeRecord || adminPrizeRecord.isCardHidden !== true) {
      throw new Error(`Admin portal failed to keep hidden prize ${tc.serial} visible!`);
    }
    console.log(`4. Verified in Admin Portal: Prize remains visible with isCardHidden=true.`);

    // E. Verify persistence in Neon PostgreSQL database
    if (neonPool) {
      const dbRes = await neonPool.query(
        'SELECT serial, prize_name, is_card_hidden FROM public.prizes WHERE serial = $1',
        [tc.serial]
      );
      if (dbRes.rows.length === 0 || dbRes.rows[0].is_card_hidden !== true) {
        throw new Error(`Neon database check failed for ${tc.serial}: ${JSON.stringify(dbRes.rows)}`);
      }
      console.log(`5. Verified in Neon Database: public.prizes.is_card_hidden = true`);
    }

    // F. Trigger UNHIDE via Admin API using unique ID
    console.log(`6. Unhiding prize card via Admin API (using unique ID ${tc.id})...`);
    const unhideRes = await fetch(`${BASE_URL}/api/admin/prizes/visibility`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: tc.id, isHidden: false }),
    });
    const unhideData = await unhideRes.json();
    if (!unhideRes.ok || !unhideData.success || unhideData.isCardHidden !== false) {
      throw new Error(`Unhide API failed for ID ${tc.id}: ${JSON.stringify(unhideData)}`);
    }
    console.log(`   ✔ Admin API confirmed unhide by unique ID: isCardHidden=false.`);

    // G. Verify prize reappeared on public customer page API
    const postUnhideRes = await fetch(`${BASE_URL}/api/prizes`);
    const postUnhideData = await postUnhideRes.json();
    const foundInPublicAfterUnhide = postUnhideData.prizes.find((p: any) => p.serial === tc.serial);
    if (!foundInPublicAfterUnhide) {
      throw new Error(`CRITICAL FAILURE: ${tc.serial} did NOT reappear in public API after UNHIDE!`);
    }
    console.log(`7. Verified on Public Customer Page: ${tc.serial} (${tc.name}) has REAPPEARED.`);
    console.log(`   Public active cards restored: ${postUnhideData.prizes.length}.\n`);
  }

  // 5. Verify 15,051 box inventory is completely intact
  console.log('----------------------------------------------------------------');
  console.log('[STEP 5] Verifying 15,051 Box Inventory Integrity...');
  console.log('----------------------------------------------------------------');
  const invRes = await fetch(`${BASE_URL}/api/inventory/diagnostic`);
  const invData = await invRes.json();
  if (invData.totalRecords !== 15051 || invData.uniqueSerialNumbers !== 15051 || invData.missingSerialNumbers !== 0) {
    throw new Error(`Inventory compromised: ${JSON.stringify(invData)}`);
  }
  console.log(`✔ Total Boxes: ${invData.totalRecords}`);
  console.log(`✔ Unique Serials: ${invData.uniqueSerialNumbers}`);
  console.log(`✔ Missing Serials: ${invData.missingSerialNumbers}`);
  console.log(`✔ Duplicate Serials: ${invData.duplicateSerialCount}`);
  console.log(`✔ Authoritative DB: ${invData.authoritativeSourceOfTruth} (${invData.databaseConnectionStatus})`);

  if (neonPool) {
    await neonPool.end();
  }

  console.log('\n================================================================');
  console.log('  ALL HIDE / UNHIDE TESTS (iPHONES & CASH PRIZES) PASSED 100%!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
