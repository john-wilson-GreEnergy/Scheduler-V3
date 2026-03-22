import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertCircle } from 'lucide-react';
import { Employee, Jobsite } from '../types';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  targetJobsites: Jobsite[];
  allJobsites: Jobsite[];
  weekStart: string;
  onConfirm: (action: 'replace' | 'add', jobsiteDays: Record<string, string[]>) => void;
}

export default function AssignmentModal({ isOpen, onClose, employee, targetJobsites, allJobsites, weekStart, onConfirm }: AssignmentModalProps) {
  const [action, setAction] = useState<'replace' | 'add' | 'rotation'>('add');
  const [selectedJobsites, setSelectedJobsites] = useState<Jobsite[]>(targetJobsites);
  const [jobsiteDays, setJobsiteDays] = useState<Record<string, string[]>>(
    targetJobsites.reduce((acc, site) => ({ ...acc, [site.id]: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }), {})
  );
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleToggleDay = (jobsiteId: string, day: string) => {
    setJobsiteDays(prev => {
      const currentDays = prev[jobsiteId] || [];
      const newDays = currentDays.includes(day) 
        ? currentDays.filter(d => d !== day) 
        : [...currentDays, day];
      return { ...prev, [jobsiteId]: newDays };
    });
  };

  const addJobsite = (jobsiteId: string) => {
    const site = allJobsites.find(j => j.id === jobsiteId);
    if (site && !selectedJobsites.find(s => s.id === site.id)) {
      setSelectedJobsites([...selectedJobsites, site]);
      setJobsiteDays(prev => ({ ...prev, [site.id]: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }));
    }
  };

  const removeJobsite = (jobsiteId: string) => {
    setSelectedJobsites(selectedJobsites.filter(s => s.id !== jobsiteId));
    setJobsiteDays(prev => {
      const newDays = { ...prev };
      delete newDays[jobsiteId];
      return newDays;
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">Assign {employee.first_name} {employee.last_name}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2 block">Action</label>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => setAction('add')}
                  className={`p-4 rounded-2xl border ${action === 'add' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-black/20 border-emerald-900/30'}`}
                >
                  Add
                </button>
                <button
                  onClick={() => setAction('replace')}
                  className={`p-4 rounded-2xl border ${action === 'replace' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-black/20 border-emerald-900/30'}`}
                >
                  Replace
                </button>
                <button
                  onClick={() => setAction('rotation')}
                  className={`p-4 rounded-2xl border ${action === 'rotation' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-black/20 border-emerald-900/30'}`}
                >
                  Rotation
                </button>
              </div>
            </div>

            {action !== 'rotation' && (
              <div>
                <label className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2 block">Jobsites</label>
                <div className="space-y-4">
                  {selectedJobsites.map(site => (
                    <div key={site.id} className="p-4 bg-black/20 border border-emerald-900/30 rounded-2xl">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-sm font-bold text-white">{site.jobsite_name}</p>
                        <button onClick={() => removeJobsite(site.id)} className="text-red-500 hover:text-red-400"><X size={16} /></button>
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {daysOfWeek.map(day => (
                          <button
                            key={day}
                            onClick={() => handleToggleDay(site.id, day)}
                            className={`p-2 rounded-lg border text-center text-xs ${jobsiteDays[site.id]?.includes(day) ? 'bg-emerald-500/10 border-emerald-500 text-white' : 'bg-black/20 border-emerald-900/30 text-gray-500'}`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  <select 
                    className="w-full p-4 bg-black/20 border border-emerald-900/30 rounded-2xl text-white text-sm"
                    onChange={(e) => addJobsite(e.target.value)}
                    value=""
                  >
                    <option value="" disabled>Add another jobsite...</option>
                    {allJobsites.filter(s => !selectedJobsites.find(sel => sel.id === s.id)).map(site => (
                      <option key={site.id} value={site.id}>{site.jobsite_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
              <button 
                onClick={() => onConfirm(action, jobsiteDays)}
                className="px-6 py-2 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
