import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { SurveyModal } from './SurveyModal';
import { TargetSelectionModal } from './TargetSelectionModal';
import { Employee } from '../types';
import { format } from 'date-fns';
import { Plus, MessageSquare } from 'lucide-react';
import { parseAssignmentNames } from '../utils/assignmentParser';

interface SurveyInitiatorProps {
  userId: string;
  email: string;
  userRole: 'admin' | 'manager' | 'employee';
}

export const SurveyInitiator: React.FC<SurveyInitiatorProps> = ({ userId, email, userRole }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [eligibleTargets, setEligibleTargets] = useState<Employee[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const handleStartSurvey = async () => {
    // Fetch eligible targets based on user role and jobsite
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    
    // 1. Get current user's jobsite for this week
    const { data: userAssignments, error: assignError } = await supabase
      .from('assignment_weeks')
      .select('id, week_start, assignment_name')
      .eq('email', email)
      .lte('week_start', todayStr)
      .order('week_start', { ascending: false })
      .limit(1);
      
    if (!userAssignments || userAssignments.length === 0) {
      alert('No jobsite assignment found for this week.');
      return;
    }
    
    const assignmentNames = parseAssignmentNames(userAssignments[0].assignment_name);
    
    // Get jobsite groups for these jobsites
    const { data: jobsites, error: sitesError } = await supabase
      .from('jobsites')
      .select('id, jobsite_group')
      .in('jobsite_group', assignmentNames);
      
    if (sitesError || !jobsites) {
      alert('Error fetching jobsite information.');
      return;
    }
    
    const jobsiteGroups = Array.from(new Set(jobsites?.map(j => j.jobsite_group).filter(Boolean) as string[]));
    
    // 2. Get other employees with the target role at the same jobsite group
    const targetRole = userRole === 'manager' ? 'bess_tech' : 'site_manager';
    
    // 2. Get other employees with the target role
    const { data: targets, error: targetsError } = await supabase
      .from('employees')
      .select('*')
      .eq('role', targetRole);
      
    if (targetsError) {
      console.error('Error fetching targets:', targetsError);
      alert('Error fetching eligible employees.');
      return;
    }

    // 3. Get assignment weeks for these employees for the target week
    const { data: targetAssignments, error: targetAssignError } = await supabase
      .from('assignment_weeks')
      .select('*')
      .eq('week_start', userAssignments[0].week_start)
      .in('employee_id', targets.map(t => t.employee_id_ref));
      
    if (targetAssignError) {
      console.error('Error fetching target assignments:', targetAssignError);
      alert('Error fetching eligible employees.');
      return;
    }

    // 4. Filter targets in JS
    const filteredTargets = targets.filter(emp => {
      const empAssignments = targetAssignments.filter(ta => ta.employee_id === emp.employee_id_ref);
      
      // Parse assignment names for this employee
      const empAssignmentNames = empAssignments.flatMap(aw => parseAssignmentNames(aw.assignment_name || ''));
      
      // Check if any of these assignment names match the current user's assignment names
      return empAssignmentNames.some(name => assignmentNames.includes(name));
    });
      
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
            const type = userRole === 'manager' ? 'manager_eval_tech' : 'tech_eval_manager';
            console.log('Debug: SurveyInitiator passing surveyType:', type, 'for userRole:', userRole);
            return type;
          })()}
          raterId={userId} 
          targetId={selectedTargetId} 
          weekStartDate={format(new Date(), 'yyyy-MM-dd')} 
        />
      )}
    </>
  );
};
