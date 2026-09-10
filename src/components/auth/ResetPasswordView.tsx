import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export const ResetPasswordView: React.FC = () => {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const res = await resetPassword(password);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/workout');
      }, 3000);
    } else {
      setError(res.error || 'Failed to reset password');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md w-full mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.4)] mx-auto mb-3">
          <Lock className="w-8 h-8 text-zinc-950 font-black" />
        </div>
        <h1 className="text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          Reset Password
        </h1>
      </div>

      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
        {error && (
          <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-6 text-center">
            <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="font-bold text-sm">Password Updated Successfully!</span>
            </div>
            <p className="text-zinc-400 text-xs uppercase tracking-wider">Redirecting you to the app...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl p-3 pr-10 text-base sm:text-sm font-semibold focus:border-cyan-500 outline-none transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 min-h-[44px] rounded-xl uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 transition disabled:opacity-50 mt-4"
            >
              {loading ? 'Resetting...' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
