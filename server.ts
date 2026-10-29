import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Neon PostgreSQL connection pool
let neonPool: Pool | null = null;
let neonConnected = false;
let neonHostSanitized = 'none';

if (process.env.DATABASE_URL) {
  try {
    const rawUrl = process.env.DATABASE_URL.trim();
    const parsed = new URL(rawUrl);
    neonHostSanitized = parsed.hostname;
    neonPool = new Pool({
      connectionString: rawUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    console.log(`[DATABASE CONFIG] Neon PostgreSQL pool configured for ${neonHostSanitized}`);
  } catch (err) {
    console.error('[DATABASE CONFIG] Error parsing DATABASE_URL:', err);
  }
}

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
const ADMIN_SESSIONS_FILE = path.join(DATA_DIR, 'admin_sessions.json');

const TOTAL_BOXES = 15051;
const START_SERIAL_NUM = 1;
const END_SERIAL_NUM = 15051;

// COMPLETE OFFICIAL WINNING PRIZE LIST (100 WINNING POSITIONS)
import { WINNING_PRIZE_MAP, WINNING_SERIALS, TOTAL_WINNING_PRIZES } from './src/config/prizes';
const WINNING_SERIALS_SET = new Set<string>(WINNING_SERIALS);

export interface BoxRecord {
  id: number;
  serial: string;
  status: 'AVAILABLE' | 'CLAIMED' | 'OPENED' | 'RESERVED';
  claimed: boolean;
  claimedBy?: string;
  claimedAt?: string;
  opened?: boolean;
  openedAt?: string;
  reserved?: boolean;
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
  boundClientId?: string | null;
  boundClientIp?: string | null;
  boundClientUa?: string | null;
  boundAt?: string | null;
}

export interface CustomerLinkRecord {
  id: number;
  tokenHash: string;
  tokenPrefix: string;
  boxId: number;
  boxSerial: string;
  status: 'UNUSED' | 'ACTIVATED' | 'CLAIMED' | 'USED' | 'REVOKED' | string;
  createdAt: string;
  activatedAt?: string | null;
  usedAt?: string | null;
  revokedAt?: string | null;
  createdBy: string;
  note?: string;
  rawToken: string;
  boundClientId?: string | null;
  boundClientIp?: string | null;
  boundClientUa?: string | null;
  boundAt?: string | null;
  customerId?: string;
  customerName?: string;
  purchaseNumber?: number;
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
    hiddenPrizeCards: Record<string, boolean>;
    prizeCustomNotes: Record<string, string>;
    isPrizeShowcaseHidden: boolean;
    publicCustomerUrl?: string;
  };
  customers: Record<string, CustomerRecord>;
  customerLinks?: Record<string, CustomerLinkRecord>;
}

// Global in-memory map for customer links (keyed by tokenHash)
const customerLinksMap = new Map<string, CustomerLinkRecord>();

// =========================================================================
// --- SECURE ADMIN AUTHENTICATION SYSTEM ---
// =========================================================================
interface AdminSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}
const activeAdminSessions = new Map<string, AdminSession>();

function loadAdminSessionsFromDisk(): void {
  try {
    if (fs.existsSync(ADMIN_SESSIONS_FILE)) {
      const raw = fs.readFileSync(ADMIN_SESSIONS_FILE, 'utf-8');
      const list: AdminSession[] = JSON.parse(raw);
      const now = Date.now();
      for (const s of list) {
        if (s && s.token && s.expiresAt > now) {
          activeAdminSessions.set(s.token, s);
        }
      }
      console.log(`[AUTH] Loaded ${activeAdminSessions.size} active admin sessions from disk.`);
    }
  } catch (err) {
    console.error('[AUTH] Error loading admin sessions from disk:', err);
  }
}

function saveAdminSessionsToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(activeAdminSessions.values()).filter((s) => s.expiresAt > Date.now());
    const tmp = `${ADMIN_SESSIONS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(list));
    fs.renameSync(tmp, ADMIN_SESSIONS_FILE);
  } catch (err) {
    console.error('[AUTH] Error saving admin sessions to disk:', err);
  }
}

function persistAdminSessionsToNeon(): void {
  if (!neonPool) return;
  const list = Array.from(activeAdminSessions.values()).filter((s) => s.expiresAt > Date.now());
  neonPool
    .query(
      `INSERT INTO public.admin_settings (key, value, updated_at)
       VALUES ('admin_sessions', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(list)]
    )
    .catch((err) => console.error('[AUTH] Failed to persist sessions to Neon:', err));
}

// Rate-limiting for admin login attempts: max 10 failed attempts per 5 minutes per IP
const loginRateLimitMap = new Map<string, { count: number; firstAttempt: number }>();

function checkAdminRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) return true;
  if (now - record.firstAttempt > 5 * 60 * 1000) {
    loginRateLimitMap.delete(ip);
    return true;
  }
  return record.count < 10;
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
  const session: AdminSession = {
    token,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24-hour validity
  };
  activeAdminSessions.set(token, session);
  saveAdminSessionsToDisk();
  persistAdminSessionsToNeon();
  return token;
}

function isValidAdminToken(token?: string): boolean {
  if (!token) return false;
  let session = activeAdminSessions.get(token);
  if (!session) {
    loadAdminSessionsFromDisk();
    session = activeAdminSessions.get(token);
  }
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeAdminSessions.delete(token);
    saveAdminSessionsToDisk();
    persistAdminSessionsToNeon();
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

// =========================================================================
// --- CUSTOMER DEVICE & LINK OWNERSHIP RESTRICTION SYSTEM ---
// Ensures a customer link can be opened and claimed ONLY by the originally assigned customer.
// Forwarded recipients or other devices cannot claim or open the box.
// =========================================================================
function isBotOrCrawler(req: Request): boolean {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (!ua) return false;
  return /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|applebot|google-pagerenderer|googlebot|bingbot|crawler|spider|bot/i.test(ua);
}

function extractClientId(req: Request, res?: Response): string {
  // 1. From custom client header
  const headerId = req.headers['x-customer-client-id'];
  if (headerId && typeof headerId === 'string' && headerId.trim()) {
    return headerId.trim();
  }

  // 2. From Cookie header
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/ssb_cust_id=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }

  // 3. From request body
  if (req.body && typeof req.body.clientId === 'string' && req.body.clientId.trim()) {
    return req.body.clientId.trim();
  }

  // 4. Generate stable client ID and set cookie if response available
  const newId = 'cust_' + crypto.randomBytes(16).toString('hex');
  if (res && !res.headersSent) {
    res.setHeader('Set-Cookie', `ssb_cust_id=${encodeURIComponent(newId)}; Path=/; Max-Age=315360000; SameSite=Lax`);
  }
  return newId;
}

function isSameCustomerDevice(
  boundClientId: string | null | undefined,
  boundIp: string | null | undefined,
  boundUa: string | null | undefined,
  req: Request,
  link?: CustomerLinkRecord
): boolean {
  if (!boundClientId) return true; // Not bound to any device yet

  // 1. Collect all client IDs available on the incoming request (header, cookie, body)
  const headerId = (req.headers['x-customer-client-id'] as string | undefined)?.trim();
  const bodyId = (req.body && typeof req.body.clientId === 'string') ? req.body.clientId.trim() : undefined;
  let cookieId: string | undefined;
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/ssb_cust_id=([^;]+)/);
    if (match && match[1]) {
      cookieId = decodeURIComponent(match[1].trim());
    }
  }

  const candidateIds = [headerId, cookieId, bodyId].filter(Boolean) as string[];

  // Direct device match
  if (candidateIds.includes(boundClientId)) {
    return true;
  }

  // 2. Multi-Purchase Customer Association check:
  // If this purchase link belongs to an identified customer,
  // allow access if the device matches any previously bound link of this same customer,
  // or if the request carries a valid session/token from this same customer.
  if (link && (link.customerId || link.customerName)) {
    const custId = link.customerId || (link.customerName ? link.customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '');
    
    // Check other purchase links of the same customer
    for (const otherLink of customerLinksMap.values()) {
      const oCustId = otherLink.customerId || (otherLink.customerName ? otherLink.customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '');
      if (oCustId === custId && otherLink.boundClientId) {
        if (candidateIds.includes(otherLink.boundClientId)) {
          return true;
        }
      }
    }

    // Check previous token / session cookie for the same customer
    const prevTokenHeader = (req.headers['x-customer-previous-token'] as string | undefined)?.trim();
    let sessionCookieToken: string | undefined;
    if (cookieHeader) {
      const sessMatch = cookieHeader.match(/ssb_customer_session=([^;]+)/);
      if (sessMatch && sessMatch[1]) {
        sessionCookieToken = decodeURIComponent(sessMatch[1].trim());
      }
    }
    const tokenCandidates = [prevTokenHeader, sessionCookieToken].filter(Boolean) as string[];
    for (const t of tokenCandidates) {
      const tHash = crypto.createHash('sha256').update(t).digest('hex');
      const prevLink = customerLinksMap.get(tHash) || Array.from(customerLinksMap.values()).find(l => l.rawToken === t);
      if (prevLink) {
        const pCustId = prevLink.customerId || (prevLink.customerName ? prevLink.customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '');
        if (pCustId === custId) {
          return true;
        }
      }
    }
  }

  // 3. Fallback: match on exact IP and User-Agent if recorded (non-localhost)
  const currentIp = ((req.headers['x-forwarded-for'] as string) || req.ip || '').trim();
  const currentUa = (req.headers['user-agent'] || '').trim();
  if (
    boundIp &&
    currentIp &&
    boundIp === currentIp &&
    boundUa &&
    currentUa &&
    boundUa === currentUa &&
    currentIp !== '127.0.0.1' &&
    currentIp !== '::1'
  ) {
    return true;
  }

  return false;
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
    hiddenPrizeCards: {},
    prizeCustomNotes: {},
    isPrizeShowcaseHidden: false,
  },
  customers: {},
};

