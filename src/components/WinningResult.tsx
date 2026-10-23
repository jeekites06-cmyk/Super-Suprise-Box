import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Check, Copy, MessageCircle, ShieldCheck, Sparkles, Wifi, Banknote, IndianRupee } from 'lucide-react';

interface WinningResultProps {
  serial: string;
  prizeName?: string;
  claimCode?: string;
  openedAt?: string;
}

export const WinningResult: React.FC<WinningResultProps> = ({
  serial,
  prizeName = 'iPhone 17 Pro Max',
  claimCode = `SSB-${serial}-9941`,
  openedAt = new Date().toISOString(),
}) => {
  const [copied, setCopied] = useState(false);
  const isCash = prizeName.includes('Cash') || prizeName.includes('₹');
  const isIPhone = prizeName.toLowerCase().includes('iphone');

  useEffect(() => {
    // Multi-stage celebratory confetti explosion
    const duration = 3.5 * 1000;
    const animationEnd = Date.now() + duration;
    const colors = ['#ffd700', '#d4af37', '#ffffff', '#e5c07b', '#b38728', '#10b981', '#38bdf8', '#f43f5e'];

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 60,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 60,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  const claimMessage = `🎉 SUPER SURPRISE BOX WINNER CLAIM\n\nFull Name: \nRegistered Mobile: \nBox Serial: ${serial}\nClaim Code: ${claimCode}\nPrize: ${prizeName}\n\nI have attached my winning screenshot for official prize claim/payout.`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(claimMessage)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `Box Serial: ${serial} | Claim Code: ${claimCode} | Prize: ${prizeName}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-obsidian-card border border-[#d4af37]/40 rounded-2xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center animate-fade-in">
      {/* Top Gold Ambient Flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-28 bg-[#ffd700]/15 blur-3xl pointer-events-none" />

      {/* Verified Authentic Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-6">
        <ShieldCheck className="w-4 h-4 text-amber-400" />
        <span>Verified Batch 1 Winner</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono-numbers">{serial}</span>
      </div>

      {/* Main Headline strictly from prompt */}
      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white uppercase font-cinzel mb-2">
        🎉 CONGRATULATIONS! YOU WON!
      </h1>

      <div className="text-xl sm:text-2xl font-bold text-gold-bright tracking-wide mb-1 flex items-center justify-center gap-2">
        <span>{isCash ? '💰' : '📱'} {prizeName.toUpperCase()}</span>
      </div>

      <p className="text-neutral-300 text-base sm:text-lg mb-8">
        {isCash
          ? `Your instant cash prize is ${prizeName}.`
          : `Your prize is an ${prizeName}.`}
      </p>

      {/* =========================================================================
          --- PRIZE VISUAL: REALISTIC APPLE iPHONE OR OFFICIAL CASH CERTIFICATE ---
         ========================================================================= */}
      {isIPhone ? (
        <div className="relative mx-auto w-64 sm:w-72 aspect-[9/18.5] rounded-[48px] p-3 bg-gradient-to-b from-[#e5d4ba] via-[#d4af37] to-[#8c7336] shadow-[0_25px_60px_rgba(0,0,0,0.95),0_0_35px_rgba(255,215,0,0.35)] border border-[#fff2b2]/80 mb-8">
          {/* Outer Titanium Chassis Highlights */}
          <div className="absolute inset-0 rounded-[48px] border-2 border-white/20 pointer-events-none" />
          <div className="absolute -left-1 top-24 w-1 h-8 bg-[#8c7336] rounded-l-sm" />
          <div className="absolute -left-1 top-36 w-1 h-12 bg-[#8c7336] rounded-l-sm" />
          <div className="absolute -left-1 top-52 w-1 h-12 bg-[#8c7336] rounded-l-sm" />
          <div className="absolute -right-1 top-36 w-1 h-16 bg-[#8c7336] rounded-r-sm" />

          {/* OLED Screen Bezel & Panel */}
          <div className="relative w-full h-full rounded-[40px] bg-black overflow-hidden flex flex-col justify-between p-4 border border-black/80">
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-950/70 via-black to-amber-950/50 opacity-90" />
            <div className="absolute -top-24 -left-24 w-60 h-60 rounded-full bg-amber-500/25 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 w-60 h-60 rounded-full bg-purple-500/25 blur-3xl" />

            {/* Dynamic Island Assembly */}
            <div className="relative z-20 flex justify-between items-center text-[11px] text-neutral-300 font-semibold px-2 pt-1">
              <span className="font-mono-numbers">9:41</span>
              <div className="h-6 w-24 bg-black rounded-full px-2.5 flex items-center justify-between border border-neutral-800 shadow-md">
                <div className="w-2.5 h-2.5 rounded-full bg-[#05051a] border border-blue-900/60 relative">
                  <div className="w-1 h-1 rounded-full bg-blue-500/60 m-auto mt-0.5" />
                </div>
                <div className="w-2 h-2 rounded-full bg-neutral-900 border border-neutral-700" />
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <Wifi className="w-3 h-3 text-neutral-300" />
                <div className="w-5 h-2.5 border border-neutral-300 rounded-[3px] p-0.5 flex items-center">
                  <div className="w-full h-full bg-emerald-400 rounded-[1px]" />
                </div>
              </div>
            </div>

            {/* Wallpaper Lock-Screen Content */}
            <div className="relative z-10 flex flex-col items-center justify-center my-auto space-y-2 py-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-200 shadow-[0_0_20px_rgba(255,215,0,0.6)] flex items-center justify-center border border-white/60">
                <Sparkles className="w-6 h-6 text-black" />
              </div>
              <span className="text-[10px] uppercase tracking-widest font-cinzel text-amber-300 font-bold drop-shadow">
                OFFICIAL WINNER EDITION
              </span>
              <span className="text-xl font-bold tracking-tight text-white drop-shadow-md">
                {prizeName}
              </span>
              <div className="px-3 py-1 rounded-full bg-black/60 border border-amber-400/50 backdrop-blur-md text-[10px] font-mono-numbers text-amber-200 shadow-inner">
                Serial: {serial}
              </div>
            </div>

            {/* Bottom Lock-Screen Controls */}
            <div className="relative z-10 flex justify-between items-center px-4 pb-1">
              <div className="w-8 h-8 rounded-full bg-neutral-900/80 border border-white/10 flex items-center justify-center text-xs">
                🔦
              </div>
              <div className="w-28 h-1 rounded-full bg-white/50" />
              <div className="w-8 h-8 rounded-full bg-neutral-900/80 border border-white/10 flex items-center justify-center text-xs">
                📷
              </div>
            </div>

            {/* Realistic Surface Reflection Glare */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 pointer-events-none rounded-[40px]" />
          </div>
        </div>
      ) : (
        /* Cash Prize Certificate Visual */
        <div className="relative mx-auto w-full max-w-md p-6 rounded-2xl bg-gradient-to-br from-emerald-950/70 via-black to-neutral-950 border border-emerald-500/40 shadow-[0_20px_50px_rgba(16,185,129,0.25)] mb-8 overflow-hidden text-center">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-amber-500/15 blur-3xl pointer-events-none" />

          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-emerald-500 to-amber-300 shadow-lg flex items-center justify-center border border-white/30">
            <IndianRupee className="w-9 h-9 text-black font-extrabold" />
          </div>

          <span className="text-[11px] uppercase tracking-widest font-cinzel text-emerald-400 font-bold block mb-1">
            OFFICIAL CASH PRIZE REWARD
          </span>
          <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-amber-200 to-yellow-400 font-cinzel mb-2">
            {prizeName}
          </div>
          <p className="text-xs text-neutral-300 mb-4 max-w-xs mx-auto">
            Direct instant transfer via UPI, Google Pay, PhonePe, or Bank NEFT upon claim verification.
          </p>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/70 border border-emerald-500/40 text-[11px] font-mono-numbers text-emerald-200">
            <Banknote className="w-3.5 h-3.5 text-emerald-400" />
            <span>Guaranteed Instant Payout · Box {serial}</span>
          </div>
        </div>
      )}

      {/* Claim Code Certificate Box */}
      <div className="bg-black/60 border border-[#d4af37]/30 rounded-xl p-5 mb-8 text-left space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
          <div>
            <span className="text-xs text-neutral-400 block font-cinzel">OFFICIAL CLAIM CODE</span>
            <span className="text-lg sm:text-xl font-mono-numbers font-bold text-amber-300 tracking-wider">
              {claimCode}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-neutral-500 block">Box Serial:</span>
            <span className="font-mono-numbers text-white font-medium">{serial}</span>
          </div>
          <div>
            <span className="text-neutral-500 block">Prize Allocated:</span>
            <span className="font-semibold text-amber-300">{prizeName}</span>
          </div>
          <div>
            <span className="text-neutral-500 block">Opened Date:</span>
            <span className="font-mono-numbers text-white font-medium">
              {new Date(openedAt).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block">Claim Status:</span>
            <span className="text-emerald-400 font-semibold">Ready for Claim</span>
          </div>
        </div>
      </div>

      {/* Step-by-Step Claim Instructions */}
      <div className="text-left space-y-3 mb-8 bg-neutral-950/60 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-amber-300 font-cinzel tracking-wider uppercase">
          How to Claim Your {prizeName}
        </h2>
        <ol className="text-xs text-neutral-300 space-y-2 list-decimal list-inside leading-relaxed">
          <li>
            Take a screenshot of this page showing your <strong>Box Serial ({serial})</strong> and <strong>Claim Code</strong>.
          </li>
          <li>
            Click the WhatsApp contact button below to message our official support desk.
          </li>
          <li>
            {isCash
              ? 'Provide your UPI ID or Bank Account Details for instant credit.'
              : 'Provide your full name and delivery address for insured dispatch, or arrange official pickup.'}
          </li>
        </ol>
      </div>

      {/* WhatsApp Official Contact Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-cinzel font-bold text-sm uppercase tracking-widest shadow-[0_10px_30px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 active:scale-[0.99] cursor-pointer"
      >
        <MessageCircle className="w-5 h-5 fill-current" />
        <span>CONTACT US ON WHATSAPP TO CLAIM {prizeName.toUpperCase()}</span>
      </a>
    </div>
  );
};
