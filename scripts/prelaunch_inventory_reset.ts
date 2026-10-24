import fs from 'fs';
import { Pool } from 'pg';

async function prelaunchReset() {
  console.log('=== STARTING PRE-LAUNCH INVENTORY RESET ===\n');

  // Step 1: Safe Backup
  const timestamp = Date.now();
  fs.copyFileSync('data/boxes.json', `data/backups/boxes.before_prelaunch_reset.${timestamp}.json`);
  fs.copyFileSync('data/store.json', `data/backups/store.before_prelaunch_reset.${timestamp}.json`);
  console.log(`[STEP 1] Created backups with timestamp ${timestamp}.`);

  // Step 2: Reset data/boxes.json
  const rawBoxes = fs.readFileSync('data/boxes.json', 'utf8');
  const boxes = JSON.parse(rawBoxes);
  console.log(`[STEP 2] Updating ${boxes.length} records in data/boxes.json...`);

  for (const b of boxes) {
    b.status = 'AVAILABLE';
    b.claimed = false;
    b.claimedBy = null;
    b.claimedAt = null;
    b.opened = false;
    b.openedAt = null;
    b.result = null;
    b.claimCode = null;
    b.isHidden = false;
  }
  fs.writeFileSync('data/boxes.json', JSON.stringify(boxes, null, 2), 'utf8');
  console.log('✔ data/boxes.json updated to 100% AVAILABLE.');

  // Step 3: Reset data/store.json customers
  const rawStore = fs.readFileSync('data/store.json', 'utf8');
  const store = JSON.parse(rawStore);
  store.customers = {};
  fs.writeFileSync('data/store.json', JSON.stringify(store, null, 2), 'utf8');
  console.log('✔ data/store.json customers cleared.');

  // Step 4: Reset Neon PostgreSQL database
  if (process.env.DATABASE_URL) {
    console.log('[STEP 3] Updating Neon PostgreSQL public.boxes and public.customers...');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const updateBoxesRes = await client.query(`
        UPDATE public.boxes
        SET status = 'AVAILABLE',
            claimed = FALSE,
            claimed_by = NULL,
            claimed_at = NULL,
            opened = FALSE,
            opened_at = NULL,
            result = NULL,
            claim_code = NULL,
            is_hidden = FALSE,
            updated_at = NOW();
      `);
      console.log(`✔ Neon public.boxes updated: ${updateBoxesRes.rowCount} rows set to AVAILABLE.`);

      const clearCustomersRes = await client.query('DELETE FROM public.customers;');
      console.log(`✔ Neon public.customers cleared: ${clearCustomersRes.rowCount} test sessions removed.`);

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error('DATABASE ERROR during reset:', dbErr);
      throw dbErr;
    } finally {
      client.release();
      await pool.end();
    }
  }

  console.log('\n=== PRE-LAUNCH INVENTORY RESET COMPLETE ===\n');
}

prelaunchReset().catch((err) => {
  console.error('RESET FAILED:', err);
  process.exit(1);
});
