import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Zap, Shield, LogOut } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, profile, role, signOut, switchRole } = useAuth();
  const isOnline = useOnlineStatus();

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
          {/* Online / Offline Status Badge */}
          <div
            className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 select-none ${
              isOnline
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
            }`}
            data-testid="connection-status"
            title={isOnline ? 'Online' : 'Offline'}
          >
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
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
    </header>
  );
};
