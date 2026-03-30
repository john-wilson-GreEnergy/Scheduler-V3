import React, { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { AssignmentWeek, AssignmentItem } from '../types';
import { sendNotification } from '../utils/notifications';

export const AssignmentImporter: React.FC<{ onImportComplete?: () => void }> = ({ onImportComplete }) => {
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
      const { data: employees } = await supabase.from('employees').select('id, first_name, last_name, email');
      const { data: jobsites } = await supabase.from('jobsites').select('id, jobsite_name');

      // Mapping objects for normalization
      const NAME_MAPPING: Record<string, string> = {
        "Blake Horton": "Blake Horton",
        "Ivan Lopez": "Ivan Lopez",
        "Stephen Vela": "Stephen Vela",
        "Kade Murphy": "Kade Murphy",
        "Vincent Baptiste": "Vincent Baptiste",
        "Trenton Ward": "Trenton Ward",
        "Andrew Rossi": "Andrew Rossi",
        "Raul Portillo": "Raul Portillo",
        "Kwatayvous Blackwell": "Kwatayvous Blackwell",
        "Jonathan Davis": "Jonathan Davis",
        "Takarius Floyd": "Takarius Floyd"
      };
      const JOB_SITE_MAPPING: Record<string, string> = {
        "LG - ACIR": "LG ACIR",
        "Willow Springs/ Chaparral": "Willow Springs/ Chaparral",
        "YUMA": "Yuma",
        "Idaho Power": "Idaho Power",
        "Oklahoma Foothills": "Oklahoma Foothills",
        "Sunstreams": "Sunstreams",
        "Solar Star": "Solar Star",
        "SMA Training": "SMA Training",
        "FSS Training": "FSS Training",
        "Lonestar": "Lone Star",
        "Slocum/ Training": "Slocum",
        "Idaho Power/V": "Idaho Power",
        "Slocum/ Solar Star": "Slocum",
        "Mav6/Solar Star": "Mav6",
        "Dark & Stormy": "Dark & Stormy",
        "CleanPower": "CleanPower",
        "Invenergy": "Invenergy",
        "APS": "APS",
        "Ravenswood/ Slocum": "Ravenswood",
        "Slocum/ Ravenswood": "Slocum",
        "Poblano/ DQ": "Poblano",
        "Solar Star/ Hummingbird": "Solar Star",
        "AVEP/ Arrow Canyon": "AVEP",
        "Santa Paula/ Solar Star": "Santa Paula",
        "Johanna": "Johanna",
        "DQ/TRAVEL": "Desert Quartzite",
        "Sungrow/ Sunstreams": "Sunstreams",
        "Oklahoma Landon": "Oklahoma Landon",
        "Ravenswood/ Oak Hill": "Ravenswood",
        "Countryside/ Ravenswood": "Countryside",
        "Countryside/Ravenswood": "Countryside",
        "KCE/ Ravenswood": "KCE"
      };

      const dateRow = preview[4]; // Row 5
      const dataRows = preview.slice(5, 81); // Rows 6 to 81

      const plannedAssignments: any[] = [];

      for (const row of dataRows) {
        const rawName = row[4]; // Column E
        if (!rawName) continue;

        const normalizedName = NAME_MAPPING[rawName] || rawName;
        const employee = employees?.find(e => 
          `${e.first_name} ${e.last_name}`.toLowerCase() === normalizedName.toLowerCase() ||
          e.email?.toLowerCase() === normalizedName.toLowerCase()
        );
        if (!employee) {
          console.warn(`Employee not found: ${normalizedName}`);
          continue;
        }

        for (let i = 6; i < row.length; i++) { // Column G onwards
          const assignmentName = row[i];
          if (!assignmentName || assignmentName === '-') continue;

          const weekStart = dateRow[i];
          if (!weekStart) continue;

          const normalizedJobsite = JOB_SITE_MAPPING[assignmentName] || assignmentName;
          const jobsite = jobsites?.find(j => j.jobsite_name === normalizedJobsite);

          if (jobsite) {
            plannedAssignments.push({
              employee_fk: employee.id,
              week_start: new Date(weekStart).toISOString().split('T')[0],
              assignment_type: jobsite.jobsite_name,
              target_jobsites: [{
                jobsite_fk: jobsite.id,
                days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
              }]
            });
          } else {
            console.warn(`Jobsite not found: ${assignmentName} (Normalized: ${normalizedJobsite})`);
          }
        }
      }

      // Call the SQL RPC function
      const { error: rpcError } = await supabase
        .rpc('import_assignments', { assignment_data: plannedAssignments });
      
      if (rpcError) throw rpcError;

      alert(`Sync complete! ${plannedAssignments.length} assignments processed.`);
      if (onImportComplete) onImportComplete();
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
