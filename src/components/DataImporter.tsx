import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite } from '../types';
import Papa from 'papaparse';
import { Upload, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface DataImporterProps {
  employees: Employee[];
  jobsites: Jobsite[];
}

export default function DataImporter({ employees, jobsites }: DataImporterProps) {
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
          
          if (rows.length < 5) throw new Error('CSV does not have enough rows.');
          
          const dateHeaderRow = rows[4];
          // Find the index where the dates actually start.
          // Based on the screenshot, dates start after "Week #" column.
          // Let's find the first column that looks like a date (contains '/')
          const dateStartIndex = dateHeaderRow.findIndex(cell => cell && cell.includes('/'));
          if (dateStartIndex === -1) throw new Error('Could not find date headers.');
          
          const dateHeaders = dateHeaderRow.slice(dateStartIndex);
          console.log('Date headers found starting at index:', dateStartIndex, 'Count:', dateHeaders.length);
          
          const assignmentsList: any[] = [];

          for (let i = 5; i < rows.length; i++) {
            const row = rows[i];
            const fullName = row[4]; // Column E
            if (!fullName) continue;

            const employee = employees.find(e => `${e.first_name} ${e.last_name}`.toLowerCase() === fullName.trim().toLowerCase());
            if (!employee) {
              console.warn(`Employee not found: '${fullName}'`);
              continue;
            }

            for (let j = 0; j < dateHeaders.length; j++) {
              const dateStr = dateHeaders[j];
              const assignmentValue = row[dateStartIndex + j];
              
              if (!assignmentValue || assignmentValue === '-' || assignmentValue === 'Rotation') continue;

              // Parse date (MM/DD/YY)
              const parts = dateStr.split('/');
              if (parts.length !== 3) {
                continue;
              }
              const [m, d, y] = parts;
              const dateObj = new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d));
              
              // Ensure it's a Monday (getDay() returns 1 for Monday)
              if (dateObj.getDay() !== 1) {
                console.warn(`Skipping assignment for date ${dateStr} as it is not a Monday.`);
                continue;
              }
              
              const weekStart = `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

              // Handle dual assignments (e.g., "El Sol/Sunstreams")
              const assignmentValueTrimmed = assignmentValue.trim();
              const normalizedAssignmentValue = assignmentValueTrimmed.replace(/vacay/gi, 'Vacation');
              if (!normalizedAssignmentValue || normalizedAssignmentValue === '-') continue;
              
              // Robustness check: skip if it looks like an employee name
              if (employees.some(e => `${e.first_name} ${e.last_name}`.toLowerCase() === normalizedAssignmentValue.toLowerCase())) {
                console.warn(`Skipping assignment as it looks like an employee name: '${normalizedAssignmentValue}'`);
                continue;
              }

              const assignmentParts = normalizedAssignmentValue.split('/');
              
              // Insert/Update assignment_weeks
              const weekAssignment = {
                employee_fk: employee.id,
                week_start: weekStart,
                status: 'assigned'
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
              // Clear existing items for this week to avoid duplicates
              await supabase.from('assignment_items').delete().eq('assignment_week_fk', weekId);

              for (let k = 0; k < assignmentParts.length; k++) {
                const part = assignmentParts[k].trim();
                
                // Try to find the jobsite ID
                const jobsite = jobsites.find(j => 
                  j.jobsite_name.toLowerCase() === part.toLowerCase() ||
                  j.jobsite_alias?.toLowerCase() === part.toLowerCase()
                );

                if (!jobsite) {
                  console.warn(`Jobsite not found for name: '${part}'`);
                  // We still insert it but without a jobsite_fk if the schema allows, 
                  // but based on types.ts it should have a jobsite_fk.
                  // If we don't have a jobsite_fk, we might skip it or use a placeholder.
                  continue; 
                }

                let days;
                if (assignmentParts.length === 1) {
                  days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                } else {
                  days = k === 0 ? ['Mon', 'Tue', 'Wed'] : ['Thu', 'Fri', 'Sat', 'Sun'];
                }
                
                const { error: insertItemError } = await supabase
                  .from('assignment_items')
                  .insert({
                    assignment_week_fk: weekId,
                    jobsite_fk: jobsite.id,
                    days: days,
                    week_start: weekStart
                  });
                if (insertItemError) throw insertItemError;
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
