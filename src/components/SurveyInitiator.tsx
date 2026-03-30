import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { SurveyModal } from './SurveyModal';
import { TargetSelectionModal } from './TargetSelectionModal';
import { Employee } from '../types';
import { format, startOfWeek } from 'date-fns';
import { Plus, MessageSquare } from 'lucide-react';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { NativeAlert } from './NativeAlert';
import { fetchCurrentScheduleBackend } from '../lib/supabase_functions';

import { Role } from '../types';
import { SurveyType } from '../types/surveys';

interface SurveyInitiatorProps {
  userId: string;
  email: string;
  userRole: Role;
  jobsiteGroup?: string;
  weekStartDate?: string;
}

const getSurveyType = (raterRole: Role, targetRole: Role): SurveyType | null => {
  if (raterRole === 'bess_tech') {
    if (targetRole === 'site_manager') return 'tech_eval_manager';
    if (targetRole === 'site_lead') return 'tech_eval_lead';
  }
  if (raterRole === 'site_lead') {
    if (targetRole === 'bess_tech') return 'lead_eval_tech';
    if (targetRole === 'site_manager') return 'tech_eval_manager';
  }
  if (raterRole === 'site_manager') {
    if (targetRole === 'bess_tech') return 'manager_eval_tech';
    if (targetRole === 'site_lead') return 'tech_eval_lead';
  }
  return null;
};

export const SurveyInitiator: React.FC<SurveyInitiatorProps> = ({ userId, email, userRole, jobsiteGroup, weekStartDate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [eligibleTargets, setEligibleTargets] = useState<Employee[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string; type?: 'info' | 'warning' | 'error' }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const handleStartSurvey = async () => {
    let assignmentNames: string[] = [];
    let weekStart = weekStartDate;

    if (jobsiteGroup) {
      assignmentNames = [jobsiteGroup];
      if (!weekStart) {
        weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      }
    } else {
      // Fetch eligible targets based on user role and jobsite
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      
      // 1. Get current user's jobsite for this week
      const userAssignments = await fetchCurrentScheduleBackend('', {
        employeeId: userId,
        lte: todayStr,
        order: { column: 'week_start', ascending: false },
        limit: 1
      });
        
      if (!userAssignments || userAssignments.length === 0) {
        setAlertConfig({
          isOpen: true,
          title: 'No Assignment',
          message: 'No jobsite assignment found for this week. You must be assigned to a jobsite to start a survey.',
          type: 'warning'
        });
        return;
      }
      
      assignmentNames = userAssignments[0].jobsite_name ? [userAssignments[0].jobsite_name] : parseAssignmentNames(userAssignments[0].assignment_type);
      weekStart = userAssignments[0].week_start;
    }
    
    // 2. Get other employees assigned to the same jobsite
    let targets: Employee[] = [];
    
    if (userRole === 'employee') {
      // Find the jobsite for the current assignment
      const { data: jobsites } = await supabase
        .from('jobsites')
        .select('manager')
        .or(assignmentNames.map(n => `jobsite_name.ilike.%${n}%,jobsite_group.ilike.%${n}%`).join(','));
        
      if (jobsites && jobsites.length > 0) {
        const managerNames = jobsites.flatMap(j => j.manager?.split(',').map(m => m.trim()) || []);
        
        // Fetch the manager's employee record
        const { data: managers } = await supabase
          .from('employees')
          .select('*')
          .in('first_name', managerNames.map(m => m.split(' ')[0]))
          .in('last_name', managerNames.map(m => m.split(' ')[1] || ''));
          
        targets = managers || [];
      }
    } else {
      const { data: allTargets, error: targetsError } = await supabase
        .from('employees')
        .select('*')
        .neq('id', userId); // Exclude current user
        
      if (targetsError) {
        console.error('Error fetching targets:', targetsError);
        setAlertConfig({
          isOpen: true,
          title: 'Error',
          message: `Error fetching eligible employees: ${targetsError.message}`,
          type: 'error'
        });
        return;
      }
      targets = allTargets || [];
    }

    // 3. Get assignment weeks for these employees for the target week
    if (targets.length === 0) {
      setEligibleTargets([]);
      setIsTargetModalOpen(true);
      return;
    }

    const targetAssignments = await fetchCurrentScheduleBackend(weekStart, {
      employeeId: targets.map(t => t.id).join(',') // This might not work if fetchCurrentScheduleBackend doesn't support comma separated IDs
    });

    // 4. Filter targets in JS
    console.log('Targets before filtering:', targets);
    console.log('Target assignments for week:', targetAssignments);
    console.log('User assignment names:', assignmentNames);

    const filteredTargets = targets.filter(emp => {
      // Constraint: Cannot survey own role
      if (userRole === emp.role) return false;

      const empAssignments = targetAssignments.filter(ta => ta.employee_fk === emp.id);
      
      // Parse assignment names for this employee
      const empAssignmentNames = empAssignments.flatMap(row => row.jobsite_name ? [row.jobsite_name] : parseAssignmentNames(row.assignment_type || ''));
      
      // Check if any of these assignment names match the current user's assignment names
      const isMatch = empAssignmentNames.some(empName => 
        assignmentNames.some(userName => 
          empName.includes(userName) || userName.includes(empName)
        )
      );
      
      console.log(`Filtering ${emp.first_name} ${emp.last_name}: match=${isMatch}, empAssignmentNames=${JSON.stringify(empAssignmentNames)}, empAssignments=${JSON.stringify(empAssignments)}`);
      
      return isMatch;
    });
    
    console.log('Filtered targets:', filteredTargets);
      
    if (filteredTargets) {
      setEligibleTargets(filteredTargets);
      setIsTargetModalOpen(true);
    }
  };

  return (
    <>
      <button onClick={handleStartSurvey} className="w-full p-4 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-2xl border border-white/5 flex items-center justify-between transition-all group">
        <div className="flex items-center gap-3">
          <span className="text-emerald-500 group-hover:text-black"><MessageSquare size={16} /></span>
          <span className="text-xs font-bold">Start New Survey</span>
        </div>
        <Plus size={16} className="opacity-50" />
      </button>

      <TargetSelectionModal
        isOpen={isTargetModalOpen}
        onClose={() => setIsTargetModalOpen(false)}
        targets={eligibleTargets}
        onSelect={(targetId) => {
          setSelectedTargetId(targetId);
          setIsModalOpen(true);
        }}
      />

      {selectedTargetId && (
        <SurveyModal 
          isOpen={isModalOpen} 
          onClose={() => { setIsModalOpen(false); setSelectedTargetId(null); }}
          surveyType={(() => {
            const target = eligibleTargets.find(t => t.id === selectedTargetId);
            if (!target) return 'tech_eval_manager'; // Default
            return getSurveyType(userRole, target.role) || 'tech_eval_manager';
          })()}
          raterId={userId} 
          targetId={selectedTargetId} 
          weekStartDate={weekStartDate} 
        />
      )}

      <NativeAlert 
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </>
  );
};
