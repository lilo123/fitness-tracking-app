import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Zap, Dumbbell, AlertCircle } from 'lucide-react';
import type { UserRole } from '../../types/database';

export const LoginView: React.FC = () => {
  const { signIn, signUp, switchRole } = useAuth();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUp) {
      const res = await signUp(email, password, 'athlete');
      if (res.success) {
        navigate('/workout');
      } else {
        setError(res.error || 'Failed to sign up');
      }
    } else {
      const res = await signIn(email, password);
      if (res.success) {
        navigate('/workout');
      } else {
        setError(res.error || 'Failed to sign in');
      }
    }
    setLoading(false);
  };

  const handleQuickDemo = async (demoRole: UserRole) => {
    setError('');
    setLoading(true);
    const demoEmail = demoRole === 'coach' ? 'coach@cybergym.io' : 'athlete@cybergym.io';
    const res = await signIn(demoEmail, 'password123');
    if (res.success) {
      if (demoRole === 'coach') {
        localStorage.setItem('cybergym_view_mode', 'coach');
        await switchRole('coach');
      }
      navigate(demoRole === 'coach' ? '/coach' : '/workout');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md w-full mx-auto px-4 py-8">
      {/* Brand card */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.4)] mx-auto mb-3">
          <Zap className="w-8 h-8 text-zinc-950 fill-zinc-950 font-black" />
        </div>
        <h1 className="text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          CyberGym
        </h1>
        <p className="text-xs text-zinc-400 font-mono tracking-widest mt-1 uppercase">
          Fitness & Nutrition
        </p>
      </div>

      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex border-b border-zinc-800 pb-4 mb-5 gap-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError('');
            }}
            className={`flex-1 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center touch-manipulation ${
              !isSignUp
                ? 'bg-cyan-500 text-black shadow-neon-cyan'
                : 'text-zinc-400 hover:text-white bg-zinc-950'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError('');
            }}
            className={`flex-1 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center touch-manipulation ${
              isSignUp
                ? 'bg-cyan-500 text-black shadow-neon-cyan'
                : 'text-zinc-400 hover:text-white bg-zinc-950'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@cybergym.io"
              autoComplete="email"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-base sm:text-sm font-semibold focus:border-cyan-500 outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 text-base sm:text-sm font-semibold focus:border-cyan-500 outline-none transition"
              required
            />
          </div>

          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Account Role
              </label>
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-cyan-400" /> Athlete Account
                </span>
                <span className="text-[10px] text-zinc-500 font-normal">(Coaches provisioned by admin)</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-zinc-800 text-center">
          <p className="text-xs text-zinc-500 font-mono mb-3 uppercase tracking-wider">
            Quick Demo Access
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemo('athlete')}
              className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs font-bold py-2.5 px-3 min-h-[44px] rounded-xl border border-zinc-700 transition flex items-center justify-center touch-manipulation"
            >
              Demo Athlete
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('coach')}
              className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs font-bold py-2.5 px-3 min-h-[44px] rounded-xl border border-zinc-700 transition flex items-center justify-center touch-manipulation"
            >
              Demo Coach
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
