import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { CoachProvider } from './context/CoachContext';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { LoginView } from './components/auth/LoginView';
import { ResetPasswordView } from './components/auth/ResetPasswordView';
import { GlobalRestTimerPill } from './components/common/GlobalRestTimerPill';
import './App.css';

const WorkoutEngine = React.lazy(() =>
  import('./components/workout/WorkoutEngine').then((m) => ({ default: m.WorkoutEngine }))
);
const NutritionEngine = React.lazy(() =>
  import('./components/nutrition/NutritionEngine').then((m) => ({ default: m.NutritionEngine }))
);
const ExercisesView = React.lazy(() =>
  import('./components/exercises/ExercisesView').then((m) => ({ default: m.ExercisesView }))
);
const SettingsView = React.lazy(() =>
  import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const CoachCockpit = React.lazy(() =>
  import('./components/coach/CoachCockpit').then((m) => ({ default: m.CoachCockpit }))
);
const HistoryView = React.lazy(() =>
  import('./components/history/HistoryView').then((m) => ({ default: m.HistoryView }))
);

const LazyFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center p-12 text-cyan-400 font-mono text-xs">
    Loading...
  </div>
);

// Guard for authenticated routes
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, refreshProfile } = useAuth();
  const [showRetry, setShowRetry] = useState(false);

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (!loading || user) {
      setShowRetry(false);
      return;
    }
    const timer = setTimeout(() => setShowRetry(true), 2000);
    return () => clearTimeout(timer);
  }, [loading, user]);

  // Display content immediately when optimistic cached user is available
  if (user) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
        <div className="text-cyan-400 font-mono text-xs tracking-wider">Connecting to CyberGym...</div>
        {showRetry && (
          <button
            type="button"
            onClick={() => {
              setShowRetry(false);
              refreshProfile();
            }}
            data-testid="auth-retry-button"
            className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition shadow-neon-cyan active:scale-95 touch-manipulation flex items-center justify-center"
          >
            Connecting to CyberGym... Tap to Retry
          </button>
        )}
      </div>
    );
  }
  return <Navigate to="/login" replace />;
};

// Guard for Coach-only routes
const CoachRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isCoachMode, loading } = useAuth();
  if (user) {
    if (!isCoachMode) {
      return <Navigate to="/workout" replace />;
    }
    return <>{children}</>;
  }
  if (loading) return null;
  return <Navigate to="/login" replace />;
};

// Guard for Login route when already authenticated
const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isCoachMode, loading } = useAuth();
  if (user) {
    return <Navigate to={isCoachMode ? '/coach' : '/workout'} replace />;
  }
  if (loading) return null;
  return <>{children}</>;
};

function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100 selection:bg-cyan-500/20 selection:text-cyan-300">
      <Header />
      <main className={`flex-1 max-w-xl w-full mx-auto p-4 ${user ? 'pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))]' : 'pb-8'}`}>
        <React.Suspense fallback={<LazyFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/workout" replace />} />
            <Route
              path="/workout"
              element={
                <ProtectedRoute>
                  <WorkoutEngine />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nutrition"
              element={
                <ProtectedRoute>
                  <NutritionEngine />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/exercises"
              element={
                <ProtectedRoute>
                  <ExercisesView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coach"
              element={
                <CoachRoute>
                  <CoachCockpit />
                </CoachRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginView />
                </PublicOnlyRoute>
              }
            />
            <Route 
              path="/reset-password" 
              element={<ResetPasswordView />} 
            />
            <Route path="*" element={<Navigate to="/workout" replace />} />
          </Routes>
        </React.Suspense>
      </main>
      <GlobalRestTimerPill />
      <BottomNav />
    </div>
  );
}

export function App() {
  return (
    <Router>
      <AuthProvider>
        <CoachProvider>
          <AppLayout />
        </CoachProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
