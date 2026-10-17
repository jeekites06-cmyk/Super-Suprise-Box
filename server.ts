import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Persistent Database Directory & Files
const DATA_DIR = path.join(__dirname, 'data');
const BOXES_FILE = path.join(DATA_DIR, 'boxes.json');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const TOTAL_BOXES = 15051;
const START_SERIAL_NUM = 1;
const END_SERIAL_NUM = 15051;

// EXACT FIVE WINNING SERIAL NUMBERS (Strict requirement)
// 1. SS00003075
// 2. SS00006099
// 3. SS00009012
// 4. SS00012452
// 5. SS00014999
const WINNING_SERIALS = [
  'SS00003075',
  'SS00006099',
  'SS00009012',
  'SS00012452',
  'SS00014999',
];

export interface BoxRecord {
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
}

export interface CustomerRecord {
  token: string;
  hasClaimed: boolean;
  assignedBox: string | null;
  batchId: number;
  opened: boolean;
  used?: boolean;
  openedAt?: string;
  result?: 'WINNER' | 'BETTER_LUCK';
  prizeName?: string;
  claimCode?: string;
  customerNote?: string;
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
  };
  customers: Record<string, CustomerRecord>;
}

// Server-side Transactional Concurrency Lock
// Guarantees atomic serializable operations so concurrent customer requests cannot race or double-claim
class AsyncLock {
  private queue = Promise.resolve();

  acquire(): Promise<() => void> {
    let release: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.queue;
    this.queue = this.queue.then(() => next);
    return current.then(() => release);
  }
}
const dbTransactionLock = new AsyncLock();

// In-memory data caches for fast O(1) operations
let boxesMap = new Map<string, BoxRecord>();
let storeData: StoreSchema = {
  batch: {
    id: 1,
    name: 'Batch 1',
    startSerial: 'SS00000001',
    endSerial: 'SS00015051',
    totalBoxes: TOTAL_BOXES,
    price: 299,
    currency: 'INR',
    prize: 'Apple iPhone 17 Pro',
    prizeDescription: 'Your prize is an iPhone 17 Pro.',
    winnersPerBatch: 5,
    totalBatches: 4,
    totalPrizes: 20,
    winningSerials: WINNING_SERIALS,
  },
  customers: {
    'SS1-VIP-WINNER-77': {
      token: 'SS1-VIP-WINNER-77',
      hasClaimed: true,
      assignedBox: 'SS00003075',
      batchId: 1,
      opened: false,
      used: false,
      customerNote: 'Verified WhatsApp Winner #1 (SS00003075)',
    },
    'SS1-VIP-WINNER-92': {
      token: 'SS1-VIP-WINNER-92',
      hasClaimed: true,
      assignedBox: 'SS00006099',
      batchId: 1,
      opened: false,
      used: false,
      customerNote: 'Verified WhatsApp Winner #2 (SS00006099)',
    },
    'SS1-VIP-WINNER-12': {
      token: 'SS1-VIP-WINNER-12',
      hasClaimed: true,
      assignedBox: 'SS00009012',
      batchId: 1,
      opened: false,
      used: false,
      customerNote: 'Verified WhatsApp Winner #3 (SS00009012)',
    },
    'SS1-VIP-WINNER-45': {
      token: 'SS1-VIP-WINNER-45',
      hasClaimed: true,
      assignedBox: 'SS00012452',
      batchId: 1,
      opened: false,
      used: false,
      customerNote: 'Verified WhatsApp Winner #4 (SS00012452)',
    },
    'SS1-VIP-WINNER-99': {
      token: 'SS1-VIP-WINNER-99',
      hasClaimed: true,
      assignedBox: 'SS00014999',
      batchId: 1,
      opened: false,
      used: false,
      customerNote: 'Verified WhatsApp Winner #5 (SS00014999)',
    },
  },
};

function formatSerial(num: number): string {
  return `SS${num.toString().padStart(8, '0')}`;
}

