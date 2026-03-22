import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export default function MobileSplashScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#050A08] flex flex-col items-center justify-center p-8 z-[9999]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-col items-center gap-6"
      >
        <div className="flex items-center gap-4">
          <img 
            src="/logo.png" 
            alt="Greenergy Logo" 
            className="h-24 w-24 object-contain" 
            referrerPolicy="no-referrer" 
          />
          <div className="flex flex-col items-start justify-center text-left">
            <span className="text-white font-bold text-4xl leading-none tracking-tight">GreEnergy</span>
            <span className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] leading-tight mt-2">RESOURCES</span>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 w-64">
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-white font-black text-2xl uppercase tracking-[0.2em] italic"
          >
            Herding Cats
          </motion.h2>
          
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
            <motion.div 
              className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "linear" }}
            />
          </div>
          
          <span className="text-emerald-500/50 font-mono text-[10px] tracking-widest uppercase">
            Loading System... {Math.round(progress)}%
          </span>
        </div>
      </motion.div>

      <div className="absolute bottom-12 text-gray-600 text-[10px] uppercase tracking-[0.4em] font-bold">
        Secure Portal v2.0
      </div>
    </div>
  );
}
