import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import { Zap, Shield, Users, UserPlus, LogOut } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, profile, role, signOut, switchRole } = useAuth();
  const { isCoach, selectedAthleteId, switchAthlete, athletes, addAthlete } = useCoach();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAthleteName, setNewAthleteName] = useState('');
  const [newAthleteEmail, setNewAthleteEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddAthlete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAthleteName.trim()) return;
    setIsSubmitting(true);
    try {
      await addAthlete(newAthleteName, newAthleteEmail);
      setNewAthleteName('');
      setNewAthleteEmail('');
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isVerifiedCoach = profile?.role === 'coach';

  return (
    <header className="bg-zinc-900/90 backdrop-blur-xl border-b border-zinc-800/80 sticky top-0 z-30 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <Link to="/workout" className="flex items-center gap-2.5 min-w-0 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)] shrink-0 group-hover:scale-105 transition-transform">
            <Zap className="w-4 h-4 text-zinc-950 fill-zinc-950 font-black" />
          </div>
          <div className="min-w-0">
            <h1 className="font-black tracking-wider text-base uppercase bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent truncate">
              CyberGym
            </h1>
            <div className="text-[10px] font-mono tracking-widest uppercase text-cyan-400 font-semibold -mt-1 truncate">
              Fitness & Nutrition
            </div>
          </div>
        </Link>

        {/* Right Action Badges */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Synced Badge */}
          <div
            className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.15)] select-none"
            title="Database Synced"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span className="hidden sm:inline">Synced</span>
          </div>

          {/* Role Pill Switcher (Interactive only for verified coaches) */}
          {isVerifiedCoach ? (
            <button
              onClick={() => switchRole(role === 'coach' ? 'athlete' : 'coach')}
              className={`text-xs font-bold px-3 py-1.5 min-h-[36px] sm:min-h-[28px] rounded-full border flex items-center gap-1.5 transition ${
                role === 'coach'
                  ? 'text-cyan-300 bg-cyan-500/15 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-zinc-400 bg-zinc-800 border-zinc-700'
              }`}
              title="Click to toggle Coach/Athlete view mode"
            >
              {role === 'coach' ? (
                <>
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Coach</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Athlete</span>
                </>
              )}
            </button>
          ) : (
            <div
              className="text-xs font-bold px-2.5 py-1 rounded-full border text-zinc-400 bg-zinc-800/80 border-zinc-700/80 flex items-center gap-1.5 select-none"
              title="Athlete Account"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Athlete</span>
            </div>
          )}

          {/* User / Sign Out */}
          {user ? (
            <button
              onClick={() => signOut()}
              className="text-zinc-400 hover:text-rose-400 min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg hover:bg-rose-500/10 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <Link
              to="/login"
              className="text-xs font-bold text-cyan-400 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 min-h-[36px] flex items-center rounded-full transition"
            >
              Login
            </Link>
          )}
        </div>
      </div>

      {/* Coach Athlete Selector */}
      {isCoach && (
        <div className="max-w-4xl mx-auto mt-2.5 pt-2.5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 shadow-inner">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Athlete:
            </span>
            <select
              value={selectedAthleteId}
              onChange={(e) => switchAthlete(e.target.value)}
              className="bg-transparent text-white text-base sm:text-xs font-extrabold outline-none cursor-pointer"
              data-testid="coach-athlete-select"
            >
              {athletes.length === 0 ? (
                <option value="" disabled className="bg-zinc-900 text-zinc-500">
                  No athletes yet
                </option>
              ) : (
                athletes.map((ath) => (
                  <option key={ath.id} value={ath.id} className="bg-zinc-900 text-white">
                    {ath.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-3 py-1.5 min-h-[36px] rounded-xl transition flex items-center gap-1.5 border border-zinc-700"
            >
              <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Athlete</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Athlete Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-cyan-400" /> Add Athlete
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Add a new athlete to track their workouts and nutrition.
            </p>
            <form onSubmit={handleAddAthlete} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">
                  Athlete Name
                </label>
                <input
                  type="text"
                  value={newAthleteName}
                  onChange={(e) => setNewAthleteName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-base sm:text-sm outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">
                  Athlete Email <span className="text-zinc-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  value={newAthleteEmail}
                  onChange={(e) => setNewAthleteEmail(e.target.value)}
                  placeholder="e.g. sarah@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-base sm:text-sm outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newAthleteName.trim()}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black shadow-neon-cyan font-black"
                >
                  {isSubmitting ? 'Creating...' : 'Create Athlete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
