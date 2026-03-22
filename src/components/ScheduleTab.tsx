import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Jobsite, SiteEmployee } from '../types';
import { format, startOfWeek, parseISO } from 'date-fns';
import { motion } from 'motion/react';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';

interface ScheduleTabProps {
  jobsite: Jobsite | null;
  allJobsites: Jobsite[];
  siteEmployees: SiteEmployee[];
}

export default function ScheduleTab({ jobsite, allJobsites, siteEmployees }: ScheduleTabProps) {
  const [futureAssignments, setFutureAssignments] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const weeksPerPage = 6;
  const displayedWeeks = weeks.slice(weekOffset * weeksPerPage, (weekOffset + 1) * weeksPerPage);

  const navigateWeeks = (direction: 'prev' | 'next') => {
    setWeekOffset(prev => Math.max(0, direction === 'next' ? prev + 1 : prev - 1));
  };

  useEffect(() => {
    if (!jobsite) return;
    const fetchSchedule = async () => {
      setLoading(true);
      const todayStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      const siteGroup = (jobsite as any).jobsite_group;
      const groupSites = siteGroup ? allJobsites.filter((s: any) => s.jobsite_group === siteGroup) : [jobsite];
      const jobsiteIds = groupSites.map((s: any) => s.id);

      const { data, error } = await supabase
        .from('assignment_weeks')
        .select(`
          *,
          assignment_items (
            *,
            jobsites (*)
          )
        `)
        .gte('week_start', todayStr)
        .order('week_start');

      if (error) { console.error(error); setLoading(false); return; }
      
      setFutureAssignments(data || []);
      const weekSet = Array.from(new Set((data || []).map((a: any) => a.week_start))).sort() as string[];
      setWeeks(weekSet);
      setLoading(false);
    };
    fetchSchedule();
  }, [jobsite, allJobsites]);

  const { scheduleData, allEmps } = React.useMemo(() => {
    const siteGroup = (jobsite as any).jobsite_group;
    const groupSites = siteGroup ? allJobsites.filter((s: any) => s.jobsite_group === siteGroup) : [jobsite];
    const jobsiteIds = groupSites.map((s: any) => s.id);

    const data: Record<string, Record<string, string>> = {};
    futureAssignments.forEach((a: any) => {
      console.log('Assignment:', a);
      const key = a.employee_fk || '';
      if (!key) return;
      if (!data[key]) data[key] = {};
      
      const item = a.assignment_items?.find((i: any) => jobsiteIds.includes(i.jobsite_fk));
      const isRotation = a.assignment_type?.toLowerCase() === 'rotation' || item?.assignment_type?.toLowerCase() === 'rotation';
      const isCurrentSite = item !== undefined;

      if (isCurrentSite || isRotation) {
        const jobsiteGroup = item?.jobsites?.jobsite_group;
        const jobsiteName = item?.jobsites?.jobsite_name;
        // If it's a rotation, maybe we should show the assignment_type if jobsite info is missing
        data[key][a.week_start] = jobsiteGroup || jobsiteName || a.assignment_type || 'Assigned';
      } else {
        data[key][a.week_start] = ''; // Blank
      }
    });

    const emps = Array.from(new Set([
      ...siteEmployees.map((e: any) => e.id),
      ...Object.keys(data),
    ])).filter(id => {
      const emp = siteEmployees.find((e: any) => e.id === id);
      return !!emp;
    });

    return { scheduleData: data, allEmps: emps };
  }, [futureAssignments, siteEmployees, jobsite, allJobsites]);

  const getEmpName = (employeeId: string) => {
    const emp = siteEmployees.find((e: any) => e.id === employeeId);
    if (emp) return { name: `${emp.first_name} ${emp.last_name}`, title: emp.job_title || '' };
    return { name: 'Unknown', title: '' };
  };

  if (loading) return (
    <div className="py-20 text-center text-gray-600 text-sm italic">Loading schedule...</div>
  );

  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  return (
    <motion.div key="schedule" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-6 flex items-center justify-between">
          <div className='flex items-center gap-2'>
            <Layers size={16} className="text-emerald-500" />
            Upcoming Schedule — {(jobsite as any)?.jobsite_group || (jobsite as any)?.jobsite_name}
            <span className="ml-2 text-[10px] text-gray-600 font-normal">{weeks.length} weeks</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigateWeeks('prev')} disabled={weekOffset === 0} className="p-1 rounded bg-white/5 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <button onClick={() => navigateWeeks('next')} disabled={(weekOffset + 1) * weeksPerPage >= weeks.length} className="p-1 rounded bg-white/5 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </h3>
        {weeks.length === 0 ? (
          <div className="py-10 text-center text-gray-600 italic text-sm">No upcoming assignments found for this site.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-[10px] text-gray-600 uppercase tracking-widest font-bold pb-4 pr-6 min-w-[180px] sticky left-0 bg-[#0A120F]">Employee</th>
                  {displayedWeeks.map((w: string) => {
                    const isThis = w === thisWeek;
                    return (
                      <th key={w} className={`text-center text-[10px] uppercase tracking-widest font-bold pb-4 px-3 min-w-[90px] ${isThis ? 'text-emerald-500' : 'text-gray-600'}`}>
                        {isThis ? 'This Week' : format(parseISO(w), 'MMM d')}
                        <div className="font-mono text-[9px] mt-0.5 opacity-50">{format(parseISO(w), 'MM/dd')}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {allEmps.map((employeeId: string) => {
                  const { name, title } = getEmpName(employeeId);
                  const empWeeks = scheduleData[employeeId] || {};
                  return (
                    <tr key={employeeId} className="group">
                      <td className="py-3 pr-6 sticky left-0 bg-[#0A120F]">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-500 shrink-0">
                            {name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white capitalize">{name}</p>
                            {title && <p className="text-[10px] text-gray-600">{title}</p>}
                          </div>
                        </div>
                      </td>
                      {displayedWeeks.map((w: string) => {
                        const assignment = empWeeks[w];
                        return (
                          <td key={w} className="py-3 px-3 text-center">
                            {assignment ? (
                              <span className={`inline-block px-2 py-1 rounded-lg text-[10px] font-bold ${assignment.includes('Rotation') ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {assignment}
                              </span>
                            ) : (
                              <span className="text-gray-700 text-[10px]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex items-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-emerald-500/20 inline-block" />
          Assigned to site
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-white/5 inline-block" />
          Not scheduled
        </div>
      </div>
    </motion.div>
  );
}
