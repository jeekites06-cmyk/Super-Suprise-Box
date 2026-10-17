import React from 'react';
import { Shield } from 'lucide-react';

interface NonWinningResultProps {
  serial: string;
  openedAt?: string;
}

export const NonWinningResult: React.FC<NonWinningResultProps> = ({
  serial,
  openedAt = new Date().toISOString(),
}) => {
  return (
    <div className="w-full max-w-lg mx-auto bg-obsidian-card border border-neutral-800 rounded-2xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center">
      {/* Subtle top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-20 bg-neutral-700/10 blur-2xl pointer-events-none" />

      {/* Verified Box Serial Tag */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs font-semibold tracking-wider uppercase mb-8">
        <Shield className="w-3.5 h-3.5 text-neutral-400" />
        <span>Box Serial:</span>
        <span className="font-mono-numbers text-amber-300 font-bold">{serial}</span>
      </div>

      {/* Main Required Headline strictly from prompt */}
      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white uppercase font-cinzel mb-4">
        😔 BETTER LUCK NEXT TIME!
      </h1>

      <p className="text-neutral-300 text-base sm:text-lg mb-8">
        Thank you for opening your Surprise Box.
      </p>

      {/* Box summary metadata */}
      <div className="bg-black/60 border border-neutral-800/80 rounded-xl p-4 text-left grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-neutral-500 block mb-0.5">Box Serial:</span>
          <span className="font-mono-numbers font-bold text-white text-sm">{serial}</span>
        </div>
        <div>
          <span className="text-neutral-500 block mb-0.5">Status:</span>
          <span className="font-semibold text-neutral-300">Permanent Record Saved</span>
        </div>
        <div className="sm:col-span-2">
          <span className="text-neutral-500 block mb-0.5">Opened:</span>
          <span className="font-mono-numbers text-neutral-400">
            {new Date(openedAt).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
