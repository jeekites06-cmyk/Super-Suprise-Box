/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BoxOpeningStage } from './components/BoxOpeningStage';
import { AvailableBoxGrid } from './components/AvailableBoxGrid';
import { WinningResult } from './components/WinningResult';
import { NonWinningResult } from './components/NonWinningResult';
import { LinkAlreadyUsed } from './components/LinkAlreadyUsed';
import { CustomerSession, OpenResult } from './types/box';
import { fetchCustomerSession } from './utils/customerStore';

export default function App() {
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeResult, setActiveResult] = useState<OpenResult | null>(null);
  const [isReopenedUsedLink, setIsReopenedUsedLink] = useState(false);

  // Read query parameters on load (?token=... or ?box=... or ?serial=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('box') || params.get('serial') || params.get('id');

    loadTokenSession(token);
  }, []);

  const loadTokenSession = async (token?: string | null) => {
    setSessionLoading(true);

    const cleanToken = token?.trim() || null;

    // STRICT REQUIREMENT:
    // When a customer opens the main website URL without a private customer token,
    // display the MAIN BOX SELECTION PAGE instead of the "THIS LINK HAS ALREADY BEEN USED" screen.
    // Do not treat the main website URL as an expired private link.
    if (!cleanToken) {
      setIsReopenedUsedLink(false);
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

      // If a private customer link has already been opened, display "THIS LINK HAS ALREADY BEEN USED."
      if (data.opened || data.used || data.alreadyUsed) {
        setIsReopenedUsedLink(true);
      } else {
        setIsReopenedUsedLink(false);
      }
    } catch (err: unknown) {
      console.error('Error loading customer session:', err);
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

  return (
    <div className="min-h-screen bg-[#050507] text-neutral-100 flex flex-col justify-between font-sans selection:bg-amber-400/30 selection:text-amber-200">
      {/* Brand Header */}
      <header className="pt-8 pb-3 text-center">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-widest font-cinzel text-gold-gradient uppercase">
          SUPER SURPRISE BOX
        </h1>
      </header>

      {/* Main Experience Container */}
      <main className="flex-1 flex flex-col items-center justify-start px-3 sm:px-6 py-3 max-w-[1440px] w-full mx-auto">
        {sessionLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 my-auto">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-neutral-400 font-cinzel tracking-wider">
              Loading Super Surprise Box...
            </span>
          </div>
        ) : isReopenedUsedLink && customerSession ? (
          // 1. RE-OPENED / REFRESHED USED PRIVATE LINK: STRICTLY DISPLAY "THIS LINK HAS ALREADY BEEN USED."
          <div className="w-full my-auto animate-fade-in">
            <LinkAlreadyUsed
              serial={customerSession.assignedBox || 'Recorded Box'}
              openedAt={customerSession.openedAt}
              result={customerSession.result}
              claimCode={customerSession.claimCode}
            />
          </div>
        ) : activeResult ? (
          // 2. IMMEDIATE REVEAL UPON OPENING (WINNER OR NON-WINNER)
          <div className="w-full my-auto animate-fade-in">
            {activeResult.result === 'WINNER' ? (
              <WinningResult
                serial={activeResult.boxSerial}
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

      {/* Quiet minimal footer */}
      <footer className="py-6 text-center text-[11px] text-neutral-600 font-cinzel">
        SUPER SURPRISE BOX · BATCH 1 (15,051 BOXES)
      </footer>
    </div>
  );
}
