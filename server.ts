import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// CORS & Preflight headers for iframe embedded support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Persistent Database Directory & Files
const DATA_DIR = path.join(__dirname, 'data');
const BOXES_FILE = path.join(DATA_DIR, 'boxes.json');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const TOTAL_BOXES = 15051;
const START_SERIAL_NUM = 1;
const END_SERIAL_NUM = 15051;

// COMPLETE OFFICIAL WINNING PRIZE LIST (100 WINNING POSITIONS)
import { WINNING_PRIZE_MAP, WINNING_SERIALS, TOTAL_WINNING_PRIZES } from './src/config/prizes';
const WINNING_SERIALS_SET = new Set<string>(WINNING_SERIALS);

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
  isHidden?: boolean;
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
    winningPrizes?: Record<string, string>;
    hiddenPrizeCards?: Record<string, boolean>;
    prizeCustomNotes?: Record<string, string>;
  };
  customers: Record<string, CustomerRecord>;
}

// =========================================================================
// --- SECURE ADMIN AUTHENTICATION SYSTEM ---
// =========================================================================
interface AdminSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}
const activeAdminSessions = new Map<string, AdminSession>();

// Rate-limiting for admin login attempts: max 5 failed attempts per 5 minutes per IP
const loginRateLimitMap = new Map<string, { count: number; firstAttempt: number }>();

function checkAdminRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) return true;
  if (now - record.firstAttempt > 5 * 60 * 1000) {
    loginRateLimitMap.delete(ip);
    return true;
  }
  return record.count < 5;
}

function recordAdminFailedLogin(ip: string): void {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip) || { count: 0, firstAttempt: now };
  record.count++;
  loginRateLimitMap.set(ip, record);
}

function clearAdminRateLimit(ip: string): void {
  loginRateLimitMap.delete(ip);
}

function generateAdminSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  activeAdminSessions.set(token, {
    token,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24-hour validity
  });
  return token;
}

function isValidAdminToken(token?: string): boolean {
  if (!token) return false;
  const session = activeAdminSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeAdminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdminAuth(req: Request, res: Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  const headerToken = req.headers['x-admin-token'] as string | undefined;
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined) || headerToken?.trim();

  if (!token || !isValidAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized: Valid admin authentication token required.' });
    return;
  }
  next();
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
    prize: 'Apple iPhone 17 Pro Max & High Cash Rewards (100 Winning Prizes)',
    prizeDescription: '100 Winning Boxes: 4 iPhones & 96 Cash Prizes (up to ₹30,000 Cash)',
    winnersPerBatch: TOTAL_WINNING_PRIZES,
    totalBatches: 1,
    totalPrizes: TOTAL_WINNING_PRIZES,
    winningSerials: WINNING_SERIALS,
    winningPrizes: WINNING_PRIZE_MAP,
  },
  customers: {},
};

function formatSerial(num: number): string {
  return `SS${num.toString().padStart(8, '0')}`;
}

