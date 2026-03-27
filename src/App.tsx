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

export default function App() {
  const { user, isAdmin, isSiteManager, isSiteLead, isHR, loading, handleLogin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A08] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
        <p className="text-gray-500 text-sm font-mono">Initializing Application...</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-gray-500 hover:text-white transition-all"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/map" element={<StandaloneMap />} />

        <Route
          path="/admin/*"
          element={isAdmin ? <AdminPortal /> : <Navigate to="/portal" replace />}
        />

        <Route
          path="/hr/*"
          element={(isAdmin || isHR) ? <HRPortal /> : <Navigate to="/portal" replace />}
        />

        <Route
          path="/site-manager/*"
          element={(isAdmin || isSiteManager) ? <SiteManagerPortal /> : <Navigate to="/portal" replace />}
        />

        <Route
          path="/site-lead/*"
          element={(isAdmin || isSiteLead) ? <SiteLeadPortal /> : <Navigate to="/portal" replace />}
        />

        <Route
          path="/portal/*"
          element={<EmployeePortal />}
        />

        <Route
          path="/"
          element={
            isAdmin
              ? <Navigate to="/admin" replace />
              : isHR
              ? <Navigate to="/hr" replace />
              : isSiteManager
              ? <Navigate to="/site-manager" replace />
              : isSiteLead
              ? <Navigate to="/site-lead" replace />
              : <Navigate to="/portal" replace />
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
