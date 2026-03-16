import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Notification } from '../types';
import { Bell, X, Info, AlertTriangle, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface NotificationPanelProps {
  employeeId: string;
  onClose: () => void;
}

export default function NotificationPanel({ employeeId, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    
    // Subscribe to new notifications
    const subscription = supabase
      .channel('notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `employee_fk=eq.${employeeId}`
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [employeeId]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('employee_fk', employeeId)
      .order('created_at', { ascending: false });
    
    if (data) setNotifications(data);
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
    
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const deleteNotification = async (id: string) => {
    await supabase
      .from('notifications')
      .delete()
      .eq('id', id);
    
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed right-0 top-0 h-screen w-full max-w-md bg-[#050A08] border-l border-emerald-900/30 shadow-2xl z-50 flex flex-col"
    >
      <div className="p-6 border-b border-emerald-900/30 flex items-center justify-between bg-[#0A120F]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
            <Bell size={20} />
          </div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/5 rounded-full text-gray-400 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-gray-500 space-y-4">
            <Bell size={48} className="opacity-20" />
            <p>No notifications yet</p>
          </div>
        ) : (
          <AnimatePresence>
            {notifications.map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-4 rounded-2xl border transition-all ${
                  notification.read 
                    ? 'bg-white/5 border-white/10 opacity-60' 
                    : 'bg-emerald-500/5 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                }`}
              >
                <div className="flex gap-4">
                  <div className={`mt-1 p-2 rounded-lg ${
                    notification.type === 'alert' ? 'bg-red-500/10 text-red-500' :
                    notification.type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    {notification.type === 'alert' ? <AlertCircle size={16} /> :
                     notification.type === 'warning' ? <AlertTriangle size={16} /> :
                     <Info size={16} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="font-bold text-white text-sm">{notification.title}</h4>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {format(new Date(notification.created_at), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed mb-3">
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-3">
                      {!notification.read && (
                        <button 
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                        >
                          <Check size={12} />
                          Mark as read
                        </button>
                      )}
                      <button 
                        onClick={() => deleteNotification(notification.id)}
                        className="text-xs font-bold text-gray-500 hover:text-red-500 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="p-6 border-t border-emerald-900/30 bg-[#0A120F]">
        <button 
          onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
          className="w-full py-3 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-xl transition-all"
        >
          Mark all as read
        </button>
      </div>
    </motion.div>
  );
}
