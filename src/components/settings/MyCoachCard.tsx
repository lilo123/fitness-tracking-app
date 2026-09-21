import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { UserProfile } from '../../types/database';
import {
  Users,
  UserMinus,
  UserPlus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { StatusBanner } from '../common/StatusBanner';

interface MyCoachCardProps {
  profile: UserProfile | null;
  refreshProfile?: () => Promise<void>;
}

export const MyCoachCard: React.FC<MyCoachCardProps> = ({
  profile,
  refreshProfile,
}) => {
  const queryClient = useQueryClient();

  // Athlete: My Coach Link query
  const { data: coachLink, isLoading: isCoachLinkLoading, refetch: refetchCoachLink } = useQuery({
    queryKey: ['my_coach_link', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('coach_athlete_links')
          .select('id, coach_id, linked_at, coach:users!coach_id(username, email, coach_code)')
          .eq('athlete_id', profile!.id)
          .eq('status', 'active')
          .maybeSingle();
        if (error || !data) return null;
        return data;
      } catch {
        return null;
      }
    },
  });

  // Link / Disconnect Coach state
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [linkStatus, setLinkStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleLinkCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkCodeInput.trim().toUpperCase();
    if (!trimmed) return;

    setIsLinking(true);
    setLinkStatus(null);
    try {
      const { data, error } = await supabase.rpc('link_to_coach', { input_code: trimmed });
      if (error) throw error;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error || 'Failed to link to coach.');
      }
      setLinkStatus({ type: 'success', message: 'Successfully linked to coach!' });
      setLinkCodeInput('');
      
      queryClient.invalidateQueries({ queryKey: ['my_coach_link'] });
      queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs'] });

      await refetchCoachLink();
      if (refreshProfile) await refreshProfile();
    } catch (err: any) {
      setLinkStatus({ type: 'error', message: err?.message || 'Failed to link to coach.' });
    } finally {
      setIsLinking(false);
    }
  };

  const handleDisconnectCoach = async () => {
    if (!window.confirm('Are you sure you want to disconnect from your coach?')) {
      return;
    }
    setIsDisconnecting(true);
    setLinkStatus(null);
    try {
      const { error } = await supabase.rpc('disconnect_coach');
      if (error) throw error;
      setLinkStatus({ type: 'success', message: 'Successfully disconnected from coach.' });
      
      queryClient.invalidateQueries({ queryKey: ['my_coach_link'] });
      queryClient.invalidateQueries({ queryKey: ['routine_templates'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition_logs'] });

      await refetchCoachLink();
      if (refreshProfile) await refreshProfile();
    } catch (err: any) {
      setLinkStatus({ type: 'error', message: err?.message || 'Failed to disconnect from coach.' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            My Coach
          </h3>
        </div>
        {coachLink && (
          <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30">
            Linked
          </span>
        )}
      </div>

      {!profile?.id || isCoachLinkLoading ? (
        <div className="p-4 text-center text-xs text-zinc-500 font-mono" data-testid="coach-link-loading">
          Loading coaching status...
        </div>
      ) : coachLink ? (
        <div className="space-y-3">
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Assigned Coach
              </div>
              <div className="text-sm font-black text-white mt-0.5" data-testid="assigned-coach-name">
                {(coachLink.coach as any)?.username || (coachLink.coach as any)?.email || 'Coach'}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                Code: <span className="text-cyan-400 font-bold">{(coachLink.coach as any)?.coach_code || 'N/A'}</span>
                {coachLink.linked_at && (
                  <span className="ml-2 text-zinc-500">
                    • Linked {new Date(coachLink.linked_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDisconnectCoach}
              disabled={isDisconnecting}
              className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="disconnect-coach-btn"
            >
              <UserMinus className="w-4 h-4" />
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect Coach'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleLinkCoach} className="space-y-3">
          <p className="text-xs text-zinc-400">
            Enter your coach's code to link your account. Your coach will configure your workout routines and monitor nutrition targets.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={linkCodeInput}
              onChange={(e) => setLinkCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. CYBER-DEMO01"
              maxLength={20}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-xl px-3 py-2 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none uppercase min-h-[44px]"
              data-testid="link-coach-code-input"
              required
            />
            <button
              type="submit"
              disabled={isLinking || !linkCodeInput.trim()}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black px-4 py-2 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan transition disabled:opacity-50 touch-manipulation flex items-center gap-1.5"
              data-testid="link-coach-btn"
            >
              <UserPlus className="w-4 h-4" />
              {isLinking ? 'Linking...' : 'Link Coach'}
            </button>
          </div>
        </form>
      )}

      <StatusBanner
        testId="link-coach-status"
        message={linkStatus?.message}
        tone={linkStatus?.type === 'error' ? 'error' : 'success'}
        icon={
          linkStatus?.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          )
        }
      />
    </div>
  );
};
