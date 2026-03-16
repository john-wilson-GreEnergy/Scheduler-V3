import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Employee } from '../types';
import Papa from 'papaparse';
import { Upload, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface DataImporterProps {
  employees: Employee[];
}

export default function DataImporter({ employees }: DataImporterProps) {
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

              // Handle dual assignments (e.g., "Sunstreams/Vacation")
              const assignment = assignmentValue.trim();
              if (!assignment || assignment === '-' || assignment === 'Rotation') continue;
              
              // Robustness check: skip if it looks like an employee name
              if (employees.some(e => `${e.first_name} ${e.last_name}`.toLowerCase() === assignment.toLowerCase())) {
                console.warn(`Skipping assignment as it looks like an employee name: '${assignment}'`);
                continue;
              }

              const newAssignment = {
                employee_id: employee.employee_id_ref,
                email: employee.email,
                first_name: employee.first_name,
                last_name: employee.last_name,
                week_start: weekStart,
                assignment_name: assignment,
                value_type: 'jobsite'
              };

              // Find existing assignment that conflicts on either constraint
              const existingIndex = assignmentsList.findIndex(a =>
                (a.week_start === newAssignment.week_start &&
                 ((newAssignment.employee_id && a.employee_id === newAssignment.employee_id) ||
                  (newAssignment.email && a.email === newAssignment.email)))
              );

              if (existingIndex !== -1) {
                // Merge
                const existing = assignmentsList[existingIndex];
                if (!existing.assignment_name.split('/').includes(newAssignment.assignment_name)) {
                  existing.assignment_name = `${existing.assignment_name}/${newAssignment.assignment_name}`;
                }
              } else {
                assignmentsList.push(newAssignment);
              }
            }
          }

          const assignmentsToUpsert = assignmentsList;
          console.log('Assignments to upsert:', assignmentsToUpsert.length);
          
          for (const assignment of assignmentsToUpsert) {
            // Check for existing assignment based on either unique constraint
            const employeeIdFilter = assignment.employee_id ? `employee_id.eq.${assignment.employee_id}` : 'employee_id.is.null';
            const emailFilter = assignment.email ? `email.eq.${assignment.email}` : 'email.is.null';
            
            const { data: existing, error: fetchError } = await supabase
              .from('assignment_weeks')
              .select('id')
              .or(`and(${employeeIdFilter},week_start.eq.${assignment.week_start}),and(${emailFilter},week_start.eq.${assignment.week_start})`)
              .maybeSingle();
            
            if (fetchError) throw fetchError;

            if (existing) {
              const { error: updateError } = await supabase
                .from('assignment_weeks')
                .update(assignment)
                .eq('id', existing.id);
              if (updateError) throw updateError;
            } else {
              const { error: insertError } = await supabase
                .from('assignment_weeks')
                .insert(assignment);
              if (insertError) throw insertError;
            }
          }

          setStatus({ type: 'success', message: `Successfully imported ${assignmentsToUpsert.length} assignments.` });
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