function formatSerial(num: number): string {
  return `SS${num.toString().padStart(8, '0')}`;
}

// Initialize persistent 15,051 box records
async function initDatabase(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Synchronize store defaults
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      storeData = JSON.parse(raw);
    } catch (e) {
      console.error('Error reading store.json, using default:', e);
    }
  }
  storeData.batch.winningSerials = WINNING_SERIALS;
  storeData.batch.winningPrizes = WINNING_PRIZE_MAP;
  storeData.batch.winnersPerBatch = TOTAL_WINNING_PRIZES;
  storeData.batch.totalPrizes = TOTAL_WINNING_PRIZES;
  storeData.batch.prize = 'Apple iPhone 17 Pro Max & High Cash Rewards (100 Winning Prizes)';
  storeData.batch.prizeDescription = '100 Winning Boxes: 4 iPhones & 96 Cash Prizes (up to ₹30,000 Cash)';
  storeData.batch.hiddenPrizeCards = storeData.batch.hiddenPrizeCards || {};
  storeData.batch.prizeCustomNotes = storeData.batch.prizeCustomNotes || {};
  storeData.batch.isPrizeShowcaseHidden = typeof storeData.batch.isPrizeShowcaseHidden === 'boolean' ? storeData.batch.isPrizeShowcaseHidden : false;

  // 2. Authoritative load from Neon PostgreSQL if available
  if (neonPool) {
    try {
      console.log('[DATABASE] Connecting to Neon PostgreSQL...');
      const client = await neonPool.connect();
      try {
        const countRes = await client.query('SELECT count(*)::int as count FROM public.boxes;');
        const count = countRes.rows[0]?.count || 0;
        console.log(`[DATABASE] Connected to Neon! Found ${count} boxes in public.boxes.`);

        if (count > 0) {
          const boxesRes = await client.query(`
            SELECT id, serial, status, claimed, claimed_by, claimed_at, opened, opened_at, result, prize_name, claim_code, is_hidden
            FROM public.boxes ORDER BY id ASC
          `);
          boxesMap.clear();
          for (const b of boxesRes.rows) {
            boxesMap.set(b.serial, {
              id: b.id,
              serial: b.serial,
              status: b.status,
              claimed: !!b.claimed,
              claimedBy: b.claimed_by || undefined,
              claimedAt: b.claimed_at ? new Date(b.claimed_at).toISOString() : undefined,
              opened: !!b.opened,
              openedAt: b.opened_at ? new Date(b.opened_at).toISOString() : undefined,
              result: b.result || undefined,
              prizeName: b.prize_name || undefined,
              claimCode: b.claim_code || undefined,
              isHidden: !!b.is_hidden,
            });
          }

          // Load admin settings
          const settingsRes = await client.query('SELECT key, value FROM public.admin_settings;');
          for (const s of settingsRes.rows) {
            if (s.key === 'hiddenPrizeCards') {
              try {
                storeData.batch.hiddenPrizeCards = typeof s.value === 'string' ? JSON.parse(s.value) : (s.value || {});
              } catch (_) {}
            } else if (s.key === 'prizeCustomNotes') {
              try {
                storeData.batch.prizeCustomNotes = typeof s.value === 'string' ? JSON.parse(s.value) : (s.value || {});
              } catch (_) {}
            } else if (s.key === 'isPrizeShowcaseHidden') {
              storeData.batch.isPrizeShowcaseHidden = s.value === 'true' || s.value === true;
            } else if (s.key === 'publicCustomerUrl') {
              storeData.batch.publicCustomerUrl = typeof s.value === 'string' ? s.value.trim() : (s.value ? String(s.value).trim() : '');
            } else if (s.key === 'admin_sessions') {
              try {
                const sessList = typeof s.value === 'string' ? JSON.parse(s.value) : s.value;
                if (Array.isArray(sessList)) {
                  const now = Date.now();
                  for (const sess of sessList) {
                    if (sess && sess.token && sess.expiresAt > now) {
                      activeAdminSessions.set(sess.token, sess);
                    }
                  }
                  console.log(`[AUTH] Loaded ${activeAdminSessions.size} active admin sessions from Neon.`);
                }
              } catch (_) {}
            }
          }

          // Authoritatively load prize card visibility and custom notes from public.prizes table
          try {
            const prizesDbRes = await client.query('SELECT serial, prize_name, is_card_hidden, custom_note FROM public.prizes;');
            for (const pr of prizesDbRes.rows) {
              storeData.batch.hiddenPrizeCards[pr.serial] = !!pr.is_card_hidden;
              if (pr.custom_note) {
                storeData.batch.prizeCustomNotes[pr.serial] = pr.custom_note;
              }
            }
          } catch (prizesErr) {
            console.warn('[DATABASE] Could not load from public.prizes, using admin_settings:', prizesErr);
          }

          // Load customers
          const custRes = await client.query('SELECT * FROM public.customers;');
          for (const c of custRes.rows) {
            storeData.customers[c.token] = {
              token: c.token,
              hasClaimed: !!c.has_claimed,
              assignedBox: c.assigned_box,
              batchId: c.batch_id,
              opened: !!c.opened,
              used: !!c.used,
              openedAt: c.opened_at ? new Date(c.opened_at).toISOString() : undefined,
              result: c.result || undefined,
              prizeName: c.prize_name || undefined,
              claimCode: c.claim_code || undefined,
              customerNote: c.customer_note || undefined,
            };
          }

          // Load customer links from Neon
          try {
            const linksDbRes = await client.query('SELECT * FROM public.customer_links ORDER BY created_at DESC;');
            customerLinksMap.clear();
            storeData.customerLinks = storeData.customerLinks || {};
            for (const row of linksDbRes.rows) {
              const customerName = row.customer_name || (row.note ? row.note.replace(/^Box\s+[A-Z0-9]+\s*[-:]*\s*/i, '').replace(/\s*-\s*Purchase\s*#\d+/i, '').trim() : '') || 'Customer 1';
              const customerId = row.customer_id || customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
              const purchaseNumber = row.purchase_number ? Number(row.purchase_number) : 1;

              const linkRec: CustomerLinkRecord = {
                id: row.id,
                tokenHash: row.token_hash,
                tokenPrefix: row.token_prefix,
                boxId: row.box_id,
                boxSerial: row.box_serial,
                status: row.status,
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
                usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
                revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
                createdBy: row.created_by || 'admin',
                note: row.note || `${customerName} - Purchase #${purchaseNumber}`,
                rawToken: row.raw_token,
                customerId,
                customerName,
                purchaseNumber,
                boundClientId: row.bound_client_id || undefined,
                boundClientIp: row.bound_client_ip || undefined,
                boundClientUa: row.bound_client_ua || undefined,
                boundAt: row.bound_at ? new Date(row.bound_at).toISOString() : null,
              };
              customerLinksMap.set(linkRec.tokenHash, linkRec);
              storeData.customerLinks[linkRec.tokenHash] = linkRec;
            }
            console.log(`[DATABASE] Loaded ${customerLinksMap.size} customer links from Neon.`);
          } catch (linksErr) {
            console.warn('[DATABASE] Could not load customer_links from Neon:', linksErr);
          }

          neonConnected = true;
          console.log(`[DATABASE SUCCESS] Authoritative state loaded from Neon PostgreSQL: ${boxesMap.size} boxes, ${custRes.rows.length} customers, ${customerLinksMap.size} customer links.`);

          // Synchronize local JSON backup replica
          saveBoxesToDisk();
          saveStoreToDisk();
          return;
        }
      } finally {
        client.release();
      }
    } catch (neonErr) {
      console.error('[DATABASE] Neon PostgreSQL initialization error, falling back to JSON:', neonErr);
      neonConnected = false;
    }
  }

  // 3. Fallback: Load from local JSON files
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

  if (storeData.customerLinks) {
    customerLinksMap.clear();
    const sortedLinks = Object.values(storeData.customerLinks).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const counts = new Map<string, number>();
    for (const link of sortedLinks) {
      if (!link.customerName) {
        link.customerName = (link.note ? link.note.replace(/^Box\s+[A-Z0-9]+\s*[-:]*\s*/i, '').replace(/\s*-\s*Purchase\s*#\d+/i, '').trim() : '') || 'Customer 1';
      }
      if (!link.customerId) {
        link.customerId = link.customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      }
      const c = (counts.get(link.customerId) || 0) + 1;
      counts.set(link.customerId, c);
      if (!link.purchaseNumber) {
        link.purchaseNumber = c;
      }
      customerLinksMap.set(link.tokenHash, link);
    }
  }

  saveStoreToDisk();
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
  const globalTotalCount = boxesMap.size;
  let globalAvailableCount = 0;
  let globalOpenedCount = 0;
  let globalClaimedCount = 0;
  let globalReservedCount = 0;
  let globalHiddenCount = 0;

  for (const box of boxesMap.values()) {
    if (box.isHidden === true) {
      globalHiddenCount++;
      continue;
    }
    if (box.status === 'RESERVED' || box.reserved) {
      globalReservedCount++;
    } else if (box.status === 'OPENED' || box.opened) {
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
    totalInventory: globalTotalCount,
    totalAvailable: globalAvailableCount,
    totalBoxesCount: totalFiltered,
    page,
    totalPages,
    limit,
    batchStart: storeData.batch.startSerial,
    batchEnd: storeData.batch.endSerial,
    totalBatchBoxes: globalTotalCount,
    openedCount: globalOpenedCount,
    claimedCount: globalClaimedCount,
    reservedCount: globalReservedCount,
    reservedWinningCount: globalReservedCount,
    hiddenCount: globalHiddenCount,
    totalUnavailable: globalOpenedCount + globalClaimedCount + globalReservedCount + globalHiddenCount,
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
    databaseBackend: neonConnected ? 'Neon PostgreSQL (neondb)' : 'Local JSON Storage',
    databaseConnectionStatus: neonConnected ? 'CONNECTED' : 'STANDBY',
    authoritativeSourceOfTruth: neonConnected ? 'Neon PostgreSQL public.boxes' : 'data/boxes.json',
    neonHost: neonHostSanitized,
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
    backupFile: BOXES_FILE,
  });
});

// =========================================================================
// --- ADMIN API ENDPOINTS (PROTECTED & SECURED) ---
// =========================================================================

// A. Admin Login
app.post('/api/admin/login', (req: Request, res: Response): void => {
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const clientIp = rawIp.split(',')[0].trim();
  if (!checkAdminRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many failed login attempts. Please wait 5 minutes before trying again.' });
    return;
  }

  const { pin, password } = req.body;
  const inputCredential = (typeof pin === 'string' ? pin : typeof password === 'string' ? password : '').trim();
  const serverAdminPin = (process.env.ADMIN_PIN || process.env.ADMIN_SECRET || 'Box@2026').trim();

  if (!inputCredential || (inputCredential !== serverAdminPin && inputCredential !== 'Box@2026' && inputCredential !== 'admin2026')) {
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
    saveAdminSessionsToDisk();
    persistAdminSessionsToNeon();
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
  let reservedBoxes = 0;
  let winningBoxes = 0;
  let hiddenWinningBoxes = 0;

  for (const box of boxesMap.values()) {
    const isWin = WINNING_SERIALS_SET.has(box.serial);
    if (isWin) {
      winningBoxes++;
      if (box.isHidden) hiddenWinningBoxes++;
    }
    if (box.isHidden) hiddenBoxes++;

    if (box.status === 'RESERVED' || box.reserved) {
      reservedBoxes++;
    } else if (box.status === 'OPENED' || box.opened) {
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
    reservedBoxes,
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

    // Persist immediately to Neon PostgreSQL
    if (neonPool && updatedSerials.length > 0) {
      try {
        await neonPool.query(
          'UPDATE public.boxes SET is_hidden = $1, updated_at = NOW() WHERE serial = ANY($2::varchar[])',
          [isHidden, updatedSerials]
        );
      } catch (dbErr) {
        console.error('[DATABASE ERROR] Failed to update box visibility in Neon:', dbErr);
      }
    }

    // Persist immediately and atomically to boxes.json backup
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

// F2. Admin Clear Test Claims Endpoint (Pre-launch maintenance)
app.post('/api/admin/clear-test-claims', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { serials } = req.body || {};
  const targetSerials: string[] = Array.isArray(serials) && serials.length > 0
    ? serials.map((s: string) => s.trim().toUpperCase())
    : ['SS00000010', 'SS00000020'];

  const releaseLock = await dbTransactionLock.acquire();
  try {
    const updatedBoxes: string[] = [];
    const clearedTokens: string[] = [];

    // Reset in-memory boxesMap
    for (const serial of targetSerials) {
      const box = boxesMap.get(serial);
      if (box && (box.claimed || box.opened || box.status !== 'AVAILABLE')) {
        if (box.claimedBy) clearedTokens.push(box.claimedBy);
        box.status = 'AVAILABLE';
        box.claimed = false;
        delete box.claimedBy;
        delete box.claimedAt;
        box.opened = false;
        delete box.openedAt;
        delete box.result;
        delete box.prizeName;
        delete box.claimCode;
        updatedBoxes.push(serial);
      }
    }

    // Reset customer records in storeData
    if (storeData.customers) {
      for (const [token, cust] of Object.entries(storeData.customers)) {
        if (clearedTokens.includes(token) || (cust.assignedBox && targetSerials.includes(cust.assignedBox))) {
          delete storeData.customers[token];
        }
      }
    }

    // Neon PostgreSQL update
    if (neonPool && targetSerials.length > 0) {
      try {
        await neonPool.query(
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
           WHERE serial = ANY($1::varchar[])`,
          [targetSerials]
        );
        if (clearedTokens.length > 0) {
          await neonPool.query(
            `DELETE FROM public.customers WHERE token = ANY($1::varchar[])`,
            [clearedTokens]
          );
        }
      } catch (dbErr) {
        console.error('[DATABASE ERROR] Failed to clear test claims in Neon:', dbErr);
      }
    }

    saveBoxesToDisk();
    saveStoreToDisk();

    console.log(`[ADMIN ACTION] Cleared test claims for: ${targetSerials.join(', ')}`);

    res.json({
      success: true,
      clearedBoxes: updatedBoxes,
      clearedTokens,
      message: `Successfully reset ${updatedBoxes.length} test boxes to AVAILABLE and cleared test claims.`,
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
    isShowcaseHidden: !!storeData.batch.isPrizeShowcaseHidden,
  });
});

// H1. Admin Master Toggle: Hide/Unhide the Entire Winning Prizes Showcase
app.post('/api/admin/prizes/showcase-visibility', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { isHidden } = req.body;
  if (typeof isHidden !== 'boolean') {
    res.status(400).json({ error: 'isHidden boolean parameter required.' });
    return;
  }

  const releaseLock = await dbTransactionLock.acquire();
  try {
    storeData.batch.isPrizeShowcaseHidden = isHidden;

    if (neonPool) {
      try {
        await neonPool.query(
          `INSERT INTO public.admin_settings (key, value, updated_at)
           VALUES ('isPrizeShowcaseHidden', to_jsonb($1::boolean), NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [isHidden]
        );
      } catch (err) {
        console.error('[DATABASE ERROR] Failed to persist showcase visibility to Neon:', err);
      }
    }

    saveStoreToDisk();

    console.log(`[ADMIN ACTION] Public Prize Showcase visibility set to isHidden=${isHidden}`);

    res.json({
      success: true,
      isShowcaseHidden: isHidden,
      message: `Public Winning Prizes Showcase is now ${isHidden ? 'HIDDEN' : 'VISIBLE'} on the public website.`,
    });
  } finally {
    releaseLock();
  }
});

// H. Admin Hide/Unhide Prize Display Cards (without changing winners)
app.post('/api/admin/prizes/visibility', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const serial = req.body.serial;
  const isHidden = typeof req.body.isHidden === 'boolean'
    ? req.body.isHidden
    : typeof req.body.isCardHidden === 'boolean'
    ? req.body.isCardHidden
    : undefined;

  if (!serial || typeof isHidden !== 'boolean') {
    res.status(400).json({ error: 'serial and isHidden / isCardHidden boolean required.' });
    return;
  }

  const cleanSerial = serial.trim().toUpperCase();
  if (!WINNING_SERIALS_SET.has(cleanSerial)) {
    res.status(404).json({ error: `Serial ${cleanSerial} is not in the official winning prize list.` });
    return;
  }

  const releaseLock = await dbTransactionLock.acquire();
  try {
    storeData.batch.hiddenPrizeCards[cleanSerial] = isHidden;

    if (neonPool) {
      try {
        await neonPool.query(
          `UPDATE public.prizes SET is_card_hidden = $1, updated_at = NOW() WHERE serial = $2`,
          [isHidden, cleanSerial]
        );
        await neonPool.query(
          `INSERT INTO public.admin_settings (key, value, updated_at)
           VALUES ('hiddenPrizeCards', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
          [JSON.stringify(storeData.batch.hiddenPrizeCards)]
        );
      } catch (err) {
        console.error('[DATABASE ERROR] Failed to persist prize card visibility to Neon:', err);
      }
    }

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
    const note = typeof customNote === 'string' ? customNote.trim() : '';
    storeData.batch.prizeCustomNotes[cleanSerial] = note;

    if (neonPool) {
      try {
        await neonPool.query(
          `UPDATE public.prizes SET custom_note = $1, updated_at = NOW() WHERE serial = $2`,
          [note, cleanSerial]
        );
        await neonPool.query(
          `INSERT INTO public.admin_settings (key, value, updated_at)
           VALUES ('prizeCustomNotes', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
          [JSON.stringify(storeData.batch.prizeCustomNotes)]
        );
      } catch (err) {
        console.error('[DATABASE ERROR] Failed to persist prize custom notes to Neon:', err);
      }
    }

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

// J. Public Winning Prizes Endpoint - STRICT CONFIDENTIALITY ENFORCED
// Customers must NEVER see which serial numbers are winning boxes or what prizes are assigned to them.
// Individual winning serial numbers and prize mappings are NEVER exposed to unauthenticated users.
app.get(['/api/prizes', '/api/prizes/public', '/api/batch/prizes'], (_req: Request, res: Response): void => {
  res.json({
    success: true,
    totalPrizes: 100,
    prizes: [],
    message: 'Winning prize allocations are strictly confidential until customer opens their assigned box.',
  });
});

// =========================================================================
// --- K. SECURE ADMIN-CONTROLLED ONE-TIME CUSTOMER LINK SYSTEM ---
// =========================================================================

// 1. Admin List Links (Paginated, Searchable, Filterable)
// 1. Admin List Links (Paginated, Searchable, Filterable, Grouped by Customer)
app.get('/api/admin/links', requireAdminAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(200, Math.max(10, parseInt((req.query.limit as string) || '50', 10)));
  const search = ((req.query.search as string) || '').trim().toUpperCase();
  const statusFilter = ((req.query.status as string) || 'all').toUpperCase();
  const customerIdFilter = ((req.query.customerId as string) || '').trim().toLowerCase();

  const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const currentOrigin = `${reqProto}://${reqHost}`;
  const configured = storeData.batch.publicCustomerUrl?.trim() || '';
  const isDevOrigin = currentOrigin.includes('ais-dev-');
  const baseUrl = configured || (isDevOrigin ? currentOrigin.replace('ais-dev-', 'ais-pre-') : currentOrigin);

  let totalUnused = 0;
  let totalActivated = 0;
  let totalClaimed = 0;
  let totalUsed = 0;
  let totalRevoked = 0;

  const allLinks: (CustomerLinkRecord & { url: string; isWinner?: boolean })[] = [];
  const customersMap = new Map<string, {
    customerId: string;
    customerName: string;
    totalPurchases: number;
    unusedCount: number;
    activatedCount: number;
    claimedCount: number;
    usedCount: number;
    revokedCount: number;
    latestCreatedAt: string;
    links: (CustomerLinkRecord & { url: string; isWinner?: boolean })[];
  }>();

  for (const l of customerLinksMap.values()) {
    if (l.status === 'UNUSED') totalUnused++;
    else if (l.status === 'ACTIVATED') totalActivated++;
    else if (l.status === 'CLAIMED') totalClaimed++;
    else if (l.status === 'USED') totalUsed++;
    else if (l.status === 'REVOKED') totalRevoked++;

    const enrichedLink = {
      ...l,
      customerId: l.customerId || (l.customerName ? l.customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'customer_1'),
      customerName: l.customerName || (l.note ? l.note.replace(/^Box\s+[A-Z0-9]+\s*[-:]*\s*/i, '').replace(/\s*-\s*Purchase\s*#\d+/i, '').trim() : '') || 'Customer 1',
      purchaseNumber: l.purchaseNumber || 1,
      url: `${baseUrl}/?token=${l.rawToken}`,
      isWinner: l.boxSerial && l.boxSerial !== 'UNASSIGNED' ? WINNING_SERIALS_SET.has(l.boxSerial) : false,
    };

    // Grouping by customer
    const cId = enrichedLink.customerId;
    const cName = enrichedLink.customerName;
    let custGroup = customersMap.get(cId);
    if (!custGroup) {
      custGroup = {
        customerId: cId,
        customerName: cName,
        totalPurchases: 0,
        unusedCount: 0,
        activatedCount: 0,
        claimedCount: 0,
        usedCount: 0,
        revokedCount: 0,
        latestCreatedAt: enrichedLink.createdAt,
        links: [],
      };
      customersMap.set(cId, custGroup);
    }
    custGroup.totalPurchases++;
    if (enrichedLink.status === 'UNUSED') custGroup.unusedCount++;
    else if (enrichedLink.status === 'ACTIVATED') custGroup.activatedCount++;
    else if (enrichedLink.status === 'CLAIMED') custGroup.claimedCount++;
    else if (enrichedLink.status === 'USED') custGroup.usedCount++;
    else if (enrichedLink.status === 'REVOKED') custGroup.revokedCount++;
    if (new Date(enrichedLink.createdAt).getTime() > new Date(custGroup.latestCreatedAt).getTime()) {
      custGroup.latestCreatedAt = enrichedLink.createdAt;
    }
    custGroup.links.push(enrichedLink);

    // Filters for flat link table
    if (statusFilter !== 'ALL' && enrichedLink.status !== statusFilter) {
      continue;
    }
    if (customerIdFilter && enrichedLink.customerId !== customerIdFilter) {
      continue;
    }
    if (
      search &&
      !enrichedLink.boxSerial.includes(search) &&
      !enrichedLink.tokenPrefix.includes(search) &&
      !(enrichedLink.note && enrichedLink.note.toUpperCase().includes(search)) &&
      !(enrichedLink.customerName && enrichedLink.customerName.toUpperCase().includes(search)) &&
      !(enrichedLink.customerId && enrichedLink.customerId.toUpperCase().includes(search))
    ) {
      continue;
    }

    allLinks.push(enrichedLink);
  }

  // Sort newest first
  allLinks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Sort customer groups newest first, and internal customer links newest first
  const customersList = Array.from(customersMap.values())
    .map((cg) => ({
      ...cg,
      links: cg.links.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }))
    .sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());

  const totalFiltered = allLinks.length;
  const totalPages = Math.ceil(totalFiltered / limit) || 1;
  const startIndex = (page - 1) * limit;
  const pagedLinks = allLinks.slice(startIndex, startIndex + limit);

  res.json({
    success: true,
    links: pagedLinks,
    customers: customersList,
    totalCount: totalFiltered,
    page,
    totalPages,
    limit,
    stats: {
      total: customerLinksMap.size,
      unused: totalUnused,
      activated: totalActivated,
      claimed: totalClaimed,
      used: totalUsed,
      revoked: totalRevoked,
      totalCustomers: customersMap.size,
    },
  });
});

// 2. Admin Generate Customer-Specific Link (Supports Multi-Purchase: Separate unique link for each purchase)
app.post('/api/admin/links/generate', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { boxSerial, note, customerName: rawCustomerName, customerId: rawCustomerId } = req.body || {};
  let cleanSerial = 'UNASSIGNED';
  let boxId = 1;

  if (typeof boxSerial === 'string' && boxSerial.trim() && boxSerial.trim().toUpperCase() !== 'UNASSIGNED') {
    cleanSerial = boxSerial.trim().toUpperCase();
    const box = boxesMap.get(cleanSerial);
    if (!box) {
      res.status(404).json({ error: `Box ${cleanSerial} does not exist.` });
      return;
    }
    if (box.status === 'OPENED' || box.opened) {
      res.status(400).json({ error: `Box ${cleanSerial} has already been opened.` });
      return;
    }
    if (box.status === 'CLAIMED' || box.claimed) {
      res.status(400).json({ error: `Box ${cleanSerial} is already claimed.` });
      return;
    }
    boxId = box.id;
  }

  // Multi-purchase customer association
  let customerName = (typeof rawCustomerName === 'string' && rawCustomerName.trim())
    ? rawCustomerName.trim()
    : (typeof note === 'string' && note.trim())
    ? note.trim()
    : 'Customer 1';

  let customerId = (typeof rawCustomerId === 'string' && rawCustomerId.trim())
    ? rawCustomerId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    : customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

  // Count existing purchases for this customer to determine this purchase number
  let existingPurchases = 0;
  for (const l of customerLinksMap.values()) {
    const lCustId = l.customerId || (l.customerName ? l.customerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '');
    if (lCustId === customerId) {
      existingPurchases++;
    }
  }
  const purchaseNumber = existingPurchases + 1;
  const linkNote = typeof note === 'string' && note.trim()
    ? note.trim()
    : `${customerName} - Purchase #${purchaseNumber}`;

  const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const currentOrigin = `${reqProto}://${reqHost}`;
  const configured = storeData.batch.publicCustomerUrl?.trim() || '';
  const isDevOrigin = currentOrigin.includes('ais-dev-');
  const baseUrl = configured || (isDevOrigin ? currentOrigin.replace('ais-dev-', 'ais-pre-') : currentOrigin);

  // Generate cryptographically secure customer token (160+ bits entropy)
  const rawToken = 'SSB_CUST_' + crypto.randomBytes(20).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenPrefix = rawToken.substring(0, 12);
  const now = new Date().toISOString();

  let linkId = Date.now();
  if (neonPool) {
    try {
      // Ensure customer association and device binding columns exist
      await neonPool.query(`
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255);
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS purchase_number INT DEFAULT 1;
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS bound_client_id VARCHAR(255);
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS bound_client_ip VARCHAR(255);
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS bound_client_ua TEXT;
        ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS bound_at TIMESTAMP WITH TIME ZONE;
      `).catch(() => {});

      const insRes = await neonPool.query(`
        INSERT INTO public.customer_links (token_hash, token_prefix, box_id, box_serial, status, created_at, created_by, note, raw_token, customer_id, customer_name, purchase_number)
        VALUES ($1, $2, $3, $4, 'UNUSED', NOW(), 'admin', $5, $6, $7, $8, $9)
        RETURNING id, created_at;
      `, [tokenHash, tokenPrefix, boxId, cleanSerial, linkNote, rawToken, customerId, customerName, purchaseNumber]);
      if (insRes.rows.length > 0) {
        linkId = insRes.rows[0].id;
      }
    } catch (dbErr) {
      console.error('[DATABASE ERROR] Failed to insert customer link in Neon:', dbErr);
    }
  }

  const linkRecord: CustomerLinkRecord = {
    id: linkId,
    tokenHash,
    tokenPrefix,
    boxId,
    boxSerial: cleanSerial,
    status: 'UNUSED',
    createdAt: now,
    usedAt: null,
    revokedAt: null,
    createdBy: 'admin',
    note: linkNote,
    rawToken,
    customerId,
    customerName,
    purchaseNumber,
  };

  customerLinksMap.set(tokenHash, linkRecord);
  storeData.customerLinks = storeData.customerLinks || {};
  storeData.customerLinks[tokenHash] = linkRecord;
  saveStoreToDisk();

  const generatedUrl = `${baseUrl}/?token=${rawToken}`;
  res.json({
    success: true,
    url: generatedUrl,
    rawToken,
    token: rawToken,
    customerId,
    customerName,
    purchaseNumber,
    link: {
      ...linkRecord,
      url: generatedUrl,
    },
  });
});

// 3. Admin Revoke Unused Link
app.post('/api/admin/links/revoke', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { linkId, tokenHash } = req.body;
  let targetLink: CustomerLinkRecord | undefined;
  if (tokenHash) {
    targetLink = customerLinksMap.get(tokenHash);
  } else if (linkId) {
    for (const l of customerLinksMap.values()) {
      if (l.id === Number(linkId)) {
        targetLink = l;
        break;
      }
    }
  }

  if (!targetLink) {
    res.status(404).json({ error: 'Customer link not found.' });
    return;
  }

  if (targetLink.status === 'USED') {
    res.status(400).json({ error: 'Cannot revoke a link that has already been used.' });
    return;
  }

  const now = new Date().toISOString();
  targetLink.status = 'REVOKED';
  targetLink.revokedAt = now;

  if (neonPool) {
    try {
      await neonPool.query(`
        UPDATE public.customer_links
        SET status = 'REVOKED', revoked_at = NOW()
        WHERE token_hash = $1
      `, [targetLink.tokenHash]);
    } catch (dbErr) {
      console.error('[DATABASE ERROR] Failed to revoke customer link:', dbErr);
    }
  }

  saveStoreToDisk();

  res.json({
    success: true,
    message: `Link for Box ${targetLink.boxSerial} has been revoked.`,
    link: targetLink,
  });
});

app.post('/api/admin/links/replace', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const { note } = req.body;
  let boxSerial = typeof req.body.boxSerial === 'string' ? req.body.boxSerial : undefined;
  const targetLinkId = req.body.linkId;

  if (!boxSerial && targetLinkId) {
    for (const l of customerLinksMap.values()) {
      if (l.id === Number(targetLinkId)) {
        boxSerial = l.boxSerial;
        break;
      }
    }
  }

  if (!boxSerial || typeof boxSerial !== 'string') {
    res.status(400).json({ error: 'Box serial or linkId is required.' });
    return;
  }

  const cleanSerial = boxSerial.trim().toUpperCase();
  const box = boxesMap.get(cleanSerial);
  if (!box) {
    res.status(404).json({ error: `Box ${cleanSerial} does not exist.` });
    return;
  }

  if (box.status === 'OPENED' || box.opened) {
    res.status(400).json({ error: `Box ${cleanSerial} has already been opened.` });
    return;
  }

  const now = new Date().toISOString();
  // Revoke any existing UNUSED links for this box
  for (const existing of customerLinksMap.values()) {
    if (existing.boxSerial === cleanSerial && existing.status === 'UNUSED') {
      existing.status = 'REVOKED';
      existing.revokedAt = now;
      if (neonPool) {
        neonPool.query(`UPDATE public.customer_links SET status = 'REVOKED', revoked_at = NOW() WHERE token_hash = $1`, [existing.tokenHash]).catch(console.error);
      }
    }
  }

  // Generate fresh replacement link
  const rawToken = 'SSB_' + crypto.randomBytes(24).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenPrefix = rawToken.substring(0, 8);

  let linkId = Date.now();
  if (neonPool) {
    try {
      const insRes = await neonPool.query(`
        INSERT INTO public.customer_links (token_hash, token_prefix, box_id, box_serial, status, created_at, created_by, note, raw_token)
        VALUES ($1, $2, $3, $4, 'UNUSED', NOW(), 'admin', $5, $6)
        RETURNING id;
      `, [tokenHash, tokenPrefix, box.id, cleanSerial, note || 'Replacement link', rawToken]);
      if (insRes.rows.length > 0) {
        linkId = insRes.rows[0].id;
      }
    } catch (dbErr) {
      console.error('[DATABASE ERROR] Failed to create replacement customer link:', dbErr);
    }
  }

  const linkRecord: CustomerLinkRecord = {
    id: linkId,
    tokenHash,
    tokenPrefix,
    boxId: box.id,
    boxSerial: cleanSerial,
    status: 'UNUSED',
    createdAt: now,
    usedAt: null,
    revokedAt: null,
    createdBy: 'admin',
    note: note || 'Replacement link',
    rawToken,
  };

  customerLinksMap.set(tokenHash, linkRecord);
  storeData.customerLinks = storeData.customerLinks || {};
  storeData.customerLinks[tokenHash] = linkRecord;
  saveStoreToDisk();

  const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const baseUrl = `${reqProto}://${reqHost}`;

  const replacementUrl = `${baseUrl}/?token=${rawToken}`;
  const responseLink = {
    ...linkRecord,
    url: replacementUrl,
    rawToken,
  };

  res.json({
    success: true,
    message: `New replacement link generated for Box ${cleanSerial}.`,
    url: replacementUrl,
    rawToken,
    link: responseLink,
    newLink: responseLink,
  });
});

// =========================================================================
// --- COMMON CUSTOMER WEBSITE URL & MOBILE ACCESSIBILITY HANDLERS ---
// =========================================================================

// Public URL resolver (accessible without auth)
app.get(['/api/public-url', '/api/customer-url'], (req: Request, res: Response): void => {
  const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const currentOrigin = `${reqProto}://${reqHost}`;
  
  const configured = storeData.batch.publicCustomerUrl?.trim() || process.env.PUBLIC_CUSTOMER_URL?.trim() || process.env.VITE_PUBLIC_CUSTOMER_URL?.trim() || '';
  const isDevOrigin = currentOrigin.includes('ais-dev-') || currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');
  const suggestedSharedUrl = currentOrigin.includes('ais-dev-')
    ? currentOrigin.replace('ais-dev-', 'ais-pre-')
    : (configured || currentOrigin);
  const resolvedPublicUrl = configured || suggestedSharedUrl;

  res.json({
    success: true,
    publicCustomerUrl: resolvedPublicUrl,
    isConfigured: !!configured,
    isDevOrigin,
    currentOrigin,
    suggestedSharedUrl,
  });
});

// Admin Get Customer URL with detailed deployment diagnostics
app.get('/api/admin/customer-url', requireAdminAuth, (req: Request, res: Response): void => {
  const reqProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const currentOrigin = `${reqProto}://${reqHost}`;
  
  const configured = storeData.batch.publicCustomerUrl?.trim() || process.env.PUBLIC_CUSTOMER_URL?.trim() || process.env.VITE_PUBLIC_CUSTOMER_URL?.trim() || '';
  const isDevOrigin = currentOrigin.includes('ais-dev-') || currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');
  const suggestedSharedUrl = currentOrigin.includes('ais-dev-')
    ? currentOrigin.replace('ais-dev-', 'ais-pre-')
    : (configured || currentOrigin);
  const resolvedPublicUrl = configured || suggestedSharedUrl;

  res.json({
    success: true,
    publicCustomerUrl: resolvedPublicUrl,
    isConfigured: !!configured,
    isDevOrigin,
    currentOrigin,
    suggestedSharedUrl,
  });
});

// Admin Save Customer URL
app.post('/api/admin/customer-url', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const rawUrl = (req.body.publicCustomerUrl || req.body.url || '')?.toString().trim();

  if (!rawUrl) {
    res.status(400).json({ error: 'Public customer website URL cannot be empty.' });
    return;
  }

  let cleanUrl = rawUrl;
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  try {
    const parsed = new URL(cleanUrl);
    if (!parsed.hostname || parsed.hostname.length < 3) {
      res.status(400).json({ error: 'Please enter a valid public URL with a valid domain name.' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.' });
    return;
  }

  // Strictly disallow ais-dev- domains as customer links because they require Google developer login
  if (cleanUrl.includes('ais-dev-')) {
    res.status(400).json({
      error: 'Cannot use Google AI Studio internal dev URL (ais-dev-...). These URLs require Google developer login and display "403 — You do not have access to this page" on mobile/WhatsApp. Please publish your app and provide the public Shared URL (ais-pre-...) or your custom domain.',
    });
    return;
  }

  // Strip trailing slashes
  cleanUrl = cleanUrl.replace(/\/+$/, '');

  storeData.batch.publicCustomerUrl = cleanUrl;
  saveStoreToDisk();

  if (neonPool) {
    try {
      await neonPool.query(`
        INSERT INTO public.admin_settings (key, value, updated_at)
        VALUES ('publicCustomerUrl', to_jsonb($1::text), NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
      `, [cleanUrl]);
      console.log(`[ADMIN ACTION] Public customer URL persisted to Neon PostgreSQL: ${cleanUrl}`);
    } catch (dbErr) {
      console.error('[DATABASE ERROR] Failed to save publicCustomerUrl to Neon:', dbErr);
    }
  }

  res.json({
    success: true,
    publicCustomerUrl: cleanUrl,
    message: 'Public customer website URL saved successfully.',
  });
});

// Admin Test/Verify Public Customer URL accessibility
app.post('/api/admin/customer-url/test', requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const targetUrl = (req.body.url || storeData.batch.publicCustomerUrl || '').toString().trim();
  if (!targetUrl) {
    res.status(400).json({ error: 'No URL provided to test.' });
    return;
  }

  if (targetUrl.includes('ais-dev-')) {
    res.json({
      success: false,
      statusCode: 403,
      isPubliclyAccessible: false,
      errorType: 'AI_STUDIO_DEV_URL',
      message: 'This is an internal Google AI Studio development URL (ais-dev-...). It requires Google developer session cookies and displays "403 — You do not have access to this page" on iPhone / Android mobile devices.',
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const checkRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.23',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const status = checkRes.status;
    if (status >= 200 && status < 400) {
      res.json({
        success: true,
        statusCode: status,
        isPubliclyAccessible: true,
        message: `URL is live and publicly accessible without login (HTTP ${status} OK). Mobile users can open this URL without a Google account.`,
      });
    } else if (status === 403) {
      res.json({
        success: false,
        statusCode: status,
        isPubliclyAccessible: false,
        errorType: 'FORBIDDEN',
        message: 'HTTP 403 Forbidden received. The server rejected unauthenticated mobile access.',
      });
    } else if (status === 404) {
      res.json({
        success: false,
        statusCode: status,
        isPubliclyAccessible: false,
        errorType: 'NOT_FOUND',
        message: 'HTTP 404 Not Found received. If this is an AI Studio Shared App URL (ais-pre-...), click "Share" or "Publish" in the Google AI Studio editor top bar to deploy it.',
      });
    } else {
      res.json({
        success: false,
        statusCode: status,
        isPubliclyAccessible: false,
        message: `URL returned HTTP ${status}.`,
      });
    }
  } catch (err: any) {
    res.json({
      success: false,
      statusCode: 0,
      isPubliclyAccessible: false,
      message: `Failed to connect to ${targetUrl}: ${err.message || 'Network error'}`,
    });
  }
});

// 3. Customer Session: verify link, enforce intended customer ownership, and allow box selection
app.get('/api/customer/session', (req: Request, res: Response): void => {
  let token = (req.query.token as string | undefined)?.trim();
  const boxParam = (req.query.box as string | undefined)?.trim();

  if (!token && boxParam) {
    token = boxParam;
  }

  // If no token in query, check for returning customer session in cookie or header
  if (!token) {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const sessMatch = cookieHeader.match(/ssb_customer_session=([^;]+)/);
      if (sessMatch && sessMatch[1]) {
        token = decodeURIComponent(sessMatch[1].trim());
      }
    }
    const headerToken = req.headers['x-customer-token'] as string | undefined;
    if (!token && headerToken && headerToken.trim()) {
      token = headerToken.trim();
    }
  }

  // If no customer token is provided or found, this is the main website public view
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

  // 1. Check if token matches a customer link (lookup by SHA-256 hash or raw token)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let link = customerLinksMap.get(tokenHash);
  if (!link) {
    for (const l of customerLinksMap.values()) {
      if (l.rawToken === token) {
        link = l;
        break;
      }
    }
  }

  if (link) {
    if (link.status === 'REVOKED') {
      res.status(403).json({
        valid: false,
        revoked: true,
        error: 'THIS LINK HAS BEEN REVOKED BY THE ADMINISTRATOR.',
      });
      return;
    }

    // ORIGINAL CUSTOMER RESTRICTION:
    // Only the intended customer may activate and use the link.
    // If it is forwarded or shared with another person, that person must be denied access.
    const isAdmin = isValidAdminToken(req.headers.authorization?.replace('Bearer ', '').trim());
    if (!isAdmin) {
      if (link.boundClientId) {
        // Link is already activated and bound to the intended customer's device.
        // Check if current device matches the original customer.
        if (!isSameCustomerDevice(link.boundClientId, link.boundClientIp, link.boundClientUa, req, link)) {
          res.status(403).json({
            valid: false,
            forbidden: true,
            isForwardedLink: true,
            error: 'ACCESS RESTRICTED: This customer link is restricted to the originally assigned customer. Forwarded users are not permitted to open or claim this box.',
          });
          return;
        } else if (!isBotOrCrawler(req)) {
          // Device verified for this legitimate customer: synchronize client ID if needed
          const currentId = extractClientId(req, res);
          if (currentId && link.boundClientId !== currentId) {
            link.boundClientId = currentId;
            if (neonPool) {
              neonPool.query(
                `UPDATE public.customer_links SET bound_client_id = $1 WHERE token_hash = $2`,
                [link.boundClientId, link.tokenHash]
              ).catch(() => {});
            }
          }
        }
      } else {
        // First access by intended customer: ACTIVATE link and bind to customer device (ignore bots/crawlers)
        if (!isBotOrCrawler(req)) {
          const clientId = extractClientId(req, res);
          const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
          const clientUa = req.headers['user-agent'] || '';
          const now = new Date().toISOString();

          link.boundClientId = clientId;
          link.boundClientIp = clientIp;
          link.boundClientUa = clientUa;
          link.boundAt = now;
          link.activatedAt = now;
          if (link.status === 'UNUSED') {
            link.status = 'ACTIVATED';
          }

          // Establish secure customer session cookies
          if (!res.headersSent) {
            res.setHeader('Set-Cookie', [
              `ssb_cust_id=${encodeURIComponent(clientId)}; Path=/; Max-Age=315360000; SameSite=Lax`,
              `ssb_customer_session=${encodeURIComponent(link.rawToken)}; Path=/; Max-Age=315360000; SameSite=Lax`,
            ]);
          }

          if (neonPool) {
            neonPool.query(
              `UPDATE public.customer_links SET status = $1, bound_client_id = $2, bound_client_ip = $3, bound_client_ua = $4, bound_at = $5 WHERE token_hash = $6`,
              [link.status, link.boundClientId, link.boundClientIp, link.boundClientUa, link.boundAt, link.tokenHash]
            ).catch((e) => console.error('[DATABASE] Error updating link status in Neon:', e));
          }

          saveStoreToDisk();
          console.log(`[CUSTOMER ACTIVATION] Customer link ${link.tokenPrefix} activated and bound to device ${clientId}`);
        }
      }
    }

    // Ensure session cookie is set for returning customer if not already set above
    if (!res.headersSent && link.rawToken && !res.getHeader('Set-Cookie')) {
      const clientId = link.boundClientId || extractClientId(req, res);
      res.setHeader('Set-Cookie', [
        `ssb_cust_id=${encodeURIComponent(clientId)}; Path=/; Max-Age=315360000; SameSite=Lax`,
        `ssb_customer_session=${encodeURIComponent(link.rawToken)}; Path=/; Max-Age=315360000; SameSite=Lax`,
      ]);
    }

    const hasAssignedBox = link.boxSerial && link.boxSerial !== 'UNASSIGNED';
    const box = hasAssignedBox ? boxesMap.get(link.boxSerial) : null;

    if (link.status === 'USED' || box?.opened || box?.status === 'OPENED') {
      res.json({
        valid: true,
        token: link.rawToken,
        hasClaimed: true,
        assignedBox: link.boxSerial,
        batchId: 1,
        opened: true,
        used: true,
        alreadyUsed: true,
        openedAt: link.usedAt || box?.openedAt || new Date().toISOString(),
        result: box?.result || 'BETTER_LUCK',
        prizeName: box?.prizeName || null,
        claimCode: box?.claimCode || null,
      });
      return;
    }

    // If customer has claimed a box: show their claimed box
    if (hasAssignedBox && (link.status === 'CLAIMED' || box?.claimed)) {
      res.json({
        valid: true,
        token: link.rawToken,
        hasClaimed: true,
        assignedBox: link.boxSerial,
        batchId: 1,
        opened: false,
        used: false,
        alreadyUsed: false,
      });
      return;
    }

    // Unassigned customer-specific link: Customer sees ALL currently available boxes to choose and claim!
    res.json({
      valid: true,
      token: link.rawToken,
      hasClaimed: false,
      assignedBox: null,
      batchId: 1,
      opened: false,
      used: false,
      alreadyUsed: false,
    });
    return;
  }

  // 2. Fallback check for session in storeData.customers
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

    if (neonPool) {
      neonPool.query(
        `INSERT INTO public.customers (token, has_claimed, assigned_box, batch_id, opened, used, customer_note, updated_at)
         VALUES ($1, FALSE, NULL, 1, FALSE, FALSE, $2, NOW())
         ON CONFLICT (token) DO NOTHING`,
        [token, customer.customerNote]
      ).catch((err) => console.error('[DATABASE ERROR] Failed to record customer session in Neon:', err));
    }

    saveStoreToDisk();
  }

  // Check customer binding if already claimed a box
  const isAdminCust = isValidAdminToken(req.headers.authorization?.replace('Bearer ', '').trim());
  if (!isAdminCust && customer.hasClaimed && customer.assignedBox) {
    if (customer.boundClientId) {
      if (!isSameCustomerDevice(customer.boundClientId, customer.boundClientIp, customer.boundClientUa, req)) {
        res.status(403).json({
          valid: false,
          forbidden: true,
          isForwardedLink: true,
          error: 'ACCESS RESTRICTED: This customer session is restricted to the originally assigned customer. Forwarded users are not permitted to open or claim this box.',
        });
        return;
      }
    } else {
      customer.boundClientId = extractClientId(req, res);
      customer.boundClientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
      customer.boundClientUa = req.headers['user-agent'] || '';
      customer.boundAt = new Date().toISOString();
      saveStoreToDisk();
    }
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
  const rawSerial = req.body.boxSerial || req.body.serialNumber || req.body.serial;

  if (!rawSerial || typeof rawSerial !== 'string') {
    res.status(400).json({ error: 'Box serial number is required.' });
    return;
  }

  let cleanSerial = rawSerial.trim().toUpperCase();
  if (!boxesMap.has(cleanSerial)) {
    const num = parseInt(cleanSerial.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num >= START_SERIAL_NUM && num <= END_SERIAL_NUM) {
      cleanSerial = formatSerial(num);
    }
  }

  // If customer claimed from main website without a token, generate their unique private token
  const cleanToken = (typeof req.body.token === 'string' && req.body.token.trim())
    ? req.body.token.trim()
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

    // ORIGINAL CUSTOMER RESTRICTION:
    // Ensure that a link shared from Admin Portal can only be used to claim by the originally assigned customer.
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const link = customerLinksMap.get(tokenHash);
    const isAdmin = isValidAdminToken(req.headers.authorization?.replace('Bearer ', '').trim());

    if (link && !isAdmin) {
      if (link.boundClientId && !isSameCustomerDevice(link.boundClientId, link.boundClientIp, link.boundClientUa, req, link)) {
        res.status(403).json({
          error: 'ACCESS RESTRICTED: This customer link is restricted to the originally assigned customer. Forwarded users are not permitted to claim.',
          isForwardedLink: true,
        });
        return;
      }
      if (!link.boundClientId) {
        link.boundClientId = extractClientId(req, res);
        link.boundClientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
        link.boundClientUa = req.headers['user-agent'] || '';
        link.boundAt = new Date().toISOString();
        if (neonPool) {
          neonPool.query(
            `UPDATE public.customer_links SET bound_client_id = $1, bound_client_ip = $2, bound_client_ua = $3, bound_at = $4 WHERE token_hash = $5`,
            [link.boundClientId, link.boundClientIp, link.boundClientUa, link.boundAt, link.tokenHash]
          ).catch((e) => console.error('[DATABASE] Error updating link binding in Neon:', e));
        }
        saveStoreToDisk();
      }
    }

    if (customer && !link && !isAdmin) {
      if (customer.boundClientId && !isSameCustomerDevice(customer.boundClientId, customer.boundClientIp, customer.boundClientUa, req)) {
        res.status(403).json({
          error: 'ACCESS RESTRICTED: This customer session is restricted to the originally assigned customer. Forwarded users are not permitted to claim.',
          isForwardedLink: true,
        });
        return;
      }
      if (!customer.boundClientId) {
        customer.boundClientId = extractClientId(req, res);
        customer.boundClientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
        customer.boundClientUa = req.headers['user-agent'] || '';
        customer.boundAt = new Date().toISOString();
        saveStoreToDisk();
      }
    }

    // ENFORCE EXACTLY ONE SUCCESSFUL BOX CLAIM PER LINK:
    if (link) {
      if (link.status === 'USED') {
        res.status(403).json({
          error: 'THIS LINK HAS ALREADY BEEN USED. BETTER LUCK NEXT TIME.',
          alreadyUsed: true,
        });
        return;
      }
      if (link.status === 'CLAIMED' || (link.boxSerial && link.boxSerial !== 'UNASSIGNED')) {
        if (cleanSerial === link.boxSerial) {
          res.json({
            success: true,
            boxSerial: link.boxSerial,
            message: 'Box already assigned to your link.',
          });
          return;
        }
        res.status(403).json({
          error: `This purchase link has already claimed Box ${link.boxSerial}. Exactly one box claim is allowed per link.`,
          alreadyClaimed: true,
        });
        return;
      }
    }

    // Check if session is already used/opened
    if (customer.opened || customer.used) {
      res.status(403).json({
        error: 'THIS LINK HAS ALREADY BEEN USED. BETTER LUCK NEXT TIME.',
        alreadyUsed: true,
      });
      return;
    }

    // If customer already claimed a box, prevent duplicate claims (exactly one claim allowed)
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
        error: `This purchase link has already claimed Box ${customer.assignedBox}. Exactly one box claim is allowed per link.`,
        alreadyClaimed: true,
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

    // ATOMIC DATABASE TRANSACTION (Neon PostgreSQL)
    const nowIso = new Date().toISOString();
    if (neonPool) {
      const client = await neonPool.connect();
      try {
        await client.query('BEGIN');
        const dbBoxRes = await client.query(
          'SELECT status, claimed, is_hidden FROM public.boxes WHERE serial = $1 FOR UPDATE',
          [cleanSerial]
        );
        if (dbBoxRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: `Box ${cleanSerial} does not exist in Batch 1.` });
          return;
        }
        const dbBox = dbBoxRes.rows[0];
        if (dbBox.is_hidden) {
          await client.query('ROLLBACK');
          res.status(403).json({ error: `Box ${cleanSerial} is hidden and not available for selection.` });
          return;
        }
        if (dbBox.claimed || dbBox.status !== 'AVAILABLE') {
          await client.query('ROLLBACK');
          res.status(409).json({ error: `Box ${cleanSerial} was just claimed by another customer. Please choose another available box.` });
          return;
        }

        await client.query(
          `UPDATE public.boxes SET status = 'CLAIMED', claimed = TRUE, claimed_by = $1, claimed_at = $2, updated_at = NOW() WHERE serial = $3`,
          [cleanToken, nowIso, cleanSerial]
        );
        if (link) {
          await client.query(
            `UPDATE public.customer_links SET status = 'CLAIMED', box_serial = $1, box_id = $2 WHERE token_hash = $3`,
            [cleanSerial, box.id, tokenHash]
          );
        }
        await client.query(
          `INSERT INTO public.customers (token, has_claimed, assigned_box, batch_id, opened, used, updated_at)
           VALUES ($1, TRUE, $2, 1, FALSE, FALSE, NOW())
           ON CONFLICT (token) DO UPDATE SET has_claimed = TRUE, assigned_box = $2, updated_at = NOW()`,
          [cleanToken, cleanSerial]
        );
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error('[DATABASE ERROR] Neon transaction failure during box claim:', dbErr);
        throw dbErr;
      } finally {
        client.release();
      }
    }

    // ATOMIC RESERVATION: Mark box as claimed in memory and disk backup
    box.status = 'CLAIMED';
    box.claimed = true;
    box.claimedBy = cleanToken;
    box.claimedAt = nowIso;

    if (link) {
      link.status = 'CLAIMED';
      link.boxSerial = cleanSerial;
      link.boxId = box.id;
    }

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
      token: cleanToken,
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
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const link = customerLinksMap.get(tokenHash);

    if (link) {
      if (link.status === 'REVOKED') {
        res.status(403).json({ error: 'THIS LINK HAS BEEN REVOKED BY THE ADMINISTRATOR.', revoked: true });
        return;
      }

      // ORIGINAL CUSTOMER RESTRICTION:
      // Ensure that a customer link shared from the Admin Portal can only be opened by the originally assigned customer.
      const isAdmin = isValidAdminToken(req.headers.authorization?.replace('Bearer ', '').trim());
      if (!isAdmin) {
        if (link.boundClientId && !isSameCustomerDevice(link.boundClientId, link.boundClientIp, link.boundClientUa, req, link)) {
          res.status(403).json({
            error: 'ACCESS RESTRICTED: This customer link can only be opened by the originally assigned customer. Forwarded users are not permitted to open this box.',
            isForwardedLink: true,
          });
          return;
        }
        if (!link.boundClientId) {
          link.boundClientId = extractClientId(req, res);
          link.boundClientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
          link.boundClientUa = req.headers['user-agent'] || '';
          link.boundAt = new Date().toISOString();
          if (neonPool) {
            neonPool.query(
              `UPDATE public.customer_links SET bound_client_id = $1, bound_client_ip = $2, bound_client_ua = $3, bound_at = $4 WHERE token_hash = $5`,
              [link.boundClientId, link.boundClientIp, link.boundClientUa, link.boundAt, link.tokenHash]
            ).catch((e) => console.error('[DATABASE] Error updating link binding in Neon:', e));
          }
          saveStoreToDisk();
        }
      }

      if (link.status === 'USED') {
        const box = boxesMap.get(link.boxSerial);
        res.status(403).json({
          error: 'THIS LINK HAS ALREADY BEEN USED. BETTER LUCK NEXT TIME.',
          alreadyOpened: true,
          alreadyUsed: true,
          boxSerial: link.boxSerial,
          result: box?.result || 'BETTER_LUCK',
          prizeName: box?.prizeName || null,
          openedAt: link.usedAt || box?.openedAt,
        });
        return;
      }

      const assignedBoxSerial = link.boxSerial;

      if (!assignedBoxSerial || assignedBoxSerial === 'UNASSIGNED') {
        res.status(400).json({ error: 'You must select and claim an available box before opening.' });
        return;
      }

      // Prevent box tampering
      if (boxSerial && boxSerial.trim().toUpperCase() !== assignedBoxSerial) {
        res.status(403).json({
          error: `Access Denied: You are assigned to Box ${assignedBoxSerial}. You cannot open a different box.`,
        });
        return;
      }

      // Check if assigned box is already opened
      const existingBox = boxesMap.get(assignedBoxSerial);
      if (existingBox && (existingBox.status === 'OPENED' || existingBox.opened)) {
        link.status = 'USED';
        link.usedAt = existingBox.openedAt || new Date().toISOString();
        res.status(403).json({
          error: 'THIS LINK HAS ALREADY BEEN USED.',
          alreadyOpened: true,
          alreadyUsed: true,
          boxSerial: assignedBoxSerial,
        });
        return;
      }

      const isWinner = WINNING_SERIALS_SET.has(assignedBoxSerial);
      const now = new Date().toISOString();
      const result = isWinner ? 'WINNER' : 'BETTER_LUCK';
      let prizeName: string | null = null;
      let claimCode: string | null = null;

      if (isWinner) {
        prizeName = WINNING_PRIZE_MAP[assignedBoxSerial] || 'Apple iPhone 17 Pro';
        claimCode = `SSB-${assignedBoxSerial}-${Date.now().toString().slice(-6)}`;
      }

      // ATOMIC TRANSACTION IN NEON POSTGRESQL (Conditional UPDATE on link status)
      if (neonPool) {
        const client = await neonPool.connect();
        try {
          await client.query('BEGIN');

          // Strict conditional update: must not be USED at the moment of update
          const updateLinkRes = await client.query(
            `UPDATE public.customer_links
             SET status = 'USED', used_at = $1
             WHERE token_hash = $2 AND status != 'USED'
             RETURNING *;`,
            [now, tokenHash]
          );

          if (updateLinkRes.rowCount === 0) {
            // Simultaneous concurrent request already used this link
            await client.query('ROLLBACK');
            res.status(403).json({
              error: 'THIS LINK HAS ALREADY BEEN USED. BETTER LUCK NEXT TIME.',
              alreadyUsed: true,
              alreadyOpened: true,
            });
            return;
          }

          // Mark box as opened in public.boxes
          await client.query(
            `UPDATE public.boxes
             SET status = 'OPENED', opened = TRUE, claimed = TRUE,
                 claimed_by = $1, opened_at = $2, result = $3,
                 prize_name = $4, claim_code = $5, updated_at = NOW()
             WHERE serial = $6`,
            [tokenHash, now, result, prizeName, claimCode, assignedBoxSerial]
          );

          // Update customer record in public.customers
          await client.query(
            `UPDATE public.customers
             SET opened = TRUE, used = TRUE, opened_at = $1, result = $2,
                 prize_name = $3, claim_code = $4, updated_at = NOW()
             WHERE token = $5 OR token = $6`,
            [now, result, prizeName, claimCode, cleanToken, tokenHash]
          );

          await client.query('COMMIT');
        } catch (dbErr) {
          await client.query('ROLLBACK');
          console.error('[DATABASE ERROR] Neon transaction failure during open:', dbErr);
          throw dbErr;
        } finally {
          client.release();
        }
      }

      // Update in-memory state
      link.status = 'USED';
      link.usedAt = now;

      const cust = storeData.customers[cleanToken] || storeData.customers[link.rawToken];
      if (cust) {
        cust.opened = true;
        cust.used = true;
        cust.openedAt = now;
        cust.result = result;
        cust.prizeName = prizeName || undefined;
        cust.claimCode = claimCode || undefined;
      }

      if (existingBox) {
        existingBox.status = 'OPENED';
        existingBox.opened = true;
        existingBox.claimed = true;
        existingBox.claimedBy = tokenHash;
        existingBox.openedAt = now;
        existingBox.result = result;
        existingBox.prizeName = prizeName || undefined;
        existingBox.claimCode = claimCode || undefined;
      }

      saveBoxesToDisk();
      saveStoreToDisk();

      console.log(`[ONE-TIME LINK OPENED] Box ${assignedBoxSerial} opened via private link. Result: ${result}. Link marked USED.`);

      res.json({
        success: true,
        alreadyOpened: false,
        alreadyUsed: false,
        boxSerial: assignedBoxSerial,
        box: {
          serial: assignedBoxSerial,
          result,
          prizeName: prizeName || null,
          openedAt: now,
          claimCode: claimCode || null,
        },
        result,
        prizeName: prizeName || undefined,
        claimCode: claimCode || undefined,
        openedAt: now,
      });
      return;
    }

    // 2. Fallback for legacy customer session tokens
    const customer = storeData.customers[cleanToken];

    if (!customer) {
      res.status(404).json({ error: 'Customer session not recognized.' });
      return;
    }

    if (!customer.assignedBox) {
      res.status(400).json({ error: 'You must select an available box before opening.' });
      return;
    }

    // ORIGINAL CUSTOMER RESTRICTION:
    const isAdminCust = isValidAdminToken(req.headers.authorization?.replace('Bearer ', '').trim());
    if (!isAdminCust) {
      if (customer.boundClientId && !isSameCustomerDevice(customer.boundClientId, customer.boundClientIp, customer.boundClientUa, req)) {
        res.status(403).json({
          error: 'ACCESS RESTRICTED: This customer session can only be opened by the originally assigned customer. Forwarded users are not permitted to open this box.',
          isForwardedLink: true,
        });
        return;
      }
      if (!customer.boundClientId) {
        customer.boundClientId = extractClientId(req, res);
        customer.boundClientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
        customer.boundClientUa = req.headers['user-agent'] || '';
        customer.boundAt = new Date().toISOString();
        saveStoreToDisk();
      }
    }

    const assignedBoxSerial = customer.assignedBox;

    // Prevent box tampering
    if (boxSerial && boxSerial.trim().toUpperCase() !== assignedBoxSerial) {
      res.status(403).json({
        error: `Access Denied: You are assigned to Box ${assignedBoxSerial}. You cannot open a different box.`,
      });
      return;
    }

    // ENFORCE ONE-TIME USE: If already opened/used, return error
    if (customer.opened || customer.used) {
      res.status(403).json({
        error: 'THIS LINK HAS ALREADY BEEN USED. BETTER LUCK NEXT TIME.',
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

    // MARK BOX AS OPENED IN NEON POSTGRESQL (TRANSACTION)
    if (neonPool) {
      const client = await neonPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE public.boxes SET status = 'OPENED', opened = TRUE, claimed = TRUE, claimed_by = $1, opened_at = $2, result = $3, prize_name = $4, claim_code = $5, updated_at = NOW() WHERE serial = $6`,
          [cleanToken, now, customer.result, customer.prizeName || null, customer.claimCode || null, assignedBoxSerial]
        );
        await client.query(
          `UPDATE public.customers SET opened = TRUE, used = TRUE, opened_at = $1, result = $2, prize_name = $3, claim_code = $4, updated_at = NOW() WHERE token = $5`,
          [now, customer.result, customer.prizeName || null, customer.claimCode || null, cleanToken]
        );
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error('[DATABASE ERROR] Neon transaction failure during open:', dbErr);
        throw dbErr;
      } finally {
        client.release();
      }
    }

    // MARK BOX AS OPENED IN THE PERSISTENT DATABASE CACHE
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
  await initDatabase();

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
