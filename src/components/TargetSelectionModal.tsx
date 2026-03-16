import React from 'react';
import { X } from 'lucide-react';
import { Employee } from '../types';

interface TargetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targets: Employee[];
  onSelect: (targetId: string) => void;
}

export const TargetSelectionModal: React.FC<TargetSelectionModalProps> = ({ isOpen, onClose, targets, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-950 rounded-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Select Target</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
        </div>
        <div className="space-y-2">
          {targets.map(target => (
            <button
              key={target.id}
              onClick={() => { onSelect(target.id); onClose(); }}
              className="w-full text-left p-3 hover:bg-zinc-800 text-gray-300 rounded-lg"
            >
              {target.first_name} {target.last_name} ({target.job_title})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
