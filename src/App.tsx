/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Lock, Gift, Package, ShieldAlert } from 'lucide-react';
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
  const [isAdminView, setIsAdminView] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    return path === '/admin' || path === '/admin/' || path.startsWith('/admin') || window.location.search.includes('admin=true');
  });

  // Listen for browser popstate or route changes
  useEffect(() => {
    const handleLocationCheck = () => {
      const path = window.location.pathname.toLowerCase();
      setIsAdminView(path === '/admin' || path === '/admin/' || path.startsWith('/admin') || window.location.search.includes('admin=true'));
    };
    window.addEventListener('popstate', handleLocationCheck);
    return () => window.removeEventListener('popstate', handleLocationCheck);
  }, []);

  const navigateToAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setIsAdminView(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCustomer = () => {
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

    const cleanToken = token?.trim() || null;

    // STRICT REQUIREMENT:
    // When a customer opens the main website URL without a private customer token,
    // display the MAIN BOX SELECTION PAGE instead of the "THIS LINK HAS ALREADY BEEN USED" screen.
    // Do not treat the main website URL as an expired private link.
    if (!cleanToken) {
      setIsReopenedUsedLink(false);
      setIsRevokedLink(false);
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
      } else if (data.opened || data.used || data.alreadyUsed) {
        setIsReopenedUsedLink(true);
        setIsRevokedLink(false);
      } else {
        setIsReopenedUsedLink(false);
        setIsRevokedLink(false);
      }
    } catch (err: unknown) {
      console.error('Error loading customer session:', err);
      const errMsg = (err as Error)?.message || '';
      if (errMsg.includes('REVOKED')) {
        setIsRevokedLink(true);
        setIsReopenedUsedLink(false);
      } else if (errMsg.includes('ALREADY BEEN USED')) {
        setIsReopenedUsedLink(true);
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
      }
    } finally {
      setSessionLoading(false);
    }
  };

  // Called when customer selects and claims an available box from the grid
  const handleBoxClaimed = (serial: string, newToken?: string) => {
    const assignedToken = newToken || customerSession?.token || `SS1-CUST-${Date.now().toString(36).toUpperCase()}`;

    // Establish customer private token in the browser address bar
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
      <header className="w-full border-b border-amber-500/20 bg-[#07070b]/95 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-8 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
        <div className="max-w-[1520px] mx-auto flex items-center justify-between gap-3">
          {/* Left: Gift Icon + Brand + Badge */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-500/25 via-yellow-400/20 to-amber-300/10 border border-amber-400/50 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.25)] shrink-0">
              <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 drop-shadow-sm" />
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <h1
                onClick={navigateToCustomer}
                className="text-base sm:text-xl md:text-2xl font-black tracking-widest font-cinzel text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-500 uppercase cursor-pointer hover:opacity-90 transition-opacity select-none drop-shadow-[0_2px_8px_rgba(245,158,11,0.3)]"
              >
                SUPER SURPRISE BOX
              </h1>

              {/* Beside brand: BATCH 1 • 15,051 BOXES badge */}
              <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0a0a0f] border border-amber-500/40 text-[11px] text-amber-300 font-cinzel font-semibold tracking-wider shadow-inner">
                <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>BATCH 1 • 15,051 BOXES</span>
              </div>
            </div>
          </div>

          {/* Right: Gold-bordered ADMIN LOGIN button */}
          <div className="flex items-center gap-2.5">
            <div className="md:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0a0a0f] border border-amber-500/30 text-[9px] text-amber-300 font-cinzel font-semibold">
              <span>15,051 BOXES</span>
            </div>

            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                navigateToAdmin();
              }}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-black/80 border border-amber-400/90 hover:bg-amber-400 hover:text-black text-amber-300 text-xs font-cinzel font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-amber-400/40 group shrink-0"
              title="Open Admin Login"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400 group-hover:text-black transition-colors" />
              <span>ADMIN LOGIN</span>
            </a>
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

      {/* Footer with visible Admin Login link */}
      <footer className="py-8 border-t border-neutral-900/80 bg-[#050507] text-center text-xs text-neutral-500 font-cinzel flex flex-col items-center justify-center gap-3 px-4">
        <div className="flex items-center gap-2 text-neutral-400 text-xs font-semibold">
          <span>SUPER SURPRISE BOX</span>
          <span>·</span>
          <span>BATCH 1 (15,051 BOXES)</span>
          <span>·</span>
          <span>100 WINNING PRIZES</span>
        </div>
        <p className="text-[11px] text-neutral-600 max-w-md">
          Official digital inventory & prize allocation. Each box serial corresponds to one verified pre-assigned reward.
        </p>
        <div className="pt-1">
          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              navigateToAdmin();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900/90 border border-neutral-700/80 hover:border-amber-400/70 text-neutral-200 hover:text-amber-300 text-xs font-cinzel font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-md hover:shadow-amber-500/20"
          >
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Admin Login</span>
          </a>
        </div>
        <div className="text-[10px] text-neutral-700 mt-1">
          Authorized personnel only. Protected by server-side PIN authentication.
        </div>
      </footer>
    </div>
  );
}