// Initialize persistent 15,051 box records
function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Synchronize store.json with the EXACT 5 winning serial numbers
  let shouldSaveStore = false;
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      storeData = JSON.parse(raw);
      storeData.batch.winningSerials = WINNING_SERIALS;
      shouldSaveStore = true;
    } catch (e) {
      console.error('Error reading store.json, using default:', e);
      shouldSaveStore = true;
    }
  } else {
    shouldSaveStore = true;
  }

  if (shouldSaveStore) {
    saveStoreToDisk();
  }

  // 2. Load or generate all 15,051 box records in boxes.json
  let shouldGenerate = false;
  if (fs.existsSync(BOXES_FILE)) {
    try {
      const raw = fs.readFileSync(BOXES_FILE, 'utf-8');
      const loadedBoxes: BoxRecord[] = JSON.parse(raw);
      if (Array.isArray(loadedBoxes) && loadedBoxes.length === TOTAL_BOXES) {
        boxesMap.clear();
        for (const b of loadedBoxes) {
          // Normalize status
          b.status = b.opened ? 'OPENED' : b.claimed ? 'CLAIMED' : 'AVAILABLE';
          boxesMap.set(b.serial, b);
        }
        console.log(`Successfully loaded all ${boxesMap.size} box records from ${BOXES_FILE}`);
      } else {
        shouldGenerate = true;
      }
    } catch (err) {
      console.error('Failed to parse boxes.json, regenerating:', err);
      shouldGenerate = true;
    }
  } else {
    shouldGenerate = true;
  }

  if (shouldGenerate) {
    console.log(`Generating all ${TOTAL_BOXES} box records (SS00000001 to SS00015051)...`);
    boxesMap.clear();
    for (let i = START_SERIAL_NUM; i <= END_SERIAL_NUM; i++) {
      const serial = formatSerial(i);
      const box: BoxRecord = {
        id: i,
        serial,
        status: 'AVAILABLE',
        claimed: false,
      };
      boxesMap.set(serial, box);
    }

    // Mark pre-assigned winner boxes as claimed by their specific tokens
    for (const cust of Object.values(storeData.customers)) {
      if (cust.assignedBox && boxesMap.has(cust.assignedBox)) {
        const b = boxesMap.get(cust.assignedBox)!;
        b.claimed = true;
        b.claimedBy = cust.token;
        b.claimedAt = new Date().toISOString();
        if (cust.opened) {
          b.status = 'OPENED';
          b.opened = true;
          b.openedAt = cust.openedAt;
          b.result = cust.result;
          b.prizeName = cust.prizeName;
          b.claimCode = cust.claimCode;
        } else {
          b.status = 'CLAIMED';
        }
      }
    }

    saveBoxesToDisk();
    console.log(`Generated and saved all ${TOTAL_BOXES} boxes to ${BOXES_FILE}`);
  }
}

// Atomic file write using temporary file + rename to prevent race conditions during reads
function saveBoxesToDisk() {
  try {
    const list = Array.from(boxesMap.values());
    const tmpFile = `${BOXES_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(list));
    fs.renameSync(tmpFile, BOXES_FILE);
  } catch (err) {
    console.error('Error saving boxes to disk:', err);
  }
}

function saveStoreToDisk() {
  try {
    const tmpFile = `${STORE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(storeData, null, 2));
    fs.renameSync(tmpFile, STORE_FILE);
  } catch (err) {
    console.error('Error saving store to disk:', err);
  }
}

// Initialize on startup
initDatabase();

// --- API ROUTES ---