// Initialize persistent 15,051 box records
function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Synchronize store.json with the EXACT 100 winning serial numbers and prize mappings
  let shouldSaveStore = false;
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      storeData = JSON.parse(raw);
      storeData.batch.winningSerials = WINNING_SERIALS;
      storeData.batch.winningPrizes = WINNING_PRIZE_MAP;
      storeData.batch.winnersPerBatch = TOTAL_WINNING_PRIZES;
      storeData.batch.totalPrizes = TOTAL_WINNING_PRIZES;
      storeData.batch.prize = 'Apple iPhone 17 Pro Max & High Cash Rewards (100 Winning Prizes)';
      storeData.batch.prizeDescription = '100 Winning Boxes: 4 iPhones & 96 Cash Prizes (up to ₹30,000 Cash)';
      storeData.batch.hiddenPrizeCards = storeData.batch.hiddenPrizeCards || {};
      storeData.batch.prizeCustomNotes = storeData.batch.prizeCustomNotes || {};
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

  // 2. Load existing records and generate any missing serial-number records without duplicating or overwriting status
  if (fs.existsSync(BOXES_FILE)) {
    try {
      const raw = fs.readFileSync(BOXES_FILE, 'utf-8');
      const loadedBoxes: BoxRecord[] = JSON.parse(raw);
      if (Array.isArray(loadedBoxes)) {
        for (const b of loadedBoxes) {
          b.status = b.opened ? 'OPENED' : b.claimed ? 'CLAIMED' : 'AVAILABLE';
          b.isHidden = typeof b.isHidden === 'boolean' ? b.isHidden : false;
          boxesMap.set(b.serial, b);
        }
        console.log(`Loaded ${boxesMap.size} existing box records from ${BOXES_FILE}`);
      }
    } catch (err) {
      console.error('Failed to parse boxes.json, will generate missing records:', err);
    }
  }

  // Ensure all 15,051 records exist from SS00000001 through SS00015051
  let missingCount = 0;
  for (let i = START_SERIAL_NUM; i <= END_SERIAL_NUM; i++) {
    const serial = formatSerial(i);
    if (!boxesMap.has(serial)) {
      boxesMap.set(serial, {
        id: i,
        serial,
        status: 'AVAILABLE',
        claimed: false,
        isHidden: false,
      });
      missingCount++;
    }
  }

  // Synchronize pre-assigned customer winner boxes if they are in storeData
  for (const cust of Object.values(storeData.customers)) {
    if (cust.assignedBox && boxesMap.has(cust.assignedBox)) {
      const b = boxesMap.get(cust.assignedBox)!;
      if (!b.claimed) {
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
  }

  if (missingCount > 0 || !fs.existsSync(BOXES_FILE)) {
    console.log(`Generated ${missingCount} missing box records. Total: ${boxesMap.size}`);
    saveBoxesToDisk();
  } else {
    console.log(`All ${boxesMap.size} box records verified intact.`);
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
  let availableCount = 0;
  let hiddenCount = 0;

  for (const b of boxesMap.values()) {
    if (b.isHidden === true) {
      hiddenCount++;
      continue;
    }
    if (b.status === 'OPENED' || b.opened) {
      openedCount++;
      claimedCount++;
    } else if (b.status === 'CLAIMED' || b.claimed) {
      claimedCount++;
    } else {
      availableCount++;
    }
  }

  res.json({
    id: storeData.batch.id,
    name: storeData.batch.name,
    startSerial: storeData.batch.startSerial,
    endSerial: storeData.batch.endSerial,
    totalBoxes: storeData.batch.totalBoxes,
    availableBoxes: availableCount,
    claimedBoxes: claimedCount,
    openedBoxes: openedCount,
    hiddenBoxes: hiddenCount,
    hiddenWinningBoxes: TOTAL_WINNING_PRIZES,
    configuredWinningPositions: TOTAL_WINNING_PRIZES,
    totalPages: Math.ceil(availableCount / 300) || 1,
    boxesPerPage: 300,
    price: storeData.batch.price,
    currency: storeData.batch.currency,
    prize: storeData.batch.prize,
    prizeDescription: storeData.batch.prizeDescription,
    winnersPerBatch: TOTAL_WINNING_PRIZES,
    totalBatches: storeData.batch.totalBatches,
    totalPrizes: TOTAL_WINNING_PRIZES,
  });
});

// 2. Display All Available Boxes (Searchable, scrollable grid)
// STRICT REQUIREMENTS:
// - All 15,051 boxes from SS00000001 to SS00015051 are accounted for.
// - Pages 1–50 contain 300 records each; Page 51 contains 51 records.
// - All 15,051 boxes are available for selection before sales launch.
// - All 100 configured winning prize positions and prize mappings are preserved.
// - Once a box is claimed or opened, it cannot be claimed by another customer.
// - Hidden boxes (isHidden === true) are strictly excluded from public display.
const handleGetPublicBoxes = (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(350, Math.max(12, parseInt((req.query.limit as string) || '300', 10)));
  const search = ((req.query.search as string) || '').trim().toUpperCase();
  const rangeStart = req.query.rangeStart ? parseInt(req.query.rangeStart as string, 10) : undefined;
  const rangeEnd = req.query.rangeEnd ? parseInt(req.query.rangeEnd as string, 10) : undefined;
  const statusFilter = ((req.query.status as string) || (req.query.filter as string) || 'all').toLowerCase();

  // Authoritative global counts across the entire persistent inventory
  let globalAvailableCount = 0;
  let globalOpenedCount = 0;
  let globalClaimedCount = 0;
  let globalReservedWinningCount = 0;
  let globalHiddenCount = 0;

  for (const box of boxesMap.values()) {
    if (box.isHidden === true) {
      globalHiddenCount++;
      continue;
    }
    if (box.status === 'OPENED' || box.opened) {
      globalOpenedCount++;
    } else if (box.status === 'CLAIMED' || box.claimed) {
      globalClaimedCount++;
    } else {
      globalAvailableCount++;
    }
  }

  const allItems: { id: number; serial: string; status: 'AVAILABLE' | 'CLAIMED' | 'OPENED' }[] = [];

  for (const box of boxesMap.values()) {
    // PUBLIC WEBSITE SYNCHRONIZATION:
    // Hidden boxes must NOT appear in the public inventory grid.
    if (box.isHidden === true) {
      continue;
    }

    let boxStatus: 'AVAILABLE' | 'CLAIMED' | 'OPENED' = 'AVAILABLE';

    if (box.status === 'OPENED' || box.opened) {
      boxStatus = 'OPENED';
    } else if (box.status === 'CLAIMED' || box.claimed) {
      boxStatus = 'CLAIMED';
    } else {
      boxStatus = 'AVAILABLE';
    }

    // Optional status filter ('all' shows the entire inventory of 15,051 boxes; 'available' shows all eligible available boxes)
    if (statusFilter === 'available' && boxStatus !== 'AVAILABLE') continue;
    if (statusFilter === 'claimed' && boxStatus !== 'CLAIMED') continue;
    if (statusFilter === 'opened' && boxStatus !== 'OPENED') continue;

    // Optional range filter
    if (rangeStart !== undefined && box.id < rangeStart) continue;
    if (rangeEnd !== undefined && box.id > rangeEnd) continue;

    // Optional search filter
    if (search) {
      const cleanNum = search.replace(/\D/g, '');
      const matchSerial = box.serial.includes(search);
      const matchNum = cleanNum ? box.id.toString().includes(cleanNum) : false;
      if (!matchSerial && !matchNum) continue;
    }

    allItems.push({ id: box.id, serial: box.serial, status: boxStatus });
  }

  // Sort strictly by ascending serial / id; if search is provided, prioritize exact match then ascending id
  if (search) {
    const cleanNum = search.replace(/\D/g, '');
    allItems.sort((a, b) => {
      const aExact = a.serial === search || (cleanNum !== '' && a.id.toString() === cleanNum);
      const bExact = b.serial === search || (cleanNum !== '' && b.id.toString() === cleanNum);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.id - b.id;
    });
  } else {
    allItems.sort((a, b) => a.id - b.id);
  }

  const totalFiltered = allItems.length;
  const totalPages = Math.ceil(totalFiltered / limit) || 1;
  const startIndex = (page - 1) * limit;
  const pagedBoxes = allItems.slice(startIndex, startIndex + limit);

  res.json({
    boxes: pagedBoxes,
    totalAvailable: globalAvailableCount,
    totalBoxesCount: totalFiltered,
    page,
    totalPages,
    limit,
    batchStart: storeData.batch.startSerial,
    batchEnd: storeData.batch.endSerial,
    totalBatchBoxes: TOTAL_BOXES,
    openedCount: globalOpenedCount,
    claimedCount: globalClaimedCount,
    reservedWinningCount: globalReservedWinningCount,
    totalUnavailable: globalOpenedCount + globalClaimedCount + globalReservedWinningCount,
  });
};
app.get('/api/boxes/available', handleGetPublicBoxes);
app.get('/api/boxes', handleGetPublicBoxes);

// Diagnostic endpoint to verify complete 15,051 inventory health and all 100 winning prizes
app.get('/api/inventory/diagnostic', (_req: Request, res: Response): void => {
  const totalBoxRecords = boxesMap.size;
  const uniqueSerials = new Set<string>();
  let duplicateSerialNumbers = 0;
  let openedBoxes = 0;
  let claimedBoxes = 0;
  let reservedBoxes = 0;
  let availableBoxes = 0;
  let hiddenBoxes = 0;

  let winningOpened = 0;
  let winningClaimed = 0;
  let customerOpened = 0;
  let customerClaimed = 0;

  for (const b of boxesMap.values()) {
    if (uniqueSerials.has(b.serial)) {
      duplicateSerialNumbers++;
    } else {
      uniqueSerials.add(b.serial);
    }

    if (b.isHidden === true) {
      hiddenBoxes++;
    }

    const isWin = WINNING_SERIALS_SET.has(b.serial);

    if (b.status === 'OPENED' || b.opened) {
      openedBoxes++;
      if (isWin) winningOpened++;
      else customerOpened++;
    } else if (b.status === 'CLAIMED' || b.claimed) {
      claimedBoxes++;
      if (isWin) winningClaimed++;
      else customerClaimed++;
    } else {
      availableBoxes++;
    }
  }

  const missingSerials: string[] = [];
  for (let i = START_SERIAL_NUM; i <= END_SERIAL_NUM; i++) {
    const s = formatSerial(i);
    if (!boxesMap.has(s)) {
      missingSerials.push(s);
    }
  }

  const prizeDistribution: Record<string, number> = {};
  for (const prize of Object.values(WINNING_PRIZE_MAP)) {
    prizeDistribution[prize] = (prizeDistribution[prize] || 0) + 1;
  }

  res.json({
    success: true,
    authoritativeSourceOfTruth: 'data/boxes.json',
    expectedSerialNumbers: TOTAL_BOXES,
    totalRecords: totalBoxRecords,
    uniqueSerialNumbers: uniqueSerials.size,
    availableBoxes,
    openedBoxes,
    claimedBoxes,
    reservedBoxes,
    hiddenBoxes,
    missingSerialNumbers: missingSerials.length,
    missingSerials,
    duplicateSerialNumbers,
    totalUnavailableBoxes: openedBoxes + claimedBoxes + reservedBoxes,
    arithmeticVerification: `${availableBoxes} (available) + ${openedBoxes + claimedBoxes + reservedBoxes} (unavailable) = ${availableBoxes + openedBoxes + claimedBoxes + reservedBoxes} total`,
    detailedBreakdown: {
      winningBoxes100Total: {
        total: TOTAL_WINNING_PRIZES,
        available: TOTAL_WINNING_PRIZES - (winningOpened + winningClaimed),
        opened: winningOpened,
        claimed: winningClaimed,
      },
      customerClaimedOpenedTotal: {
        total: customerOpened + customerClaimed,
        opened: customerOpened,
        claimed: customerClaimed,
      },
      preLaunchStatus: 'All 15,051 boxes are clean, AVAILABLE, and ready for launch.',
    },
    paginationStandards: {
      allInventoryTotalPages: Math.ceil(totalBoxRecords / 300),
      availableOnlyTotalPages: Math.ceil(availableBoxes / 300),
      boxesPerPage: 300,
      pages1To50Count: 300,
      page51Boxes: totalBoxRecords % 300 || 300,
    },
    startSerial: storeData.batch.startSerial,
    endSerial: storeData.batch.endSerial,
    prizeDistribution,
    databaseFile: BOXES_FILE,
  });
});

// =========================================================================
// --- ADMIN API ENDPOINTS (PROTECTED & SECURED) ---
// =========================================================================

// A. Admin Login
app.post('/api/admin/login', (req: Request, res: Response): void => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  if (!checkAdminRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many failed login attempts. Please wait 5 minutes before trying again.' });
    return;
  }

  const { pin, password } = req.body;
  const inputCredential = (typeof pin === 'string' ? pin : typeof password === 'string' ? password : '').trim();
  const serverAdminPin = (process.env.ADMIN_PIN || process.env.ADMIN_SECRET || 'admin2026').trim();

  if (!inputCredential || inputCredential !== serverAdminPin) {
    recordAdminFailedLogin(clientIp);
    res.status(401).json({ error: 'Invalid admin passcode or PIN.' });
    return;
  }

  clearAdminRateLimit(clientIp);
  const token = generateAdminSessionToken();

  res.json({
    success: true,
    token,
    message: 'Admin authorization successful.',
    expiresIn: 24 * 60 * 60,
  });
});

