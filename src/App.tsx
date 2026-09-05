import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { CoachProvider } from './context/CoachContext';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { WorkoutEngine } from './components/workout/WorkoutEngine';
import { NutritionEngine } from './components/nutrition/NutritionEngine';
import { SettingsView } from './components/settings/SettingsView';
import { LoginView } from './components/auth/LoginView';
import { ExercisesView } from './components/exercises/ExercisesView';
import './App.css';

const CoachCockpit = React.lazy(() =>
  import('./components/coach/CoachCockpit').then((m) => ({ default: m.CoachCockpit }))
);
const HistoryView = React.lazy(() =>
  import('./components/history/HistoryView').then((m) => ({ default: m.HistoryView }))
);

const LazyFallback: React.FC = () => (
  <div className="flex items-center justify-center p-12 text-cyan-400 font-mono text-xs">
    Loading...
  </div>
);

// Guard for authenticated routes
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-cyan-400 font-mono text-xs">
        Loading...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// Guard for Coach-only routes
const CoachRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'coach') {
    return <Navigate to="/workout" replace />;
  }
  return <>{children}</>;
};

// Guard for Login route when already authenticated
const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return <Navigate to={role === 'coach' ? '/coach' : '/workout'} replace />;
  }
  return <>{children}</>;
};

function AppLayout() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100 selection:bg-cyan-500/20 selection:text-cyan-300">
      <Header />
      <main className="flex-1 max-w-xl w-full mx-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
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
                <React.Suspense fallback={<LazyFallback />}>
                  <HistoryView />
                </React.Suspense>
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
                <React.Suspense fallback={<LazyFallback />}>
                  <CoachCockpit />
                </React.Suspense>
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
          <Route path="*" element={<Navigate to="/workout" replace />} />
        </Routes>
      </main>
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
