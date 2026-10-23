import React from 'react';

interface SurpriseBox3DProps {
  serial: string;
  size?: 'sm' | 'md' | 'lg';
  isOpening?: boolean;
  isOpen?: boolean;
  isAssigned?: boolean;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export const SurpriseBox3D: React.FC<SurpriseBox3DProps> = ({
  serial,
  size = 'md',
  isOpening = false,
  isOpen = false,
  isAssigned = false,
  onClick,
  className = '',
  disabled = false,
}) => {
  const isSmall = size === 'sm';

  const sizeClasses = {
    sm: 'w-14 h-16 sm:w-16 sm:h-18 md:w-18 md:h-20',
    md: 'w-36 h-42 sm:w-44 sm:h-50',
    lg: 'w-64 h-76 sm:w-80 sm:h-92',
  }[size];

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={!disabled ? onClick : undefined}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`group relative flex flex-col items-center justify-center cursor-pointer select-none outline-none perspective-1000 ${sizeClasses} ${
        disabled ? 'cursor-not-allowed opacity-80' : ''
      } ${className}`}
    >
      {/* --- REFINED GOLDEN AMBIENT FLOOR REFLECTION & GLOW --- */}
      <div
        className={`absolute ${
          isSmall ? '-bottom-1.5 w-[85%] h-4 blur-sm' : '-bottom-5 w-[85%] h-10 blur-xl'
        } rounded-full transition-all duration-700 pointer-events-none ${
          isOpening || isOpen
            ? 'bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 opacity-90 scale-125 shadow-[0_0_25px_rgba(255,215,0,0.6)]'
            : 'bg-gradient-to-r from-amber-600/30 via-yellow-500/40 to-amber-600/30 opacity-70 group-hover:opacity-95 group-hover:scale-110 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
        }`}
      />