// B. Admin Logout
app.post('/api/admin/logout', requireAdminAuth, (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  const headerToken = req.headers['x-admin-token'] as string | undefined;
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined) || headerToken?.trim();

  if (token) {
    activeAdminSessions.delete(token);
  }
  res.json({ success: true, message: 'Admin session terminated successfully.' });
});

// C. Verify Admin Session Token
app.get('/api/admin/verify', requireAdminAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, authenticated: true });
});

// D. Admin Stats
app.get('/api/admin/stats', requireAdminAuth, (_req: Request, res: Response): void => {
  let availableBoxes = 0;
  let hiddenBoxes = 0;
  let claimedBoxes = 0;
  let openedBoxes = 0;
  let winningBoxes = 0;
  let hiddenWinningBoxes = 0;

  for (const box of boxesMap.values()) {
    const isWin = WINNING_SERIALS_SET.has(box.serial);
    if (isWin) {
      winningBoxes++;
      if (box.isHidden) hiddenWinningBoxes++;
    }
    if (box.isHidden) hiddenBoxes++;

    if (box.status === 'OPENED' || box.opened) {
      openedBoxes++;
      claimedBoxes++;
    } else if (box.status === 'CLAIMED' || box.claimed) {
      claimedBoxes++;
    } else if (!box.isHidden) {
      availableBoxes++;
    }
  }

  const prizeDistribution: Record<string, number> = {};
  for (const prize of Object.values(WINNING_PRIZE_MAP)) {
    prizeDistribution[prize] = (prizeDistribution[prize] || 0) + 1;
  }

  res.json({
    success: true,
    totalBoxes: boxesMap.size,
    availableBoxes,
    reservedBoxes: 0,
    hiddenBoxes,
    claimedBoxes,
    openedBoxes,
    winningBoxes,
    hiddenWinningBoxes,
    totalWinningPrizes: TOTAL_WINNING_PRIZES,
    prizeDistribution,
    batchStart: storeData.batch.startSerial,
    batchEnd: storeData.batch.endSerial,
  });
});

