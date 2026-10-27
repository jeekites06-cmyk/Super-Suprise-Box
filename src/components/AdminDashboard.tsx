import React, { useState, useEffect, useCallback, useTransition } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Gift,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Edit2,
  Save,
  X,
  Smartphone,
  Banknote,
  SlidersHorizontal,
  Link as LinkIcon,
  Copy,
  MessageCircle,
  Check,
  Globe,
  AlertTriangle,
  CheckCheck,
  Users,
  User,
  Plus,
} from 'lucide-react';
import { AdminBoxRecord, AdminStats, AdminPrizeRecord, AdminCustomerLink, CustomerGroupSummary } from '../types/box';

interface AdminDashboardProps {
  onBackToCustomerView: () => void;
}

const ADMIN_TOKEN_KEY = 'ssb_admin_session_token';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToCustomerView }) => {
  // Auth state
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY)
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [pinInput, setPinInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Dashboard tab state: 'boxes' | 'prizes' | 'links'
  const [activeTab, setActiveTab] = useState<'boxes' | 'prizes' | 'links'>('prizes');

  // Customer Links state
  const [customerLinks, setCustomerLinks] = useState<AdminCustomerLink[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroupSummary[]>([]);
  const [customerLinksLoading, setCustomerLinksLoading] = useState<boolean>(false);
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [customerNoteInput, setCustomerNoteInput] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [linkViewMode, setLinkViewMode] = useState<'grouped' | 'all'>('grouped');
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [generatingCustomerLink, setGeneratingCustomerLink] = useState<boolean>(false);
  const [latestCustomerLink, setLatestCustomerLink] = useState<AdminCustomerLink | null>(null);

  // Common Customer Link state
  const [copiedCommonLink, setCopiedCommonLink] = useState<boolean>(false);
  const [customerUrlConfig, setCustomerUrlConfig] = useState<{
    publicCustomerUrl: string;
    isConfigured: boolean;
    isDevOrigin: boolean;
    currentOrigin: string;
    suggestedSharedUrl: string;
  } | null>(null);
  const [urlInputValue, setUrlInputValue] = useState<string>('');
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(false);
  const [isSavingUrl, setIsSavingUrl] = useState<boolean>(false);
  const [isTestingUrl, setIsTestingUrl] = useState<boolean>(false);
  const [urlTestFeedback, setUrlTestFeedback] = useState<{
    success: boolean;
    message: string;
    statusCode?: number;
    isPubliclyAccessible?: boolean;
  } | null>(null);

  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Boxes table state
  const [boxes, setBoxes] = useState<AdminBoxRecord[]>([]);
  const [boxesTotal, setBoxesTotal] = useState<number>(15051);
  const [boxesPage, setBoxesPage] = useState<number>(1);
  const [boxesTotalPages, setBoxesTotalPages] = useState<number>(151);
  const [boxesLimit, setBoxesLimit] = useState<number>(100);
  const [boxesSearch, setBoxesSearch] = useState<string>('');
  const [boxesFilter, setBoxesFilter] = useState<string>('all');
  const [boxesLoading, setBoxesLoading] = useState<boolean>(false);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  // Prizes table state
  const [prizes, setPrizes] = useState<AdminPrizeRecord[]>([]);
  const [prizesSearch, setPrizesSearch] = useState<string>('');
  const [prizesLoading, setPrizesLoading] = useState<boolean>(false);
  const [isShowcaseHidden, setIsShowcaseHidden] = useState<boolean>(false);
  const [togglingShowcase, setTogglingShowcase] = useState<boolean>(false);

  // Action status / Notifications
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [togglingSerial, setTogglingSerial] = useState<string | null>(null);

  // Bulk selection state for boxes
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [bulkConfirmModal, setBulkConfirmModal] = useState<{
    isOpen: boolean;
    action: 'hide' | 'unhide';
    count: number;
  } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState<boolean>(false);

  // Edit prize display modal state
  const [editingPrize, setEditingPrize] = useState<AdminPrizeRecord | null>(null);
  const [editNoteInput, setEditNoteInput] = useState<string>('');
  const [editSaving, setEditSaving] = useState<boolean>(false);

  const [, startTransition] = useTransition();

  const showNotification = (type: 'success' | 'error', message: string) => {
    setActionNotice({ type, message });
    setTimeout(() => {
      setActionNotice((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // 1. Verify existing session token on mount
  useEffect(() => {
    let isMounted = true;
    const verifyToken = async () => {
      const stored = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!stored) {
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthChecking(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/admin/verify', {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (isMounted) {
          if (res.ok) {
            sessionStorage.setItem(ADMIN_TOKEN_KEY, stored);
            localStorage.setItem(ADMIN_TOKEN_KEY, stored);
            setToken(stored);
            setIsAuthenticated(true);
          } else {
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
            localStorage.removeItem(ADMIN_TOKEN_KEY);
            setToken(null);
            setIsAuthenticated(false);
          }
        }
      } catch {
        if (isMounted) {
          // Keep token if network error occurs
          setToken(stored);
          setIsAuthenticated(true);
        }
      } finally {
        if (isMounted) {
          setAuthChecking(false);
        }
      }
    };

    verifyToken();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Stats
  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: AdminStats = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
    }
  }, [token]);

  // 3. Fetch Boxes Grid
  const fetchBoxes = useCallback(
    async (page = 1, limit = 100, search = '', filter = 'all') => {
      if (!token) return;
      setBoxesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('limit', limit.toString());
        params.set('filter', filter);
        if (search.trim()) params.set('search', search.trim());

        const res = await fetch(`/api/admin/boxes?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBoxes(data.boxes);
          setBoxesTotal(data.total);
          setBoxesTotalPages(data.totalPages);
          setBoxesPage(data.page);
        }
      } catch (err) {
        console.error('Failed to fetch admin boxes:', err);
        showNotification('error', 'Network error fetching boxes.');
      } finally {
        setBoxesLoading(false);
      }
    },
    [token]
  );

  // 4. Fetch Prizes
  const fetchPrizes = useCallback(async () => {
    if (!token) return;
    setPrizesLoading(true);
    try {
      const res = await fetch('/api/admin/prizes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPrizes(data.prizes);
        setIsShowcaseHidden(!!data.isShowcaseHidden);
      }
    } catch (err) {
      console.error('Failed to fetch admin prizes:', err);
      showNotification('error', 'Network error fetching winning prize records.');
    } finally {
      setPrizesLoading(false);
    }
  }, [token]);

  // 5. Fetch Customer URL Configuration
  const fetchCustomerUrl = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/admin/customer-url', { headers });
      if (res.ok) {
        const data = await res.json();
        setCustomerUrlConfig(data);
        if (data.publicCustomerUrl) {
          setUrlInputValue(data.publicCustomerUrl);
        } else if (data.suggestedSharedUrl && !data.suggestedSharedUrl.includes('ais-dev-')) {
          setUrlInputValue(data.suggestedSharedUrl);
        }
      }
    } catch (err) {
      console.error('Failed to fetch customer URL config:', err);
    }
  }, [token]);

  const getCommonCustomerUrl = (): string => {
    // 1. Authoritative configured public customer URL
    if (customerUrlConfig?.publicCustomerUrl && customerUrlConfig.publicCustomerUrl.trim()) {
      return customerUrlConfig.publicCustomerUrl.trim();
    }
    // 2. Suggested public shared preview URL (e.g. ais-pre-...)
    if (customerUrlConfig?.suggestedSharedUrl && customerUrlConfig.suggestedSharedUrl.trim()) {
      return customerUrlConfig.suggestedSharedUrl.trim();
    }
    // 3. If window origin is available
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('ais-dev-')) {
        return origin.replace('ais-dev-', 'ais-pre-');
      }
      return origin;
    }
    return '';
  };

  const fetchCustomerLinks = useCallback(async () => {
    if (!token) return;
    setCustomerLinksLoading(true);
    try {
      const res = await fetch('/api/admin/links?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerLinks(data.links || []);
        if (data.customers) {
          setCustomerGroups(data.customers);
        }
        if (data.links && data.links.length > 0 && !latestCustomerLink) {
          setLatestCustomerLink(data.links[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch customer links:', err);
    } finally {
      setCustomerLinksLoading(false);
    }
  }, [token, latestCustomerLink]);

  const handleGenerateCustomerLink = async (
    autoCopy = false,
    overrideCustomerName?: string,
    overrideCustomerId?: string
  ) => {
    if (!token) return null;
    setGeneratingCustomerLink(true);
    try {
      const chosenCustomer = overrideCustomerName
        ? overrideCustomerName.trim()
        : customerNameInput.trim() || (selectedCustomerId ? customerGroups.find((g) => g.customerId === selectedCustomerId)?.customerName || '' : '') || 'Customer 1';

      const chosenCustomerId = overrideCustomerId
        ? overrideCustomerId
        : selectedCustomerId || undefined;

      const res = await fetch('/api/admin/links/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerName: chosenCustomer,
          customerId: chosenCustomerId,
          note: customerNoteInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.link) {
        setLatestCustomerLink(data.link);
        setCustomerNoteInput('');
        fetchCustomerLinks();
        const successMsg = `Generated purchase link #${data.purchaseNumber || 1} for ${data.customerName || chosenCustomer}: ${data.url}`;
        if (autoCopy && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(data.url).then(() => {
            setCopiedCommonLink(true);
            showNotification('success', `Copied link: ${data.url}`);
            setTimeout(() => setCopiedCommonLink(false), 2500);
          }).catch(() => {
            showNotification('success', successMsg);
          });
        } else {
          showNotification('success', successMsg);
        }
        return data.link;
      } else {
        showNotification('error', data.error || 'Failed to generate customer link.');
      }
    } catch (err) {
      console.error('Error generating customer link:', err);
      showNotification('error', 'Network error generating customer link.');
    } finally {
      setGeneratingCustomerLink(false);
    }
    return null;
  };

  const handleCopyCustomerLink = async () => {
    let targetUrl = latestCustomerLink?.url;
    if (!targetUrl) {
      const newLink = await handleGenerateCustomerLink(true);
      if (newLink?.url) targetUrl = newLink.url;
    }

    if (!targetUrl) {
      targetUrl = getCommonCustomerUrl();
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(targetUrl).then(() => {
        setCopiedCommonLink(true);
        showNotification('success', `Copied customer link to clipboard: ${targetUrl}`);
        setTimeout(() => setCopiedCommonLink(false), 2500);
      }).catch(() => {
        showNotification('success', `Customer link: ${targetUrl}`);
      });
    } else {
      showNotification('success', `Customer link: ${targetUrl}`);
    }
  };

  const handleShareWhatsAppCommon = async () => {
    let targetUrl = latestCustomerLink?.url;
    if (!targetUrl) {
      const newLink = await handleGenerateCustomerLink(false);
      if (newLink?.url) targetUrl = newLink.url;
    }

    if (!targetUrl) {
      targetUrl = getCommonCustomerUrl();
    }

    const text = `🎉 *SUPER SURPRISE BOX (BATCH 1)*\n\nChoose your surprise box from 15,051 available boxes! 100 winning prizes including 4 Apple iPhones and 96 Cash Rewards.\n\nOpen your private customer link to select and claim your box:\n${targetUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRevokeCustomerLink = async (tokenHash: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/links/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tokenHash }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', 'Customer link has been revoked.');
        fetchCustomerLinks();
      } else {
        showNotification('error', data.error || 'Failed to revoke link.');
      }
    } catch {
      showNotification('error', 'Network error revoking link.');
    }
  };

  const handleSavePublicUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token) return;
    const trimmed = urlInputValue.trim();
    if (!trimmed) {
      showNotification('error', 'Please enter a valid public URL.');
      return;
    }

    if (trimmed.includes('ais-dev-')) {
      showNotification(
        'error',
        'Cannot save internal Google AI Studio dev URL (ais-dev-...). It requires Google login and will fail with 403 on mobile.'
      );
      return;
    }

    setIsSavingUrl(true);
    setUrlTestFeedback(null);
    try {
      const res = await fetch('/api/admin/customer-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publicCustomerUrl: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', 'Public customer website URL saved and verified successfully!');
        setIsEditingUrl(false);
        fetchCustomerUrl();
      } else {
        showNotification('error', data.error || 'Failed to save public customer URL.');
      }
    } catch (err) {
      console.error('Error saving public customer URL:', err);
      showNotification('error', 'Network error saving public customer URL.');
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleTestPublicUrl = async (urlToTest?: string) => {
    const target = urlToTest || urlInputValue || customerUrlConfig?.publicCustomerUrl;
    if (!target) {
      showNotification('error', 'Please enter or save a URL to verify.');
      return;
    }

    setIsTestingUrl(true);
    setUrlTestFeedback(null);
    try {
      const res = await fetch('/api/admin/customer-url/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      setUrlTestFeedback({
        success: !!data.isPubliclyAccessible,
        message: data.message,
        statusCode: data.statusCode,
        isPubliclyAccessible: data.isPubliclyAccessible,
      });
      if (data.isPubliclyAccessible) {
        showNotification('success', 'URL Verified: Accessible to mobile visitors without login!');
      } else {
        showNotification('error', data.message || 'URL verification failed.');
      }
    } catch {
      setUrlTestFeedback({
        success: false,
        message: 'Could not connect to URL verification service.',
      });
    } finally {
      setIsTestingUrl(false);
    }
  };

  // Trigger data fetches on auth
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchCustomerUrl();
      fetchPrizes();
      fetchCustomerLinks();
      if (activeTab === 'boxes') {
        fetchBoxes(boxesPage, boxesLimit, boxesSearch, boxesFilter);
      }
    }
  }, [isAuthenticated, activeTab, fetchStats, fetchBoxes, fetchPrizes, fetchCustomerUrl, fetchCustomerLinks, boxesPage, boxesLimit, boxesSearch, boxesFilter]);

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!pinInput.trim()) {
      setLoginError('Please enter the admin passcode or PIN.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        sessionStorage.removeItem('ssb_preview_customer');
        setToken(data.token);
        setIsAuthenticated(true);
        setPinInput('');
        if (typeof window !== 'undefined' && window.location.pathname !== '/admin') {
          window.history.replaceState({}, '', '/admin');
        }
      } else {
        setLoginError(data.error || 'Authentication failed. Please verify your PIN.');
      }
    } catch {
      setLoginError('Could not connect to backend server. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Continue clearing client token
      }
    }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem('ssb_preview_customer');
    setToken(null);
    setIsAuthenticated(false);
    onBackToCustomerView();
  };

  // Toggle Single Box Visibility
  const handleToggleBoxVisibility = async (box: AdminBoxRecord) => {
    if (!token) return;
    const targetSerial = box.serial;
    const newIsHidden = !box.isHidden;

    setTogglingSerial(targetSerial);

    // Optimistic UI update
    setBoxes((prev) =>
      prev.map((b) => (b.serial === targetSerial ? { ...b, isHidden: newIsHidden } : b))
    );

    try {
      const res = await fetch('/api/admin/boxes/visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ serial: targetSerial, isHidden: newIsHidden }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(
          'success',
          `Box ${targetSerial} is now permanently ${newIsHidden ? 'HIDDEN' : 'VISIBLE'} on the website.`
        );
        // Refresh authoritative stats and boxes from server
        fetchStats();
        fetchBoxes(boxesPage, boxesLimit, boxesSearch, boxesFilter);
      } else {
        // Revert on failure
        setBoxes((prev) =>
          prev.map((b) => (b.serial === targetSerial ? { ...b, isHidden: box.isHidden } : b))
        );
        showNotification('error', data.error || 'Failed to update visibility in database.');
      }
    } catch (err) {
      console.error(err);
      setBoxes((prev) =>
        prev.map((b) => (b.serial === targetSerial ? { ...b, isHidden: box.isHidden } : b))
      );
      showNotification('error', 'Network error. Could not save changes to database.');
    } finally {
      setTogglingSerial(null);
    }
  };

  // Toggle selection for a single box
  const toggleSelectBox = (serial: string) => {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) {
        next.delete(serial);
      } else {
        next.add(serial);
      }
      return next;
    });
  };

  // Toggle selection for all boxes on the current page
  const handleSelectAllOnPage = () => {
    if (boxes.length === 0) return;
    const allSelected = boxes.every((b) => selectedSerials.has(b.serial));
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        boxes.forEach((b) => next.delete(b.serial));
      } else {
        boxes.forEach((b) => next.add(b.serial));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedSerials(new Set());
  };

  // Trigger bulk confirmation modal
  const handleTriggerBulk = (action: 'hide' | 'unhide') => {
    if (selectedSerials.size === 0) return;
    setBulkConfirmModal({
      isOpen: true,
      action,
      count: selectedSerials.size,
    });
  };

  // Execute confirmed bulk action
  const handleConfirmBulkAction = async () => {
    if (!bulkConfirmModal || !token || selectedSerials.size === 0) return;
    const { action, count } = bulkConfirmModal;
    const isHidden = action === 'hide';
    const targets = Array.from(selectedSerials);

    setBulkProcessing(true);
    try {
      const res = await fetch('/api/admin/boxes/visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ serials: targets, isHidden }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(
          'success',
          `Successfully ${isHidden ? 'HIDDEN' : 'UNHIDDEN'} ${data.updatedCount || count} boxes on the website.`
        );
        fetchStats();
        fetchBoxes(boxesPage, boxesLimit, boxesSearch, boxesFilter);
        setSelectedSerials(new Set());
        setBulkConfirmModal(null);
      } else {
        showNotification('error', data.error || 'Bulk visibility update failed.');
      }
    } catch (err) {
      console.error('Error during bulk visibility update:', err);
      showNotification('error', 'Network error. Could not complete bulk visibility update.');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Toggle Prize Card Visibility
  const handleTogglePrizeCardVisibility = async (prize: AdminPrizeRecord) => {
    if (!token || togglingSerial) return;
    const targetSerial = prize.serial;
    const newIsCardHidden = !prize.isCardHidden;

    setTogglingSerial(targetSerial);

    try {
      const res = await fetch('/api/admin/prizes/visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ serial: targetSerial, isHidden: newIsCardHidden }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Backend confirmed success: update state so button flips to Unhide and badge shows CARD HIDDEN
        setPrizes((prev) =>
          prev.map((p) => (p.serial === targetSerial ? { ...p, isCardHidden: newIsCardHidden } : p))
        );
        showNotification(
          'success',
          `Prize card for ${targetSerial} (${prize.prizeName}) is now ${newIsCardHidden ? 'HIDDEN' : 'VISIBLE'}.`
        );
        fetchStats();
      } else {
        showNotification('error', data.error || 'Failed to update prize card visibility in database.');
      }
    } catch {
      showNotification('error', 'Network error updating prize visibility.');
    } finally {
      setTogglingSerial(null);
    }
  };

  // Master Toggle: Public Winning Prizes Showcase Visibility
  const handleToggleShowcaseVisibility = async () => {
    if (!token || togglingShowcase) return;
    const newIsHidden = !isShowcaseHidden;
    setTogglingShowcase(true);

    try {
      const res = await fetch('/api/admin/prizes/showcase-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isHidden: newIsHidden }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsShowcaseHidden(newIsHidden);
        showNotification(
          'success',
          `Public Winning Prizes Showcase is now ${
            newIsHidden ? 'COMPLETELY HIDDEN from public website' : 'VISIBLE on public website'
          }.`
        );
      } else {
        showNotification('error', data.error || 'Failed to update showcase visibility.');
      }
    } catch {
      showNotification('error', 'Network error updating showcase visibility.');
    } finally {
      setTogglingShowcase(false);
    }
  };

  // Save Prize Display Note
  const handleSavePrizeNote = async () => {
    if (!token || !editingPrize) return;
    setEditSaving(true);

    try {
      const res = await fetch('/api/admin/prizes/update-display', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serial: editingPrize.serial,
          customNote: editNoteInput,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPrizes((prev) =>
          prev.map((p) => (p.serial === editingPrize.serial ? { ...p, customNote: editNoteInput } : p))
        );
        showNotification('success', `Display note for ${editingPrize.serial} updated successfully.`);
        setEditingPrize(null);
      } else {
        showNotification('error', data.error || 'Failed to update prize display note.');
      }
    } catch {
      showNotification('error', 'Network error updating prize display.');
    } finally {
      setEditSaving(false);
    }
  };

  // Jump to page form
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= boxesTotalPages) {
      setBoxesPage(p);
      setJumpPageInput('');
    }
  };

  // =========================================================================
  // VIEW A: AUTHENTICATION CHECKING SPINNER
  // =========================================================================
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#07070a] text-neutral-200 flex flex-col items-center justify-center p-4">
        <div className="w-9 h-9 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs uppercase tracking-widest text-neutral-400 font-cinzel">
          Verifying Admin Authorization...
        </span>
      </div>
    );
  }

  // =========================================================================
  // VIEW B: SECURE ADMIN LOGIN SCREEN
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#060609] text-neutral-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-[#0c0c12] border border-amber-400/40 rounded-3xl p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.95)] relative overflow-hidden text-center animate-fade-in">
          {/* Ambient Amber Flare */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-20 bg-amber-500/15 blur-3xl pointer-events-none" />

          {/* Secure Lock Badge */}
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-300/10 border border-amber-400/40 flex items-center justify-center shadow-lg">
            <Lock className="w-6 h-6 text-amber-400" />
          </div>

          <span className="text-[10px] uppercase font-cinzel tracking-widest text-amber-300 font-bold block mb-1">
            CONTROL CENTER AUTHENTICATION
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white uppercase font-cinzel mb-2">
            SUPER SURPRISE BOX ADMIN
          </h1>
          <p className="text-xs text-neutral-400 mb-6">
            Enter the authorized admin master password or PIN to access persistent inventory & prize visibility controls.
          </p>

          {/* Login Error Notification */}
          {loginError && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="relative text-left">
              <label className="text-[11px] uppercase font-cinzel font-semibold text-neutral-300 block mb-1">
                Password / PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  placeholder="Enter Password or PIN..."
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  disabled={loginLoading}
                  className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none transition-colors pr-11 font-mono-numbers"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-black font-cinzel font-bold text-xs uppercase tracking-wider hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-black" />
                  <span>Admin Login</span>
                </>
              )}
            </button>
          </form>

          {/* Back to Customer website */}
          <div className="mt-6 pt-5 border-t border-neutral-800/80 flex items-center justify-between text-xs">
            <button
              onClick={onBackToCustomerView}
              className="text-neutral-400 hover:text-amber-300 transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Return to Customer Website</span>
            </button>
            <span className="text-[10px] text-neutral-500 font-mono-numbers">Batch 1 · 15,051 Boxes</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW C: FULL ADMIN DASHBOARD VIEW
  // =========================================================================
  const filteredPrizes = prizes.filter((p) => {
    if (!prizesSearch.trim()) return true;
    const q = prizesSearch.toUpperCase();
    return p.serial.includes(q) || p.prizeName.toUpperCase().includes(q) || (p.customNote && p.customNote.toUpperCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-[#07070a] text-neutral-100 flex flex-col font-sans selection:bg-amber-400/30 selection:text-amber-200">
      {/* Top Admin Navigation Header */}
      <header className="bg-[#0b0b10] border-b border-neutral-800 px-4 sm:px-8 py-3.5 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-[1520px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-400 to-yellow-300 flex items-center justify-center shadow-md">
              <ShieldCheck className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold font-cinzel text-white uppercase tracking-wider">
                  SUPER SURPRISE BOX
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[10px] text-amber-300 font-bold uppercase font-cinzel">
                  Admin Control Center
                </span>
              </div>
              <span className="text-[10px] text-neutral-400">
                Persistent Database: <strong className="text-emerald-400">Connected (/data/boxes.json)</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={onBackToCustomerView}
              className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Customer Website View</span>
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 hover:text-white hover:bg-red-900/60 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1520px] w-full mx-auto p-3 sm:p-6 space-y-5">
        {/* Toast / Notification Banner */}
        {actionNotice && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 shadow-lg transition-all animate-fade-in ${
              actionNotice.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
                : 'bg-red-950/90 border-red-500/60 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {actionNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{actionNotice.message}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-neutral-400 hover:text-white font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Live Stats Cards Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3 text-xs">
            <div className="bg-[#0e0e14] border border-neutral-800 p-3 rounded-xl">
              <span className="text-neutral-500 block text-[10px] uppercase font-cinzel">Total Inventory</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-white">
                {stats.totalBoxes.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">SS00000001 - SS00015051</span>
            </div>
            <div className="bg-[#0e0e14] border border-emerald-500/30 p-3 rounded-xl">
              <span className="text-emerald-400 block text-[10px] uppercase font-cinzel">Available</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-emerald-300">
                {stats.availableBoxes.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">Visible & Unclaimed</span>
            </div>
            <div className="bg-[#0e0e14] border border-cyan-500/30 p-3 rounded-xl">
              <span className="text-cyan-400 block text-[10px] uppercase font-cinzel">Reserved</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-cyan-300">
                {(stats.reservedBoxes ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">Pre-launch / Held</span>
            </div>
            <div className="bg-[#0e0e14] border border-purple-500/30 p-3 rounded-xl">
              <span className="text-purple-400 block text-[10px] uppercase font-cinzel">Opened</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-purple-300">
                {stats.openedBoxes.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">One-time links used</span>
            </div>
            <div className="bg-[#0e0e14] border border-blue-500/30 p-3 rounded-xl">
              <span className="text-blue-400 block text-[10px] uppercase font-cinzel">Claimed</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-blue-300">
                {stats.claimedBoxes.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">Assigned to customer</span>
            </div>
            <div className="bg-[#0e0e14] border border-amber-500/30 p-3 rounded-xl">
              <span className="text-amber-400 block text-[10px] uppercase font-cinzel">Hidden Boxes</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-amber-300">
                {stats.hiddenBoxes.toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">Excluded from public</span>
            </div>
            <div className="bg-[#0e0e14] border border-yellow-500/40 p-3 rounded-xl">
              <span className="text-amber-300 block text-[10px] uppercase font-cinzel">Winning Prizes</span>
              <span className="text-lg sm:text-xl font-bold font-mono-numbers text-gold-bright">
                {stats.winningBoxes}
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">4 iPhones + 96 Cash</span>
            </div>
          </div>
        )}

        {/* 2. Common Customer Link Quick Management Bar */}
        <div className="bg-[#0e0e14] border border-amber-500/30 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold font-cinzel text-white uppercase tracking-wider">
                  Permanent Public Customer URL
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold uppercase">
                  Reusable by All Customers
                </span>
              </div>
              <p className="text-xs text-amber-300 font-mono font-medium truncate mt-0.5 select-all">
                {getCommonCustomerUrl() || 'https://super-surprise-box.ai.studio'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={handleCopyCustomerLink}
              className="flex-1 md:flex-initial py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-black font-cinzel font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap"
            >
              {copiedCommonLink ? (
                <>
                  <Check className="w-4 h-4 text-black stroke-[3]" />
                  <span>COPIED!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-black stroke-[2.5]" />
                  <span>COPY CUSTOMER LINK</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleShareWhatsAppCommon}
              className="flex-1 md:flex-initial py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-cinzel font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4 text-white stroke-[2.5]" />
              <span>WHATSAPP SHARE</span>
            </button>
          </div>
        </div>

        {/* 3. Main Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
          <button
            onClick={() => setActiveTab('boxes')}
            className={`px-4 py-2 rounded-xl text-xs font-cinzel font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'boxes'
                ? 'bg-amber-400 text-black shadow-md'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>Box Inventory (15,051 Boxes)</span>
          </button>
          <button
            onClick={() => setActiveTab('prizes')}
            className={`px-4 py-2 rounded-xl text-xs font-cinzel font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'prizes'
                ? 'bg-amber-400 text-black shadow-md'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Winning Prizes (100 Prizes)</span>
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`px-4 py-2 rounded-xl text-xs font-cinzel font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'links'
                ? 'bg-amber-400 text-black shadow-md'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>COMMON CUSTOMER LINK</span>
          </button>
        </div>

        {/* =====================================================================
            TAB 1: COMPLETE BOX INVENTORY (15,051 BOXES)
           ===================================================================== */}
        {activeTab === 'boxes' && (
          <div className="space-y-3">
            {/* Toolbar: Search, Filters, Limit, Refresh */}
            <div className="bg-[#0c0c12] border border-neutral-800 p-3 rounded-2xl flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
              {/* Search input */}
              <div className="relative w-full lg:w-80">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search Serial, ID, Prize, Token..."
                  value={boxesSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    startTransition(() => {
                      setBoxesSearch(val);
                      setBoxesPage(1);
                    });
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono-numbers"
                />
                {boxesSearch && (
                  <button
                    onClick={() => {
                      setBoxesSearch('');
                      setBoxesPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto py-1">
                {[
                  { label: 'All (15,051)', value: 'all' },
                  { label: 'Available', value: 'available' },
                  { label: 'Hidden Only', value: 'hidden' },
                  { label: 'Winning (100)', value: 'winner' },
                  { label: 'Claimed', value: 'claimed' },
                  { label: 'Opened', value: 'opened' },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => {
                      setBoxesFilter(f.value);
                      setBoxesPage(1);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                      boxesFilter === f.value
                        ? 'bg-amber-400 text-black font-bold shadow-sm'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Per Page Limit & Refresh */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-neutral-500 text-[11px]">Show:</span>
                <select
                  value={boxesLimit}
                  onChange={(e) => {
                    setBoxesLimit(Number(e.target.value));
                    setBoxesPage(1);
                  }}
                  className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-amber-400"
                >
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={300}>300 / page</option>
                </select>

                <button
                  onClick={() => {
                    fetchStats();
                    fetchBoxes(boxesPage, boxesLimit, boxesSearch, boxesFilter);
                  }}
                  title="Reload from database"
                  className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-amber-300 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${boxesLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Pagination Controls Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-[#0a0a0e] border border-neutral-800/80 px-3.5 py-2 rounded-xl text-xs">
              <span className="text-neutral-400">
                Showing{' '}
                <strong className="text-amber-300 font-mono-numbers">
                  {Math.min(boxesTotal, (boxesPage - 1) * boxesLimit + 1)} -{' '}
                  {Math.min(boxesTotal, boxesPage * boxesLimit)}
                </strong>{' '}
                of <strong className="text-white font-mono-numbers">{boxesTotal.toLocaleString()}</strong> boxes
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={boxesPage <= 1 || boxesLoading}
                  onClick={() => setBoxesPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <span className="px-2 py-1 rounded bg-black/60 font-mono-numbers text-neutral-300 border border-neutral-800">
                  Page {boxesPage} of {boxesTotalPages}
                </span>

                <button
                  disabled={boxesPage >= boxesTotalPages || boxesLoading}
                  onClick={() => setBoxesPage((p) => Math.min(boxesTotalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <form onSubmit={handleJumpSubmit} className="hidden sm:flex items-center gap-1 ml-1.5">
                  <input
                    type="text"
                    placeholder="Page #"
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value.replace(/\D/g, ''))}
                    className="w-14 px-1.5 py-1 bg-neutral-900 border border-neutral-700 rounded-md text-xs text-white placeholder-neutral-600 font-mono-numbers text-center focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-md"
                  >
                    Go
                  </button>
                </form>
              </div>
            </div>

            {/* Bulk Action Controls Bar (visible when 1+ boxes selected) */}
            {selectedSerials.size > 0 && (
              <div className="bg-amber-950/40 border border-amber-500/60 p-2.5 px-4 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs animate-in fade-in duration-200 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                  <span className="font-bold text-amber-200 font-cinzel tracking-wider">
                    {selectedSerials.size} {selectedSerials.size === 1 ? 'box' : 'boxes'} selected on this page
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTriggerBulk('hide')}
                    className="px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-amber-500/60 hover:border-amber-400 text-amber-300 hover:text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs uppercase font-cinzel tracking-wider"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                    <span>BULK HIDE ({selectedSerials.size})</span>
                  </button>

                  <button
                    onClick={() => handleTriggerBulk('unhide')}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-900/70 hover:bg-emerald-800 border border-emerald-500/60 hover:border-emerald-400 text-emerald-200 hover:text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs uppercase font-cinzel tracking-wider"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>BULK UNHIDE ({selectedSerials.size})</span>
                  </button>

                  <button
                    onClick={handleClearSelection}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer text-xs"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* Boxes Data Table */}
            <div className="bg-[#0b0b10] border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#101016] text-neutral-400 border-b border-neutral-800 uppercase font-cinzel text-[10.5px]">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={boxes.length > 0 && boxes.every((b) => selectedSerials.has(b.serial))}
                          onChange={handleSelectAllOnPage}
                          title="Select / deselect all on this page"
                          className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500"
                        />
                      </th>
                      <th className="py-3 px-4">Box Serial</th>
                      <th className="py-3 px-4">Website Visibility</th>
                      <th className="py-3 px-4">Database Status</th>
                      <th className="py-3 px-4">Winner / Prize</th>
                      <th className="py-3 px-4">Claimed By</th>
                      <th className="py-3 px-4">Result / Code</th>
                      <th className="py-3 px-4 text-right">Visibility Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900">
                    {boxesLoading ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-neutral-400 font-cinzel">
                          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <span>Loading database records...</span>
                        </td>
                      </tr>
                    ) : boxes.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-neutral-400">
                          No box records match your current search/filter.
                        </td>
                      </tr>
                    ) : (
                      boxes.map((b) => {
                        const isToggling = togglingSerial === b.serial;
                        const isSelected = selectedSerials.has(b.serial);

                        return (
                          <tr
                            key={b.serial}
                            className={`hover:bg-neutral-900/40 transition-colors ${
                              isSelected
                                ? 'bg-amber-950/25'
                                : b.isWinner
                                ? 'bg-amber-950/10'
                                : b.isHidden
                                ? 'bg-neutral-950/40 opacity-75'
                                : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectBox(b.serial)}
                                title={`Select box ${b.serial}`}
                                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500"
                              />
                            </td>

                            {/* Serial */}
                            <td className="py-3 px-4">
                              <span className="font-mono-numbers font-bold text-white text-[13px]">{b.serial}</span>
                              <span className="text-[10px] text-neutral-500 block font-mono-numbers">ID #{b.id}</span>
                            </td>

                            {/* Visibility Badge */}
                            <td className="py-3 px-4">
                              {b.isHidden ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/70 border border-amber-500/60 text-amber-300 text-[10px] font-bold tracking-wider">
                                  <EyeOff className="w-3 h-3 text-amber-400" />
                                  <span>HIDDEN</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/60 text-emerald-300 text-[10px] font-bold tracking-wider">
                                  <Eye className="w-3 h-3 text-emerald-400" />
                                  <span>VISIBLE</span>
                                </span>
                              )}
                            </td>

                            {/* Database Status */}
                            <td className="py-3 px-4">
                              {b.status === 'OPENED' ? (
                                <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/40 text-purple-300 font-bold text-[10px]">
                                  OPENED
                                </span>
                              ) : b.status === 'CLAIMED' ? (
                                <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-500/40 text-blue-300 font-bold text-[10px]">
                                  CLAIMED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-300 text-[10px]">
                                  AVAILABLE
                                </span>
                              )}
                            </td>

                            {/* Prize info */}
                            <td className="py-3 px-4">
                              {b.isWinner ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-[10px] font-cinzel">
                                    <Sparkles className="w-3 h-3 text-amber-400" />
                                    <span>WINNER</span>
                                  </span>
                                  <span className="text-[11px] font-semibold text-gold-bright block">
                                    {b.assignedPrize || b.prizeName}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-neutral-500 text-[11px]">Regular Box</span>
                              )}
                            </td>

                            {/* Claimed by */}
                            <td className="py-3 px-4">
                              {b.claimedBy ? (
                                <div>
                                  <span className="font-mono-numbers text-white font-medium block truncate max-w-[140px]">
                                    {b.claimedBy}
                                  </span>
                                  {b.claimedAt && (
                                    <span className="text-[10px] text-neutral-500 font-mono-numbers">
                                      {new Date(b.claimedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-neutral-600">—</span>
                              )}
                            </td>

                            {/* Result & Code */}
                            <td className="py-3 px-4">
                              {b.opened ? (
                                <div>
                                  <span
                                    className={`font-bold text-[10px] uppercase font-cinzel ${
                                      b.result === 'WINNER' ? 'text-amber-300' : 'text-neutral-400'
                                    }`}
                                  >
                                    {b.result}
                                  </span>
                                  {b.claimCode && (
                                    <span className="text-[10px] font-mono-numbers text-neutral-400 block">
                                      {b.claimCode}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-neutral-600">Unopened</span>
                              )}
                            </td>

                            {/* Action Button: HIDE / UNHIDE */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleToggleBoxVisibility(b)}
                                  disabled={isToggling}
                                  title={
                                    b.isHidden
                                      ? `Unhide box ${b.serial} and restore to public website`
                                      : `Hide box ${b.serial} from public website`
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
                                    b.isHidden
                                      ? 'bg-emerald-900/80 hover:bg-emerald-700 border border-emerald-500/60 text-emerald-100 hover:text-white'
                                      : 'bg-neutral-900 hover:bg-neutral-800 border border-amber-500/50 hover:border-amber-400 text-amber-300 hover:text-white'
                                  }`}
                                >
                                  {isToggling ? (
                                    <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                                  ) : b.isHidden ? (
                                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                  )}
                                  <span>{b.isHidden ? 'UNHIDE' : 'HIDE'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 2: WINNING PRIZE MANAGEMENT (100 WINNING POSITIONS)
           ===================================================================== */}
        {activeTab === 'prizes' && (
          <div className="space-y-4">
            {/* Master Showcase Visibility Control */}
            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 transition-all ${
                isShowcaseHidden
                  ? 'bg-red-950/25 border-red-500/50'
                  : 'bg-emerald-950/20 border-emerald-500/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                    isShowcaseHidden
                      ? 'bg-red-500/20 border-red-500/40 text-red-300'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  {isShowcaseHidden ? <EyeOff className="w-5 h-5 text-red-400" /> : <Eye className="w-5 h-5 text-emerald-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold font-cinzel text-white">
                      Public Winning Prizes Showcase
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isShowcaseHidden
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {isShowcaseHidden ? 'SHOWCASE HIDDEN FROM PUBLIC' : 'SHOWCASE PUBLICLY ACTIVE'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {isShowcaseHidden
                      ? 'The entire Winning Prizes section is completely removed from the public website and public API.'
                      : 'The Winning Prizes section is visible on the public website (individual hidden cards remain excluded).'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleShowcaseVisibility}
                disabled={togglingShowcase}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 disabled:opacity-60 whitespace-nowrap shrink-0 ${
                  isShowcaseHidden
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50'
                    : 'bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-500/50'
                }`}
              >
                {togglingShowcase ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isShowcaseHidden ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                <span>{isShowcaseHidden ? 'Unhide Entire Showcase' : 'Hide Entire Showcase'}</span>
              </button>
            </div>

            {/* Header / Search toolbar */}
            <div className="bg-[#0c0c12] border border-neutral-800 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-cinzel uppercase font-bold text-amber-300 text-xs">
                  Official 100 Winning Prizes
                </span>
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-400 font-mono-numbers">
                  4 Apple iPhones · 96 Guaranteed Cash Rewards
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search prize, serial..."
                    value={prizesSearch}
                    onChange={(e) => setPrizesSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <button
                  onClick={fetchPrizes}
                  className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-amber-300 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${prizesLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Prizes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {prizesLoading ? (
                <div className="col-span-full py-16 text-center text-neutral-400 font-cinzel">
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>Loading winning prize cards...</span>
                </div>
              ) : filteredPrizes.length === 0 ? (
                <div className="col-span-full py-16 text-center text-neutral-400">
                  No winning prizes match your search.
                </div>
              ) : (
                filteredPrizes.map((p) => {
                  const isIPhone = p.prizeName.toLowerCase().includes('iphone');

                  return (
                    <div
                      key={p.serial}
                      className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${
                        p.isCardHidden
                          ? 'bg-[#09090d] border-neutral-800/60 opacity-60'
                          : 'bg-[#0e0e14] border-amber-500/30 hover:border-amber-400/60 shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                              isIPhone
                                ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                                : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                            }`}
                          >
                            {isIPhone ? <Smartphone className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                          </div>
                          <div>
                            <span className="font-mono-numbers font-bold text-white text-sm block">
                              {p.serial}
                            </span>
                            <span className="text-[10px] text-neutral-400 uppercase font-cinzel">
                              {isIPhone ? 'Apple Flagship Device' : 'Cash Prize'}
                            </span>
                          </div>
                        </div>

                        {/* Card Hidden / Visible status */}
                        {p.isCardHidden ? (
                          <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-[10px] font-bold text-neutral-400">
                            CARD HIDDEN
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                            CARD ACTIVE
                          </span>
                        )}
                      </div>

                      {/* Prize Title */}
                      <div className="text-base font-bold text-gold-bright mb-2 font-cinzel">
                        {p.prizeName}
                      </div>

                      {/* Custom display note if set */}
                      {p.customNote && (
                        <div className="p-2 rounded-lg bg-black/60 border border-neutral-800 text-[11px] text-neutral-300 mb-3 italic">
                          "{p.customNote}"
                        </div>
                      )}

                      {/* Claim details */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-black/40 p-2.5 rounded-xl border border-neutral-800/80 mb-3 font-mono-numbers">
                        <div>
                          <span className="text-neutral-500 block text-[10px]">Claim State:</span>
                          <span
                            className={
                              p.isOpened
                                ? 'text-purple-300 font-bold'
                                : p.isClaimed
                                ? 'text-blue-300 font-bold'
                                : 'text-neutral-400'
                            }
                          >
                            {p.isOpened ? 'Opened' : p.isClaimed ? 'Claimed' : 'Unopened'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[10px]">Claim Code:</span>
                          <span className="text-neutral-300 truncate block">
                            {p.claimCode || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-neutral-800 text-xs">
                        <button
                          onClick={() => handleTogglePrizeCardVisibility(p)}
                          disabled={togglingSerial === p.serial}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${
                            p.isCardHidden
                              ? 'bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200'
                              : 'bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {togglingSerial === p.serial ? (
                            <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          ) : p.isCardHidden ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                          <span>{p.isCardHidden ? 'Unhide Card' : 'Hide Card'}</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingPrize(p);
                            setEditNoteInput(p.customNote || '');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                          title="Edit prize display note"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Note</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 3: CUSTOMER-SPECIFIC LINK MANAGEMENT (ALL 15,051 BOXES)
           ===================================================================== */}
        {activeTab === 'links' && (
          <div className="space-y-4">
            <div className="bg-[#0c0c12] border border-amber-500/30 rounded-2xl p-5 sm:p-7 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-neutral-800/80">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-400/30 text-[10px] text-amber-300 font-cinzel font-bold uppercase tracking-wider mb-2">
                    <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Customer Link Management</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black font-cinzel text-white uppercase tracking-wide">
                    Customer-Specific Link Generator
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
                    Generate one customer-specific link from the Admin Portal (not separate links for all 15,051 boxes). When the customer opens the link, all currently available boxes are displayed for them to choose and claim. The link is locked to the intended customer's device; forwarded users are denied access. Once activated, the link expires for other users while the original customer can return anytime via their secure session.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-2 rounded-xl bg-neutral-900/90 border border-amber-500/40 text-amber-300 flex items-center gap-2 text-xs font-mono-numbers">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Device Locked & Protected</span>
                  </div>
                </div>
              </div>

              {/* 1. Generate Customer Link Form Card */}
              <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-amber-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold font-cinzel text-amber-300 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" />
                      <span>Customer Link & Multi-Purchase Generator</span>
                    </h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Generate a separate unique link for each purchase. All purchase links are associated with the same customer.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  {/* Customer Name or Select existing */}
                  <div className="lg:col-span-5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase font-cinzel text-neutral-400">
                      <span>Customer Name / Identifier:</span>
                      {customerGroups.length > 0 && (
                        <span className="text-amber-400/90 lowercase text-[9.5px]">
                          ({customerGroups.length} existing customers)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={customerNameInput}
                        onChange={(e) => {
                          setCustomerNameInput(e.target.value);
                          setSelectedCustomerId('');
                        }}
                        placeholder="Enter Customer Name (e.g. John Doe, +91 98...)"
                        className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none"
                      />
                      {customerGroups.length > 0 && (
                        <select
                          value={selectedCustomerId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setSelectedCustomerId(id);
                            if (id) {
                              const found = customerGroups.find((g) => g.customerId === id);
                              if (found) setCustomerNameInput(found.customerName);
                            }
                          }}
                          className="px-2 py-2 bg-neutral-900 border border-neutral-700 text-xs text-amber-300 rounded-xl focus:outline-none max-w-[130px] sm:max-w-[160px] truncate"
                          title="Select existing customer"
                        >
                          <option value="">Select Existing ▾</option>
                          {customerGroups.map((g) => (
                            <option key={g.customerId} value={g.customerId}>
                              {g.customerName} ({g.totalPurchases} {g.totalPurchases === 1 ? 'purchase' : 'purchases'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Purchase Note */}
                  <div className="lg:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-cinzel text-neutral-400 block">
                      Purchase Note / Order Ref (Optional):
                    </label>
                    <input
                      type="text"
                      value={customerNoteInput}
                      onChange={(e) => setCustomerNoteInput(e.target.value)}
                      placeholder="e.g. Order #1024, WhatsApp purchase..."
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none"
                    />
                  </div>

                  {/* Generate Button */}
                  <div className="lg:col-span-3">
                    <button
                      type="button"
                      onClick={() => handleGenerateCustomerLink(true)}
                      disabled={generatingCustomerLink}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-black font-cinzel font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {generatingCustomerLink ? (
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-black" />
                      )}
                      <span>GENERATE & COPY LINK</span>
                    </button>
                  </div>
                </div>

                {/* Notice for customer association */}
                {customerNameInput.trim() && (
                  <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      Associating with: <strong className="text-white">{customerNameInput.trim()}</strong>
                      {(() => {
                        const existing = customerGroups.find(
                          (g) => g.customerName.toLowerCase() === customerNameInput.trim().toLowerCase()
                        );
                        if (existing) {
                          return ` · Existing Customer (${existing.totalPurchases} previous purchases). This will create Purchase #${existing.totalPurchases + 1}.`;
                        }
                        return ' · New Customer (Purchase #1).';
                      })()}
                    </span>
                  </div>
                )}

                {/* Display Latest Generated Link if Available */}
                {latestCustomerLink && (
                  <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/50 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase font-cinzel text-amber-400 tracking-wider">
                          Active Purchase Link Ready to Share:
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-bold">
                          {latestCustomerLink.customerName || 'Customer'} (Purchase #{latestCustomerLink.purchaseNumber || 1})
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                        {latestCustomerLink.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 sm:p-3">
                      <LinkIcon className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
                      <span className="text-xs sm:text-sm text-amber-300 font-mono font-medium truncate flex-1 select-all">
                        {latestCustomerLink.url}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyCustomerLink}
                        className="py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-cinzel font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        {copiedCommonLink ? (
                          <>
                            <Check className="w-4 h-4 text-black stroke-[3]" />
                            <span>COPIED TO CLIPBOARD!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-black stroke-[2.5]" />
                            <span>COPY PURCHASE LINK</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleShareWhatsAppCommon}
                        className="py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-cinzel font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4 text-white stroke-[2.5]" />
                        <span>SHARE VIA WHATSAPP</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Customer Association & Purchase Links Section */}
              <div className="mb-6 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* View Mode Toggle: Grouped by Customer vs All Links */}
                  <div className="flex items-center gap-1.5 p-1 bg-neutral-950 border border-neutral-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setLinkViewMode('grouped')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-cinzel font-bold tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer ${
                        linkViewMode === 'grouped'
                          ? 'bg-amber-400 text-black shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Associated Customers ({customerGroups.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkViewMode('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-cinzel font-bold tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer ${
                        linkViewMode === 'all'
                          ? 'bg-amber-400 text-black shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>All Purchase Links ({customerLinks.length})</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {linkViewMode === 'all' && customerGroups.length > 0 && (
                      <select
                        value={filterCustomerId}
                        onChange={(e) => setFilterCustomerId(e.target.value)}
                        className="px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 rounded-xl focus:outline-none"
                      >
                        <option value="">All Customers ({customerGroups.length})</option>
                        {customerGroups.map((g) => (
                          <option key={g.customerId} value={g.customerId}>
                            {g.customerName} ({g.totalPurchases})
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={fetchCustomerLinks}
                      className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-amber-300 transition-colors cursor-pointer"
                      title="Refresh customer links"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${customerLinksLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* VIEW 1: GROUPED BY CUSTOMER (Shows all purchase links associated with the same customer) */}
                {linkViewMode === 'grouped' ? (
                  <div className="space-y-4">
                    {customerLinksLoading && customerGroups.length === 0 ? (
                      <div className="py-12 text-center text-neutral-500 bg-[#0b0b10] border border-neutral-800 rounded-xl">
                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <span>Loading customer purchase records...</span>
                      </div>
                    ) : customerGroups.length === 0 ? (
                      <div className="py-12 text-center text-neutral-500 bg-[#0b0b10] border border-neutral-800 rounded-xl">
                        No customer links generated yet. Enter a customer name above to generate their first purchase link.
                      </div>
                    ) : (
                      customerGroups.map((cg) => (
                        <div
                          key={cg.customerId}
                          className="bg-[#0b0b10] border border-neutral-800 hover:border-neutral-700 rounded-2xl overflow-hidden shadow-lg transition-all"
                        >
                          {/* Customer Header */}
                          <div className="p-3.5 sm:p-4 bg-[#111118] border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300 font-bold font-cinzel text-xs shrink-0">
                                <Users className="w-4 h-4 text-amber-400" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-bold font-cinzel text-white">
                                    {cg.customerName}
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-bold font-mono-numbers">
                                    {cg.totalPurchases} {cg.totalPurchases === 1 ? 'PURCHASE' : 'PURCHASES'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5 flex-wrap">
                                  <span className="text-emerald-400">{cg.unusedCount + cg.activatedCount} Ready</span>
                                  <span>·</span>
                                  <span className="text-purple-300">{cg.claimedCount} Claimed</span>
                                  <span>·</span>
                                  <span className="text-neutral-400">{cg.usedCount} Opened</span>
                                </div>
                              </div>
                            </div>

                            {/* + New Purchase Link for this Customer */}
                            <button
                              type="button"
                              onClick={() => handleGenerateCustomerLink(true, cg.customerName, cg.customerId)}
                              disabled={generatingCustomerLink}
                              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-cinzel font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
                              title={`Generate another purchase link for ${cg.customerName}`}
                            >
                              <Plus className="w-3.5 h-3.5 text-black stroke-[3]" />
                              <span>+ Add Purchase Link</span>
                            </button>
                          </div>

                          {/* Associated Links Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-[#0e0e14] text-neutral-400 border-b border-neutral-800/80 uppercase font-cinzel text-[10px]">
                                <tr>
                                  <th className="py-2 px-3">Purchase #</th>
                                  <th className="py-2 px-3">Token Prefix</th>
                                  <th className="py-2 px-3">Assigned Box</th>
                                  <th className="py-2 px-3">Status</th>
                                  <th className="py-2 px-3">Device Binding</th>
                                  <th className="py-2 px-3">Created</th>
                                  <th className="py-2 px-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-900">
                                {cg.links.map((link) => (
                                  <tr key={link.tokenHash} className="hover:bg-neutral-900/30 transition-colors">
                                    <td className="py-2 px-3 font-cinzel font-bold text-amber-300 text-[11px]">
                                      Purchase #{link.purchaseNumber || 1}
                                    </td>
                                    <td className="py-2 px-3 font-mono text-neutral-300 text-[11px]">
                                      {link.tokenPrefix}...
                                    </td>
                                    <td className="py-2 px-3 font-mono text-xs">
                                      {link.boxSerial && link.boxSerial !== 'UNASSIGNED' ? (
                                        <span className="font-bold text-amber-300">{link.boxSerial}</span>
                                      ) : (
                                        <span className="text-neutral-500 italic">Available to choose</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3">
                                      {link.status === 'UNUSED' ? (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold">
                                          READY / UNUSED
                                        </span>
                                      ) : link.status === 'ACTIVATED' ? (
                                        <span className="px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold">
                                          ACTIVATED / LOCKED
                                        </span>
                                      ) : link.status === 'CLAIMED' ? (
                                        <span className="px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/50 text-purple-300 text-[10px] font-bold">
                                          CLAIMED ({link.boxSerial})
                                        </span>
                                      ) : link.status === 'USED' ? (
                                        <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-400 text-[10px] font-bold">
                                          OPENED ({link.boxSerial})
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-red-950/70 border border-red-500/50 text-red-300 text-[10px] font-bold">
                                          REVOKED
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-[11px] text-neutral-400">
                                      {link.boundClientId ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-400">
                                          <Check className="w-3 h-3 stroke-[3]" />
                                          <span>Locked to Device</span>
                                        </span>
                                      ) : (
                                        <span className="text-neutral-500 italic">Locks on first open</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-[10px] text-neutral-500 font-mono-numbers">
                                      {new Date(link.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => {
                                            navigator.clipboard?.writeText(link.url);
                                            showNotification('success', `Copied link: ${link.url}`);
                                          }}
                                          className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-[10px] font-cinzel font-bold uppercase transition-colors cursor-pointer"
                                          title="Copy link to clipboard"
                                        >
                                          Copy
                                        </button>
                                        <button
                                          onClick={() => {
                                            const text = `🎉 *SUPER SURPRISE BOX (BATCH 1)*\n\nChoose your surprise box from 15,051 available boxes! 100 winning prizes including 4 Apple iPhones and 96 Cash Rewards.\n\nOpen your private customer link to select and claim your box:\n${link.url}`;
                                            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                                            window.open(waUrl, '_blank', 'noopener,noreferrer');
                                          }}
                                          className="px-2 py-1 rounded bg-[#25D366]/20 hover:bg-[#25D366]/40 border border-[#25D366]/50 text-[#25D366] text-[10px] font-cinzel font-bold uppercase transition-colors cursor-pointer"
                                          title="Share on WhatsApp"
                                        >
                                          WhatsApp
                                        </button>
                                        {link.status !== 'REVOKED' && link.status !== 'USED' && (
                                          <button
                                            onClick={() => handleRevokeCustomerLink(link.tokenHash)}
                                            className="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-[10px] font-cinzel font-bold uppercase transition-colors cursor-pointer"
                                            title="Revoke this customer link"
                                          >
                                            Revoke
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* VIEW 2: FLAT LINK TABLE (All Purchase Links) */
                  <div className="bg-[#0b0b10] border border-neutral-800 rounded-xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#101016] text-neutral-400 border-b border-neutral-800 uppercase font-cinzel text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Associated Customer</th>
                            <th className="py-2.5 px-3">Token Prefix</th>
                            <th className="py-2.5 px-3">Assigned Box</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Device Binding</th>
                            <th className="py-2.5 px-3">Created</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-900">
                          {customerLinksLoading && customerLinks.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-neutral-500">
                                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-1.5" />
                                <span>Loading customer links...</span>
                              </td>
                            </tr>
                          ) : customerLinks.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-neutral-500">
                                No customer links generated yet. Click "GENERATE & COPY CUSTOMER LINK" above to create one.
                              </td>
                            </tr>
                          ) : (
                            customerLinks
                              .filter((l) => !filterCustomerId || l.customerId === filterCustomerId)
                              .map((link) => (
                                <tr key={link.tokenHash} className="hover:bg-neutral-900/40 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-white text-xs">
                                      {link.customerName || 'Customer'}
                                    </div>
                                    <div className="text-[10px] text-amber-400 font-cinzel">
                                      Purchase #{link.purchaseNumber || 1}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-neutral-300 text-[11px]">
                                    {link.tokenPrefix}...
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-xs">
                                    {link.boxSerial && link.boxSerial !== 'UNASSIGNED' ? (
                                      <span className="font-bold text-amber-300">{link.boxSerial}</span>
                                    ) : (
                                      <span className="text-neutral-500 italic">Available to choose</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {link.status === 'UNUSED' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold">
                                        READY / UNUSED
                                      </span>
                                    ) : link.status === 'ACTIVATED' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold">
                                        ACTIVATED / LOCKED
                                      </span>
                                    ) : link.status === 'CLAIMED' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/50 text-purple-300 text-[10px] font-bold">
                                        CLAIMED ({link.boxSerial})
                                      </span>
                                    ) : link.status === 'USED' ? (
                                      <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-400 text-[10px] font-bold">
                                        OPENED ({link.boxSerial})
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-red-950/70 border border-red-500/50 text-red-300 text-[10px] font-bold">
                                        REVOKED
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px] text-neutral-400">
                                    {link.boundClientId ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-400">
                                        <Check className="w-3 h-3 stroke-[3]" />
                                        <span>Locked to Device</span>
                                      </span>
                                    ) : (
                                      <span className="text-neutral-500 italic">Locks on first open</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-[10px] text-neutral-500 font-mono-numbers">
                                    {new Date(link.createdAt).toLocaleDateString()}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => {
                                          navigator.clipboard?.writeText(link.url);
                                          showNotification('success', `Copied link: ${link.url}`);
                                        }}
                                        className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-[10px] font-cinzel font-bold uppercase transition-colors cursor-pointer"
                                        title="Copy link to clipboard"
                                      >
                                        Copy
                                      </button>
                                      <button
                                        onClick={() => {
                                          const text = `🎉 *SUPER SURPRISE BOX (BATCH 1)*\n\nChoose your surprise box from 15,051 available boxes! 100 winning prizes including 4 Apple iPhones and 96 Cash Rewards.\n\nOpen your private customer link to select and claim your box:\n${link.url}`;
                                          const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                                          window.open(waUrl, '_blank', 'noopener,noreferrer');
                                        }}
                                        className="px-2 py-1 rounded bg-[#25D366]/20 hover:bg-[#25D366]/40 border border-[#25D366]/50 text-[#25D366] text-[10px] font-cinzel font-bold uppercase transition-colors cursor-pointer"
                                        title="Share on WhatsApp"
                                      >
                                        WhatsApp
                                      </button>
                                      {link.status !== 'REVOKED' && link.status !== 'USED' && (
                                        <button
                                          onClick={() => handleRevokeCustomerLink(link.tokenHash)}
                                          className="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-[10px] font-cinzel font-bold uppercase transition-colors cursor-pointer"
                                          title="Revoke this customer link"
                                        >
                                          Revoke
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Public Customer Website URL Configuration */}
              <div className="mb-6 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-neutral-300 uppercase font-cinzel tracking-wider block">
                    Public Customer Website URL
                  </label>
                  {!isEditingUrl && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTestPublicUrl()}
                        disabled={isTestingUrl || !getCommonCustomerUrl()}
                        className="text-[11px] px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Verify unauthenticated public accessibility"
                      >
                        {isTestingUrl ? (
                          <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ExternalLink className="w-3 h-3 text-amber-400" />
                        )}
                        <span>Verify Mobile Access</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingUrl(true);
                          setUrlInputValue(getCommonCustomerUrl() || customerUrlConfig?.suggestedSharedUrl || '');
                        }}
                        className="text-[11px] px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 text-amber-300 hover:text-amber-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Configure Public URL</span>
                      </button>
                    </div>
                  )}
                </div>

                {!isEditingUrl ? (
                  <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 sm:p-3">
                    <Globe className="w-4 h-4 text-neutral-500 shrink-0 ml-1" />
                    <span className="text-xs sm:text-sm text-amber-300 font-mono font-medium truncate flex-1 select-all">
                      {getCommonCustomerUrl() || (
                        <span className="text-neutral-500 italic">
                          No public URL configured yet (click "Configure Public URL" above)
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-bold uppercase font-cinzel px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 shrink-0">
                      Batch 1 · 15,051 Boxes
                    </span>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-neutral-950 border border-amber-500/40 space-y-3">
                    <div className="text-xs text-neutral-300">
                      Enter the live, publicly deployed customer website URL (do NOT enter an internal <code className="text-red-400">ais-dev-</code> URL):
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Globe className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="url"
                          value={urlInputValue}
                          onChange={(e) => setUrlInputValue(e.target.value)}
                          placeholder="https://ais-pre-... or https://yourdomain.com"
                          className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-lg text-xs font-mono text-white placeholder-neutral-600 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSavePublicUrl()}
                          disabled={isSavingUrl || !urlInputValue.trim()}
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-cinzel font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isSavingUrl ? (
                            <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>Save Public URL</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingUrl(false);
                            setUrlTestFeedback(null);
                          }}
                          className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Security & Architecture Highlights */}
              <div className="mt-8 pt-6 border-t border-neutral-800/80 grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs text-neutral-400">
                <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800">
                  <div className="text-amber-300 font-cinzel font-bold mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Single Customer Link</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Generate one customer-specific link from the Admin Portal, not separate links for all 15,051 boxes.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800">
                  <div className="text-amber-300 font-cinzel font-bold mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Device Locked & Bound</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Only the intended customer may activate and use the link. Forwarded recipients are denied access.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800">
                  <div className="text-amber-300 font-cinzel font-bold mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                    <span>All Available Boxes Displayed</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    When the customer opens the link, all available boxes are displayed for them to choose and claim.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Edit Prize Display Note Modal */}
      {editingPrize && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c0c12] border border-amber-400/40 rounded-2xl p-6 shadow-2xl relative text-left animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold font-cinzel text-white uppercase">
                  Edit Prize Display Note
                </h3>
              </div>
              <button
                onClick={() => setEditingPrize(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-5 text-xs">
              <div>
                <span className="text-neutral-500 block">Box Serial:</span>
                <span className="font-mono-numbers font-bold text-white text-sm">
                  {editingPrize.serial}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Assigned Prize:</span>
                <span className="font-bold text-gold-bright text-sm">
                  {editingPrize.prizeName}
                </span>
              </div>
              <div>
                <label className="text-neutral-400 block font-semibold mb-1">
                  Custom Display Note / Banner (e.g. "Special VIP Winner #1"):
                </label>
                <input
                  type="text"
                  placeholder="Enter custom display note..."
                  value={editNoteInput}
                  onChange={(e) => setEditNoteInput(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-500 block mt-1">
                  This note updates display details only. Winner assignments and serial numbers cannot be modified.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setEditingPrize(null)}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrizeNote}
                disabled={editSaving}
                className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-black font-cinzel font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{editSaving ? 'Saving...' : 'Save Note'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Hide / Unhide Confirmation Modal */}
      {bulkConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#0c0c12] border border-amber-400/50 rounded-2xl p-6 shadow-2xl relative text-left">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                    bulkConfirmModal.action === 'hide'
                      ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                      : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  }`}
                >
                  {bulkConfirmModal.action === 'hide' ? (
                    <EyeOff className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold font-cinzel text-white uppercase">
                    Confirm Bulk {bulkConfirmModal.action === 'hide' ? 'Hide' : 'Unhide'}
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {bulkConfirmModal.count} {bulkConfirmModal.count === 1 ? 'box' : 'boxes'} selected
                  </span>
                </div>
              </div>
              <button
                onClick={() => setBulkConfirmModal(null)}
                disabled={bulkProcessing}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-5 text-xs text-neutral-300">
              <p className="leading-relaxed">
                {bulkConfirmModal.action === 'hide' ? (
                  <span>
                    Are you sure you want to <strong className="text-amber-300 font-bold">HIDE {bulkConfirmModal.count} selected box(es)</strong> from the public website?
                  </span>
                ) : (
                  <span>
                    Are you sure you want to <strong className="text-emerald-300 font-bold">UNHIDE {bulkConfirmModal.count} selected box(es)</strong> and make them visible on the public website?
                  </span>
                )}
              </p>
              <div className="p-3 bg-neutral-900/80 border border-neutral-800 rounded-xl text-[11px] text-neutral-400 leading-relaxed">
                {bulkConfirmModal.action === 'hide' ? (
                  <span>
                    ✓ Hidden boxes will be immediately removed from the public inventory grid, search, and customer links.<br />
                    ✓ Serial numbers, winning prize allocations, and availability statuses are 100% preserved.<br />
                    ✓ Hidden boxes remain visible here in the Admin Dashboard and can be unhidden anytime.
                  </span>
                ) : (
                  <span>
                    ✓ Unhidden boxes will immediately reappear in the public inventory grid and search results.<br />
                    ✓ Customers will be able to select and claim these boxes again.
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 text-xs">
              <button
                onClick={() => setBulkConfirmModal(null)}
                disabled={bulkProcessing}
                className="px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkAction}
                disabled={bulkProcessing}
                className={`px-4 py-1.5 rounded-lg text-black font-cinzel font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-md ${
                  bulkConfirmModal.action === 'hide'
                    ? 'bg-amber-400 hover:bg-amber-300'
                    : 'bg-emerald-400 hover:bg-emerald-300'
                }`}
              >
                {bulkProcessing && (
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                )}
                <span>
                  {bulkProcessing
                    ? 'Processing...'
                    : `Confirm & ${bulkConfirmModal.action === 'hide' ? 'Hide' : 'Unhide'}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
