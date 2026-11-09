import React, { useState, useEffect, useCallback, useTransition, useRef, useMemo } from 'react';
import { SurpriseBox3D } from './SurpriseBox3D';
import { AvailableBox, AvailableBoxesResponse, PublicPrize } from '../types/box';
import { getOrCreateCustomerClientId } from '../utils/customerStore';
import {
  Search,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Package,
  Trophy,
  Users,
  CheckCircle2,
  Smartphone,
  Banknote,
} from 'lucide-react';

interface AvailableBoxGridProps {
  token: string;
  onBoxClaimed: (serial: string, newToken?: string) => void;
}

const BOXES_PER_PAGE = 25000;

function getVirtualGridConfig(width: number) {
  if (width >= 1536) return { cols: 12, cardH: 142, gap: 8, rowH: 150 };
  if (width >= 1280) return { cols: 10, cardH: 142, gap: 8, rowH: 150 };
  if (width >= 1024) return { cols: 8, cardH: 142, gap: 8, rowH: 150 };
  if (width >= 768) return { cols: 6, cardH: 142, gap: 8, rowH: 150 };
  if (width >= 640) return { cols: 4, cardH: 136, gap: 8, rowH: 144 };
  return { cols: 3, cardH: 124, gap: 6, rowH: 130 };
}

function generateFallbackPage(page: number, limit = 25000, search = '', range = 'all', _status = 'all'): AvailableBox[] {
  const items: AvailableBox[] = [];
  let rStart = 1;
  let rEnd = 15051;
  if (range !== 'all') {
    const [s, e] = range.split('-').map(Number);
    if (s && e) {
      rStart = s;
      rEnd = e;
    }
  }

  for (let i = 1; i <= 15051; i++) {
    if (i < rStart || i > rEnd) continue;
    const serial = `SS${i.toString().padStart(8, '0')}`;
    if (search && !serial.includes(search.toUpperCase()) && !i.toString().includes(search.replace(/\D/g, ''))) {
      continue;
    }
    items.push({
      id: i,
      serial,
      status: 'AVAILABLE',
    });
  }

  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
}