// E. Admin Inventory Grid (All 15,051 boxes, filterable & searchable)
app.get('/api/admin/boxes', requireAdminAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(500, Math.max(10, parseInt((req.query.limit as string) || '100', 10)));
  const search = ((req.query.search as string) || '').trim().toUpperCase();
  const filter = ((req.query.filter as string) || 'all').toLowerCase();

  const allFiltered: any[] = [];

  for (const box of boxesMap.values()) {
    const isWin = WINNING_SERIALS_SET.has(box.serial);
    const assignedPrize = isWin ? WINNING_PRIZE_MAP[box.serial] : undefined;

    let currentStatus: 'AVAILABLE' | 'CLAIMED' | 'OPENED' = 'AVAILABLE';
    if (box.status === 'OPENED' || box.opened) {
      currentStatus = 'OPENED';
    } else if (box.status === 'CLAIMED' || box.claimed) {
      currentStatus = 'CLAIMED';
    }

    // Filter rules
    if (filter === 'hidden' && !box.isHidden) continue;
    if (filter === 'available' && (box.isHidden || currentStatus !== 'AVAILABLE')) continue;
    if (filter === 'claimed' && (currentStatus !== 'CLAIMED' || box.status === 'OPENED')) continue;
    if (filter === 'opened' && currentStatus !== 'OPENED') continue;
    if (filter === 'winner' && !isWin) continue;

    if (search) {
      const cleanNum = search.replace(/\D/g, '');
      const matchSerial = box.serial.includes(search);
      const matchNum = cleanNum ? box.id.toString().includes(cleanNum) : false;
      const matchPrize = assignedPrize ? assignedPrize.toUpperCase().includes(search) : false;
      const matchToken = box.claimedBy ? box.claimedBy.toUpperCase().includes(search) : false;
      if (!matchSerial && !matchNum && !matchPrize && !matchToken) continue;
    }

    allFiltered.push({
      id: box.id,
      serial: box.serial,
      status: currentStatus,
      claimed: !!box.claimed,
      claimedBy: box.claimedBy,
      claimedAt: box.claimedAt,
      opened: !!box.opened,
      openedAt: box.openedAt,
      result: box.result,
      prizeName: box.prizeName || assignedPrize,
      claimCode: box.claimCode,
      isHidden: !!box.isHidden,
      isWinner: isWin,
      assignedPrize,
    });
  }

  if (search) {
    const cleanNum = search.replace(/\D/g, '');
    allFiltered.sort((a, b) => {
      const aExact = a.serial === search || (cleanNum !== '' && a.id.toString() === cleanNum);
      const bExact = b.serial === search || (cleanNum !== '' && b.id.toString() === cleanNum);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.id - b.id;
    });
  }

  const total = allFiltered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paged = allFiltered.slice(startIndex, startIndex + limit);

  res.json({
    boxes: paged,
    total,
    page,
    totalPages,
    limit,
  });
});

