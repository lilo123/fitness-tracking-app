import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Zap, AlertCircle, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';

type AuthMode = 'signin' | 'register' | 'check_email' | 'forgot_password';

export const LoginView: React.FC = () => {
  const { signIn, signUp, requestPasswordReset, resendConfirmation } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);

    if (mode === 'register') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      const res = await signUp(email, password, 'athlete');
      if (res.success && res.needsEmailConfirmation) {
        setInfoMsg(res.message || 'Account created! Please check your email to verify your account.');
        setMode('check_email');
      } else if (res.success) {
        navigate('/workout');
      } else {
        setError(res.error || 'Failed to sign up');
      }
    } else if (mode === 'forgot_password') {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setInfoMsg('Password reset link sent! Check your inbox.');
      } else {
        setError(res.error || 'Failed to send reset link');
      }
    } else if (mode === 'signin') {
      const res = await signIn(email, password);
      // Wait, need to route coach to /coach and athlete to /workout on signIn according to the test!
      if (res.success) {
        if (res.role === 'coach') {
          navigate('/coach');
        } else {
          navigate('/workout');
        }
      } else {
        setError(res.error || 'Failed to sign in');
      }
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setInfoMsg('');
    setLoading(true);
    const res = await resendConfirmation(email);
    if (res.success) {
      setInfoMsg('Confirmation email resent!');
      setCooldown(60);
    } else {
      setError(res.error || 'Failed to resend confirmation');
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
        {(mode === 'signin' || mode === 'register') && (
          <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800/80 mb-5 gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError('');
              }}
              className={`flex-1 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center touch-manipulation ${
                mode === 'signin'
                  ? 'bg-cyan-500 text-black shadow-neon-cyan'
                  : 'text-zinc-400 hover:text-white bg-transparent'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex-1 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center touch-manipulation ${
                mode === 'register'
                  ? 'bg-cyan-500 text-black shadow-neon-cyan'
                  : 'text-zinc-400 hover:text-white bg-transparent'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            {mode === 'check_email' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{infoMsg}</span>
          </div>
        )}

        {mode === 'check_email' ? (
          <div className="space-y-6 text-center">
            <p className="text-zinc-300 text-sm">
              We've sent a verification link to <span className="font-bold text-white">{email}</span>.
            </p>
            <button
              onClick={handleResend}
              disabled={loading || cooldown > 0}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold min-h-[44px] py-3 rounded-xl uppercase tracking-wider text-xs transition disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend Available in ${cooldown}s` : 'Resend Confirmation Email'}
            </button>
            <button
              onClick={() => {
                setMode('signin');
                setError('');
                setInfoMsg('');
              }}
              className="w-full flex items-center justify-center gap-2 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </button>
          </div>
        ) : (
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

            {(mode === 'signin' || mode === 'register') && (
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'register' ? "new-password" : "current-password"}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 pr-10 text-base sm:text-sm font-semibold focus:border-cyan-500 outline-none transition"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 pr-10 text-base sm:text-sm font-semibold focus:border-cyan-500 outline-none transition"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot_password');
                    setError('');
                    setInfoMsg('');
                  }}
                  className="text-xs font-bold text-cyan-500 hover:text-cyan-400 transition"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 transition disabled:opacity-50"
            >
              {loading ? (mode === 'register' ? 'Creating Account...' : mode === 'signin' ? 'Signing in...' : 'Processing...') : (
                mode === 'register' ? 'Create Account' : mode === 'signin' ? 'Sign In' : 'Send Reset Link'
              )}
            </button>
          </form>
        )}

        {mode === 'forgot_password' && (
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setMode('signin');
                setError('');
                setInfoMsg('');
              }}
              className="flex items-center justify-center gap-2 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition w-full"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
