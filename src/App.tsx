import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import AdminPortal from './components/AdminPortal';
import EmployeePortal from './components/EmployeePortal';
import SiteManagerPortal from './components/SiteManagerPortal';
import SiteLeadPortal from './components/SiteLeadPortal';
import HRPortal from './components/HRPortal';
import StandaloneMap from './components/StandaloneMap';
import { RefreshCw, User } from 'lucide-react';
import { motion } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'sonner';

export default function App() {
  const { user, isAdmin, isSiteManager, isSiteLead, isHR, loading, handleLogin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A08] flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-right" theme="dark" richColors />
      <Routes>
        <Route path="/map" element={<StandaloneMap />} />

        <Route
          path="/login"
          element={
            !user ? (
              <div className="min-h-screen bg-[#050A08] flex items-center justify-center p-6">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-md w-full bg-[#0A120F] border border-emerald-900/30 p-8 rounded-3xl shadow-2xl text-center"
                >
                  <div className="flex items-center justify-center gap-3 mb-6">
                    <img src="/logo.png" alt="Greenergy Logo" className="h-16 object-contain" referrerPolicy="no-referrer" />
                    <div className="flex flex-col items-start justify-center text-left">
                      <span className="text-white font-bold text-2xl leading-none tracking-tight">GreEnergy</span>
                      <span className="text-emerald-500 font-bold text-[0.65rem] uppercase tracking-[0.2em] leading-tight mt-1">RESOURCES</span>
                    </div>
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2">Portal Access</h1>
                  <p className="text-gray-400 mb-8">Sign in to access your dashboard and company resources.</p>
                  <button
                    onClick={handleLogin}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
                  >
                    <User size={20} />
                    Sign In with Company Account
                  </button>
                  <p className="mt-6 text-xs text-gray-500">
                    Authorized access only. All activities are monitored.
                  </p>
                </motion.div>
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/admin/*"
          element={
            user ? (
              isAdmin ? <AdminPortal /> : <Navigate to="/portal" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/hr/*"
          element={
            user ? (
              (isAdmin || isHR) ? <HRPortal /> : <Navigate to="/portal" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/site-manager/*"
          element={
            user ? (
              (isAdmin || isSiteManager) ? <SiteManagerPortal /> : <Navigate to="/portal" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/site-lead/*"
          element={
            user ? (
              (isAdmin || isSiteLead) ? <SiteLeadPortal /> : <Navigate to="/portal" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/portal/*"
          element={
            user ? <EmployeePortal /> : <Navigate to="/login" replace />
          }
        />

        <Route
          path="/"
          element={
            user ? (
              isAdmin
                ? <Navigate to="/admin" replace />
                : isHR
                ? <Navigate to="/hr" replace />
                : isSiteManager
                ? <Navigate to="/site-manager" replace />
                : isSiteLead
                ? <Navigate to="/site-lead" replace />
                : <Navigate to="/portal" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
