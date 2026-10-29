import { CustomerSession, OpenResult } from '../types/box';

const STORAGE_PREFIX = 'ssb_cust_result_';
const CLAIM_PREFIX = 'ssb_cust_claim_';
const CLIENT_ID_KEY = 'ssb_cust_device_id';
const SESSION_TOKEN_KEY = 'ssb_customer_token';

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

export function getOrCreateCustomerClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = 'dev_c_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev_c_default';
  }
}

/**
 * Fetch customer session with authoritative server enforcement
 */
export async function fetchCustomerSession(token?: string | null): Promise<CustomerSession> {
  const explicitToken = token && token.trim() ? token.trim() : null;
  const savedToken = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY)?.trim() : null;
  const cleanToken = explicitToken || savedToken || '';

  // If no customer token is provided or stored, return standard public view
  if (!cleanToken) {
    return {
      valid: true,
      token: '',
      isMainPage: true,
      hasClaimed: false,
      assignedBox: null,
      batchId: 1,
      opened: false,
      used: false,
      alreadyUsed: false,
    };
  }

  const clientId = getOrCreateCustomerClientId();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const headers: Record<string, string> = {
      'x-customer-client-id': clientId,
      'x-customer-token': cleanToken,
    };
    if (savedToken && savedToken !== cleanToken) {
      headers['x-customer-previous-token'] = savedToken;
    }

    const res = await fetch(`/api/customer/session?token=${encodeURIComponent(cleanToken)}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: CustomerSession = await res.json();
      if (data.token) {
        localStorage.setItem(SESSION_TOKEN_KEY, data.token);
      }
      if (data.assignedBox) {
        saveLocalClaimedBox(data.token || cleanToken, data.assignedBox);
      }
      if (data.opened && data.result) {
        saveLocalCustomerResult(data.token || cleanToken, {
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
      // If was just a stale background session on main page, clear and fallback cleanly
      if (!explicitToken && (res.status === 403 || res.status === 404)) {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        return {
          valid: true,
          token: '',
          isMainPage: true,
          hasClaimed: false,
          assignedBox: null,
          batchId: 1,
          opened: false,
          used: false,
          alreadyUsed: false,
        };
      }
      throw new Error(errData.error || 'Invalid or unregistered private link.');
    }
  } catch (err: unknown) {
    const errMsg = (err as Error)?.message || '';
    if (errMsg.includes('RESTRICTED') || errMsg.includes('assigned customer') || errMsg.includes('forwarded')) {
      throw err;
    }

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
  const clientId = getOrCreateCustomerClientId();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  const res = await fetch('/api/customer/open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-client-id': clientId,
    },
    body: JSON.stringify({ token: cleanToken, boxSerial, clientId }),
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