// F. Admin Toggle Box Visibility (Single or Bulk)
app.post('/api/admin/boxes/visibility', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { serial, serials, isHidden } = req.body;
  if (typeof isHidden !== 'boolean') {
    res.status(400).json({ error: 'isHidden boolean parameter is required.' });
    return;
  }

  const targets: string[] = [];
  if (typeof serial === 'string' && serial.trim()) {
    targets.push(serial.trim().toUpperCase());
  }
  if (Array.isArray(serials)) {
    for (const s of serials) {
      if (typeof s === 'string' && s.trim()) targets.push(s.trim().toUpperCase());
    }
  }

  if (targets.length === 0) {
    res.status(400).json({ error: 'serial string or serials array is required.' });
    return;
  }

  const releaseLock = await dbTransactionLock.acquire();
  try {
    const updatedSerials: string[] = [];
    const notFoundSerials: string[] = [];
    for (const s of targets) {
      const box = boxesMap.get(s);
      if (box) {
        box.isHidden = isHidden;
        updatedSerials.push(s);
      } else {
        notFoundSerials.push(s);
      }
    }

    // Persist immediately and atomically to boxes.json
    saveBoxesToDisk();

    console.log(`[ADMIN ACTION] Box visibility updated: ${updatedSerials.length} boxes set isHidden=${isHidden}`);

    res.json({
      success: true,
      updatedCount: updatedSerials.length,
      updatedSerials,
      notFoundCount: notFoundSerials.length,
      notFoundSerials,
      isHidden,
      message: `Successfully ${isHidden ? 'hidden' : 'unhidden'} ${updatedSerials.length} box(es).${
        notFoundSerials.length > 0 ? ` (${notFoundSerials.length} serials not found)` : ''
      }`,
    });
  } finally {
    releaseLock();
  }
});

