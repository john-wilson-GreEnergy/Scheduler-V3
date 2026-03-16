import React from 'react';
import { RefreshCw, ArrowRightLeft, UserMinus, UserPlus } from 'lucide-react';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { isRotationWeek } from '../utils/rotation';
import { Employee, RotationConfig } from '../types';

interface SiteEmployee extends Employee {
  rotation_config?: RotationConfig;
  is_on_rotation?: boolean;
}

interface RotationPreviewProps {
  employees: SiteEmployee[];
}

export default function RotationPreview({ employees }: RotationPreviewProps) {
  const nextWeek = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
  
  const rotatingOff = employees.filter(emp => {
    if (!emp.rotation_config) return false;
    const isNowOn = !emp.is_on_rotation; // Currently active
    const willBeOn = isRotationWeek(nextWeek, emp.rotation_config, emp.rotation_group); // Will be on rotation next week
    return isNowOn && willBeOn;
  });

  const rotatingOn = employees.filter(emp => {
    if (!emp.rotation_config) return false;
    const isNowOff = emp.is_on_rotation; // Currently on rotation
    const willBeOff = isRotationWeek(nextWeek, emp.rotation_config, emp.rotation_group); // Will be on rotation next week
    return isNowOff && !willBeOff;
  });

  if (rotatingOff.length === 0 && rotatingOn.length === 0) {
    return (
      <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
          <RefreshCw size={16} className="text-purple-400" />
          Next Week Rotation
        </h3>
        <p className="text-sm text-gray-600 italic">No crew changes scheduled for next week.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6">
      <h3 className="font-bold text-white mb-4 flex items-center gap-2">
        <RefreshCw size={16} className="text-purple-400" />
        Next Week Rotation
      </h3>
      
      <div className="space-y-4">
        {rotatingOff.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
              <UserMinus size={10} className="text-purple-400" />
              Rotating Off
            </p>
            <div className="space-y-2">
              {rotatingOff.map(emp => (
                <div key={emp.id} className="flex items-center gap-3 px-3 py-2 bg-purple-500/5 border border-purple-500/10 rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400">
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <p className="text-xs font-bold text-gray-300">{emp.first_name} {emp.last_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {rotatingOn.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
              <UserPlus size={10} className="text-emerald-400" />
              Rotating On
            </p>
            <div className="space-y-2">
              {rotatingOn.map(emp => (
                <div key={emp.id} className="flex items-center gap-3 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-500">
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <p className="text-xs font-bold text-gray-300">{emp.first_name} {emp.last_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
