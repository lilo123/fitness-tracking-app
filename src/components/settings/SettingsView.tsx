import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { UserProfile, UserRole } from '../../types/database';
import { Settings, User, Target, CheckCircle2, Shield, Dumbbell } from 'lucide-react';

interface SettingsFormProps {
  profile: UserProfile | null;
  role: UserRole;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  switchRole: (newRole: UserRole) => Promise<void>;
}

const SettingsForm: React.FC<SettingsFormProps> = ({
  profile,
  role,
  updateProfile,
  switchRole,
}) => {
  const [username, setUsername] = useState(profile?.username || '');
  const [targetCalories, setTargetCalories] = useState(profile?.target_calories || 2200);
  const [targetProtein, setTargetProtein] = useState(profile?.target_protein || 160);
  const [targetCarbs, setTargetCarbs] = useState(profile?.target_carbs || 220);
  const [targetFat, setTargetFat] = useState(profile?.target_fat || 70);
  const [targetFiber, setTargetFiber] = useState(profile?.target_fiber ?? 30);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');

    const res = await updateProfile({
      username,
      target_calories: Number(targetCalories),
      target_protein: Number(targetProtein),
      target_carbs: Number(targetCarbs),
      target_fat: Number(targetFat),
      target_fiber: Number(targetFiber),
    });

    if (res.success) {
      setStatus('Settings saved');
    } else {
      setStatus('Failed to save settings: ' + res.error);
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
          <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{status}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { profile, role, updateProfile, switchRole } = useAuth();

  return (
    <SettingsForm
      key={profile?.id || 'default'}
      profile={profile}
      role={role}
      updateProfile={updateProfile}
      switchRole={switchRole}
    />
  );
};
