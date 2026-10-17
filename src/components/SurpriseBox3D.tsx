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
      {/* --- MULTI-COLORED AMBIENT FLOOR REFLECTION & GLOW --- */}
      <div
        className={`absolute ${
          isSmall ? '-bottom-2 w-[85%] h-5 blur-md' : '-bottom-6 w-[85%] h-12 blur-2xl'
        } rounded-full transition-all duration-700 pointer-events-none ${
          isOpening || isOpen
            ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-amber-400 opacity-90 scale-125'
            : 'bg-gradient-to-r from-purple-700/40 via-blue-600/30 to-amber-500/30 group-hover:opacity-80 scale-105'
        }`}
      />

      {/* Floating jewel particles (only on larger views) */}
      {!isSmall && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-emerald-400/80 blur-[0.5px] animate-pulse" />
          <span
            className="absolute top-8 right-3 w-2 h-2 rounded-full bg-purple-400/80 blur-[0.5px] animate-ping"
            style={{ animationDuration: '3s' }}
          />
          <span
            className="absolute bottom-10 left-3 w-1.5 h-1.5 rounded-full bg-rose-400/80 blur-[0.5px] animate-pulse"
            style={{ animationDelay: '1s' }}
          />
          <span
            className="absolute bottom-6 right-5 w-2 h-2 rounded-full bg-sky-400/80 blur-[0.5px] animate-pulse"
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
        {/* Glow rays erupting from inside when opening/open */}
        {(isOpening || isOpen) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <div
              className="w-56 h-56 md:w-80 md:h-80 rounded-full bg-[radial-gradient(circle,rgba(255,215,0,0.6)_0%,rgba(168,85,247,0.4)_35%,rgba(56,189,248,0.3)_60%,transparent_80%)] blur-2xl animate-spin"
              style={{ animationDuration: '8s' }}
            />
          </div>
        )}

        {/* =========================================================================
            --- 3D BOX LID ASSEMBLY ---
           ========================================================================= */}
        <div
          className={`relative z-20 w-[94%] h-[27%] transition-all duration-1000 ease-out ${
            isOpen || isOpening
              ? '-translate-y-28 rotate-[-22deg] opacity-0 scale-90 pointer-events-none'
              : 'translate-y-0.5'
          }`}
        >
          {/* --- OPULENT MULTI-COLORED SHINY BOW --- */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-30 flex items-center justify-center ${
              isSmall ? '-top-5 sm:-top-6 scale-[0.6]' : '-top-10 md:-top-13'
            }`}
          >
            {/* Background Ribbon Tails */}
            <div className="absolute top-5 -left-4 w-4 h-8 bg-gradient-to-b from-rose-600 via-rose-500 to-rose-800 rotate-[35deg] rounded-b-md shadow-lg border border-amber-300/40" />
            <div className="absolute top-5 -right-4 w-4 h-8 bg-gradient-to-b from-emerald-600 via-emerald-500 to-emerald-800 -rotate-[35deg] rounded-b-md shadow-lg border border-amber-300/40" />

            {/* Rear Loop 1: Royal Purple Satin */}
            <div className="absolute -top-2 -left-6 w-7 h-10 bg-gradient-to-tr from-purple-800 via-fuchsia-600 to-purple-400 rounded-full -rotate-[60deg] shadow-lg border border-purple-300/40" />
            {/* Rear Loop 2: Electric Blue Satin */}
            <div className="absolute -top-2 -right-6 w-7 h-10 bg-gradient-to-tl from-blue-800 via-sky-500 to-blue-400 rounded-full rotate-[60deg] shadow-lg border border-sky-300/40" />

            {/* Main Front Left Loop: Metallic Gold & Ruby Red Accent */}
            <div className="w-7 h-9 bg-gradient-to-br from-[#fff7b2] via-[#d4af37] to-[#aa771c] rounded-full -rotate-40 shadow-xl border border-amber-100/70 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-600/30 to-transparent" />
              <div className="w-1 h-full bg-white/40 ml-1.5" />
            </div>

            {/* Center Jeweled Bow Brooch */}
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#996515] via-[#ffd700] to-[#fffde0] shadow-[0_0_15px_rgba(255,215,0,0.8)] z-20 -mx-2.5 border-2 border-white flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-rose-500 via-fuchsia-600 to-purple-900 border border-amber-200 shadow-inner" />
            </div>

            {/* Main Front Right Loop: Emerald Green & Metallic Gold Accent */}
            <div className="w-7 h-9 bg-gradient-to-bl from-[#fff7b2] via-[#d4af37] to-[#aa771c] rounded-full rotate-40 shadow-xl border border-amber-100/70 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-l from-emerald-600/30 to-transparent" />
              <div className="w-1 h-full bg-white/40 ml-auto mr-1.5" />
            </div>

            {/* Trailing Gold Satin Ribbons */}
            <div className="absolute top-6 -left-1 w-3 h-5 bg-gradient-to-b from-[#ffd700] to-[#996515] rotate-18 rounded-b-sm border-r border-amber-200" />
            <div className="absolute top-6 -right-1 w-3 h-5 bg-gradient-to-b from-[#ffd700] to-[#996515] -rotate-18 rounded-b-sm border-l border-amber-200" />
          </div>

          {/* Lid Box Exterior Body */}
          <div className="w-full h-full rounded-t-xl bg-gradient-to-r from-[#2e0854] via-[#120626] to-[#041a35] border-t-2 border-x-2 border-[#d4af37]/60 shadow-[0_6px_20px_rgba(0,0,0,0.8)] relative overflow-hidden flex items-center justify-center">
            {/* Iridescent shimmer reflection */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />

            {/* Vertical Multi-Color Ribbon on Lid */}
            <div
              className={`absolute top-0 bottom-0 ${
                isSmall ? 'w-3 sm:w-4' : 'w-7 md:w-9'
              } bg-gradient-to-r from-[#b38728] via-[#fcf6ba] to-[#996515] shadow-lg border-x border-amber-200/60 flex items-center justify-center`}
            >
              <div className="w-1/3 h-full bg-gradient-to-b from-rose-600 via-rose-500 to-rose-700" />
            </div>

            {/* Horizontal Emerald & Gold Ribbon on Lid Rim */}
            <div
              className={`absolute bottom-0 left-0 right-0 ${
                isSmall ? 'h-1.5' : 'h-3 md:h-4'
              } bg-gradient-to-r from-[#065f46] via-[#ffd700] to-[#1e3a8a] border-t border-amber-200/70`}
            />
          </div>
        </div>

        {/* =========================================================================
            --- 3D BOX BASE / MAIN BODY ---
           ========================================================================= */}
        <div className="relative z-10 w-[90%] h-[70%] rounded-b-xl bg-gradient-to-b from-[#18052e] via-[#090b1e] to-[#06121f] border-b-2 border-x-2 border-[#d4af37]/50 shadow-[0_10px_30px_rgba(0,0,0,0.95)] overflow-hidden flex items-center justify-center">
          {/* Jewel Facet Highlights */}
          <div className="absolute top-0 left-0 w-1/2 h-full bg-[radial-gradient(circle_at_0%_30%,rgba(147,51,234,0.3),transparent_70%)]" />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(circle_at_100%_40%,rgba(37,99,235,0.3),transparent_70%)]" />

          {/* Vertical Colorful Satin Ribbon */}
          <div
            className={`absolute top-0 bottom-0 ${
              isSmall ? 'w-3 sm:w-4' : 'w-7 md:w-9'
            } bg-gradient-to-r from-[#b38728] via-[#ffd700] to-[#996515] shadow-xl border-x border-amber-100/70 flex items-center justify-center`}
          >
            <div className="w-1/3 h-full bg-gradient-to-b from-rose-700 via-rose-500 to-rose-800" />
          </div>

          {/* Horizontal Colorful Satin Ribbon */}
          <div
            className={`absolute left-0 right-0 ${
              isSmall ? 'h-2 sm:h-2.5' : 'h-5 md:h-6'
            } bg-gradient-to-r from-blue-700 via-[#ffd700] to-emerald-700 shadow-lg border-y border-amber-200/70 flex items-center justify-center`}
          >
            <div className="w-full h-0.5 bg-white/40" />
          </div>

          {/* Center Embossed Metallic Gold Plaque with Serial Number (Only on Medium/Large) */}
          {!isSmall ? (
            <div className="relative z-10 px-3 py-1.5 rounded-lg bg-gradient-to-b from-[#140824] via-[#090b14] to-[#040810] border-2 border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.5)] flex flex-col items-center">
              <span className="text-[9px] tracking-widest text-[#ffd700] uppercase font-cinzel font-bold">
                SUPER SURPRISE
              </span>
              <span className="text-xs font-mono-numbers font-bold text-white tracking-widest">
                {serial}
              </span>
            </div>
          ) : (
            <div className="relative z-10 w-3 h-3 rounded-full bg-gradient-to-tr from-[#996515] via-[#ffd700] to-[#fff] shadow-sm border border-amber-200" />
          )}

          {/* Assigned Tag if this box belongs to customer */}
          {isAssigned && (
            <div className="absolute top-1 right-1 z-20">
              <span className="inline-flex items-center px-1 py-0.2 text-[7px] font-bold text-black bg-gradient-to-r from-amber-300 to-yellow-200 rounded-full uppercase tracking-wider font-cinzel">
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
