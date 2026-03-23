import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Bell, LogOut, Construction, RefreshCw, Search, Command, UserCircle, ShieldCheck, ExternalLink, Menu, X as CloseIcon, Users, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { format, startOfWeek } from 'date-fns';
import NotificationPanel from './NotificationPanel';
import CommandPalette from './CommandPalette';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { haptics } from '../services/hapticsService';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

interface PortalLayoutProps {
  children: React.ReactNode;
  title: string;
  tabs: { id: string; label: string; icon?: React.ReactNode; category?: string }[];
  activeTab: string;
  onTabChange: (tab: any) => void;
  lastUpdated?: string;
  onRefresh?: () => void;
}

export default function PortalLayout({ 
  children, 
  title, 
  tabs, 
  activeTab, 
  onTabChange,
  lastUpdated,
  onRefresh
}: PortalLayoutProps) {
  const { user, employee, isAdmin, isSuperAdmin, isSiteManager, isSiteLead, isHR, handleLogout } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isEmployeeView = location.pathname.startsWith('/portal');

  useEffect(() => {
    if (!employee) return;

    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('employee_fk', employee.id)
        .eq('read', false);
      
      if (!error && count !== null) setUnreadCount(count);
    };

    fetchUnreadCount();

    const subscription = supabase
      .channel('notifications-bell')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'notifications',
        filter: `employee_fk=eq.${employee.id}`
      }, () => {
        fetchUnreadCount();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [employee]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile menu on route change or tab change
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMoreMenuOpen(false);
  }, [location.pathname, activeTab]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#050A08' });
    }
  }, []);

  const categories = Array.from(new Set(tabs.map(t => t.category || 'General')));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="Greenergy Logo" className="h-10 object-contain" referrerPolicy="no-referrer" />
          <div className="flex flex-col items-start justify-center">
            <span className="text-white font-bold text-xl leading-none tracking-tight">GreEnergy</span>
            <span className="text-emerald-500 font-bold text-[0.55rem] uppercase tracking-[0.2em] leading-tight mt-0.5">RESOURCES</span>
          </div>
        </div>

        <nav className="space-y-8">
          {categories.map(category => (
            <div key={category} className="space-y-2">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] px-4 mb-4">
                {category}
              </h3>
              <div className="space-y-1">
                {tabs.filter(t => (t.category || 'General') === category).map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => {
                      haptics.impact();
                      onTabChange(tab.id);
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-3 group ${
                      activeTab === tab.id 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className={`${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-600 group-hover:text-gray-400'} transition-colors`}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-8 border-t border-emerald-900/10 space-y-4">
        <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-xs">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{user?.email?.split('@')[0]}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider">
              {isAdmin ? 'Administrator' : isSuperAdmin ? 'Super Admin' : isSiteManager ? 'Site Manager' : isHR ? 'HR Visibility' : 'Employee'}
            </p>
          </div>
        </div>

        <button 
          onClick={() => {
            haptics.notification(NotificationType.Warning);
            handleLogout();
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-500 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all text-sm font-bold active-scale"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );

  // Bottom Sheet Component
  const BottomSheet = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-[#0A120F] border-t border-white/10 rounded-t-[32px] z-[101] pb-safe max-h-[90vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-3 mb-6" />
            <div className="px-6 pb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-white">{title}</h2>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 active-scale"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-[#050A08] text-gray-300 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 flex flex-col lg:flex-row pb-safe">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 border-r border-emerald-900/20 bg-zinc-950 sticky top-0 h-screen overflow-y-auto scrollbar-hide flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-zinc-950 border-r border-emerald-900/20 z-[70] lg:hidden overflow-y-auto scrollbar-hide"
            >
              <div className="absolute top-4 right-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-500 hover:text-white transition-colors"
                >
                  <CloseIcon size={24} />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 lg:h-24 border-b border-emerald-900/10 bg-[#050A08]/50 backdrop-blur-xl sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between pt-safe">
          <div className="flex items-center gap-4 lg:gap-6">
            <button 
              onClick={() => {
                haptics.impact();
                setIsMobileMenuOpen(true);
              }}
              className="lg:hidden p-2 text-gray-500 hover:text-emerald-500 transition-colors"
            >
              <Menu size={24} />
            </button>

            <h2 className="text-base lg:text-lg font-bold text-white tracking-tight truncate max-w-[160px] sm:max-w-none">{title}</h2>
            
            <div className="hidden sm:block h-4 w-px bg-emerald-900/20" />

            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={() => setIsCommandPaletteOpen(true)}
                className="flex items-center gap-3 px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-gray-500 hover:text-white transition-all group"
              >
                <Search size={12} className="group-hover:text-emerald-500 transition-colors" />
                <span className="hidden md:inline">Quick Search...</span>
                <div className="hidden md:flex items-center gap-1 px-1 py-0.5 bg-black/40 rounded border border-white/5 text-[8px] text-gray-700">
                  <Command size={8} />
                  <span>K</span>
                </div>
              </button>

              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5 ml-2">
                {isSuperAdmin && (
                  <button 
                    onClick={() => {
                      haptics.impact();
                      navigate('/admin');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      location.pathname.startsWith('/admin') 
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Super Admin
                  </button>
                )}
                {isAdmin && !isSuperAdmin && (
                  <button 
                    onClick={() => {
                      haptics.impact();
                      navigate('/admin');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      location.pathname.startsWith('/admin') 
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Admin
                  </button>
                )}
                {(isAdmin || isHR) && (
                  <button 
                    onClick={() => {
                      haptics.impact();
                      navigate('/hr');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      location.pathname.startsWith('/hr') 
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    HR
                  </button>
                )}
                {(isAdmin || isSiteManager) && (
                  <button 
                    onClick={() => {
                      haptics.impact();
                      navigate('/site-manager');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      location.pathname.startsWith('/site-manager') 
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Site Manager
                  </button>
                )}
                {(isAdmin || isSiteLead) && (
                  <button 
                    onClick={() => navigate('/site-lead')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      location.pathname.startsWith('/site-lead') 
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Site Lead
                  </button>
                )}
                <button 
                  onClick={() => navigate('/portal')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    location.pathname.startsWith('/portal') 
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  BESS Tech
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden md:flex items-center gap-4 mr-4">
              <div className="text-right">
                <p className="text-[9px] text-gray-600 uppercase font-black tracking-widest">Week Starting</p>
                <p className="text-xs font-mono text-emerald-500">
                  {format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')}
                </p>
              </div>
            </div>

            {onRefresh && (
              <button 
                onClick={onRefresh}
                className="p-2 lg:p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
                title="Refresh Data"
              >
                <RefreshCw size={16} className="text-gray-500 group-hover:text-emerald-500 transition-colors lg:w-[18px] lg:h-[18px]" />
              </button>
            )}

            <button 
              onClick={() => {
                haptics.impact();
                setIsNotificationsOpen(true);
              }}
              className="p-2 lg:p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all relative group active-scale"
            >
              <Bell size={16} className="text-gray-500 group-hover:text-white transition-colors lg:w-[18px] lg:h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </button>
            
            <button 
              onClick={() => {
                haptics.impact();
                setIsProfileOpen(true);
              }}
              className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-xs lg:text-sm active-scale"
            >
              {employee?.first_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </button>
            
            {!Capacitor.isNativePlatform() && (
              <button 
                onClick={() => window.open(window.location.origin, '_blank')}
                className="hidden sm:flex px-4 py-2 bg-emerald-500 text-black rounded-xl text-xs font-bold hover:bg-emerald-400 transition-all items-center gap-2"
              >
                <ExternalLink size={14} />
                Launch App
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-hide p-4 lg:p-8 pb-24 lg:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#050A08]/90 backdrop-blur-xl border-t border-emerald-900/30 z-40 px-2 py-3 pb-safe">
        <div className="flex items-center justify-around">
          {tabs.slice(0, 4).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  haptics.impact();
                  onTabChange(tab.id);
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active-scale ${
                  isActive ? 'text-emerald-500' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className={`${isActive ? 'bg-emerald-500/10' : ''} p-1.5 rounded-lg`}>
                  {tab.icon}
                </div>
                <span className="text-[9px] font-bold tracking-wider truncate max-w-[60px]">{tab.label.split(' ')[0]}</span>
              </button>
            );
          })}
          
          {/* More Button for Mobile */}
          <button
            onClick={() => {
              haptics.impact();
              setIsMoreMenuOpen(true);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active-scale ${
              isMoreMenuOpen ? 'text-emerald-500' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <div className={`${isMoreMenuOpen ? 'bg-emerald-500/10' : ''} p-1.5 rounded-lg`}>
              <MoreHorizontal size={18} />
            </div>
            <span className="text-[9px] font-bold tracking-wider">More</span>
          </button>
        </div>
      </div>

      {/* Bottom Sheets */}
      <BottomSheet 
        isOpen={isMoreMenuOpen} 
        onClose={() => setIsMoreMenuOpen(false)} 
        title="More Actions"
      >
        <div className="grid grid-cols-3 gap-4">
          {tabs.slice(4).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                haptics.impact();
                onTabChange(tab.id);
                setIsMoreMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all active-scale ${
                activeTab === tab.id 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' 
                  : 'bg-white/5 border-white/5 text-gray-400'
              }`}
            >
              <div className={activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400'}>
                {tab.icon}
              </div>
              <span className="text-[10px] font-bold text-center leading-tight">{tab.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        title="Profile & Settings"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-3xl border border-white/5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-2xl">
              {employee?.first_name?.[0] || 'U'}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">{employee?.first_name} {employee?.last_name}</h3>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                {employee?.role || 'User'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => {
                haptics.impact();
                navigate(isEmployeeView ? '/admin' : '/portal');
                setIsProfileOpen(false);
              }}
              className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5 active-scale"
            >
              <ShieldCheck size={20} className="text-emerald-500" />
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-white">Switch to {isEmployeeView ? 'Admin' : 'Employee'} Portal</p>
                <p className="text-[10px] text-gray-500">Access management tools</p>
              </div>
              <ExternalLink size={16} className="text-gray-600" />
            </button>

            <button 
              onClick={() => {
                haptics.notification(NotificationType.Warning);
                handleLogout();
                setIsProfileOpen(false);
              }}
              className="flex items-center gap-3 p-4 bg-red-500/5 rounded-2xl border border-red-500/10 active-scale"
            >
              <LogOut size={20} className="text-red-500" />
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-red-500">Sign Out</p>
                <p className="text-[10px] text-red-500/50">End your current session</p>
              </div>
            </button>
          </div>
        </div>
      </BottomSheet>

      <AnimatePresence>
        {isNotificationsOpen && employee && (
          <NotificationPanel 
            employeeId={employee.id} 
            onClose={() => setIsNotificationsOpen(false)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCommandPaletteOpen && (
          <CommandPalette 
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            onNavigate={onTabChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
