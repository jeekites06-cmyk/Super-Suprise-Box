import React, { useState } from 'react';
import { SurpriseBox3D } from './SurpriseBox3D';
import { OpenResult } from '../types/box';
import { openCustomerBox } from '../utils/customerStore';
import { Sparkles, AlertCircle } from 'lucide-react';

interface BoxOpeningStageProps {
  serial: string;
  token?: string;
  onBoxOpened: (result: OpenResult) => void;
}

export const BoxOpeningStage: React.FC<BoxOpeningStageProps> = ({
  serial,
  token,
  onBoxOpened,
}) => {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenClick = async () => {
    if (isOpening) return;
    setError(null);
    setIsOpening(true);

    try {
      const data = await openCustomerBox(token || '', serial);

      // Allow the 3D gift-opening animation to play smoothly before revealing result
      setTimeout(() => {
        onBoxOpened(data);
      }, 2200);
    } catch (err: unknown) {
      console.error('Error during box opening:', err);
      setIsOpening(false);
      const msg = err instanceof Error ? err.message : 'Connection error. Please retry.';
      setError(msg);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center py-6 px-4 text-center">
      {/* 3D Closed Surprise Box with Serial Number */}
      <div className="my-6 py-2 w-full flex justify-center">
        <SurpriseBox3D
          serial={serial}
          size="lg"
          isOpening={isOpening}
          isAssigned={true}
          disabled={isOpening}
          onClick={handleOpenClick}
        />
      </div>

      {error && (
        <div className="my-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2 max-w-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* ONE button: OPEN YOUR BOX */}
      <div className="mt-6 w-full max-w-xs">
        <button
          onClick={handleOpenClick}
          disabled={isOpening}
          className={`w-full py-4 px-8 rounded-xl font-cinzel font-bold text-base sm:text-lg tracking-wider uppercase transition-all duration-300 shadow-xl flex items-center justify-center gap-2 relative overflow-hidden group ${
            isOpening
              ? 'bg-amber-600 text-amber-100 cursor-wait'
              : 'bg-gradient-to-r from-[#ffd700] via-[#f7d070] to-[#d4af37] text-black hover:shadow-[0_0_35px_rgba(212,175,55,0.6)] hover:scale-[1.02] active:scale-[0.99] cursor-pointer'
          }`}
        >
          {/* Shimmer sweep effect */}
          {!isOpening && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
          )}

          {isOpening ? (
            <>
              <div className="w-5 h-5 border-2 border-amber-200 border-t-transparent rounded-full animate-spin" />
              <span>OPENING YOUR BOX...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-amber-950" />
              <span>OPEN YOUR BOX</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
