import React, { useState, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { UserProfile } from '../../types/database';
import {
  Shield,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface CoachSettingsCardProps {
  profile: UserProfile | null;
  hasCoachCapability: boolean;
  refreshProfile?: () => Promise<void>;
}

export const CoachSettingsCard: React.FC<CoachSettingsCardProps> = ({
  profile,
  hasCoachCapability,
  refreshProfile,
}) => {
  const vanityCodeId = useId();

  // Coach active athlete count
  const { data: activeAthleteCount = 0 } = useQuery({
    queryKey: ['coach_active_athletes_count', profile?.id],
    enabled: Boolean(profile?.id && hasCoachCapability),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('coach_athlete_links')
          .select('id')
          .eq('coach_id', profile!.id)
          .eq('status', 'active')
          .limit(100);
        if (error || !data) return 0;
        return Array.isArray(data) ? data.length : 0;
      } catch {
        return 0;
      }
    },
  });

  // Vanity code state
  const [customCoachCode, setCustomCoachCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [coachCodeStatus, setCoachCodeStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSavingCode, setIsSavingCode] = useState(false);

  const handleCopyCoachCode = () => {
    if (!profile?.coach_code) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(profile.coach_code);
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSaveVanityCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customCoachCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,20}$/.test(trimmed)) {
      setCoachCodeStatus({
        type: 'error',
        message: 'Code must be 4-20 characters long and contain only uppercase letters, numbers, hyphens, or underscores.',
      });
      return;
    }

    setIsSavingCode(true);
    setCoachCodeStatus(null);
    try {
      const { error } = await supabase.rpc('set_coach_code', { custom_code: trimmed });
      if (error) throw error;
      setCoachCodeStatus({ type: 'success', message: 'Coach code updated successfully!' });
      setCustomCoachCode('');
      if (refreshProfile) await refreshProfile();
    } catch (err: any) {
      setCoachCodeStatus({ type: 'error', message: err?.message || 'Failed to update coach code.' });
    } finally {
      setIsSavingCode(false);
    }
  };

  if (!hasCoachCapability) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Coach Mode
          </h3>
        </div>
        <p className="text-xs text-zinc-400">
          Want to train athletes? Activate coach mode to generate your unique coach code.
        </p>
        <form onSubmit={handleSaveVanityCode} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={customCoachCode}
              onChange={(e) => setCustomCoachCode(e.target.value.toUpperCase())}
              placeholder="Enter vanity code (e.g. COACH-PRO)"
              maxLength={20}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none uppercase min-h-[44px]"
              required
            />
            <button
              type="submit"
              disabled={isSavingCode || !customCoachCode.trim()}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 transition touch-manipulation"
            >
              {isSavingCode ? 'Activating...' : 'Activate Mode'}
            </button>
          </div>
          {coachCodeStatus && (
            <div
              className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                coachCodeStatus.type === 'error'
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
              }`}
            >
              {coachCodeStatus.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{coachCodeStatus.message}</span>
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Coach Mode & Roster
          </h3>
        </div>
        <span
          className="text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 px-2.5 py-1 rounded-full border border-cyan-500/30"
          data-testid="coach-capacity-badge"
        >
          {activeAthleteCount} / {profile?.max_athletes ?? 3} Athletes ({profile?.coach_tier || 'free'})
        </span>
      </div>

      <div className="space-y-3">
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Your Coach Code
            </div>
            <div
              className="text-lg font-mono font-black text-cyan-400 tracking-wider mt-0.5"
              data-testid="active-coach-code"
            >
              {profile?.coach_code || 'None'}
            </div>
          </div>

          {profile?.coach_code && (
            <button
              type="button"
              onClick={handleCopyCoachCode}
              className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition min-h-[44px] touch-manipulation"
              data-testid="copy-coach-code-btn"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSaveVanityCode} className="space-y-2">
          <label htmlFor={vanityCodeId} className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Custom Vanity Code
          </label>
          <div className="flex gap-2">
            <input
              id={vanityCodeId}
              type="text"
              value={customCoachCode}
              onChange={(e) => setCustomCoachCode(e.target.value.toUpperCase())}
              placeholder="e.g. COACH-PRO"
              maxLength={20}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none uppercase min-h-[44px]"
              data-testid="vanity-code-input"
            />
            <button
              type="submit"
              disabled={isSavingCode || !customCoachCode.trim()}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold px-4 py-2 min-h-[44px] rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 transition touch-manipulation"
              data-testid="save-vanity-code-btn"
            >
              {isSavingCode ? 'Saving...' : 'Save Code'}
            </button>
          </div>

          {coachCodeStatus && (
            <div
              data-testid="coach-code-status"
              className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                coachCodeStatus.type === 'error'
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
              }`}
            >
              {coachCodeStatus.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{coachCodeStatus.message}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