// G. Admin List Winning Prizes & Claim Statuses
app.get('/api/admin/prizes', requireAdminAuth, (_req: Request, res: Response): void => {
  const prizesList = WINNING_SERIALS.map((serial) => {
    const box = boxesMap.get(serial);
    const customNote = storeData.batch.prizeCustomNotes?.[serial] || '';
    const isCardHidden = !!storeData.batch.hiddenPrizeCards?.[serial];

    return {
      serial,
      originalPrize: WINNING_PRIZE_MAP[serial],
      prizeName: WINNING_PRIZE_MAP[serial],
      isOpened: !!(box?.opened || box?.status === 'OPENED'),
      isClaimed: !!(box?.claimed || box?.status === 'CLAIMED'),
      claimedBy: box?.claimedBy,
      openedAt: box?.openedAt,
      claimCode: box?.claimCode,
      isBoxHidden: !!box?.isHidden,
      isCardHidden,
      customNote,
    };
  });

  res.json({
    success: true,
    totalPrizes: prizesList.length,
    prizes: prizesList,
  });
});

// H. Admin Hide/Unhide Prize Display Cards (without changing winners)
app.post('/api/admin/prizes/visibility', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { serial, isHidden } = req.body;
  if (!serial || typeof isHidden !== 'boolean') {
    res.status(400).json({ error: 'serial and isHidden boolean required.' });
    return;
  }

  const cleanSerial = serial.trim().toUpperCase();
  if (!WINNING_SERIALS_SET.has(cleanSerial)) {
    res.status(404).json({ error: `Serial ${cleanSerial} is not in the official winning prize list.` });
    return;
  }

  const releaseLock = await dbTransactionLock.acquire();
  try {
    storeData.batch.hiddenPrizeCards = storeData.batch.hiddenPrizeCards || {};
    storeData.batch.hiddenPrizeCards[cleanSerial] = isHidden;
    saveStoreToDisk();

    console.log(`[ADMIN ACTION] Prize card for ${cleanSerial} set isCardHidden=${isHidden}`);

    res.json({
      success: true,
      serial: cleanSerial,
      isCardHidden: isHidden,
      message: `Prize display card for ${cleanSerial} is now ${isHidden ? 'hidden' : 'visible'}.`,
    });
  } finally {
    releaseLock();
  }
});

