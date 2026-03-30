import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite, JobsiteGroup } from '../types';
import Papa from 'papaparse';
import { Upload, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface DataImporterProps {
  employees: Employee[];
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
}

export default function DataImporter({ employees, jobsites, jobsiteGroups }: DataImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setStatus(null);

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as string[][];
          console.log('Parsed rows:', rows.length);
          
          if (rows.length < 6) throw new Error('CSV does not have enough rows.');
          
          const dateHeaderRow = rows[4]; // Row 5
          // Dates start at Column H (index 7)
          const dateStartIndex = 7;
          const dateHeaders = dateHeaderRow.slice(dateStartIndex);
          console.log('Date headers found starting at index:', dateStartIndex, 'Count:', dateHeaders.length);
          
          for (let i = 5; i < rows.length; i++) {
            const row = rows[i];
            const email = row[4]; // Column E
            if (!email) continue;

            const employee = employees.find(e => e.email.toLowerCase() === email.trim().toLowerCase());
            if (!employee) {
              console.warn(`Employee not found: '${email}'`);
              continue;
            }

            for (let j = 0; j < dateHeaders.length; j++) {
              const dateStr = dateHeaders[j];
              const assignmentValue = row[dateStartIndex + j];
              
              if (!assignmentValue || assignmentValue.trim() === '-' || assignmentValue.trim() === '') continue;

              // Parse date (MM/DD/YY)
              const parts = dateStr.split('/');
              if (parts.length !== 3) continue;
              const [m, d, y] = parts;
              const weekStart = `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

              // Handle assignments (split by /)
              const assignmentParts = assignmentValue.split('/').map(p => p.trim());
              
              // Insert/Update assignment_weeks
              const weekAssignment = {
                employee_fk: employee.id,
                week_start: weekStart,
                status: 'assigned',
                assignment_type: 'rotation'
              };

              // Find or create assignment_week
              const { data: existingWeek, error: fetchWeekError } = await supabase
                .from('assignment_weeks')
                .select('id')
                .eq('employee_fk', weekAssignment.employee_fk)
                .eq('week_start', weekAssignment.week_start)
                .maybeSingle();
              
              if (fetchWeekError) throw fetchWeekError;

              let weekId;
              if (existingWeek) {
                weekId = existingWeek.id;
                await supabase.from('assignment_weeks').update(weekAssignment).eq('id', weekId);
              } else {
                const { data: insertedWeek, error: insertWeekError } = await supabase
                  .from('assignment_weeks')
                  .insert(weekAssignment)
                  .select('id')
                  .single();
                if (insertWeekError) throw insertWeekError;
                weekId = insertedWeek.id;
              }

              // Insert/Update assignment_items
              await supabase.from('assignment_items').delete().eq('assignment_week_fk', weekId);

              for (const part of assignmentParts) {
                // Resolve jobsite or group
                let targetJobsites: Jobsite[] = [];
                
                // Check if part is a group
                const group = jobsiteGroups.find(g => g.name.toLowerCase() === part.toLowerCase());
                if (group) {
                  targetJobsites = jobsites.filter(j => j.group_id === group.id || j.jobsite_group === group.name);
                } else {
                  // Check if part is a jobsite
                  const jobsite = jobsites.find(j => 
                    j.jobsite_name.toLowerCase() === part.toLowerCase() ||
                    j.jobsite_alias?.toLowerCase() === part.toLowerCase()
                  );
                  if (jobsite) targetJobsites = [jobsite];
                }

                if (targetJobsites.length === 0) {
                  console.warn(`Jobsite/Group not found for: '${part}'`);
                  continue;
                }

                for (const jobsite of targetJobsites) {
                  await supabase
                    .from('assignment_items')
                    .insert({
                      assignment_week_fk: weekId,
                      jobsite_fk: jobsite.id,
                      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // Default to all days
                    });
                }
              }
            }
          }

          setStatus({ type: 'success', message: `Successfully imported assignments.` });
        } catch (err) {
          console.error('Import error:', err);
          setStatus({ type: 'error', message: `Failed to import: ${err instanceof Error ? err.message : 'Unknown error'}` });
        } finally {
          setLoading(false);
        }
      }
    });
  };


  return (
    <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
      <h2 className="text-xl font-bold text-white mb-6">Data Importer</h2>
      <div className="flex flex-col gap-4">
        <input type="file" accept=".csv" onChange={handleFileChange} className="text-white" />
        <button 
          onClick={handleImport} 
          disabled={!file || loading}
          className="px-4 py-2 bg-emerald-500 text-black font-bold rounded-lg disabled:opacity-50"
        >
          {loading ? <RefreshCw className="animate-spin" /> : 'Import CSV'}
        </button>
        {status && (
          <div className={`flex items-center gap-2 ${status.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
            {status.type === 'success' ? <CheckCircle /> : <AlertCircle />}
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