// 1. Get Batch Info & Live Inventory Counts
app.get('/api/batch/info', (_req: Request, res: Response) => {
  let claimedCount = 0;
  let openedCount = 0;

  for (const b of boxesMap.values()) {
    if (b.status === 'OPENED' || b.opened) {
      openedCount++;
      claimedCount++;
    } else if (b.status === 'CLAIMED' || b.claimed) {
      claimedCount++;
    }
  }

  const availableCount = Math.max(0, storeData.batch.totalBoxes - claimedCount - WINNING_SERIALS.length);

  res.json({
    id: storeData.batch.id,
    name: storeData.batch.name,
    startSerial: storeData.batch.startSerial,
    endSerial: storeData.batch.endSerial,
    totalBoxes: storeData.batch.totalBoxes,
    availableBoxes: availableCount,
    claimedBoxes: claimedCount,
    openedBoxes: openedCount,
    price: storeData.batch.price,
    currency: storeData.batch.currency,
    prize: storeData.batch.prize,
    prizeDescription: storeData.batch.prizeDescription,
    winnersPerBatch: storeData.batch.winnersPerBatch,
    totalBatches: storeData.batch.totalBatches,
    totalPrizes: storeData.batch.totalPrizes,
  });
});

// 2. Display All Available Boxes (Searchable, scrollable grid)
// STRICT REQUIREMENTS:
// - All customers must see the same shared inventory of available boxes.
// - Immediately remove opened or claimed boxes from the available-box grid for every customer.
// - Never display previously opened or claimed boxes as available.
// - Winning boxes containing iPhone 17 Pro prize must never appear in the available-box grid.
app.get('/api/boxes/available', (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(350, Math.max(12, parseInt((req.query.limit as string) || '300', 10)));
  const search = ((req.query.search as string) || '').trim().toUpperCase();
  const rangeStart = req.query.rangeStart ? parseInt(req.query.rangeStart as string, 10) : undefined;
  const rangeEnd = req.query.rangeEnd ? parseInt(req.query.rangeEnd as string, 10) : undefined;

  const available: { id: number; serial: string }[] = [];

  for (const box of boxesMap.values()) {
    // 1. CRITICAL: Never display previously opened or claimed boxes as available!
    if (box.status === 'OPENED' || box.status === 'CLAIMED' || box.opened || box.claimed) {
      continue;
    }

    // 2. STRICT: Winning boxes containing iPhone 17 Pro must NEVER appear in the available-box grid!
    if (WINNING_SERIALS.includes(box.serial)) {
      continue;
    }

    // 3. Optional range filter
    if (rangeStart !== undefined && box.id < rangeStart) continue;
    if (rangeEnd !== undefined && box.id > rangeEnd) continue;

    // 4. Optional search filter
    if (search) {
      const cleanNum = search.replace(/\D/g, '');
      const matchSerial = box.serial.includes(search);
      const matchNum = cleanNum ? box.id.toString().includes(cleanNum) : false;
      if (!matchSerial && !matchNum) continue;
    }

    available.push({ id: box.id, serial: box.serial });
  }

  const totalAvailable = available.length;
  const totalPages = Math.ceil(totalAvailable / limit) || 1;
  const startIndex = (page - 1) * limit;
  const pagedBoxes = available.slice(startIndex, startIndex + limit);

  res.json({
    boxes: pagedBoxes,
    totalAvailable,
    page,
    totalPages,
    limit,
    batchStart: storeData.batch.startSerial,
    batchEnd: storeData.batch.endSerial,
    totalBatchBoxes: TOTAL_BOXES,
  });
});

