import React, { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';

export function CsvRotationImporter({ onImportSuccess }: { onImportSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];
          const rotationAssignments: any[] = [];

          // Fetch all employees to map employee_id_ref to UUID id
          const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, employee_id_ref');
          
          if (empError) throw empError;

          const empMap = new Map<string, string>();
          employees?.forEach(emp => {
            if (emp.employee_id_ref) {
              empMap.set(emp.employee_id_ref.toString(), emp.id);
            }
          });

          // The spreadsheet has dates in headers starting from column G (index 6)
          // We need to map these headers to week_start dates.
          const headers = results.meta.fields || [];
          
          for (const row of data) {
            const employeeIdRef = row['']; // Assuming column A is employee_id_ref
            if (!employeeIdRef) continue;

            const employeeFk = empMap.get(employeeIdRef.toString());
            if (!employeeFk) {
              console.warn(`Employee with ID ref ${employeeIdRef} not found in database.`);
              continue;
            }

            for (let i = 6; i < headers.length; i++) {
              const weekStart = headers[i]; // e.g., "03/16/26"
              const value = row[headers[i]];

              if (value && value.toLowerCase().includes('rotation')) {
                // Convert MM/DD/YY to YYYY-MM-DD
                const dateParts = weekStart.split('/');
                const formattedDate = `20${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;

                rotationAssignments.push({
                  employee_fk: employeeFk,
                  week_start: formattedDate,
                  assignment_type: 'rotation',
                  status: 'active'
                });
              }
            }
          }

          if (rotationAssignments.length === 0) {
            throw new Error('No "Rotation" assignments found in the CSV. Please ensure headers are correct.');
          }

          for (const assignment of rotationAssignments) {
            const { error: upsertError } = await supabase
              .from('assignment_weeks')
              .upsert(assignment, { onConflict: 'employee_fk,week_start' });
            
            if (upsertError) throw upsertError;
          }

          setSuccess(`Successfully imported ${rotationAssignments.length} rotation assignments.`);
          onImportSuccess();
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      }
    });
  };

  return (
    <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6 space-y-4">
      <h3 className="text-lg font-bold text-white">Import Rotation CSV</h3>
      <p className="text-xs text-gray-500">CSV must have headers: [Employee ID], [Site Lead], [BESS Tech], [Home Airport], [Name], [Manager], [Week Start Dates...]</p>
      <p className="text-xs text-gray-500">Column A must be the Employee ID.</p>
      
      <input type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500 file:text-black hover:file:bg-emerald-400" />
      
      {error && <div className="flex items-center gap-2 text-rose-500 text-xs"><AlertCircle size={14} /> {error}</div>}
      {success && <div className="flex items-center gap-2 text-emerald-500 text-xs"><CheckCircle2 size={14} /> {success}</div>}
      
      <button 
        onClick={handleImport} 
        disabled={!file || loading}
        className="w-full py-2 bg-emerald-500 text-black font-bold rounded-xl disabled:opacity-50"
      >
        {loading ? 'Importing...' : 'Import Rotation Data'}
      </button>
    </div>
  );
}
