import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, ScanFace, CheckCircle2, XCircle } from 'lucide-react';
import { haptics } from '../services/hapticsService';
import { NotificationType } from '@capacitor/haptics';

interface BiometricAuthProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  type?: 'face' | 'fingerprint';
}

export const BiometricAuth: React.FC<BiometricAuthProps> = ({ 
  isOpen, 
  onSuccess, 
  onCancel, 
  type = 'face' 
}) => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (isOpen) {
      setStatus('scanning');
      haptics.impact();
      
      // Simulate scanning
      const timer = setTimeout(() => {
        const isSuccess = Math.random() > 0.1; // 90% success rate
        if (isSuccess) {
          setStatus('success');
          haptics.notification(NotificationType.Success);
          setTimeout(() => {
            onSuccess();
          }, 1000);
        } else {
          setStatus('error');
          haptics.notification(NotificationType.Error);
          setTimeout(() => {
            setStatus('idle');
            onCancel();
          }, 1500);
        }
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      setStatus('idle');
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-[#0A120F]/90 backdrop-blur-2xl border border-white/10 rounded-[40px] p-10 shadow-2xl flex flex-col items-center text-center"
          >
            <div className="relative mb-8">
              <AnimatePresence mode="wait">
                {status === 'scanning' && (
                  <motion.div
                    key="scanning"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative"
                  >
                    <div className="w-24 h-24 rounded-full border-2 border-emerald-500/20 flex items-center justify-center text-emerald-500">
                      {type === 'face' ? <ScanFace size={48} /> : <Fingerprint size={48} />}
                    </div>
                    <motion.div
                      animate={{ 
                        scale: [1, 1.2, 1],
                        opacity: [0.2, 0.5, 0.2]
                      }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute inset-0 rounded-full bg-emerald-500/10"
                    />
                  </motion.div>
                )}
                {status === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500"
                  >
                    <CheckCircle2 size={48} />
                  </motion.div>
                )}
                {status === 'error' && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center text-red-500"
                  >
                    <XCircle size={48} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <h3 className="text-xl font-black text-white mb-2">
              {status === 'scanning' ? (type === 'face' ? 'Face ID' : 'Touch ID') :
               status === 'success' ? 'Authenticated' : 'Authentication Failed'}
            </h3>
            <p className="text-sm text-gray-400 mb-10">
              {status === 'scanning' ? `Verifying your identity...` :
               status === 'success' ? 'Identity verified successfully' : 'Please try again'}
            </p>

            <button
              onClick={onCancel}
              className="px-8 py-3 bg-white/5 text-gray-500 font-bold rounded-2xl hover:text-white transition-colors active-scale"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
