import React, { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { AssignmentWeek, AssignmentItem } from '../types';
import { sendNotification } from '../utils/notifications';

export const AssignmentImporter: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleParse = () => {
    if (!file) return;
    Papa.parse(file, {
      header: false, // Set header to false to handle row-based indexing
      skipEmptyLines: true,
      complete: (results) => {
        setPreview(results.data as any[]);
      }
    });
  };

  const clearData = async () => {
    if (!window.confirm('Are you sure you want to clear all assignment data? This cannot be undone.')) return;
    setLoading(true);
    try {
      // assignment_items has a foreign key to assignment_weeks, so clearing items first is safer
      await supabase.from('assignment_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('assignment_weeks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      alert('Data cleared successfully!');
    } catch (error) {
      console.error(error);
      alert('Error clearing data.');
    } finally {
      setLoading(false);
    }
  };

  const syncData = async () => {
    setLoading(true);
    try {
      const { data: employees } = await supabase.from('employees').select('id, email, first_name, last_name');
      const { data: jobsites } = await supabase.from('jobsites').select('id, jobsite_name, group_id');
      const { data: jobsiteGroups } = await supabase.from('jobsite_groups').select('id, name');

      const dataRows = preview.slice(5); // Row 6 onwards
      const dateRow = preview[4]; // Row 5

      // Fetch existing data for deduplication
      const { data: existingWeeks } = await supabase.from('assignment_weeks').select('id, employee_fk, week_start');
      const { data: existingItems } = await supabase.from('assignment_items').select('assignment_week_fk, jobsite_fk');
      
      const existingAssignments = new Set(
        existingItems?.map(item => `${item.assignment_week_fk}:${item.jobsite_fk}`) || []
      );

      const itemsToInsert = [];

      for (const row of dataRows) {
        const employeeEmail = row[4]; // Column E - Email
        const employee = employees?.find(e => e.email?.toLowerCase() === employeeEmail?.toLowerCase());
        if (!employee) continue;

        for (let i = 6; i < row.length; i++) { // Column G onwards
          const assignmentName = row[i];
          if (!assignmentName) continue;

          const weekStart = dateRow[i];
          if (!weekStart) continue;

          const assignmentNames = assignmentName.split('/').map((n: string) => n.trim());

          for (const name of assignmentNames) {
            const normalizedName = name.replace(/\s+/g, ' ').trim();
            const jobsite = jobsites?.find(j => j.jobsite_name.replace(/\s+/g, ' ').trim() === normalizedName);
            const group = jobsiteGroups?.find(g => g.name.replace(/\s+/g, ' ').trim() === normalizedName);
            const targetJobsites = group 
              ? jobsites?.filter(j => j.group_id === group.id)
              : (jobsite ? [jobsite] : []);

            console.log('Processing assignment:', name, 'Normalized:', normalizedName, 'Week:', weekStart);
            console.log('Found jobsite:', jobsite?.jobsite_name, 'Found group:', group?.name, 'Target count:', targetJobsites.length);
            
            if (targetJobsites.length > 0) {
              console.log('Found target jobsites:', targetJobsites.length);
              console.log('Attempting upsert for employee:', employee.id, 'week_start:', weekStart);
              const { data: weekData, error: weekError } = await supabase
                .from('assignment_weeks')
                .upsert({
                  employee_fk: employee.id,
                  week_start: weekStart,
                  status: 'active',
                  assignment_type: targetJobsites[0].jobsite_name
                }, { onConflict: 'employee_fk, week_start' })
                .select('id, week_start')
                .single();

              if (weekError) {
                console.error('Error upserting assignment_week:', weekError);
              } else {
                console.log('Upserted assignment_week:', weekData);
              }

              if (weekData) {
                console.log('Successfully upserted weekData:', weekData);
                for (const site of targetJobsites) {
                  const assignmentKey = `${weekData.id}:${site.id}`;
                  if (!existingAssignments.has(assignmentKey)) {
                    console.log('Adding item to insert:', assignmentKey, 'for site:', site.jobsite_name);
                    itemsToInsert.push({
                      assignment_week_fk: weekData.id,
                      jobsite_fk: site.id,
                      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                      item_order: 1
                    });
                    
                    // Store metadata for notification logic (not for DB insertion)
                    (itemsToInsert[itemsToInsert.length - 1] as any)._meta = {
                      employee_fk: employee.id,
                      employee_name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.email,
                      week_start: weekData.week_start,
                      assignment_type: site.jobsite_name
                    };

                    existingAssignments.add(assignmentKey); // Prevent duplicates in same batch
                  } else {
                    console.log('Assignment item already exists, skipping:', assignmentKey);
                  }
                }
              } else {
                console.error('weekData is null after upsert, cannot add assignment items.');
              }
            } else {
              console.log('No target jobsites found for:', normalizedName);
              console.warn('No target jobsites found for assignment:', name);
            }
          }
        }
      }

      if (itemsToInsert.length > 0) {
        console.log('Attempting to insert assignment_items:', itemsToInsert);
        // Strip _meta before insertion
        const dbItems = itemsToInsert.map(({ _meta, ...rest }: any) => rest);
        const { error: insertError } = await supabase.from('assignment_items').insert(dbItems);
        if (insertError) {
          console.error('Error inserting assignment_items:', insertError);
        } else {
          console.log('Successfully inserted assignment_items');
          
          // Send notifications for imported assignments
          const employeeAssignments = new Map<string, any[]>();
          itemsToInsert.forEach((item: any) => {
            const meta = item._meta;
            if (meta && meta.employee_fk) {
              if (!employeeAssignments.has(meta.employee_fk)) {
                employeeAssignments.set(meta.employee_fk, []);
              }
              employeeAssignments.get(meta.employee_fk)?.push({
                weekStart: meta.week_start,
                jobsiteName: meta.assignment_type,
                employeeName: meta.employee_name
              });
            }
          });

          for (const [empId, assignments] of employeeAssignments.entries()) {
            const portalMessage = assignments.map(a => {
              const weeksUntil = Math.max(0, Math.round((new Date(a.weekStart).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
              return `Update Type: Assignment Change\r\nEmployee: ${a.employeeName}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${a.weekStart}\r\nPrevious Assignment: None\r\nNew Assignment: ${a.jobsiteName}\r\nDays: Mon, Tue, Wed, Thu, Fri, Sat, Sun\r\nWeeks Until New Assignment: ${weeksUntil}`;
            }).join('\r\n\r\n');

            await sendNotification({
              employeeId: empId,
              title: 'Assignment Change',
              message: portalMessage,
              type: 'info',
              sendEmail: true,
              emailData: {
                updateType: 'Assignment Change',
                jobsiteName: assignments[0].jobsiteName,
                weekStartDate: assignments[0].weekStart,
                customEmailBody: portalMessage
              }
            });
          }
        }
      } else {
        console.log('No assignment_items to insert.');
      }

      alert(`Sync complete! ${itemsToInsert.length} new assignments added.`);
    } catch (error) {
      console.error(error);
      alert('Error during sync. Check console.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-[#0A120F] border border-white/5 rounded-3xl">
      <h2 className="text-xl font-bold text-white mb-4">Assignment Importer</h2>
      <input type="file" onChange={handleFileChange} className="mb-4 text-white" />
      <button onClick={handleParse} className="px-4 py-2 bg-emerald-600 text-white rounded-lg mr-2">Parse</button>
      <button onClick={syncData} disabled={loading || preview.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-lg mr-2">Sync</button>
      <button onClick={clearData} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg">Clear All Data</button>
    </div>
  );
};
