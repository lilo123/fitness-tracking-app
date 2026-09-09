import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { UserProfile, UserRole } from '../../types/database';
import {
  Settings,
  User,
  Target,
  CheckCircle2,
  AlertCircle,
  Shield,
  Dumbbell,
  Timer,
  Copy,
  Check,
  Users,
  UserMinus,
  UserPlus,
} from 'lucide-react';

interface SettingsFormProps {
  profile: UserProfile | null;
  role: UserRole;
  isCoachMode?: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  switchRole: (newRole: UserRole) => Promise<void>;
  refreshProfile?: () => Promise<void>;
}

const SettingsForm: React.FC<SettingsFormProps> = ({
  profile,
  role,
  isCoachMode = false,
  updateProfile,
  switchRole,
  refreshProfile,
}) => {
  const [username, setUsername] = useState(profile?.username || '');
  const [targetCalories, setTargetCalories] = useState(profile?.target_calories || 2200);
  const [targetProtein, setTargetProtein] = useState(profile?.target_protein || 160);
  const [targetCarbs, setTargetCarbs] = useState(profile?.target_carbs || 220);
  const [targetFat, setTargetFat] = useState(profile?.target_fat || 70);
  const [targetFiber, setTargetFiber] = useState(profile?.target_fiber ?? 30);
  const [autoRestTimer, setAutoRestTimer] = useState<boolean>(() => {
    if (profile?.auto_rest_timer !== undefined) return profile.auto_rest_timer;
    const localVal = localStorage.getItem('cybergym_auto_rest_timer');
    return localVal !== null ? localVal !== 'false' : true;
  });
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Coach Mode capability
  const hasCoachCapability = Boolean(profile?.role === 'coach' || profile?.is_coach_mode || isCoachMode);

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
          .eq('status', 'active');
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
          .eq('status', 'active');
        if (error || !data) return null;
        return Array.isArray(data) ? (data[0] || null) : data;
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
      await refetchCoachLink();
      if (refreshProfile) await refreshProfile();
    } catch (err: any) {
      setLinkStatus({ type: 'error', message: err?.message || 'Failed to disconnect from coach.' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleToggleAutoTimer = async () => {
    const nextVal = !autoRestTimer;
    setAutoRestTimer(nextVal);
    localStorage.setItem('cybergym_auto_rest_timer', String(nextVal));

    try {
      await updateProfile({ auto_rest_timer: nextVal });
    } catch {
      // Graceful fallback: local state and localStorage already updated
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const res = await updateProfile({
      username,
      target_calories: Number(targetCalories),
      target_protein: Number(targetProtein),
      target_carbs: Number(targetCarbs),
      target_fat: Number(targetFat),
      target_fiber: Number(targetFiber),
      auto_rest_timer: autoRestTimer,
    });

    if (res.success) {
      setStatus({ type: 'success', message: 'Settings saved' });
    } else {
      setStatus({ type: 'error', message: 'Failed to save settings: ' + (res.error || 'Unknown error') });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/20 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">
            Settings
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Manage your daily nutrition targets, account profile, and view mode.
        </p>
      </div>

      {/* Account Info & Role Switcher */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <User className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Profile & Mode
          </h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="w-full bg-zinc-950/50 border border-zinc-850 text-zinc-400 rounded-xl p-2.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-semibold focus:border-cyan-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              {profile?.role === 'coach' ? 'Preview Mode (Coach Only)' : 'Account Role'}
            </label>
            {profile?.role === 'coach' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => switchRole('athlete')}
                  className={`p-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition touch-manipulation ${
                    role === 'athlete'
                      ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 shadow-neon-cyan'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Dumbbell className="w-4 h-4" /> Athlete View
                </button>
                <button
                  type="button"
                  onClick={() => switchRole('coach')}
                  className={`p-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition touch-manipulation ${
                    role === 'coach'
                      ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 shadow-neon-cyan'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Shield className="w-4 h-4" /> Coach View
                </button>
              </div>
            ) : (
              <div className="p-3 min-h-[44px] bg-zinc-950/50 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-cyan-400" />
                <span className="capitalize">{profile?.role || 'Athlete'}</span>
                <span className="text-[10px] text-zinc-500 ml-auto">(Managed by Coach)</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Coach Mode Card */}
      {hasCoachCapability && (
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
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Custom Vanity Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCoachCode}
                  onChange={(e) => setCustomCoachCode(e.target.value.toUpperCase())}
                  placeholder="e.g. COACH-DUY"
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
      )}

      {/* My Coach Card */}
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

        {isCoachLinkLoading ? (
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

        {linkStatus && (
          <div
            data-testid="link-coach-status"
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              linkStatus.type === 'error'
                ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
            }`}
          >
            {linkStatus.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{linkStatus.message}</span>
          </div>
        )}
      </div>

      {/* Workout Preferences */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Timer className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Workout Preferences
          </h3>
        </div>

        <div className="flex items-center justify-between gap-4 p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white">Auto-start Rest Timer on Set Log</div>
            <div className="text-[11px] text-zinc-400 leading-relaxed">
              Automatically start the 90s countdown timer when logging any set.
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoRestTimer}
            data-testid="toggle-auto-timer"
            onClick={handleToggleAutoTimer}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoRestTimer ? 'bg-cyan-500' : 'bg-zinc-800'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                autoRestTimer ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Target Macros Form */}
      <form
        onSubmit={handleSave}
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Target className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Daily Macro Goals
          </h3>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-5 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
              Calories (kcal)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={targetCalories}
              onChange={(e) => setTargetCalories(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              required
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
              Protein (g)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={targetProtein}
              onChange={(e) => setTargetProtein(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              required
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
              Carbs (g)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={targetCarbs}
              onChange={(e) => setTargetCarbs(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              required
            />
          </div>
          <div className="col-span-3 sm:col-span-1">
            <label className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">
              Fat (g)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={targetFat}
              onChange={(e) => setTargetFat(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              required
            />
          </div>
          <div className="col-span-3 sm:col-span-1">
            <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
              Fiber (g)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={targetFiber}
              onChange={(e) => setTargetFiber(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-2.5 text-base sm:text-xs font-mono font-bold focus:border-cyan-500 outline-none text-center"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-neon-cyan active:scale-95 transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Goals'}
        </button>

        {status && (
          <div
            data-testid="settings-status-banner"
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              status.type === 'error'
                ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
            }`}
          >
            {status.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{status.message}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { profile, role, isCoachMode, updateProfile, switchRole, refreshProfile } = useAuth();

  return (
    <SettingsForm
      key={profile?.id || 'default'}
      profile={profile}
      role={role}
      isCoachMode={isCoachMode}
      updateProfile={updateProfile}
      switchRole={switchRole}
      refreshProfile={refreshProfile}
    />
  );
};
