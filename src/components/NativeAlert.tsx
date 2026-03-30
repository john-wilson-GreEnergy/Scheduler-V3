import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

interface NativeAlertProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}

export const NativeAlert: React.FC<NativeAlertProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info'
}) => {
  const getIcon = () => {
    switch (type) {
      case 'error': return <AlertCircle className="text-red-500" size={24} />;
      case 'warning': return <AlertTriangle className="text-yellow-500" size={24} />;
      case 'success': return <CheckCircle2 className="text-emerald-500" size={24} />;
      default: return <Info className="text-blue-500" size={24} />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'error': return 'bg-red-500/10 border-red-500/20';
      case 'warning': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'success': return 'bg-emerald-500/10 border-emerald-500/20';
      default: return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${getBgColor()} bg-white dark:bg-gray-900`}
          >
            <div className="flex items-start gap-4">
              <div className="mt-1">{getIcon()}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{message}</p>
              </div>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold hover:opacity-90 transition-all active-scale"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
