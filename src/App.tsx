/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Gift, Package, ShieldAlert, Lock } from 'lucide-react';
import { BoxOpeningStage } from './components/BoxOpeningStage';
import { AvailableBoxGrid } from './components/AvailableBoxGrid';
import { WinningResult } from './components/WinningResult';
import { NonWinningResult } from './components/NonWinningResult';
import { LinkAlreadyUsed } from './components/LinkAlreadyUsed';
import { AdminDashboard } from './components/AdminDashboard';
import { CustomerSession, OpenResult } from './types/box';
import { fetchCustomerSession } from './utils/customerStore';

export default function App() {
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeResult, setActiveResult] = useState<OpenResult | null>(null);
  const [isReopenedUsedLink, setIsReopenedUsedLink] = useState(false);
  const [isRevokedLink, setIsRevokedLink] = useState(false);
  const [isForwardedLink, setIsForwardedLink] = useState(false);

  const checkIsAdminView = () => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    const isRouteAdmin =
      path === '/admin' ||
      path === '/admin/' ||
      path.startsWith('/admin') ||
      (search.includes('admin') && !search.includes('token') && !search.includes('box')) ||
      hash.includes('admin');

    // Customer link takes priority over background admin session when ?token=... or ?box=... is in URL
    const hasCustomerTokenParam = search.includes('token=') || search.includes('box=') || search.includes('serial=') || search.includes('id=');
    if (hasCustomerTokenParam && !path.startsWith('/admin')) {
      return false;
    }

    // If admin explicitly requested to preview customer view
    const isPreviewingCustomer = sessionStorage.getItem('ssb_preview_customer') === 'true';
    if (isPreviewingCustomer) {
      if (isRouteAdmin) {
        sessionStorage.removeItem('ssb_preview_customer');
        return true;
      }
      return false;
    }

    const hasAdminSession = !!(
      sessionStorage.getItem('ssb_admin_session_token') ||
      localStorage.getItem('ssb_admin_session_token')
    );

    return isRouteAdmin || hasAdminSession;
  };

  const [isAdminView, setIsAdminView] = useState(checkIsAdminView);

  // Listen for browser popstate, hashchange, storage, or route changes
  useEffect(() => {
    const handleLocationCheck = () => {
      const nextIsAdmin = checkIsAdminView();
      setIsAdminView(nextIsAdmin);
      if (!nextIsAdmin) {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || params.get('box') || params.get('serial') || params.get('id');
        loadTokenSession(token);
      }
    };
    window.addEventListener('popstate', handleLocationCheck);
    window.addEventListener('hashchange', handleLocationCheck);
    window.addEventListener('storage', handleLocationCheck);
    return () => {
      window.removeEventListener('popstate', handleLocationCheck);
      window.removeEventListener('hashchange', handleLocationCheck);
      window.removeEventListener('storage', handleLocationCheck);
    };
  }, []);

  const navigateToCustomer = () => {
    sessionStorage.setItem('ssb_preview_customer', 'true');
    window.history.pushState({}, '', '/');
    setIsAdminView(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Read query parameters on load (?token=... or ?box=... or ?serial=...)
  useEffect(() => {
    if (isAdminView) {
      setSessionLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('box') || params.get('serial') || params.get('id');

    loadTokenSession(token);
  }, [isAdminView]);

  const loadTokenSession = async (token?: string | null) => {
    setSessionLoading(true);
    setActiveResult(null);

    const explicitToken = token?.trim() || null;
    const storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('ssb_customer_token')?.trim() : null;
    if (explicitToken && explicitToken !== storedToken && typeof localStorage !== 'undefined') {
      localStorage.setItem('ssb_customer_token', explicitToken);
    }
    const cleanToken = explicitToken || storedToken || null;

    // Reset access block states on token load
    setIsForwardedLink(false);
    setIsReopenedUsedLink(false);
    setIsRevokedLink(false);

    // When customer has no active token or stored session, show the main available box selection page
    if (!cleanToken) {
      setIsReopenedUsedLink(false);
      setIsRevokedLink(false);
      setIsForwardedLink(false);
      setActiveResult(null);
      setCustomerSession({
        valid: true,
        token: '',
        hasClaimed: false,
        assignedBox: null,
        batchId: 1,
        opened: false,
        used: false,
        alreadyUsed: false,
      });
      setSessionLoading(false);
      return;
    }

    try {
      const data = await fetchCustomerSession(cleanToken);
      setCustomerSession(data);

      if (data.revoked) {
        setIsRevokedLink(true);
        setIsReopenedUsedLink(false);
        setIsForwardedLink(false);
      } else if (data.forbidden || data.isForwardedLink) {
        setIsForwardedLink(true);
        setIsRevokedLink(false);
        setIsReopenedUsedLink(false);
      } else if (data.opened || data.used || data.alreadyUsed) {
        setIsReopenedUsedLink(true);
        setIsRevokedLink(false);
        setIsForwardedLink(false);
      } else {
        setIsReopenedUsedLink(false);
        setIsRevokedLink(false);
        setIsForwardedLink(false);
      }
    } catch (err: unknown) {
      console.error('Error loading customer session:', err);
      const errMsg = (err as Error)?.message || '';
      if (errMsg.includes('REVOKED')) {
        setIsRevokedLink(true);
        setIsReopenedUsedLink(false);
        setIsForwardedLink(false);
      } else if (errMsg.includes('ALREADY BEEN USED')) {
        setIsReopenedUsedLink(true);
        setIsRevokedLink(false);
        setIsForwardedLink(false);
      } else if (errMsg.includes('RESTRICTED') || errMsg.includes('assigned customer') || errMsg.includes('forwarded')) {
        setIsForwardedLink(true);
        setIsReopenedUsedLink(false);
        setIsRevokedLink(false);
      } else {
        // Fallback for unrecognized link: allow customer to browse available boxes
        setCustomerSession({
          valid: true,
          token: cleanToken,
          hasClaimed: false,
          assignedBox: null,
          batchId: 1,
          opened: false,
          used: false,
          alreadyUsed: false,
        });
        setIsReopenedUsedLink(false);
        setIsRevokedLink(false);
        setIsForwardedLink(false);
      }
    } finally {
      setSessionLoading(false);
    }
  };

  // Called when customer selects and claims an available box from the grid
  const handleBoxClaimed = (serial: string, newToken?: string) => {
    const assignedToken = newToken || customerSession?.token || `SS1-CUST-${Date.now().toString(36).toUpperCase()}`;

    // Persist customer private token in localStorage and browser address bar
    if (typeof localStorage !== 'undefined' && assignedToken) {
      localStorage.setItem('ssb_customer_token', assignedToken);
    }
    if (assignedToken && !window.location.search.includes(assignedToken)) {
      const url = new URL(window.location.href);
      url.searchParams.set('token', assignedToken);
      window.history.pushState({}, '', url.toString());
    }

    setCustomerSession({
      valid: true,
      token: assignedToken,
      hasClaimed: true,
      assignedBox: serial,
      batchId: 1,
      opened: false,
      used: false,
      alreadyUsed: false,
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Called when customer clicks "OPEN YOUR BOX" and reveal completes in current session
  const handleBoxOpened = (result: OpenResult) => {
    setActiveResult(result);
    if (customerSession) {
      setCustomerSession({
        ...customerSession,
        opened: true,
        used: true,
        alreadyUsed: true,
        openedAt: result.openedAt,
        result: result.result,
        prizeName: result.prizeName,
        claimCode: result.claimCode,
      });
    }
  };

  // If in Admin Mode, render the complete Admin Control Center
  if (isAdminView) {
    return <AdminDashboard onBackToCustomerView={navigateToCustomer} />;
  }

  return (
    <div className="min-h-screen bg-[#050507] text-neutral-100 flex flex-col justify-between font-sans selection:bg-amber-400/30 selection:text-amber-200">
      {/* Brand Header & Top Bar */}
      <header className="w-full border-b border-amber-500/20 bg-[#07070b]/95 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 lg:px-8 py-3 sm:py-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
        <div className="max-w-[1520px] mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
          {/* Left: Gift Icon + Brand Logo */}
          <div
            onClick={navigateToCustomer}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none min-w-0"
            title="SUPER SURPRISE BOX"
          >
            <div className="w-7 h-7 xs:w-8 xs:h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-500/25 via-yellow-400/20 to-amber-300/10 border border-amber-400/50 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.25)] group-hover:border-amber-400 transition-all shrink-0">
              <Gift className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5 text-amber-300 drop-shadow-sm group-hover:scale-105 transition-transform" />
            </div>

            <h1 className="text-xs xs:text-sm sm:text-lg md:text-2xl font-black tracking-wider sm:tracking-widest font-cinzel text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-500 uppercase group-hover:opacity-95 transition-opacity drop-shadow-[0_2px_8px_rgba(245,158,11,0.3)] truncate">
              SUPER SURPRISE BOX
            </h1>
          </div>

          {/* Right: Admin Login Entry + Box Count Badge */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                sessionStorage.removeItem('ssb_preview_customer');
                window.history.pushState({}, '', '/admin');
                setIsAdminView(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-amber-400/60 text-[11px] sm:text-xs text-neutral-300 hover:text-amber-300 font-cinzel font-semibold tracking-wider transition-colors cursor-pointer shadow-sm"
              title="Admin Login / Control Center"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Login</span>
            </button>

            <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-[#0a0a0f] border border-amber-500/40 text-[10px] sm:text-xs text-amber-300 font-cinzel font-semibold tracking-wider shadow-inner shrink-0 whitespace-nowrap">
              <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">BATCH 1 • </span>
              <span className="font-mono-numbers">15,051 BOXES</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Experience Container */}
      <main className="flex-1 flex flex-col items-center justify-start px-2 sm:px-6 py-4 max-w-[1520px] w-full mx-auto">
        {sessionLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 my-auto">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-neutral-400 font-cinzel tracking-wider">
              Loading Super Surprise Box...
            </span>
          </div>
        ) : isRevokedLink ? (
          <div className="w-full max-w-lg mx-auto bg-obsidian-card border border-red-500/40 rounded-2xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center my-auto animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-semibold tracking-wider uppercase mb-6">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              <span>Link Deactivated</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-cinzel mb-4">
              THIS LINK HAS BEEN REVOKED.
            </h1>
            <p className="text-neutral-400 text-xs sm:text-sm mb-6 leading-relaxed">
              This private one-time link has been revoked or replaced by the administrator. Please contact support or request a new official link.
            </p>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/');
                loadTokenSession(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-amber-300 hover:text-white text-xs font-cinzel font-bold tracking-wider uppercase cursor-pointer"
            >
              Browse Available Boxes
            </button>
          </div>
        ) : isForwardedLink ? (
          <div className="w-full max-w-lg mx-auto bg-obsidian-card border border-amber-500/40 rounded-2xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center my-auto animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/60 border border-amber-500/50 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-6">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Link Restricted</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-cinzel mb-4">
              ORIGINAL CUSTOMER ONLY
            </h1>
            <p className="text-neutral-400 text-xs sm:text-sm mb-6 leading-relaxed">
              This private customer link is restricted to the originally assigned customer and cannot be opened or claimed from a forwarded link or another person.
            </p>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/');
                loadTokenSession(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-amber-300 hover:text-white text-xs font-cinzel font-bold tracking-wider uppercase cursor-pointer"
            >
              Browse Available Boxes
            </button>
          </div>
        ) : isReopenedUsedLink && customerSession ? (
          // 1. RE-OPENED / REFRESHED USED PRIVATE LINK: STRICTLY DISPLAY "THIS LINK HAS ALREADY BEEN USED."
          <div className="w-full my-auto animate-fade-in">
            <LinkAlreadyUsed
              serial={customerSession.assignedBox || 'Recorded Box'}
              openedAt={customerSession.openedAt}
              result={customerSession.result}
              prizeName={customerSession.prizeName}
              claimCode={customerSession.claimCode}
            />
          </div>
        ) : activeResult ? (
          // 2. IMMEDIATE REVEAL UPON OPENING (WINNER OR NON-WINNER)
          <div className="w-full my-auto animate-fade-in">
            {activeResult.result === 'WINNER' ? (
              <WinningResult
                serial={activeResult.boxSerial}
                prizeName={activeResult.prizeName}
                claimCode={activeResult.claimCode}
                openedAt={activeResult.openedAt}
              />
            ) : (
              <NonWinningResult
                serial={activeResult.boxSerial}
                openedAt={activeResult.openedAt}
              />
            )}
          </div>
        ) : customerSession?.hasClaimed && customerSession?.assignedBox ? (
          // 3. ASSIGNED CLOSED BOX READY TO OPEN (ONE BOX, SERIAL NUMBER, "OPEN YOUR BOX" BUTTON)
          <div className="w-full my-auto animate-fade-in">
            <BoxOpeningStage
              serial={customerSession.assignedBox}
              token={customerSession.token}
              onBoxOpened={handleBoxOpened}
            />
          </div>
        ) : customerSession ? (
          // 4. MAIN BOX SELECTION PAGE: DISPLAY ALL CURRENTLY AVAILABLE NON-WINNING BOXES (300 PER PAGE)
          <div className="w-full animate-fade-in">
            <AvailableBoxGrid
              token={customerSession.token}
              onBoxClaimed={handleBoxClaimed}
            />
          </div>
        ) : null}
      </main>

      {/* Brand Footer */}
      <footer className="py-8 border-t border-neutral-900/80 bg-[#050507] text-center text-xs text-neutral-500 font-cinzel flex flex-col items-center justify-center gap-2.5 px-4">
        <div className="flex items-center gap-2 text-neutral-400 text-xs font-semibold flex-wrap justify-center">
          <span>SUPER SURPRISE BOX</span>
          <span>·</span>
          <span>BATCH 1 (15,051 BOXES)</span>
          <span>·</span>
          <span>100 WINNING PRIZES</span>
        </div>
        <p className="text-[11px] text-neutral-600 max-w-md">
          Official digital inventory & prize allocation. Each box serial corresponds to one verified pre-assigned reward.
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem('ssb_preview_customer');
            window.history.pushState({}, '', '/admin');
            setIsAdminView(true);
          }}
          className="text-neutral-500 hover:text-amber-400 text-[11px] font-cinzel uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer mt-1"
        >
          <Lock className="w-3 h-3 text-amber-400/80" />
          <span>Admin Portal</span>
        </button>
      </footer>
    </div>
  );
}

