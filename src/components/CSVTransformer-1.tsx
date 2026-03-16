import { Upload, FileJson } from 'lucide-react';
import React, { useState } from 'react';
import Papa from 'papaparse';

export default function CSVTransformer() {
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformError, setTransformError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'assignments' | 'employees' | 'jobsites'>('assignments');

  const downloadCSV = (data: any[], filename: string) => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAssignmentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsTransforming(true);
    setTransformError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = results.data as any[];
          const headers = results.meta.fields || [];
          
          const idVars = ['employee_id', 'email', 'first_name', 'last_name', 'id'];
          const fixedHeaders = headers.filter(h => idVars.includes(h.toLowerCase()));
          const dateHeaders = headers.filter(h => !idVars.includes(h.toLowerCase()));

          const tallData: any[] = [];

          data.forEach(row => {
            dateHeaders.forEach(date => {
              const assignment = row[date];
              if (assignment && assignment.trim() !== '') {
                const newRow: any = {};
                fixedHeaders.forEach(h => {
                  newRow[h.toLowerCase()] = row[h];
                });

                let formattedDate = date;
                if (date.includes('/')) {
                  const parts = date.split('/');
                  if (parts.length === 3) {
                    let [m, d, y] = parts;
                    if (y.length === 2) y = '20' + y;
                    formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                  }
                }

                newRow.week_start = formattedDate;
                newRow.assignment_name = assignment;
                tallData.push(newRow);
              }
            });
          });

          if (tallData.length === 0) throw new Error("No assignments found.");
          downloadCSV(tallData, 'assignments_to_import.csv');
          setIsTransforming(false);
        } catch (err: any) {
          setTransformError(err.message);
          setIsTransforming(false);
        }
      }
    });
  };

  const handleEmployeeUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsTransforming(true);
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const data = results.data as any[];
        const uniqueEmployees = Array.from(new Set(data.map(e => e.email))).map(email => {
          const emp = data.find(e => e.email === email);
          return {
            employee_id_ref: emp.employee_id || emp.id || '',
            email: emp.email,
            first_name: emp.first_name || '',
            last_name: emp.last_name || '',
            job_title: emp.job_title || 'Field Technician'
          };
        }).filter(e => e.email);
        downloadCSV(uniqueEmployees, 'employees_to_import.csv');
        setIsTransforming(false);
      }
    });
  };

  const handleJobsiteUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsTransforming(true);
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const data = results.data as any[];
        const uniqueJobsites = Array.from(new Set(data.map(j => j.jobsite_name || j.assignment_name))).map(name => {
          const site = data.find(j => (j.jobsite_name || j.assignment_name) === name);
          return {
            jobsite_id_ref: site.jobsite_id || '',
            jobsite_name: name,
            jobsite_group: site.jobsite_group || '',
            jobsite_alias: site.jobsite_alias || '',
            customer: site.customer || '',
            address1: site.address1 || '',
            full_address: site.full_address || '',
            city: site.city || '',
            state: site.state || '',
            zip: site.zip || '',
            lat: site.lat || site.latitude || '',
            lng: site.lng || site.longitude || '',
            manager: site.manager || '',
            drive_time_minutes: site.drive_time_minutes || '',
            wage: site.wage || '',
            notes: site.notes || '',
            is_active: site.active !== undefined ? (site.active.toString().toLowerCase() === 'true' || site.active === true) : true
          };
        }).filter(j => j.jobsite_name);
        downloadCSV(uniqueJobsites, 'jobsites_to_import.csv');
        setIsTransforming(false);
      }
    });
  };

  return (
    <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
          <FileJson className="text-emerald-500" size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Direct CSV Transformers</h2>
          <p className="text-gray-400">Select the data type you want to prepare for Supabase.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-black/20 p-1 rounded-2xl mb-8 w-fit">
        <button 
          onClick={() => setActiveMode('assignments')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeMode === 'assignments' ? 'bg-emerald-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
        >
          Assignments (Wide Sheet)
        </button>
        <button 
          onClick={() => setActiveMode('employees')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeMode === 'employees' ? 'bg-emerald-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
        >
          Employees List
        </button>
        <button 
          onClick={() => setActiveMode('jobsites')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeMode === 'jobsites' ? 'bg-emerald-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
        >
          Jobsites List
        </button>
      </div>

      <div className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-900/30 rounded-3xl p-12 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors cursor-pointer relative">
        <input 
          type="file" 
          accept=".csv" 
          onChange={
            activeMode === 'assignments' ? handleAssignmentUpload :
            activeMode === 'employees' ? handleEmployeeUpload :
            handleJobsiteUpload
          }
          className="absolute inset-0 opacity-0 cursor-pointer"
          disabled={isTransforming}
        />
        <Upload className={`text-emerald-500 mb-4 ${isTransforming ? 'animate-bounce' : ''}`} size={48} />
        <p className="text-white font-bold">
          {isTransforming ? 'Transforming...' : `Click or Drag ${activeMode.charAt(0).toUpperCase() + activeMode.slice(1)} CSV`}
        </p>
        <p className="text-gray-500 text-sm mt-2 text-center">
          {activeMode === 'assignments' ? 'Upload your main wide spreadsheet' : 'Upload your list of ' + activeMode}
        </p>
      </div>

      {transformError && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {transformError}
        </div>
      )}
    </div>
  );
}