      {/* Floating subtle golden particles (only on larger views) */}
      {!isSmall && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-amber-300/90 blur-[0.5px] animate-pulse shadow-[0_0_6px_rgba(255,215,0,0.8)]" />
          <span
            className="absolute top-8 right-3 w-2 h-2 rounded-full bg-yellow-200/90 blur-[0.5px] animate-ping shadow-[0_0_8px_rgba(255,235,150,0.9)]"
            style={{ animationDuration: '3s' }}
          />
          <span
            className="absolute bottom-10 left-3 w-1.5 h-1.5 rounded-full bg-amber-400/80 blur-[0.5px] animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.7)]"
            style={{ animationDelay: '1s' }}
          />
          <span
            className="absolute bottom-6 right-5 w-2 h-2 rounded-full bg-yellow-300/85 blur-[0.5px] animate-pulse shadow-[0_0_6px_rgba(255,215,0,0.8)]"
            style={{ animationDelay: '1.5s' }}
          />
        </div>
      )}

      {/* Main 3D Box Assembly */}
      <div
        className={`relative w-full h-full flex flex-col items-center justify-end preserve-3d transition-transform duration-300 ease-out ${
          !disabled && !isOpen ? 'group-hover:-translate-y-1.5 group-hover:scale-[1.04]' : ''
        }`}
      >
        {/* Golden light rays erupting from inside when opening/open */}
        {(isOpening || isOpen) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <div
              className="w-56 h-56 md:w-80 md:h-80 rounded-full bg-[radial-gradient(circle,rgba(255,225,120,0.75)_0%,rgba(212,175,55,0.45)_35%,rgba(160,115,20,0.2)_60%,transparent_80%)] blur-2xl animate-spin"
              style={{ animationDuration: '8s' }}
            />
          </div>
        )}

        {/* =========================================================================
            --- 3D BOX LID ASSEMBLY (LUXURY BLACK & METALLIC GOLD) ---
           ========================================================================= */}
        <div
          className={`relative z-20 w-[94%] h-[27%] transition-all duration-1000 ease-out ${
            isOpen || isOpening
              ? '-translate-y-28 rotate-[-22deg] opacity-0 scale-90 pointer-events-none'
              : 'translate-y-0.5'
          }`}
        >
          {/* --- OPULENT 24K METALLIC GOLD BOW --- */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-30 flex items-center justify-center ${
              isSmall ? '-top-4 sm:-top-5 scale-[0.65]' : '-top-10 md:-top-13'
            }`}
          >
            {/* Background Ribbon Tails in Burnished Gold */}
            <div className="absolute top-5 -left-4 w-4 h-8 bg-gradient-to-b from-[#ffd700] via-[#c59b27] to-[#7a550f] rotate-[35deg] rounded-b-md shadow-md border-r border-[#ffeaa0]/50" />
            <div className="absolute top-5 -right-4 w-4 h-8 bg-gradient-to-b from-[#ffd700] via-[#c59b27] to-[#7a550f] -rotate-[35deg] rounded-b-md shadow-md border-l border-[#ffeaa0]/50" />

            {/* Rear Loop 1: Rich Sculpted Gold Loop */}
            <div className="absolute -top-2 -left-6 w-7 h-10 bg-gradient-to-tr from-[#7c5612] via-[#d4af37] to-[#fff6b8] rounded-full -rotate-[60deg] shadow-lg border border-[#ffeaa0]/50" />
            {/* Rear Loop 2: Rich Sculpted Gold Loop */}
            <div className="absolute -top-2 -right-6 w-7 h-10 bg-gradient-to-tl from-[#7c5612] via-[#d4af37] to-[#fff6b8] rounded-full rotate-[60deg] shadow-lg border border-[#ffeaa0]/50" />

            {/* Main Front Left Loop: Reflective Satin Gold with High-Gloss Specular Line */}
            <div className="w-7 h-9 bg-gradient-to-br from-[#fff9d2] via-[#e5b839] to-[#8c5e11] rounded-full -rotate-40 shadow-[0_4px_12px_rgba(0,0,0,0.6)] border border-[#ffec99] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#ffd700]/30 to-transparent" />
              <div className="w-1.5 h-full bg-gradient-to-b from-white/70 via-white/30 to-transparent ml-1.5" />
            </div>

            {/* Center Jeweled Gold Knot Brooch */}
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#8a5d10] via-[#ffd700] to-[#fffde8] shadow-[0_0_15px_rgba(255,215,0,0.75)] z-20 -mx-2.5 border-2 border-[#fff7c0] flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-[#1a1a20] via-[#0d0d10] to-[#000000] border border-[#ffd700]/90 shadow-[inset_0_0_4px_rgba(255,215,0,0.6)] flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-[#fff] shadow-[0_0_4px_#fff]" />
              </div>
            </div>

            {/* Main Front Right Loop: Reflective Satin Gold with High-Gloss Specular Line */}
            <div className="w-7 h-9 bg-gradient-to-bl from-[#fff9d2] via-[#e5b839] to-[#8c5e11] rounded-full rotate-40 shadow-[0_4px_12px_rgba(0,0,0,0.6)] border border-[#ffec99] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-l from-[#ffd700]/30 to-transparent" />
              <div className="w-1.5 h-full bg-gradient-to-b from-white/70 via-white/30 to-transparent ml-auto mr-1.5" />
            </div>

            {/* Trailing Gold Satin Ribbons */}
            <div className="absolute top-6 -left-1 w-3 h-5 bg-gradient-to-b from-[#ffd700] to-[#8a5d10] rotate-18 rounded-b-sm border-r border-[#ffeaa0]/70" />
            <div className="absolute top-6 -right-1 w-3 h-5 bg-gradient-to-b from-[#ffd700] to-[#8a5d10] -rotate-18 rounded-b-sm border-l border-[#ffeaa0]/70" />
          </div>

          {/* Lid Box Exterior Body: Premium Matte Obsidian Black */}
          <div className="w-full h-full rounded-t-xl bg-gradient-to-b from-[#222227] via-[#141418] to-[#0a0a0d] border-t-2 border-x-2 border-[#d4af37]/80 shadow-[0_6px_20px_rgba(0,0,0,0.85)] relative overflow-hidden flex items-center justify-center">
            {/* Subtle Metallic Gold Edge Highlight */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,235,160,0.18)_0%,transparent_60%)] pointer-events-none" />

            {/* Subtle Gold Shimmer across Lid on Hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ffd700]/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none" />

            {/* Vertical Metallic Gold Ribbon on Lid */}
            <div
              className={`absolute top-0 bottom-0 ${
                isSmall ? 'w-3 sm:w-4' : 'w-7 md:w-9'
              } bg-gradient-to-r from-[#8a5f12] via-[#ffd700] to-[#aa7a1c] shadow-lg border-x border-[#ffea9f]/80 flex items-center justify-center`}
            >
              <div className="w-1/3 h-full bg-gradient-to-r from-transparent via-white/45 to-transparent" />
            </div>

            {/* Horizontal Metallic Gold Ribbon on Lid Rim */}
            <div
              className={`absolute bottom-0 left-0 right-0 ${
                isSmall ? 'h-1.5' : 'h-3 md:h-4'
              } bg-gradient-to-r from-[#9e7019] via-[#ffd700] to-[#805510] border-t border-[#ffeaa0]/80 shadow-[0_2px_4px_rgba(0,0,0,0.6)]`}
            />
          </div>
        </div>

        {/* =========================================================================
            --- 3D BOX BASE / MAIN BODY (PREMIUM OBSIDIAN BLACK & 24K GOLD) ---
           ========================================================================= */}
        <div className="relative z-10 w-[90%] h-[70%] rounded-b-xl bg-gradient-to-b from-[#1c1c22] via-[#111115] to-[#060608] border-b-2 border-x-2 border-[#d4af37]/75 shadow-[0_12px_28px_rgba(0,0,0,0.95)] overflow-hidden flex items-center justify-center">
          {/* Subtle Realistic Ambient Highlights */}
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,rgba(255,235,160,0.15)_0%,transparent_55%)] pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,rgba(0,0,0,0.75)_0%,transparent_65%)] pointer-events-none" />

          {/* Vertical Metallic Gold Ribbon */}
          <div
            className={`absolute top-0 bottom-0 ${
              isSmall ? 'w-3 sm:w-4' : 'w-7 md:w-9'
            } bg-gradient-to-r from-[#8a5f12] via-[#ffd700] to-[#aa7a1c] shadow-xl border-x border-[#ffea9f]/80 flex items-center justify-center`}
          >
            <div className="w-1/3 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          </div>

          {/* Horizontal Metallic Gold Ribbon */}
          <div
            className={`absolute left-0 right-0 ${
              isSmall ? 'h-2 sm:h-2.5' : 'h-5 md:h-6'
            } bg-gradient-to-b from-[#8a5f12] via-[#ffd700] to-[#aa7a1c] shadow-lg border-y border-[#ffea9f]/80 flex items-center justify-center`}
          >
            <div className="w-full h-0.5 bg-white/50" />
          </div>

          {/* Center Embossed Metallic Gold Plaque with Serial Number (Only on Medium/Large) */}
          {!isSmall ? (
            <div className="relative z-10 px-3 py-1.5 rounded-lg bg-gradient-to-b from-[#1b1b22] via-[#101015] to-[#060608] border-2 border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.5)] flex flex-col items-center">
              <span className="text-[9px] tracking-widest text-[#ffd700] uppercase font-cinzel font-bold">
                SUPER SURPRISE
              </span>
              <span className="text-xs font-mono-numbers font-bold text-white tracking-widest">
                {serial}
              </span>
            </div>
          ) : (
            <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-[#8a5d10] via-[#ffd700] to-[#fffde0] shadow-[0_0_10px_rgba(255,215,0,0.7)] border border-[#ffec99] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-black/80 border border-[#ffd700]/70" />
            </div>
          )}

          {/* Assigned Tag if this box belongs to customer */}
          {isAssigned && (
            <div className="absolute top-1 right-1 z-20">
              <span className="inline-flex items-center px-1 py-0.2 text-[7px] font-bold text-black bg-gradient-to-r from-amber-300 to-yellow-200 rounded-full uppercase tracking-wider font-cinzel shadow-[0_0_8px_rgba(255,215,0,0.6)]">
                ★
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Serial display beneath the box (shown in grid view only if needed) */}
      {!isSmall && (
        <div className="mt-3 text-center">
          <span className="text-xs md:text-sm font-mono-numbers font-bold tracking-widest text-amber-300 group-hover:text-amber-200 transition-colors drop-shadow-[0_0_8px_rgba(255,215,0,0.4)]">
            {serial}
          </span>
        </div>
      )}
    </div>
  );
};

