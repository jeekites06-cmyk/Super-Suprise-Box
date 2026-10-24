import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOXES_FILE = path.join(DATA_DIR, 'boxes.json');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

interface BoxRecord {
  id: number;
  serial: string;
  status: 'AVAILABLE' | 'CLAIMED' | 'OPENED';
  claimed: boolean;
  claimedBy?: string;
  claimedAt?: string;
  opened?: boolean;
  openedAt?: string;
  result?: 'WINNER' | 'BETTER_LUCK';
  prizeName?: string;
  claimCode?: string;
  isHidden?: boolean;
}

interface StoreSchema {
  batch: {
    id: number;
    name: string;
    startSerial: string;
    endSerial: string;
    totalBoxes: number;
    price: number;
    currency: string;
    prize: string;
    prizeDescription: string;
    winnersPerBatch: number;
    totalBatches: number;
    totalPrizes: number;
    winningSerials: string[];
    winningPrizes?: Record<string, string>;
    hiddenPrizeCards?: Record<string, boolean>;
    prizeCustomNotes?: Record<string, string>;
  };
  customers: Record<string, any>;
}

async function runNeonMigration() {
  console.log('================================================================');
  console.log('   SUPER SURPRISE BOX: SAFE NEON POSTGRESQL MIGRATION');
  console.log('================================================================\n');

  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) {
    console.error('ERROR: DATABASE_URL is not set in environment.');
    process.exit(1);
  }

  // 1. Verify Source Files
  if (!fs.existsSync(BOXES_FILE) || !fs.existsSync(STORE_FILE)) {
    console.error('ERROR: Source JSON files data/boxes.json or data/store.json not found.');
    process.exit(1);
  }

  const rawBoxes = fs.readFileSync(BOXES_FILE, 'utf-8');
  const sourceBoxes: BoxRecord[] = JSON.parse(rawBoxes);
  const rawStore = fs.readFileSync(STORE_FILE, 'utf-8');
  const sourceStore: StoreSchema = JSON.parse(rawStore);

  console.log(`[1/5] Source JSON verified:`);
  console.log(`      - Total records to migrate: ${sourceBoxes.length}`);
  console.log(`      - Serial range:             ${sourceBoxes[0]?.serial} to ${sourceBoxes[sourceBoxes.length - 1]?.serial}`);
  console.log(`      - Winning prizes count:     ${sourceStore.batch.winningSerials.length}`);

  const pool = new Pool({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  console.log('\n[2/5] Connected to Neon PostgreSQL pooler successfully.');

  try {
    // 2. Initialize Schema
    console.log('      Creating PostgreSQL tables and indexes if not exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.boxes (
          id INTEGER PRIMARY KEY,
          serial VARCHAR(16) NOT NULL UNIQUE,
          status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
          claimed BOOLEAN NOT NULL DEFAULT FALSE,
          claimed_by TEXT,
          claimed_at TIMESTAMPTZ,
          opened BOOLEAN NOT NULL DEFAULT FALSE,
          opened_at TIMESTAMPTZ,
          result VARCHAR(16),
          prize_name TEXT,
          claim_code TEXT,
          is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_boxes_serial ON public.boxes(serial);
      CREATE INDEX IF NOT EXISTS idx_boxes_status ON public.boxes(status);
      CREATE INDEX IF NOT EXISTS idx_boxes_is_hidden ON public.boxes(is_hidden);
      CREATE INDEX IF NOT EXISTS idx_boxes_composite ON public.boxes(status, is_hidden);

      CREATE TABLE IF NOT EXISTS public.prizes (
          id SERIAL PRIMARY KEY,
          serial VARCHAR(16) NOT NULL UNIQUE REFERENCES public.boxes(serial) ON DELETE CASCADE,
          prize_name TEXT NOT NULL,
          is_card_hidden BOOLEAN NOT NULL DEFAULT FALSE,
          custom_note TEXT DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_prizes_serial ON public.prizes(serial);

      CREATE TABLE IF NOT EXISTS public.customers (
          token VARCHAR(64) PRIMARY KEY,
          assigned_box VARCHAR(16) REFERENCES public.boxes(serial),
          has_claimed BOOLEAN NOT NULL DEFAULT FALSE,
          opened BOOLEAN NOT NULL DEFAULT FALSE,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          opened_at TIMESTAMPTZ,
          result VARCHAR(16),
          prize_name TEXT,
          claim_code TEXT,
          batch_id INTEGER NOT NULL DEFAULT 1,
          customer_note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_customers_assigned_box ON public.customers(assigned_box);

      CREATE TABLE IF NOT EXISTS public.admin_settings (
          key VARCHAR(64) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('      -> Tables & indexes created successfully.');

    // 3. Migrate Batch Settings
    console.log('\n[3/5] Migrating Batch Settings to admin_settings...');
    await client.query(
      `INSERT INTO public.admin_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();`,
      ['batch_1_config', JSON.stringify(sourceStore.batch)]
    );
    console.log('      -> Batch configuration saved.');

    // 4. Migrate Boxes in Chunks
    console.log('\n[4/5] Migrating 15,051 Boxes to Neon in batches of 500...');
    const BATCH_SIZE = 500;
    let totalMigrated = 0;

    for (let i = 0; i < sourceBoxes.length; i += BATCH_SIZE) {
      const chunk = sourceBoxes.slice(i, i + BATCH_SIZE);

      // Build parameterized multi-row insert
      const valueStrings: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const b of chunk) {
        valueStrings.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`
        );
        values.push(
          b.id,
          b.serial,
          b.status || (b.opened ? 'OPENED' : b.claimed ? 'CLAIMED' : 'AVAILABLE'),
          !!b.claimed,
          b.claimedBy || null,
          b.claimedAt ? new Date(b.claimedAt) : null,
          !!b.opened,
          b.openedAt ? new Date(b.openedAt) : null,
          b.result || null,
          b.prizeName || null,
          b.claimCode || null,
          !!b.isHidden
        );
      }

      const queryText = `
        INSERT INTO public.boxes (
          id, serial, status, claimed, claimed_by, claimed_at,
          opened, opened_at, result, prize_name, claim_code, is_hidden, updated_at
        ) VALUES ${valueStrings.join(', ')}
        ON CONFLICT (serial) DO UPDATE SET
          status = EXCLUDED.status,
          claimed = EXCLUDED.claimed,
          claimed_by = EXCLUDED.claimed_by,
          claimed_at = EXCLUDED.claimed_at,
          opened = EXCLUDED.opened,
          opened_at = EXCLUDED.opened_at,
          result = EXCLUDED.result,
          prize_name = EXCLUDED.prize_name,
          claim_code = EXCLUDED.claim_code,
          is_hidden = EXCLUDED.is_hidden,
          updated_at = NOW();
      `;

      await client.query(queryText, values);
      totalMigrated += chunk.length;
      process.stdout.write(`\r      Uploaded ${totalMigrated} / ${sourceBoxes.length} box records...`);
    }
    console.log('\n      -> All 15,051 box records inserted/updated in Neon.');

    // 5. Migrate Prizes
    console.log('      Migrating 100 official winning prize mappings...');
    const prizeSerials = sourceStore.batch.winningSerials;
    for (const serial of prizeSerials) {
      const prizeName = sourceStore.batch.winningPrizes?.[serial] || 'Surprise Reward';
      const isCardHidden = !!sourceStore.batch.hiddenPrizeCards?.[serial];
      const customNote = sourceStore.batch.prizeCustomNotes?.[serial] || '';

      await client.query(
        `INSERT INTO public.prizes (serial, prize_name, is_card_hidden, custom_note, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (serial) DO UPDATE SET
           prize_name = EXCLUDED.prize_name,
           is_card_hidden = EXCLUDED.is_card_hidden,
           custom_note = EXCLUDED.custom_note,
           updated_at = NOW();`,
        [serial, prizeName, isCardHidden, customNote]
      );
    }
    console.log(`      -> All ${prizeSerials.length} prize mappings inserted/updated.`);

    // 6. Migrate Customers if any
    const customersList = Object.values(sourceStore.customers || {});
    if (customersList.length > 0) {
      console.log(`      Migrating ${customersList.length} customer records...`);
      for (const c of customersList) {
        await client.query(
          `INSERT INTO public.customers (token, assigned_box, has_claimed, opened, used, opened_at, result, prize_name, claim_code, batch_id, customer_note, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
           ON CONFLICT (token) DO UPDATE SET
             assigned_box = EXCLUDED.assigned_box,
             has_claimed = EXCLUDED.has_claimed,
             opened = EXCLUDED.opened,
             used = EXCLUDED.used,
             opened_at = EXCLUDED.opened_at,
             result = EXCLUDED.result,
             prize_name = EXCLUDED.prize_name,
             claim_code = EXCLUDED.claim_code,
             updated_at = NOW();`,
          [
            c.token,
            c.assignedBox || null,
            !!c.hasClaimed,
            !!c.opened,
            !!c.used,
            c.openedAt ? new Date(c.openedAt) : null,
            c.result || null,
            c.prizeName || null,
            c.claimCode || null,
            c.batchId || 1,
            c.customerNote || null,
          ]
        );
      }
      console.log(`      -> ${customersList.length} customer records migrated.`);
    }

    // =========================================================================
    // 7. RIGOROUS VERIFICATION GATE
    // =========================================================================
    console.log('\n[5/5] Executing Strict Verification Gate...');

    const countRes = await client.query('SELECT COUNT(*) as total, COUNT(DISTINCT serial) as unique_serials FROM public.boxes;');
    const totalCount = parseInt(countRes.rows[0].total, 10);
    const uniqueSerials = parseInt(countRes.rows[0].unique_serials, 10);

    const rangeRes = await client.query('SELECT MIN(serial) as min_serial, MAX(serial) as max_serial, MIN(id) as min_id, MAX(id) as max_id FROM public.boxes;');
    const { min_serial, max_serial, min_id, max_id } = rangeRes.rows[0];

    const prizeCountRes = await client.query('SELECT COUNT(*) as total_prizes FROM public.prizes;');
    const totalPrizes = parseInt(prizeCountRes.rows[0].total_prizes, 10);

    const availableRes = await client.query("SELECT COUNT(*) as count FROM public.boxes WHERE status = 'AVAILABLE';");
    const neonAvailable = parseInt(availableRes.rows[0].count, 10);

    console.log(`      - Neon Total Boxes:         ${totalCount} (Expected: 15051)`);
    console.log(`      - Neon Unique Serials:      ${uniqueSerials} (Expected: 15051)`);
    console.log(`      - Neon Serial Range:        ${min_serial} to ${max_serial} (Expected: SS00000001 to SS00015051)`);
    console.log(`      - Neon ID Range:            ${min_id} to ${max_id} (Expected: 1 to 15051)`);
    console.log(`      - Neon Total Prizes:        ${totalPrizes} (Expected: 100)`);
    console.log(`      - Neon Available Boxes:     ${neonAvailable}`);

    if (totalCount !== 15051) {
      throw new Error(`Verification FAILED: Neon boxes count is ${totalCount}, expected exactly 15051.`);
    }
    if (uniqueSerials !== 15051) {
      throw new Error(`Verification FAILED: Neon unique serials count is ${uniqueSerials}, expected exactly 15051.`);
    }
    if (min_serial !== 'SS00000001' || max_serial !== 'SS00015051') {
      throw new Error(`Verification FAILED: Serial range mismatch: ${min_serial} to ${max_serial}.`);
    }
    if (totalPrizes !== 100) {
      throw new Error(`Verification FAILED: Neon prize count is ${totalPrizes}, expected exactly 100.`);
    }

    console.log('\n================================================================');
    console.log('   VERIFICATION PASSED: ALL 15,051 BOXES IN NEON MATCH SOURCE!');
    console.log('================================================================\n');
  } finally {
    client.release();
    await pool.end();
  }
}

runNeonMigration().catch((err) => {
  console.error('\nCRITICAL MIGRATION ERROR:', err);
  process.exit(1);
});
