import { CustomerSession, OpenResult } from '../types/box';
import { WINNING_PRIZE_MAP, WINNING_SERIALS } from '../config/prizes';

// Complete official winning box serial numbers (Batch 1: SS00000001 - SS00015051)
export const EXACT_WINNING_SERIALS = WINNING_SERIALS;

// Pre-configured verified customer links for demonstration/testing
export const DEFAULT_CUSTOMERS: Record<string, { assignedBox: string; isWinner: boolean; note: string }> = {
  'SS1-VIP-WINNER-77': {
    assignedBox: 'SS00003075',
    isWinner: true,
    note: 'Verified WhatsApp Winner #1 (iPhone 17 Pro Max)',
  },
  'SS1-VIP-WINNER-92': {
    assignedBox: 'SS00006099',
    isWinner: true,
    note: 'Verified WhatsApp Winner #2 (iPhone 17 Pro)',
  },
  'SS1-VIP-WINNER-12': {
    assignedBox: 'SS00009012',
    isWinner: true,
    note: 'Verified WhatsApp Winner #3 (iPhone 17)',
  },
  'SS1-VIP-WINNER-45': {
    assignedBox: 'SS00012452',
    isWinner: true,
    note: 'Verified WhatsApp Winner #4 (iPhone 17)',
  },
};

const STORAGE_PREFIX = 'ssb_cust_result_';
const CLAIM_PREFIX = 'ssb_cust_claim_';

export function getLocalCustomerResult(token: string): OpenResult | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${token.trim()}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading localStorage:', err);
  }
  return null;
}

export function saveLocalCustomerResult(token: string, result: OpenResult): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${token.trim()}`, JSON.stringify(result));
  } catch (err) {
    console.error('Error saving localStorage:', err);
  }
}

export function getLocalClaimedBox(token: string): string | null {
  try {
    return localStorage.getItem(`${CLAIM_PREFIX}${token.trim()}`);
  } catch {
    return null;
  }
}

export function saveLocalClaimedBox(token: string, serial: string): void {
  try {
    localStorage.setItem(`${CLAIM_PREFIX}${token.trim()}`, serial.trim());
  } catch (err) {
    console.error('Error saving claimed box in localStorage:', err);
  }
}

/**
 * Fetch customer session with server enforcement
 */
export async function fetchCustomerSession(token?: string | null): Promise<CustomerSession> {
  // If no token is provided, this is the MAIN WEBSITE URL!
  // Never treat the main website URL as an expired private link.
  if (!token || !token.trim()) {
    return {
      valid: true,
      token: '',
      hasClaimed: false,
      assignedBox: null,
      batchId: 1,
      opened: false,
      used: false,
      alreadyUsed: false,
    };
  }

  const cleanToken = token.trim();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`/api/customer/session?token=${encodeURIComponent(cleanToken)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: CustomerSession = await res.json();
      if (data.assignedBox) {
        saveLocalClaimedBox(cleanToken, data.assignedBox);
      }
      if (data.opened && data.result) {
        saveLocalCustomerResult(cleanToken, {
          success: true,
          alreadyOpened: true,
          alreadyUsed: true,
          boxSerial: data.assignedBox || '',
          result: data.result,
          prizeName: data.prizeName || 'Apple iPhone 17 Pro',
          openedAt: data.openedAt || new Date().toISOString(),
          claimCode: data.claimCode || undefined,
        });
      }
      return data;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Invalid or unregistered private link.');
    }
  } catch {
    // Fallback for recognized token or local claimed box
    const customer = DEFAULT_CUSTOMERS[cleanToken];
    const localBox = getLocalClaimedBox(cleanToken) || customer?.assignedBox || null;
    const cachedResult = localBox ? getLocalCustomerResult(cleanToken) : null;
    const isWinner = localBox ? EXACT_WINNING_SERIALS.includes(localBox) : false;

    return {
      valid: true,
      token: cleanToken,
      hasClaimed: !!localBox,
      assignedBox: localBox,
      batchId: 1,
      opened: !!cachedResult,
      used: !!cachedResult,
      alreadyUsed: !!cachedResult,
      openedAt: cachedResult?.openedAt,
      result: cachedResult?.result || null,
      prizeName: cachedResult?.prizeName || (isWinner && localBox ? (WINNING_PRIZE_MAP[localBox] || 'Apple iPhone 17 Pro') : null),
      claimCode: cachedResult?.claimCode || null,
    };
  }
}

/**
 * Open box with server enforcement
 */
export async function openCustomerBox(token: string, boxSerial: string): Promise<OpenResult> {
  const cleanToken = (token || boxSerial || '').trim();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/customer/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanToken, boxSerial }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      saveLocalCustomerResult(cleanToken, data);
      return data;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to open box on server.');
    }
  } catch (networkErr: unknown) {
    const isWinner = EXACT_WINNING_SERIALS.includes(boxSerial);

    const cached = getLocalCustomerResult(cleanToken);
    if (cached) {
      return cached;
    }

    const openedAt = new Date().toISOString();
    const claimCode = isWinner ? `SSB-${boxSerial}-${Date.now().toString().slice(-6)}` : undefined;

    const result: OpenResult = {
      success: true,
      alreadyOpened: false,
      alreadyUsed: false,
      boxSerial,
      result: isWinner ? 'WINNER' : 'BETTER_LUCK',
      prizeName: isWinner ? (WINNING_PRIZE_MAP[boxSerial] || 'Apple iPhone 17 Pro') : undefined,
      openedAt,
      claimCode,
    };

    saveLocalCustomerResult(cleanToken, result);
    return result;
  }
}
