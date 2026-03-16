import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Users, 
  MapPin, 
  Calendar, 
  Settings, 
  Shield, 
  Clock,
  ArrowRight,
  Command,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export default function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null; // This is handled by parent usually, but good to have
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const commands = [
    { id: 'dashboard', label: 'Go to Dashboard', icon: <Calendar size={16} />, category: 'Navigation' },
    { id: 'employees', label: 'Manage Employees', icon: <Users size={16} />, category: 'Navigation' },
    { id: 'map', label: 'View Map Portal', icon: <MapPin size={16} />, category: 'Navigation' },
    { id: 'requests', label: 'Review Requests', icon: <Clock size={16} />, category: 'Navigation' },
    { id: 'data-health', label: 'System Health', icon: <Shield size={16} />, category: 'System' },
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="relative w-full max-w-2xl bg-[#0A120F] border border-emerald-900/30 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-white/5 flex items-center gap-4">
          <Search className="text-emerald-500" size={20} />
          <input 
            ref={inputRef}
            type="text"
            placeholder="Search commands, employees, or jobsites..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder:text-gray-600"
          />
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/5 text-[10px] font-bold text-gray-500">
            <Command size={10} />
            <span>K</span>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2 custom-scrollbar">
          {filteredCommands.length > 0 ? (
            <div className="space-y-4 p-2">
              {['Navigation', 'System'].map(category => {
                const catCmds = filteredCommands.filter(c => c.category === category);
                if (catCmds.length === 0) return null;
                return (
                  <div key={category}>
                    <h4 className="px-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">{category}</h4>
                    <div className="space-y-1">
                      {catCmds.map(cmd => (
                        <button
                          key={cmd.id}
                          onClick={() => {
                            onNavigate(cmd.id);
                            onClose();
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-emerald-500/10 group transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-colors">
                              {cmd.icon}
                            </div>
                            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{cmd.label}</span>
                          </div>
                          <ChevronRight size={14} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-600">
                <Search size={32} />
              </div>
              <p className="text-gray-500 text-sm">No results found for "{query}"</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-black/20 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-600 font-bold uppercase tracking-widest">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><ArrowRight size={10} /> Select</span>
            <span className="flex items-center gap-1">ESC Close</span>
          </div>
          <div className="text-emerald-500/50">GreEnergy Workforce OS v2.4</div>
        </div>
      </motion.div>
    </div>
  );
}
