import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { WINNING_SERIALS, TOTAL_WINNING_PRIZES } from '../src/config/prizes';

const DATA_DIR = path.join(process.cwd(), 'data');
const BOXES_FILE = path.join(DATA_DIR, 'boxes.json');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const TEST_SERIALS_TO_RESET = ['SS00000010', 'SS00000020'];
const TEST_TOKENS_TO_CLEAR = [
  'SS1-CUST-MVNKAONP-LZD4',
  'SS1-CUST-MVNKAPEU-QL7Y',
  'SS1-CUST-MVNKAPEQ-3QE0',
  'undefined',
];

async function main() {
  console.log('========================================================');
  console.log(' SUPER SURPRISE BOX: TARGETED TEST CLAIMS CLEAR');
  console.log('========================================================\n');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 1. Safe Backup of current persistent JSON files
  const backupTimestamp = Date.now();
  const boxesBackup = path.join(BACKUP_DIR, `boxes.before_clear_test_claims.${backupTimestamp}.json`);
  const storeBackup = path.join(BACKUP_DIR, `store.before_clear_test_claims.${backupTimestamp}.json`);
  fs.copyFileSync(BOXES_FILE, boxesBackup);
  fs.copyFileSync(STORE_FILE, storeBackup);
  console.log(`[BACKUP] Created snapshots:`);
  console.log(`  - ${boxesBackup}`);
  console.log(`  - ${storeBackup}\n`);

  // 2. Inspect and reset local data/boxes.json
  const rawBoxes = fs.readFileSync(BOXES_FILE, 'utf-8');
  const boxes: any[] = JSON.parse(rawBoxes);
  let localBoxesUpdated = 0;

  for (const b of boxes) {
    if (TEST_SERIALS_TO_RESET.includes(b.serial)) {
      console.log(`[LOCAL] Resetting test box ${b.serial} (previous status: ${b.status}, claimedBy: ${b.claimedBy}) -> AVAILABLE`);
      b.status = 'AVAILABLE';
      b.claimed = false;
      delete b.claimedBy;
      delete b.claimedAt;
      b.opened = false;
      delete b.openedAt;
      delete b.result;
      delete b.prizeName;
      delete b.claimCode;
      localBoxesUpdated++;
    }
  }

  fs.writeFileSync(BOXES_FILE, JSON.stringify(boxes, null, 2), 'utf-8');
  console.log(`[LOCAL] Saved updated ${BOXES_FILE}: ${localBoxesUpdated} test boxes returned to AVAILABLE.\n`);

  // 3. Inspect and reset local data/store.json
  const rawStore = fs.readFileSync(STORE_FILE, 'utf-8');
  const store = JSON.parse(rawStore);
  let localTokensCleared = 0;

  if (store.customers) {
    for (const t of TEST_TOKENS_TO_CLEAR) {
      if (store.customers[t]) {
        console.log(`[LOCAL] Removing test customer claim session: ${t}`);
        delete store.customers[t];
        localTokensCleared++;
      }
    }
  }

  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  console.log(`[LOCAL] Saved updated ${STORE_FILE}: ${localTokensCleared} test customer tokens removed.\n`);

  // 4. Update Neon PostgreSQL Database
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (rawUrl) {
    console.log('[DATABASE] Connecting to Neon PostgreSQL...');
    const pool = new Pool({
      connectionString: rawUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check current state before update
      const checkRes = await client.query(
        `SELECT serial, status, claimed, claimed_by, opened, result FROM public.boxes WHERE serial = ANY($1::varchar[])`,
        [TEST_SERIALS_TO_RESET]
      );
      console.log('[DATABASE] Pre-reset state in Neon public.boxes:');
      for (const r of checkRes.rows) {
        console.log(`  - Box ${r.serial}: status=${r.status}, claimed=${r.claimed}, claimed_by=${r.claimed_by}, opened=${r.opened}`);
      }

      // Update ONLY the confirmed test boxes
      const updateBoxesRes = await client.query(
        `UPDATE public.boxes
         SET status = 'AVAILABLE',
             claimed = FALSE,
             claimed_by = NULL,
             claimed_at = NULL,
             opened = FALSE,
             opened_at = NULL,
             result = NULL,
             prize_name = NULL,
             claim_code = NULL,
             updated_at = NOW()
         WHERE serial = ANY($1::varchar[])
         RETURNING serial, status, claimed;`,
        [TEST_SERIALS_TO_RESET]
      );

      console.log(`[DATABASE] Updated public.boxes: ${updateBoxesRes.rowCount} test rows set to AVAILABLE.`);
      for (const r of updateBoxesRes.rows) {
        console.log(`  -> Box ${r.serial} is now: status=${r.status}, claimed=${r.claimed}`);
      }

      // Delete only the confirmed test customer sessions
      const deleteCustRes = await client.query(
        `DELETE FROM public.customers WHERE token = ANY($1::varchar[]) RETURNING token, assigned_box;`,
        [TEST_TOKENS_TO_CLEAR]
      );
      console.log(`[DATABASE] Removed from public.customers: ${deleteCustRes.rowCount} test records.`);
      for (const c of deleteCustRes.rows) {
        console.log(`  -> Removed token: ${c.token} (assigned: ${c.assigned_box})`);
      }

      await client.query('COMMIT');
      console.log('[DATABASE] Neon PostgreSQL transaction committed successfully.\n');

      // 5. Verification queries on Neon
      const totalCountRes = await client.query('SELECT count(*)::int as total FROM public.boxes;');
      const statusCountsRes = await client.query('SELECT status, count(*)::int as count FROM public.boxes GROUP BY status;');
      const customerClaimsRes = await client.query('SELECT count(*)::int as count FROM public.customers WHERE has_claimed = true OR opened = true;');
      const activeClaimedBoxesRes = await client.query('SELECT count(*)::int as count FROM public.boxes WHERE claimed = true OR opened = true OR status != \'AVAILABLE\';');

      console.log('========================================================');
      console.log(' DIRECT DATABASE VERIFICATION RESULTS (NEON POSTGRESQL)');
      console.log('========================================================');
      console.log(`- Total Boxes in public.boxes:        ${totalCountRes.rows[0]?.total} (Expected: 15051)`);
      console.log(`- Status breakdown:`);
      for (const sc of statusCountsRes.rows) {
        console.log(`    * ${sc.status}: ${sc.count}`);
      }
      console.log(`- Active Customer Claims (customers): ${customerClaimsRes.rows[0]?.count} (Expected: 0)`);
      console.log(`- Unavailable/Claimed Boxes (boxes):  ${activeClaimedBoxesRes.rows[0]?.count} (Expected: 0)`);

      // Verify all 100 winning prizes are intact
      const winningPrizesRes = await client.query(
        'SELECT count(*)::int as count FROM public.boxes WHERE serial = ANY($1::varchar[]) AND status = \'AVAILABLE\';',
        [WINNING_SERIALS]
      );
      console.log(`- Winning Boxes Available:            ${winningPrizesRes.rows[0]?.count} / ${TOTAL_WINNING_PRIZES} (Expected: 100)`);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[DATABASE ERROR] Reset failed, transaction rolled back:', err);
      throw err;
    } finally {
      client.release();
      await pool.end();
    }
  } else {
    console.warn('[DATABASE] DATABASE_URL not found; only JSON was updated.');
  }

  console.log('\n✔ TEST CLAIMS CLEARED SUCCESSFULLY!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
