import { CustomerSession, OpenResult } from '../types/box';

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
 * Fetch customer session with authoritative server enforcement
 */
export async function fetchCustomerSession(token?: string | null): Promise<CustomerSession> {
  // If no token is provided, this is the main website public view
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
    // Graceful fallback from local storage cache if offline
    const localBox = getLocalClaimedBox(cleanToken);
    const cachedResult = localBox ? getLocalCustomerResult(cleanToken) : null;

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
      prizeName: cachedResult?.prizeName || null,
      claimCode: cachedResult?.claimCode || null,
    };
  }
}

/**
 * Open box with authoritative server action
 */
export async function openCustomerBox(token: string, boxSerial: string): Promise<OpenResult> {
  const cleanToken = (token || boxSerial || '').trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

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
    throw new Error(errData.error || 'Failed to open box on server. Please try again.');
  }
}