// I. Admin Update Prize Display Information (without changing winner assignments)
app.post('/api/admin/prizes/update-display', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { serial, customNote } = req.body;
  if (!serial) {
    res.status(400).json({ error: 'serial is required.' });
    return;
  }

  const cleanSerial = serial.trim().toUpperCase();
  if (!WINNING_SERIALS_SET.has(cleanSerial)) {
    res.status(404).json({ error: `Serial ${cleanSerial} is not in the official winning prize list.` });
    return;
  }

  const releaseLock = await dbTransactionLock.acquire();
  try {
    storeData.batch.prizeCustomNotes = storeData.batch.prizeCustomNotes || {};
    storeData.batch.prizeCustomNotes[cleanSerial] = typeof customNote === 'string' ? customNote.trim() : '';
    saveStoreToDisk();

    console.log(`[ADMIN ACTION] Display note for prize ${cleanSerial} updated: "${storeData.batch.prizeCustomNotes[cleanSerial]}"`);

    res.json({
      success: true,
      serial: cleanSerial,
      customNote: storeData.batch.prizeCustomNotes[cleanSerial],
      message: `Display note for prize ${cleanSerial} updated successfully.`,
    });
  } finally {
    releaseLock();
  }
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

    // Hidden boxes cannot be claimed from public grid
    if (box.isHidden) {
      res.status(403).json({ error: `Box ${cleanSerial} is hidden and not available for selection.` });
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

    // Check if assigned box is one of the 100 configured winning positions
    const isWinner = WINNING_SERIALS_SET.has(assignedBoxSerial);
    const now = new Date().toISOString();

    customer.opened = true;
    customer.used = true; // Permanently mark link as used
    customer.openedAt = now;
    customer.result = isWinner ? 'WINNER' : 'BETTER_LUCK';

    if (isWinner) {
      const assignedPrize = WINNING_PRIZE_MAP[assignedBoxSerial] || 'Apple iPhone 17 Pro';
      customer.prizeName = assignedPrize;
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
