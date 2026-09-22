import React, { useState, useId } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { UserProfile, UserRole } from '../../types/database';
import {
  Settings,
  User,
  Shield,
  Dumbbell,
  Timer,
} from 'lucide-react';
import { CoachSettingsCard } from './CoachSettingsCard';
import { MyCoachCard } from './MyCoachCard';
import { MacroGoalsCard } from './MacroGoalsCard';

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
  const displayNameId = useId();
  const restTimerLabelId = useId();

  // Coach Mode capability
  const hasCoachCapability = Boolean(profile?.role === 'coach' || profile?.is_coach_mode || isCoachMode);

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
          <dl>
            <dt className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Email Address
            </dt>
            <dd className="text-sm font-mono text-zinc-300 ml-0 py-1">
              {profile?.email || ''}
            </dd>
          </dl>

          <div>
            <label htmlFor={displayNameId} className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Display Name
            </label>
            <input
              id={displayNameId}
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
      <CoachSettingsCard
        profile={profile}
        hasCoachCapability={hasCoachCapability}
        refreshProfile={refreshProfile}
      />

      {/* My Coach Card */}
      <MyCoachCard
        profile={profile}
        refreshProfile={refreshProfile}
      />

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
            <div id={restTimerLabelId} className="text-xs font-bold text-white">Auto-start Rest Timer on Set Log</div>
            <div className="text-[11px] text-zinc-400 leading-relaxed">
              Automatically start the 90s countdown timer when logging any set.
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoRestTimer}
            aria-labelledby={restTimerLabelId}
            data-testid="toggle-auto-timer"
            onClick={handleToggleAutoTimer}
            className={`relative inline-flex before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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
      <MacroGoalsCard
        targetCalories={targetCalories}
        setTargetCalories={setTargetCalories}
        targetProtein={targetProtein}
        setTargetProtein={setTargetProtein}
        targetCarbs={targetCarbs}
        setTargetCarbs={setTargetCarbs}
        targetFat={targetFat}
        setTargetFat={setTargetFat}
        targetFiber={targetFiber}
        setTargetFiber={setTargetFiber}
        loading={loading}
        status={status}
        onSave={handleSave}
      />
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { profile, role, isCoachMode, updateProfile, switchRole, refreshProfile } = useAuth();

  return (
    <SettingsForm
      key={`${profile?.id || 'default'}-${profile?.target_calories}-${profile?.target_protein}-${profile?.target_carbs}-${profile?.target_fat}-${profile?.target_fiber}`}
      profile={profile}
      role={role}
      isCoachMode={isCoachMode}
      updateProfile={updateProfile}
      switchRole={switchRole}
      refreshProfile={refreshProfile}
    />
  );
};