// 3. Customer Session: verify link and enforce one-time use
app.get('/api/customer/session', (req: Request, res: Response): void => {
  let token = (req.query.token as string | undefined)?.trim();
  const boxParam = (req.query.box as string | undefined)?.trim();

  if (!token && boxParam) {
    token = boxParam;
  }

  // If no customer token is provided, this is the MAIN WEBSITE URL!
  // Never treat the main website URL as an expired private link.
  if (!token) {
    res.json({
      valid: true,
      token: '',
      isMainPage: true,
      hasClaimed: false,
      assignedBox: null,
      batchId: 1,
      opened: false,
      used: false,
      alreadyUsed: false,
    });
    return;
  }

  let customer = storeData.customers[token];

  if (!customer) {
    customer = {
      token,
      hasClaimed: false,
      assignedBox: null,
      batchId: 1,
      opened: false,
      used: false,
      customerNote: `Customer session for ${token}`,
    };
    storeData.customers[token] = customer;
    saveStoreToDisk();
  }

  const isAlreadyUsed = !!(customer.opened || customer.used);

  res.json({
    valid: true,
    token: customer.token,
    hasClaimed: customer.hasClaimed,
    assignedBox: customer.assignedBox,
    batchId: customer.batchId,
    opened: customer.opened,
    used: isAlreadyUsed,
    alreadyUsed: isAlreadyUsed,
    openedAt: customer.openedAt,
    result: isAlreadyUsed ? customer.result : null,
    prizeName: isAlreadyUsed ? customer.prizeName : null,
    claimCode: isAlreadyUsed ? customer.claimCode : null,
  });
});

