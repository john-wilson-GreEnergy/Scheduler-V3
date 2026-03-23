import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { haptics } from '../services/hapticsService';
import { NotificationType } from '@capacitor/haptics';

interface NativeAlertProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
  type?: 'info' | 'warning' | 'error';
}

export const NativeAlert: React.FC<NativeAlertProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  confirmText = 'Ok',
  type = 'info'
}) => {
  React.useEffect(() => {
    if (isOpen) {
      if (type === 'error' || type === 'warning') {
        haptics.notification(NotificationType.Error);
      } else {
        haptics.impact();
      }
    }
  }, [isOpen, type]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-[28px] overflow-hidden shadow-2xl"
          >
            <div className="p-6 text-center">
              <h3 className="text-lg font-black text-white mb-2">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-4 border-t border-white/10 text-emerald-500 font-black text-base active:bg-white/5 transition-colors"
            >
              {confirmText}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
