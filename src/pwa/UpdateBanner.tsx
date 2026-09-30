import React, { useState } from 'react';
import { useAppUpdate } from './useAppUpdate';
import { canApplyUpdate } from './updateSafety';

export const UpdateBanner: React.FC = () => {
  const { updateAvailable, applyUpdate } = useAppUpdate();
  const [blockReason, setBlockReason] = useState<string | null>(null);

  if (!updateAvailable) {
    return null;
  }

  const handleReload = async () => {
    const check = canApplyUpdate();
    if (check.ok) {
      setBlockReason(null);
      await applyUpdate();
    } else {
      setBlockReason(check.reason || 'Update currently blocked');
    }
  };

  return (
    <div
      className="w-full max-w-xl mx-auto px-4 pt-2 pb-1"
      data-testid="update-banner"
    >
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 px-3 py-1.5 text-xs font-bold"
      >
        <button
          type="button"
          onClick={handleReload}
          className="w-full min-h-[44px] flex items-center justify-between gap-2 text-left cursor-pointer hover:opacity-90 active:scale-[0.99] transition touch-manipulation focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-lg select-none"
          data-testid="update-reload-btn"
          aria-label="Update available. Tap to reload."
        >
          <span className="flex-1 min-w-0 break-words">
            Update available · <span className="underline">Reload</span>
          </span>
        </button>
        {blockReason && (
          <div
            className="text-xs font-normal text-amber-300 break-words pb-1"
            data-testid="update-block-reason"
            role="alert"
          >
            {blockReason}
          </div>
        )}
      </div>
    </div>
  );
};