export const AvailableBoxGrid: React.FC<AvailableBoxGridProps> = ({
  token,
  onBoxClaimed,
}) => {
  const [boxes, setBoxes] = useState<AvailableBox[]>([]);
  const [totalInventory, setTotalInventory] = useState<number>(15051);
  const [totalAvailable, setTotalAvailable] = useState<number>(15051);
  const [, setTotalFilteredCount] = useState<number>(15051);
  const [openedCount, setOpenedCount] = useState<number>(0);
  const [claimedCount, setClaimedCount] = useState<number>(0);
  const [purchasesCompleted, setPurchasesCompleted] = useState<number>(0);
  const [, setReservedCount] = useState<number>(0);
  const [, setReservedWinningCount] = useState<number>(0);
  const [, setHiddenCount] = useState<number>(0);
  const [, setTotalUnavailableCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [, setTotalPages] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeRange, setActiveRange] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [publicPrizes, setPublicPrizes] = useState<PublicPrize[]>([]);
  const [showcaseHidden, setShowcaseHidden] = useState<boolean>(false);
  const [showPrizesSection, setShowPrizesSection] = useState<boolean>(true);
  const [prizeSearch, setPrizeSearch] = useState<string>('');
  const [claimingSerial, setClaimingSerial] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inFlightAbortRef = useRef<AbortController | null>(null);

  // Virtual scrolling states
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const [visibleRange, setVisibleRange] = useState<{ startRow: number; endRow: number }>({
    startRow: 0,
    endRow: 20,
  });

  const gridRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  // Filter out any CLAIMED or OPENED boxes so only AVAILABLE boxes are shown
  const availableBoxes = useMemo(() => {
    return boxes.filter((box) => box.status !== 'CLAIMED' && box.status !== 'OPENED');
  }, [boxes]);

  const config = getVirtualGridConfig(windowWidth);
  const totalItems = availableBoxes.length;
  const totalRows = Math.ceil(totalItems / config.cols);
  const totalHeight = totalRows * config.rowH;

  const updateVirtualWindow = useCallback(() => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const vHeight = window.innerHeight;
    const wWidth = window.innerWidth;
    const currentConfig = getVirtualGridConfig(wWidth);

    const currentTotalRows = Math.ceil(availableBoxes.length / currentConfig.cols);

    // Scrolled distance into the grid container
    const offset = Math.max(0, -rect.top);

    // Viewport buffers: 4 rows above, 6 rows below
    const bufferAbovePx = 4 * currentConfig.rowH;
    const bufferBelowPx = 6 * currentConfig.rowH;

    const newStartRow = Math.max(0, Math.floor((offset - bufferAbovePx) / currentConfig.rowH));
    const newEndRow = Math.min(
      currentTotalRows,
      Math.ceil((offset + vHeight + bufferBelowPx) / currentConfig.rowH)
    );

    setWindowWidth(wWidth);
    setVisibleRange((prev) => {
      if (prev.startRow === newStartRow && prev.endRow === newEndRow) {
        return prev;
      }
      return { startRow: newStartRow, endRow: newEndRow };
    });
  }, [availableBoxes.length]);

  useEffect(() => {
    const onScrollOrResize = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        updateVirtualWindow();
      });
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    updateVirtualWindow();

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [updateVirtualWindow]);

  useEffect(() => {
    updateVirtualWindow();
  }, [availableBoxes.length, updateVirtualWindow]);

  const fetchAvailableBoxes = useCallback(
    async (page = 1, search = '', range = 'all', status = 'all', isSilentSync = false) => {
      if (!isSilentSync) {
        setLoading(true);
      }
      setClaimError(null);

      if (inFlightAbortRef.current) {
        inFlightAbortRef.current.abort();
      }
      const controller = new AbortController();
      inFlightAbortRef.current = controller;

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', BOXES_PER_PAGE.toString());
      params.set('status', status);

      if (search.trim()) {
        params.set('search', search.trim());
      }

      if (range !== 'all') {
        const [rStart, rEnd] = range.split('-').map(Number);
        if (rStart && rEnd) {
          params.set('rangeStart', rStart.toString());
          params.set('rangeEnd', rEnd.toString());
        }
      }

      // Resilient fetch with up to 2 retries
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (controller.signal.aborted) return;
        try {
          const res = await fetch(`/api/boxes/available?${params.toString()}`, {
            signal: controller.signal,
          });
          if (res.ok) {
            const data: AvailableBoxesResponse = await res.json();
            setBoxes(data.boxes);
            if (data.totalInventory !== undefined) setTotalInventory(data.totalInventory);
            else if (data.totalBatchBoxes !== undefined) setTotalInventory(data.totalBatchBoxes);
            setTotalAvailable(data.totalAvailable);
            setTotalFilteredCount(data.totalBoxesCount || data.totalAvailable);
            setTotalPages(data.totalPages);
            setCurrentPage(data.page);
            if (data.openedCount !== undefined) setOpenedCount(data.openedCount);
            if (data.claimedCount !== undefined) setClaimedCount(data.claimedCount);
            if (data.purchasesCompleted !== undefined) setPurchasesCompleted(data.purchasesCompleted);
            if (data.reservedCount !== undefined) setReservedCount(data.reservedCount);
            if (data.reservedWinningCount !== undefined) setReservedWinningCount(data.reservedWinningCount);
            if (data.hiddenCount !== undefined) setHiddenCount(data.hiddenCount);
            if (data.totalUnavailable !== undefined) setTotalUnavailableCount(data.totalUnavailable);
            setDbError(null);
            setLoading(false);
            return;
          } else {
            const errData = await res.json().catch(() => ({}));
            lastErr = new Error(errData.error || 'Server returned non-200');
          }
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') {
            return;
          }
          lastErr = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
      }

      console.warn('Network sync notice, preserving client inventory view:', lastErr);
      setBoxes((prev) => {
        if (prev && prev.length > 0) return prev;
        return generateFallbackPage(page, BOXES_PER_PAGE, search, range, status);
      });
      setDbError(null);
      setLoading(false);
    },
    []
  );

  const fetchPublicPrizes = useCallback(async () => {
    try {
      const res = await fetch('/api/prizes');
      if (res.ok) {
        const data = await res.json();
        setShowcaseHidden(!!data.showcaseHidden);
        if (Array.isArray(data.prizes)) {
          setPublicPrizes(data.prizes);
        }
      }
    } catch (err) {
      console.error('Failed to load public winning prizes:', err);
    }
  }, []);

  // Initial load & dependency update
  useEffect(() => {
    fetchAvailableBoxes(currentPage, searchQuery, activeRange, statusFilter, false);
    fetchPublicPrizes();
  }, [fetchAvailableBoxes, fetchPublicPrizes, currentPage, searchQuery, activeRange, statusFilter]);

  // Periodic automatic sync for shared global availability (every 5s when tab is active)
  useEffect(() => {
    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        fetchAvailableBoxes(currentPage, searchQuery, activeRange, statusFilter, true);
        fetchPublicPrizes();
      }
    };

    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    const interval = setInterval(handleSync, 5000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [fetchAvailableBoxes, fetchPublicPrizes, currentPage, searchQuery, activeRange, statusFilter]);

  // Handle Box Claim
  const handleSelectBox = async (serial: string) => {
    if (claimingSerial) return;
    setClaimError(null);
    setClaimingSerial(serial);

    try {
      const clientId = getOrCreateCustomerClientId();
      const res = await fetch('/api/boxes/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-client-id': clientId,
        },
        body: JSON.stringify({ token, boxSerial: serial, clientId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setClaimError(data.error || 'Failed to claim box. Please choose another.');
        setClaimingSerial(null);
        return;
      }

      // Dynamically remove claimed box immediately upon confirmation
      setBoxes((prev) => prev.filter((b) => b.serial !== serial));
      setTotalAvailable((prev) => Math.max(0, prev - 1));
      setTotalFilteredCount((prev) => Math.max(0, prev - 1));
      setClaimedCount((prev) => prev + 1);

      // Background sync to update availability
      fetchAvailableBoxes(currentPage, searchQuery, activeRange, statusFilter, true);

      onBoxClaimed(serial, data.token || token);
    } catch (err: unknown) {
      console.error(err);
      setClaimError('Network issue. Please try again.');
      setClaimingSerial(null);
    }
  };

  const filteredPublicPrizes = publicPrizes.filter((p) => {
    if (!prizeSearch.trim()) return true;
    const query = prizeSearch.trim().toUpperCase();
    return (
      p.serial.toUpperCase().includes(query) ||
      p.prizeName.toUpperCase().includes(query) ||
      (p.customNote && p.customNote.toUpperCase().includes(query))
    );
  });

  const startIndex = Math.min(totalItems, visibleRange.startRow * config.cols);
  const endIndex = Math.min(totalItems, visibleRange.endRow * config.cols);
  const visibleBoxes = availableBoxes.slice(startIndex, endIndex);
  const offsetY = visibleRange.startRow * config.rowH;

  return (
    <div className="w-full flex flex-col gap-4 sm:gap-6 overflow-x-hidden">
      {/* =========================================================================
          1. CINEMATIC BLACK-AND-GOLD HERO SECTION
         ========================================================================= */}
      <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-500/40 bg-[#07070b] shadow-[0_20px_60px_rgba(0,0,0,0.95)]">
        {/* Ambient Golden Glows & Lighting */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Hero Banner Visual: Fully Visible, Responsive, Lazy-Loaded */}
        <div className="w-full relative select-none">
          <img
            src="/assets/hero-banner-art.png"
            alt="Super Surprise Box promotion featuring stylish women, glowing mystery gift box, iPhones, and cash prizes"
            loading="lazy"
            decoding="async"
            className="w-full h-auto min-h-[170px] sm:min-h-[220px] md:min-h-[280px] lg:min-h-[320px] max-h-[460px] object-cover object-center block"
          />
        </div>
      </div>

      {/* =========================================================================
          2. FOUR PREMIUM STATISTICS CARDS (FULLY VISIBLE WITH AMPLE BREATHING ROOM)
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full mt-4 sm:mt-6">
        {/* Card 1: TOTAL INVENTORY */}
        <div className="bg-[#0c0c11]/95 border border-amber-500/40 hover:border-amber-400/80 rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.7)] backdrop-blur-sm group min-h-[96px] h-full">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500/25 via-yellow-400/20 to-amber-300/10 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)] group-hover:scale-105 transition-transform shrink-0">
            <Package className="w-6 h-6 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-cinzel font-semibold tracking-wider text-neutral-400 uppercase block truncate">
              TOTAL INVENTORY
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-white tracking-tight block">
              {totalInventory.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 2: AVAILABLE */}
        <div className="bg-[#0c0c11]/95 border border-emerald-500/40 hover:border-emerald-400/80 rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.7)] backdrop-blur-sm group min-h-[96px] h-full">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500/25 to-green-400/10 border border-emerald-400/50 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] group-hover:scale-105 transition-transform shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-cinzel font-semibold tracking-wider text-emerald-400/90 uppercase block truncate">
              AVAILABLE
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-emerald-400 tracking-tight block">
              {totalAvailable.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 3: PURCHASES COMPLETED */}
        <div
          onClick={() => setShowPrizesSection((prev) => !prev)}
          className="bg-[#0c0c11]/95 border border-amber-500/40 hover:border-amber-400/80 rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.7)] backdrop-blur-sm group min-h-[96px] h-full cursor-pointer"
          title="Click to view/toggle official winning prizes showcase"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500/25 via-yellow-400/20 to-amber-300/10 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-transform shrink-0">
            <Trophy className="w-6 h-6 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-cinzel font-semibold tracking-wider text-amber-400/90 uppercase block truncate">
              PURCHASES COMPLETED
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-amber-300 tracking-tight block">
              {purchasesCompleted.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 4: CUSTOMER CLAIMS */}
        <div className="bg-[#0c0c11]/95 border border-cyan-500/40 hover:border-cyan-400/80 rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.7)] backdrop-blur-sm group min-h-[96px] h-full">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500/25 to-blue-400/10 border border-cyan-400/50 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)] group-hover:scale-105 transition-transform shrink-0">
            <Users className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-cinzel font-semibold tracking-wider text-cyan-400/90 uppercase block truncate">
              CUSTOMER CLAIMS
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-cyan-300 tracking-tight block">
              {claimedCount + openedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Caption below the hero */}
      <div className="text-center py-1 select-none">
        <p className="text-xs sm:text-sm font-cinzel font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 uppercase drop-shadow-[0_2px_10px_rgba(245,158,11,0.2)]">
          🎁 YOUR SURPRISE. YOUR MOMENT. YOUR REWARD. ✨
        </p>
      </div>

      {/* Claim Error Banner */}
      {claimError && (
        <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/60 text-red-200 text-xs flex items-center justify-between gap-3 max-w-xl mx-auto">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{claimError}</span>
          </div>
          <button
            onClick={() => setClaimError(null)}
            className="text-red-400 hover:text-red-200 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* =========================================================================
          OFFICIAL WINNING PRIZES SHOWCASE (ACTIVE VISIBLE PRIZES)
         ========================================================================= */}
      {!showcaseHidden && showPrizesSection && publicPrizes.length > 0 && (
        <section
          id="public-winning-prizes"
          className="w-full bg-[#09090e]/95 border border-amber-500/30 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-md space-y-4 animate-in fade-in duration-300"
        >
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)] shrink-0">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold font-cinzel text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <span>OFFICIAL WINNING PRIZES SHOWCASE</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-mono-numbers font-semibold">
                    {filteredPublicPrizes.length} Active Cards
                  </span>
                </h2>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Verified flagship iPhones and guaranteed high-value cash prizes distributed across Batch 1
                </p>
              </div>
            </div>

            {/* Prize Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search prizes or serial..."
                value={prizeSearch}
                onChange={(e) => setPrizeSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono-numbers"
              />
              {prizeSearch && (
                <button
                  onClick={() => setPrizeSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Responsive Prize Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredPublicPrizes.map((p) => {
              const isIPhone = p.prizeName.toLowerCase().includes('iphone');
              return (
                <div
                  key={p.serial}
                  className="bg-[#0e0e14] border border-amber-500/30 hover:border-amber-400/70 rounded-xl p-3 flex flex-col justify-between transition-all duration-200 shadow-md hover:shadow-amber-500/10 group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <div className="flex items-center gap-1.5">
                        {isIPhone ? (
                          <Smartphone className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        ) : (
                          <Banknote className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span className="text-[10px] font-mono-numbers font-bold text-amber-300">
                          {p.serial}
                        </span>
                      </div>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/60 border border-neutral-800 text-neutral-400 font-cinzel">
                        {isIPhone ? 'iPhone' : 'Cash'}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-gold-bright font-cinzel leading-tight mb-1">
                      {p.prizeName}
                    </div>
                    {p.customNote && (
                      <div className="text-[10px] text-neutral-400 italic mb-2 line-clamp-1">
                        "{p.customNote}"
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t border-neutral-800/80 mt-2 flex items-center justify-between text-[9.5px]">
                    <span className="text-neutral-500 font-cinzel">Status:</span>
                    <span
                      className={
                        p.isOpened
                          ? 'text-purple-300 font-semibold'
                          : p.isClaimed
                          ? 'text-blue-300 font-semibold'
                          : 'text-emerald-400 font-semibold'
                      }
                    >
                      {p.isOpened ? 'Opened' : p.isClaimed ? 'Claimed' : 'Available'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =========================================================================
          3. BOX SEARCH AND FILTER BAR
         ========================================================================= */}
      <div className="bg-[#0c0c11] border border-neutral-800 p-2.5 sm:p-3.5 rounded-2xl flex flex-col xl:flex-row items-center justify-between gap-3 shadow-xl">
        {/* Search Input */}
        <div className="relative w-full xl:w-72 shrink-0">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Serial (e.g. SS00000001)..."
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              startTransition(() => {
                setSearchQuery(val);
                setCurrentPage(1);
              });
            }}
            className="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono-numbers"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status & Range Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full xl:w-auto py-1 text-xs">
          {/* Status View: All vs Available Only */}
          <div className="flex items-center rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 mr-1 shrink-0">
            <button
              onClick={() => {
                setStatusFilter('all');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-amber-400 text-black font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Inventory ({totalInventory.toLocaleString()})
            </button>
            <button
              onClick={() => {
                setStatusFilter('available');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                statusFilter === 'available'
                  ? 'bg-amber-400 text-black font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Available Only ({totalAvailable.toLocaleString()})
            </button>
          </div>

          {/* Range Buttons */}
          {[
            { label: 'All Ranges', value: 'all' },
            { label: '1 - 3,000', value: '1-3000' },
            { label: '3,001 - 6,000', value: '3001-6000' },
            { label: '6,001 - 9,000', value: '6001-9000' },
            { label: '9,001 - 12,000', value: '9001-12000' },
            { label: '12,001 - 15,051', value: '12001-15051' },
          ].map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setActiveRange(r.value);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1.5 rounded-lg font-mono-numbers whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeRange === r.value
                  ? 'bg-amber-400 text-black font-bold shadow-md'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}

          {/* Refresh Sync Button */}
          <button
            onClick={() => fetchAvailableBoxes(currentPage, searchQuery, activeRange, statusFilter)}
            title="Refresh availability from backend"
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-amber-300 transition-colors shrink-0 ml-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* AVAILABLE BOXES INVENTORY BAR (SINGLE PAGE) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-[#0a0a0e] border border-neutral-800/80 px-3.5 py-2.5 rounded-xl text-xs">
        <div className="text-neutral-400 font-mono-numbers flex items-center gap-2">
          <span>
            Showing All <strong className="text-emerald-400 font-bold">{availableBoxes.length.toLocaleString()}</strong> Available Boxes
          </span>
          <span className="text-neutral-600">·</span>
          <span className="text-amber-400/90 font-medium">Single Page Grid</span>
        </div>
        <div className="text-neutral-400 font-mono-numbers text-[11px]">
          Total Available: <strong className="text-white font-bold">{totalAvailable.toLocaleString()}</strong> of {totalInventory.toLocaleString()}
        </div>
      </div>

      {/* =========================================================================
          4. VIRTUALIZED COMPACT RESPONSIVE BOX GRID
         ========================================================================= */}
      {dbError && availableBoxes.length === 0 ? (
        <div className="py-16 text-center bg-red-950/20 border border-red-500/40 rounded-2xl p-6 max-w-lg mx-auto space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <h3 className="text-sm font-bold text-red-200 uppercase font-cinzel">Database Connection Error</h3>
          <p className="text-xs text-neutral-300">{dbError}</p>
          <button
            onClick={() => fetchAvailableBoxes(currentPage, searchQuery, activeRange, statusFilter)}
            className="px-4 py-2 rounded-lg bg-red-900/60 hover:bg-red-800 border border-red-500/50 text-xs text-white font-cinzel font-semibold"
          >
            Retry Loading Inventory
          </button>
        </div>
      ) : loading && availableBoxes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-neutral-400 font-cinzel">Loading Available Surprise Boxes...</span>
        </div>
      ) : availableBoxes.length === 0 ? (
        <div className="py-16 text-center bg-neutral-950/40 border border-neutral-800 rounded-2xl p-6">
          <p className="text-sm text-neutral-300 mb-2">No available boxes match your search.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveRange('all');
              setCurrentPage(1);
            }}
            className="px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-amber-300 hover:text-white"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="relative w-full"
          style={{ height: `${totalHeight}px` }}
        >
          <div
            style={{
              transform: `translate3d(0, ${offsetY}px, 0)`,
              gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
              rowGap: `${config.gap}px`,
              columnGap: `${config.gap}px`,
            }}
            className="grid w-full"
          >
            {visibleBoxes.map((box) => {
              const isBeingClaimed = claimingSerial === box.serial;
              const isAvailable = !box.status || box.status === 'AVAILABLE';

              return (
                <div
                  key={box.serial}
                  className={`bg-neutral-950/80 border rounded-xl p-1 sm:p-1.5 flex flex-col items-center justify-between transition-all duration-200 shadow-sm ${
                    isAvailable
                      ? 'border-neutral-800/90 hover:border-amber-400/60 hover:bg-neutral-900/90 hover:shadow-amber-500/10 group cursor-pointer'
                      : 'border-neutral-800/40 bg-neutral-950/40 opacity-70'
                  }`}
                  style={{ height: `${config.cardH}px` }}
                >
                  {/* Scaled-down 3D Surprise Box */}
                  <div className="w-full flex justify-center py-0.5">
                    <SurpriseBox3D
                      serial={box.serial}
                      size="sm"
                      disabled={!isAvailable || isBeingClaimed}
                      onClick={() => isAvailable && handleSelectBox(box.serial)}
                    />
                  </div>

                  {/* Readable Serial Number */}
                  <span
                    className={`text-[9.5px] sm:text-[10.5px] font-mono-numbers font-bold tracking-wider my-0.5 ${
                      isAvailable ? 'text-amber-300 group-hover:text-amber-200' : 'text-neutral-500'
                    }`}
                  >
                    {box.serial}
                  </span>

                  {/* Status-Aware Action Button */}
                  {isAvailable ? (
                    <button
                      onClick={() => handleSelectBox(box.serial)}
                      disabled={isBeingClaimed}
                      className="w-full py-1 px-1 rounded bg-gradient-to-r from-amber-400 via-amber-300 to-[#d4af37] hover:from-amber-300 hover:to-amber-400 text-black font-cinzel font-bold text-[8.5px] sm:text-[9.5px] uppercase tracking-wider transition-all shadow-sm hover:shadow-amber-500/30 flex items-center justify-center whitespace-nowrap active:scale-95 cursor-pointer"
                    >
                      {isBeingClaimed ? (
                        <div className="w-2.5 h-2.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>CHOOSE BOX</span>
                      )}
                    </button>
                  ) : (
                    <div className="w-full py-1 px-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-cinzel font-semibold text-[8px] sm:text-[9px] uppercase tracking-wider flex items-center justify-center select-none">
                      <span>OPENED</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
