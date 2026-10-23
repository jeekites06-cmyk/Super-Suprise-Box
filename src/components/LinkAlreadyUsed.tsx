import React from 'react';
import { Lock, ShieldAlert, CheckCircle2, MessageCircle } from 'lucide-react';

interface LinkAlreadyUsedProps {
  serial: string;
  openedAt?: string;
  result?: 'WINNER' | 'BETTER_LUCK' | null;
  prizeName?: string | null;
  claimCode?: string | null;
}

export const LinkAlreadyUsed: React.FC<LinkAlreadyUsedProps> = ({
  serial,
  openedAt = new Date().toISOString(),
  result,
  prizeName,
  claimCode,
}) => {
  const isWinner = result === 'WINNER';

  const claimMessage = `🎉 SUPER SURPRISE BOX WINNER CLAIM\n\nFull Name: \nRegistered Mobile: \nBox Serial: ${serial}\nClaim Code: ${claimCode || ''}\nPrize: ${prizeName || 'Official Prize'}\n\nI am contacting you regarding my previously claimed winning box.`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(claimMessage)}`;

  return (
    <div className="w-full max-w-lg mx-auto bg-obsidian-card border border-neutral-800 rounded-2xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center">
      {/* Top Warning Flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-24 bg-amber-500/10 blur-3xl pointer-events-none" />

      {/* Lock Status Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-semibold tracking-wider uppercase mb-6">
        <Lock className="w-3.5 h-3.5 text-amber-400" />
        <span>One-Time Link Expired</span>
      </div>

      {/* Required Exact Headline from Prompt */}
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-cinzel mb-4">
        THIS LINK HAS ALREADY BEEN USED.
      </h1>

      <p className="text-neutral-400 text-xs sm:text-sm mb-6 leading-relaxed">
        Each private link can only be opened once. The assigned Surprise Box has already been revealed and its result is permanently locked in the database.
      </p>

      {/* Record Summary Box */}
      <div className="bg-black/60 border border-neutral-800/80 rounded-xl p-4 text-left grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-6">
        <div>
          <span className="text-neutral-500 block mb-0.5">Assigned Box:</span>
          <span className="font-mono-numbers font-bold text-amber-300 text-sm">{serial}</span>
        </div>
        <div>
          <span className="text-neutral-500 block mb-0.5">Database Status:</span>
          <span className="font-semibold text-neutral-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Permanent Record</span>
          </span>
        </div>
        <div className="sm:col-span-2">
          <span className="text-neutral-500 block mb-0.5">Opened Timestamp:</span>
          <span className="font-mono-numbers text-neutral-400">
            {new Date(openedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* If this used link was a winner */}
      {isWinner && (
        <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-neutral-900 border border-amber-400/40 rounded-xl p-5 mb-2 text-left">
          <div className="text-xs font-bold text-amber-300 uppercase tracking-wider font-cinzel mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Winning Record Confirmed</span>
          </div>
          <p className="text-xs text-neutral-300 mb-3">
            This link won the <strong className="text-amber-200">{prizeName || 'Official Prize'}</strong>. Code:{' '}
            <span className="font-mono-numbers font-bold text-white">{claimCode}</span>.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Contact WhatsApp to Claim</span>
          </a>
        </div>
      )}
    </div>
  );
};
