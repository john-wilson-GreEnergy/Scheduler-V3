import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
}

interface NotificationContextType {
  showNotification: (title: string, message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = (title: string, message: string, type: NotificationType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, title, message, type }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="fixed top-safe left-0 right-0 z-[200] pointer-events-none p-4 flex flex-col items-center gap-3">
        <AnimatePresence>
          {notifications.map(notification => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="pointer-events-auto w-full max-w-sm bg-[#0A120F]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-4"
            >
              <div className={`p-2 rounded-xl ${
                notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-500' :
                notification.type === 'warning' ? 'bg-amber-500/20 text-amber-500' :
                notification.type === 'error' ? 'bg-red-500/20 text-red-500' :
                'bg-blue-500/20 text-blue-500'
              }`}>
                {notification.type === 'success' ? <CheckCircle2 size={20} /> :
                 notification.type === 'warning' ? <AlertTriangle size={20} /> :
                 notification.type === 'error' ? <AlertTriangle size={20} /> :
                 <Info size={20} />}
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-white">{notification.title}</h4>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{notification.message}</p>
              </div>

              <button 
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                className="p-1 text-gray-600 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};
