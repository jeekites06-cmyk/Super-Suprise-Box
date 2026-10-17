import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { SurpriseBox3D } from './SurpriseBox3D';
import { AvailableBox, AvailableBoxesResponse } from '../types/box';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface AvailableBoxGridProps {
  token: string;
  onBoxClaimed: (serial: string, newToken?: string) => void;
}

const BOXES_PER_PAGE = 300;

export const AvailableBoxGrid: React.FC<AvailableBoxGridProps> = ({
  token,
  onBoxClaimed,
}) => {
  const [boxes, setBoxes] = useState<AvailableBox[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number>(15046);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeRange, setActiveRange] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [claimingSerial, setClaimingSerial] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');
  const [, startTransition] = useTransition();

  const fetchAvailableBoxes = useCallback(
    async (page = 1, search = '', range = 'all') => {
      setLoading(true);
      setClaimError(null);

      try {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('limit', BOXES_PER_PAGE.toString()); // Exactly 300 boxes per page

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

        const res = await fetch(`/api/boxes/available?${params.toString()}`);
        if (res.ok) {
          const data: AvailableBoxesResponse = await res.json();
          setBoxes(data.boxes);
          setTotalAvailable(data.totalAvailable);
          setTotalPages(data.totalPages);
          setCurrentPage(data.page);
        }
      } catch (err) {
        console.error('Failed to fetch available boxes:', err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial load & dependency update
  useEffect(() => {
    fetchAvailableBoxes(currentPage, searchQuery, activeRange);
  }, [fetchAvailableBoxes, currentPage, searchQuery, activeRange]);

  // Periodic automatic sync for shared global availability (every 4s + window focus)
  useEffect(() => {
    const handleSync = () => {
      fetchAvailableBoxes(currentPage, searchQuery, activeRange);
    };

    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    const interval = setInterval(handleSync, 4000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [fetchAvailableBoxes, currentPage, searchQuery, activeRange]);

  // Handle Box Claim
  const handleSelectBox = async (serial: string) => {
    if (claimingSerial) return;
    setClaimError(null);
    setClaimingSerial(serial);

    try {
      const res = await fetch('/api/boxes/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, boxSerial: serial }),
      });

      const data = await res.json();

      if (!res.ok) {
        setClaimError(data.error || 'Failed to claim box. Please choose another.');
        setClaimingSerial(null);
        fetchAvailableBoxes(currentPage, searchQuery, activeRange);
        return;
      }

      onBoxClaimed(serial, data.token || token);
    } catch (err: unknown) {
      console.error(err);
      setClaimError('Network issue. Please try again.');
      setClaimingSerial(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    const target = Math.max(1, Math.min(totalPages, newPage));
    setCurrentPage(target);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      handlePageChange(p);
      setJumpPageInput('');
    }
  };

  // Generate numbered pagination buttons
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtons = 5;

    if (totalPages <= maxButtons + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        start = 2;
        end = 4;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="w-full flex flex-col gap-3 sm:gap-4">
      {/* Header Info */}
      <div className="text-center max-w-xl mx-auto space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-widest font-cinzel">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Batch 1 Inventory</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-numbers">{totalAvailable.toLocaleString()} Available</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-cinzel text-white">
          Choose Your Surprise Box
        </h2>
        <p className="text-xs text-neutral-400">
          Showing <span className="text-amber-300 font-mono-numbers font-semibold">300 boxes</span> per page. Click any box to claim it and open your surprise.
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

      {/* Search & Range Toolbar */}
      <div className="bg-[#0c0c11] border border-neutral-800 p-2.5 sm:p-3.5 rounded-2xl flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Serial (e.g. 500 or SS00000500)..."
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              startTransition(() => {
                setSearchQuery(val);
                setCurrentPage(1);
              });
            }}
            className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono-numbers"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Range Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto py-1 text-xs">
          {[
            { label: 'All', value: 'all' },
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
              className={`px-2.5 py-1.5 rounded-lg font-mono-numbers whitespace-nowrap shrink-0 transition-colors ${
                activeRange === r.value
                  ? 'bg-amber-400 text-black font-bold shadow-md'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}

          {/* Sync Button */}
          <button
            onClick={() => fetchAvailableBoxes(currentPage, searchQuery, activeRange)}
            title="Refresh availability"
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-amber-300 transition-colors shrink-0 ml-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* TOP PAGINATION CONTROLS BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-[#0a0a0e] border border-neutral-800/80 px-3.5 py-2 rounded-xl text-xs">
        <div className="text-neutral-400 font-mono-numbers flex items-center gap-2">
          <span>
            Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
          </span>
          <span className="text-neutral-600">·</span>
          <span className="text-amber-400/90 font-medium">{boxes.length} boxes on page</span>
        </div>

        {/* Page Nav Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            disabled={currentPage <= 1 || loading}
            onClick={() => handlePageChange(currentPage - 1)}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          {/* Numbered Page Buttons */}
          <div className="hidden md:flex items-center gap-1">
            {getPageNumbers().map((p, idx) =>
              p === '...' ? (
                <span key={`dots-${idx}`} className="px-1 text-neutral-600">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => handlePageChange(Number(p))}
                  className={`w-6.5 h-6.5 rounded-md font-mono-numbers text-xs font-semibold transition-colors ${
                    currentPage === p
                      ? 'bg-amber-400 text-black shadow-sm'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>

          <button
            disabled={currentPage >= totalPages || loading}
            onClick={() => handlePageChange(currentPage + 1)}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Jump to page form */}
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

      {/* --- COMPACT RESPONSIVE 300-BOX GRID --- */}
      {loading && boxes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-neutral-400 font-cinzel">Loading 300 Surprise Boxes...</span>
        </div>
      ) : boxes.length === 0 ? (
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-2">
          {boxes.map((box) => {
            const isBeingClaimed = claimingSerial === box.serial;

            return (
              <div
                key={box.serial}
                className="bg-neutral-950/80 border border-neutral-800/90 hover:border-amber-400/60 hover:bg-neutral-900/90 rounded-xl p-1 sm:p-1.5 flex flex-col items-center justify-between transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-amber-500/10 group"
              >
                {/* Scaled-down 3D Surprise Box */}
                <div className="w-full flex justify-center py-0.5">
                  <SurpriseBox3D
                    serial={box.serial}
                    size="sm"
                    disabled={isBeingClaimed}
                    onClick={() => handleSelectBox(box.serial)}
                  />
                </div>

                {/* Readable Serial Number */}
                <span className="text-[9.5px] sm:text-[10.5px] font-mono-numbers font-bold text-amber-300 tracking-wider group-hover:text-amber-200 transition-colors my-0.5">
                  {box.serial}
                </span>

                {/* Readable CHOOSE BOX Button */}
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
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-[#0a0a0e] border border-neutral-800/80 px-3.5 py-2.5 rounded-xl text-xs mt-1.5">
          <div className="text-neutral-400 font-mono-numbers">
            Page {currentPage} of {totalPages} · Showing 300 boxes/page ({totalAvailable.toLocaleString()} remaining)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1 || loading}
              onClick={() => handlePageChange(currentPage - 1)}
              className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {/* Numbered Page Buttons for bottom */}
            <div className="hidden md:flex items-center gap-1">
              {getPageNumbers().map((p, idx) =>
                p === '...' ? (
                  <span key={`dots-b-${idx}`} className="px-1 text-neutral-600">
                    ...
                  </span>
                ) : (
                  <button
                    key={`b-${p}`}
                    onClick={() => handlePageChange(Number(p))}
                    className={`w-6.5 h-6.5 rounded-md font-mono-numbers text-xs font-semibold transition-colors ${
                      currentPage === p
                        ? 'bg-amber-400 text-black shadow-sm'
                        : 'bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            <button
              disabled={currentPage >= totalPages || loading}
              onClick={() => handlePageChange(currentPage + 1)}
              className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
