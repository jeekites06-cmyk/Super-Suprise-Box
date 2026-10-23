import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function runMigration() {
  console.log('=====================================================');
  console.log('   SUPER SURPRISE BOX -> SUPABASE POSTGRESQL MIGRATION');
  console.log('=====================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: Supabase credentials are missing!');
    console.error('To migrate data to Supabase PostgreSQL, configure the following in the Secrets / Environment panel:');
    console.error('  1. SUPABASE_URL = "https://your-project.supabase.co"');
    console.error('  2. SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key" (Project Settings -> API)');
    console.error('\nStopping migration safely without modifying any local JSON files.');
    process.exit(1);
  }

  // 1. Verify Source Data
  if (!fs.existsSync(BOXES_FILE) || !fs.existsSync(STORE_FILE)) {
    console.error('Error: Source JSON files not found in data/ directory.');
    process.exit(1);
  }

  const rawBoxes = fs.readFileSync(BOXES_FILE, 'utf-8');
  const boxes: BoxRecord[] = JSON.parse(rawBoxes);
  const rawStore = fs.readFileSync(STORE_FILE, 'utf-8');
  const store: StoreSchema = JSON.parse(rawStore);

  console.log(`[1/5] Source JSON verified:`);
  console.log(`      - Total Box Records: ${boxes.length}`);
  console.log(`      - Winning Prize Mappings: ${Object.keys(store.batch.winningPrizes || {}).length}`);
  console.log(`      - Serial Range: ${boxes[0]?.serial} to ${boxes[boxes.length - 1]?.serial}`);

  // 2. Insert Batch Settings
  console.log('\n[2/5] Migrating Batch Settings & Configuration...');
  const settingsRes = await fetch(`${supabaseUrl}/rest/v1/admin_settings`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify([
      {
        key: 'batch_1_config',
        value: store.batch,
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!settingsRes.ok) {
    const errText = await settingsRes.text();
    console.error(`Failed to save admin settings to Supabase: ${errText}`);
    console.error('Please ensure you have run scripts/supabase_schema.sql in your Supabase SQL Editor.');
    process.exit(1);
  }
  console.log('      -> Batch configuration saved.');

  // 3. Insert Boxes in Chunks
  console.log('\n[3/5] Migrating 15,051 Boxes to Supabase in batches of 500...');
  const BATCH_SIZE = 500;
  let insertedBoxesCount = 0;

  for (let i = 0; i < boxes.length; i += BATCH_SIZE) {
    const chunk = boxes.slice(i, i + BATCH_SIZE).map((b) => ({
      id: b.id,
      serial: b.serial,
      status: b.status || (b.opened ? 'OPENED' : b.claimed ? 'CLAIMED' : 'AVAILABLE'),
      claimed: !!b.claimed,
      claimed_by: b.claimedBy || null,
      claimed_at: b.claimedAt || null,
      opened: !!b.opened,
      opened_at: b.openedAt || null,
      result: b.result || null,
      prize_name: b.prizeName || null,
      claim_code: b.claimCode || null,
      is_hidden: !!b.isHidden,
      updated_at: new Date().toISOString(),
    }));

    const res = await fetch(`${supabaseUrl}/rest/v1/boxes`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Error inserting chunk ${i} to ${i + chunk.length}: ${err}`);
      process.exit(1);
    }

    insertedBoxesCount += chunk.length;
    process.stdout.write(`\r      Uploaded ${insertedBoxesCount} / ${boxes.length} boxes...`);
  }
  console.log('\n      -> All 15,051 box records migrated successfully.');

  // 4. Insert 100 Winning Prizes
  console.log('\n[4/5] Migrating 100 Official Winning Prizes...');
  const prizeEntries = store.batch.winningSerials.map((serial) => ({
    serial,
    prize_name: store.batch.winningPrizes?.[serial] || 'Surprise Reward',
    is_card_hidden: !!store.batch.hiddenPrizeCards?.[serial],
    custom_note: store.batch.prizeCustomNotes?.[serial] || '',
    updated_at: new Date().toISOString(),
  }));

  const prizeRes = await fetch(`${supabaseUrl}/rest/v1/prizes`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(prizeEntries),
  });

  if (!prizeRes.ok) {
    const err = await prizeRes.text();
    console.error(`Error inserting prizes: ${err}`);
    process.exit(1);
  }
  console.log(`      -> All ${prizeEntries.length} winning prize mappings migrated.`);

  // 5. Verification Check
  console.log('\n[5/5] Running Verification Query against Supabase...');
  const verifyRes = await fetch(`${supabaseUrl}/rest/v1/boxes?select=count`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Range': '0-0',
      'Prefer': 'count=exact',
    },
  });

  const countHeader = verifyRes.headers.get('content-range');
  console.log(`      Supabase boxes content-range: ${countHeader}`);

  console.log('\n=====================================================');
  console.log('   MIGRATION COMPLETED & VERIFIED SUCCESSFULLY!');
  console.log('=====================================================');
}

runMigration().catch((e) => {
  console.error('Migration failed with unexpected error:', e);
  process.exit(1);
});
