import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { pendingBeforeSignOut } from '../../offline';
import { SyncStatusSheet } from '../sync/SyncStatusSheet';
import { useOutboxStatus } from '../sync/useOutboxStatus';
import { ConfirmDialog } from './ConfirmDialog';
import { Zap, Shield, LogOut, LayoutDashboard } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, profile, role, signOut, switchRole } = useAuth();
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const location = useLocation();

  const summary = useOutboxStatus(user?.id);
  const pending = summary.pending;
  const attention = summary.attention;
  const syncing = summary.syncing;
  const authRequired = summary.authRequired;

  const [isSyncSheetOpen, setIsSyncSheetOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [unsyncedSignOutCount, setUnsyncedSignOutCount] = useState(0);

  const isVerifiedCoach = profile?.role === 'coach';
  const isCoachMode = role === 'coach';
  const isOffCoach = location.pathname.replace(/\/$/, '') !== '/coach';
  const showCoachDashboard = Boolean(user && isVerifiedCoach && isCoachMode && isOffCoach);

  const handleToggleRole = () => {
    const nextRole = role === 'coach' ? 'athlete' : 'coach';
    switchRole(nextRole);
    if (nextRole === 'coach') {
      navigate('/coach');
    } else {
      navigate('/workout');
    }
  };

  let statusText = 'Online';
  let badgeTone: 'online' | 'offline' | 'syncing' | 'attention' | 'authRequired' = 'online';

  if (authRequired) {
    statusText = 'Sign in to sync';
    badgeTone = 'authRequired';
  } else if (attention > 0) {
    statusText = `${attention} need attention`;
    badgeTone = 'attention';
  } else if (!isOnline) {
    statusText = pending > 0 ? `Offline · ${pending} pending` : 'Offline';
    badgeTone = 'offline';
  } else if (syncing) {
    statusText = `Syncing · ${pending}`;
    badgeTone = 'syncing';
  } else {
    statusText = 'Online';
    badgeTone = 'online';
  }

  const handleSignOutClick = async () => {
    if (!user?.id) {
      await signOut();
      return;
    }

    try {
      const dbCount = await pendingBeforeSignOut(user.id);
      const cachedCount = summary.pending + summary.attention;
      const count = Math.max(dbCount, cachedCount);
      if (count === 0) {
        await signOut();
      } else {
        setUnsyncedSignOutCount(count);
        setShowSignOutConfirm(true);
      }
    } catch (e) {
      console.warn('[Header] Error checking pending outbox before sign out', e);
      setUnsyncedSignOutCount(1);
      setShowSignOutConfirm(true);
    }
  };

  const handleConfirmSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut();
  };

  return (
    <>
      <header className="bg-zinc-900/90 backdrop-blur-xl border-b border-zinc-800/80 sticky top-0 z-30 px-1.5 sm:px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 shadow-lg">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <Link
            to="/workout"
            className="flex items-center gap-1 sm:gap-2.5 min-w-0 min-h-[44px] group relative before:absolute before:inset-0 before:min-w-[44px] before:min-h-[44px] before:content-['']"
          >
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)] shrink-0 group-hover:scale-105 transition-transform">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-950 fill-zinc-950" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold tracking-normal text-xs sm:text-base bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                Yourbody.fyi
              </h1>
              <div className="text-xs font-semibold tracking-wider text-cyan-400 -mt-1 truncate">
                Fitness & Nutrition
              </div>
            </div>
          </Link>

          {/* Right Action Badges */}
          <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
            {showCoachDashboard && (
              <Link
                to="/coach"
                data-testid="coach-dashboard-link"
                aria-label="Coach dashboard"
                title="Coach dashboard"
                className="text-cyan-300 bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition touch-manipulation focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                <LayoutDashboard className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              </Link>
            )}

            {/* Connection Status Badge Button (A10) */}
            <button
              type="button"
              onClick={() => setIsSyncSheetOpen(true)}
              data-testid="connection-status"
              title={statusText}
              aria-label={`Connection status: ${statusText}`}
              className={`text-xs font-bold px-2.5 py-1 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center gap-1.5 transition touch-manipulation cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                badgeTone === 'online'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : badgeTone === 'syncing'
                  ? 'text-cyan-300 bg-cyan-500/15 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                  badgeTone === 'online'
                    ? 'bg-emerald-500 animate-pulse'
                    : badgeTone === 'syncing'
                    ? 'bg-cyan-400 animate-spin'
                    : 'bg-amber-500'
                }`}
              />
              <span
                role="status"
                aria-live="polite"
                className={badgeTone === 'online' ? 'hidden sm:inline' : 'inline'}
              >
                {statusText}
              </span>
            </button>

            {/* Role Pill Switcher (Interactive only for verified coaches) */}
            {user && (
              isVerifiedCoach ? (
                <button
                  type="button"
                  onClick={handleToggleRole}
                  data-testid="role-switch-button"
                  aria-label={
                    role === 'coach'
                      ? 'Coach mode active. Switch to Athlete mode.'
                      : 'Athlete mode active. Switch to Coach mode.'
                  }
                  title={role === 'coach' ? 'Switch to Athlete mode' : 'Switch to Coach mode'}
                  className={`text-xs font-bold px-1.5 sm:px-3.5 py-1.5 sm:py-2 min-h-[44px] min-w-[44px] rounded-full border flex items-center justify-center gap-1 sm:gap-1.5 transition touch-manipulation focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                    role === 'coach'
                      ? 'text-cyan-300 bg-cyan-500/15 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : 'text-zinc-400 bg-zinc-800 border-border-interactive'
                  }`}
                >
                  {role === 'coach' ? (
                    <>
                      <Shield className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                      <span>Coach</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                      <span>Athlete</span>
                    </>
                  )}
                </button>
              ) : (
                <div
                  className="text-xs font-bold px-2 sm:px-2.5 py-1 rounded-full border text-zinc-400 bg-zinc-800/80 border-zinc-700/80 flex items-center gap-1 sm:gap-1.5 select-none"
                  title="Athlete Account"
                >
                  <Zap className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>Athlete</span>
                </div>
              )
            )}

            {/* User / Sign Out */}
            {user && (
              <button
                type="button"
                onClick={handleSignOutClick}
                data-testid="sign-out-button"
                className="text-zinc-400 hover:text-rose-400 min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg hover:bg-rose-500/10 transition focus:outline-none focus:ring-2 focus:ring-rose-500"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sync Status Sheet (A10) */}
      <SyncStatusSheet
        isOpen={isSyncSheetOpen}
        onClose={() => setIsSyncSheetOpen(false)}
      />

      {/* Sign Out Unsynced Warning Dialog (A9) */}
      <ConfirmDialog
        isOpen={showSignOutConfirm}
        title="Unsynced changes"
        consequence={`${unsyncedSignOutCount} unsynced changes stay on this device and sync the next time you sign in as ${user?.email || 'this user'}. Sign out?`}
        confirmLabel="Sign out anyway"
        cancelLabel="Stay signed in"
        isDestructive={true}
        testId="sign-out-confirm-dialog"
        onConfirm={handleConfirmSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </>
  );
};

export default Header;