// 4. Atomic Server-Side Database Transaction for Box Claim
// STRICT REQUIREMENT:
// - Use server-side database transactions to prevent two customers from claiming the same box simultaneously.
// - Once a box is claimed, remove it from the available-box grid for every customer.
// - If two customers claim simultaneously, synchronize box availability and prevent duplicate claims.
app.post('/api/boxes/claim', async (req: Request, res: Response): Promise<void> => {
  const { token, boxSerial } = req.body;

  if (!boxSerial || typeof boxSerial !== 'string') {
    res.status(400).json({ error: 'Box serial number is required.' });
    return;
  }

  const cleanSerial = boxSerial.trim().toUpperCase();
  // If customer claimed from main website without a token, generate their unique private token
  const cleanToken = (typeof token === 'string' && token.trim())
    ? token.trim()
    : `SS1-CUST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Acquire atomic transaction lock
  const releaseLock = await dbTransactionLock.acquire();

  try {
    let customer = storeData.customers[cleanToken];
    if (!customer) {
      customer = {
        token: cleanToken,
        hasClaimed: false,
        assignedBox: null,
        batchId: 1,
        opened: false,
        used: false,
      };
      storeData.customers[cleanToken] = customer;
    }

    // Check if link is already used/opened
    if (customer.opened || customer.used) {
      res.status(403).json({ error: 'THIS LINK HAS ALREADY BEEN USED.' });
      return;
    }

    // If customer already claimed a box, prevent switching
    if (customer.hasClaimed && customer.assignedBox) {
      if (customer.assignedBox === cleanSerial) {
        res.json({
          success: true,
          boxSerial: customer.assignedBox,
          message: 'Box already assigned to your link.',
        });
        return;
      }
      res.status(403).json({
        error: `You have already claimed Box ${customer.assignedBox}. You cannot switch to another box.`,
      });
      return;
    }

    // Validate box exists in Batch 1
    const box = boxesMap.get(cleanSerial);
    if (!box) {
      res.status(404).json({ error: `Box ${cleanSerial} does not exist in Batch 1.` });
      return;
    }

    // Winning boxes cannot be claimed from public grid
    if (WINNING_SERIALS.includes(cleanSerial)) {
      res.status(403).json({ error: `Box ${cleanSerial} is reserved and not available for selection.` });
      return;
    }

    // ATOMIC TRANSACTION CHECK: If already claimed or opened by another customer, reject!
    if (box.status === 'OPENED' || box.opened) {
      res.status(409).json({
        error: `Box ${cleanSerial} has already been opened. Please choose another available box.`,
      });
      return;
    }

    if (box.status === 'CLAIMED' || box.claimed) {
      res.status(409).json({
        error: `Box ${cleanSerial} was just claimed by another customer. Please choose another available box.`,
      });
      return;
    }

    // ATOMIC RESERVATION: Mark box as claimed and unavailable to all customers
    box.status = 'CLAIMED';
    box.claimed = true;
    box.claimedBy = cleanToken;
    box.claimedAt = new Date().toISOString();

    customer.hasClaimed = true;
    customer.assignedBox = cleanSerial;

    // Persist immediately to persistent disk
    saveBoxesToDisk();
    saveStoreToDisk();

    console.log(`[CLAIM TRANSACTION] Box ${cleanSerial} successfully claimed by customer ${cleanToken}`);

    res.json({
      success: true,
      boxSerial: cleanSerial,
      assignedBox: cleanSerial,
      message: `Box ${cleanSerial} has been successfully assigned to you!`,
    });
  } finally {
    // Release atomic lock
    releaseLock();
  }
});

// 5. Open Surprise Box - Secure Server Action
// STRICT REQUIREMENTS:
// - Mark box as OPENED in the persistent backend database.
// - Immediately remove the opened box from the available-box grid for every customer.
// - Keep the opened result permanently associated with that box and customer.
// - Permanently mark the link as used.
app.post('/api/customer/open', async (req: Request, res: Response): Promise<void> => {
  const { token, boxSerial } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Token is required to open your box.' });
    return;
  }

  const cleanToken = token.trim();

  // Acquire atomic transaction lock
  const releaseLock = await dbTransactionLock.acquire();

  try {
    const customer = storeData.customers[cleanToken];

    if (!customer) {
      res.status(404).json({ error: 'Customer session not recognized.' });
      return;
    }

    if (!customer.assignedBox) {
      res.status(400).json({ error: 'You must select an available box before opening.' });
      return;
    }

    const assignedBoxSerial = customer.assignedBox;

    // Prevent box tampering
    if (boxSerial && boxSerial.trim().toUpperCase() !== assignedBoxSerial) {
      res.status(403).json({
        error: `Access Denied: You are assigned to Box ${assignedBoxSerial}. You cannot open a different box.`,
      });
      return;
    }

    // ENFORCE ONE-TIME USE: If already opened/used, return permanent saved result
    if (customer.opened || customer.used) {
      res.json({
        success: true,
        alreadyOpened: true,
        alreadyUsed: true,
        boxSerial: customer.assignedBox,
        result: customer.result,
        prizeName: customer.prizeName,
        openedAt: customer.openedAt,
        claimCode: customer.claimCode,
      });
      return;
    }

    // Check if assigned box is one of the EXACT 5 winning serial numbers
    const isWinner = WINNING_SERIALS.includes(assignedBoxSerial);
    const now = new Date().toISOString();

    customer.opened = true;
    customer.used = true; // Permanently mark link as used
    customer.openedAt = now;
    customer.result = isWinner ? 'WINNER' : 'BETTER_LUCK';

    if (isWinner) {
      customer.prizeName = 'Apple iPhone 17 Pro';
      customer.claimCode = `SSB-${assignedBoxSerial}-${Date.now().toString().slice(-6)}`;
    }

    // MARK BOX AS OPENED IN THE PERSISTENT DATABASE
    const box = boxesMap.get(assignedBoxSerial);
    if (box) {
      box.status = 'OPENED';
      box.opened = true;
      box.claimed = true;
      box.claimedBy = cleanToken;
      box.openedAt = now;
      box.result = customer.result;
      box.prizeName = customer.prizeName;
      box.claimCode = customer.claimCode;
    }

    // Persist permanently to disk storage
    saveBoxesToDisk();
    saveStoreToDisk();

    console.log(
      `[OPEN TRANSACTION] Box ${assignedBoxSerial} marked OPENED in database by ${cleanToken}. Result: ${customer.result}. Link marked USED.`
    );

    res.json({
      success: true,
      alreadyOpened: false,
      alreadyUsed: true,
      boxSerial: assignedBoxSerial,
      result: customer.result,
      prizeName: customer.prizeName,
      openedAt: customer.openedAt,
      claimCode: customer.claimCode,
    });
  } finally {
    // Release atomic lock
    releaseLock();
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SUPER SURPRISE BOX Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
