import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Jobsite, Employee, AssignmentItem, JobsiteGroup } from '../types';
import { MapPin, Navigation, Phone, User, ChevronRight, ChevronDown, Filter, ArrowUpDown, Users, Maximize2, RefreshCw, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfWeek, eachWeekOfInterval, endOfYear, addWeeks } from 'date-fns';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { isRotationWeek } from '../utils/rotation';
import { RotationConfig } from '../types';
import { fetchCurrentScheduleBackend } from '../lib/supabase_functions';

// Map Controller for programmatic zooming/centering
function MapController({ target }: { target: { center?: [number, number], bounds?: L.LatLngBoundsExpression } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    if (target.bounds) {
      map.fitBounds(target.bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (target.center) {
      map.setView(target.center, 15);
    }
  }, [target, map]);

  return null;
}

// Custom marker generator - simplified to just the pin
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative group">
        <!-- The Pin -->
        <div class="w-6 h-6 rounded-full border-2 border-white shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center transition-transform group-hover:scale-110" style="background-color: ${color}">
          <div class="w-1.5 h-1.5 rounded-full bg-white shadow-sm"></div>
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

interface MapPortalProps {
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
  employees?: Employee[];
}

interface SiteStaffing {
  siteId: string;
  employees: (Employee & { role_rank: number })[];
  staffingLevel: number; // 0 to 1
  hasRotationConflict?: boolean;
}

interface OffSitePersonnel {
  status: string;
  employees: Employee[];
}

export default function MapPortal({ jobsites, jobsiteGroups, employees: providedEmployees }: MapPortalProps) {
  const fieldEmployees = useMemo(() => (providedEmployees || []).filter(e => e.role !== 'hr'), [providedEmployees]);
  const [staffing, setStaffing] = useState<Record<string, SiteStaffing>>({});
  const [offSite, setOffSite] = useState<Record<string, OffSitePersonnel>>({});
  const [legendOpen, setLegendOpen] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'customer' | 'staffing'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [mapTarget, setMapTarget] = useState<{ center?: [number, number], bounds?: L.LatLngBoundsExpression } | null>(null);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});
  const [selectedWeek, setSelectedWeek] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));

  const mondays = useMemo(() => {
    const start = new Date(2026, 2, 9); // March 9, 2026
    const end = endOfYear(addWeeks(start, 52));
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  }, []);

  const center: [number, number] = [39.8283, -98.5795];

  useEffect(() => {
    fetchStaffingData();
  }, [jobsites, fieldEmployees, selectedWeek]);

  const fetchStaffingData = async () => {
    // Use selected week
    const weekStr = selectedWeek;
    const weekStartObj = new Date(selectedWeek + 'T00:00:00');

    // Fetch current assignments from backend view
    const queries: any[] = [
      fetchCurrentScheduleBackend(weekStr)
    ];

    if (fieldEmployees.length === 0 && !providedEmployees) {
      queries.push(
        supabase
          .from('employees')
          .select('*')
          .eq('is_active', true)
      );
    }

    // Add rotation configs query
    queries.push(
      supabase
        .from('rotation_configs')
        .select('*')
    );

    const results = await Promise.all(queries);
    const scheduleData = results[0];
    const employeesRes = { data: fieldEmployees, error: null };
    const rotRes = results[results.length - 1];

    if (!scheduleData || employeesRes.error) {
      console.error('Error fetching staffing data:', employeesRes.error);
      return;
    }

    const allEmployees = employeesRes.data || [];
    const rotationConfigsMap: Record<string, RotationConfig> = {};
    if (rotRes.data) {
      rotRes.data.forEach((c: RotationConfig) => rotationConfigsMap[c.employee_fk] = c);
    }
    setRotationConfigs(rotationConfigsMap);

    if (allEmployees.length > 0) {
      const staffingMap: Record<string, SiteStaffing> = {};
      const offSiteMap: Record<string, OffSitePersonnel> = {};
      
      const roleRanks: Record<string, number> = {
        'site manager': 1,
        'site lead': 2,
        'bess tech': 3,
        'admin': 0,
        'hr': 4
      };

      const OFF_SITE_STATUSES = ['rotation', 'vacation', 'personal', 'training', 'sick', 'holiday', 'home office', 'oklahoma'];

      const addToOffSite = (status: string, employee: any) => {
        const normalizedStatus = status.toLowerCase();
        if (!offSiteMap[normalizedStatus]) {
          offSiteMap[normalizedStatus] = {
            status: status,
            employees: []
          };
        }
        if (!offSiteMap[normalizedStatus].employees.find(e => e.id === employee.id)) {
          offSiteMap[normalizedStatus].employees.push(employee);
        }
      };

      const addToSite = (siteId: string, employee: any) => {
        const site = jobsites.find(s => s.id === siteId);
        if (!site) return;

        // If site is part of a group, apply to all sites in that group
        const sitesToUpdate = site.group_id 
          ? jobsites.filter(s => s.group_id === site.group_id)
          : [site];

        sitesToUpdate.forEach(s => {
          if (!staffingMap[s.id]) {
            staffingMap[s.id] = {
              siteId: s.id,
              employees: [],
              staffingLevel: 0,
              hasRotationConflict: false
            };
          }
          
          if (!staffingMap[s.id].employees.find(e => e.id === employee.id)) {
            staffingMap[s.id].employees.push({
              ...employee,
              role_rank: roleRanks[employee.role?.toLowerCase()] || 99
            });

            // Check for rotation conflict
            if (isRotationWeek(weekStartObj, rotationConfigsMap[employee.id], employee.rotation_group)) {
              staffingMap[s.id].hasRotationConflict = true;
            }
          }
        });
      };

      const processRow = (row: any) => {
        // Match employee by email or ID ref (robust matching)
        const employee = allEmployees.find(e => 
          (row.email && e.email.toLowerCase() === row.email.toLowerCase()) ||
          (row.employee_id && e.id === row.employee_id) ||
          (row.employee_fk && e.id === row.employee_fk)
        );

        if (!employee) return;

        // 1. Check for explicit jobsite assignment (from view)
        if (row.jobsite_id) {
          addToSite(row.jobsite_id, employee);
        } 
        // 2. Fallback to assignment_type matching
        else if (row.assignment_type || row.jobsite_name) {
          const assignmentNames = parseAssignmentNames(row.assignment_type || row.jobsite_name);
          
          assignmentNames.forEach(name => {
            const trimmedName = name.trim().toLowerCase();
            
            // Check if it's an off-site status first
            if (OFF_SITE_STATUSES.includes(trimmedName)) {
              addToOffSite(name.trim(), employee);
              return;
            }

            // Check if it matches a group name directly
            const group = jobsiteGroups.find(g => g.name.toLowerCase() === trimmedName);
            const groupSites = group ? jobsites.filter(j => j.group_id === group.id) : [];
            
            if (groupSites.length > 0) {
              groupSites.forEach(s => addToSite(s.id, employee));
            } else {
              // Find jobsite by name or alias with improved matching
              const site = jobsites.find(j => {
                const name = j.jobsite_name.toLowerCase();
                const alias = j.jobsite_alias?.toLowerCase();
                
                return name === trimmedName || 
                       alias === trimmedName ||
                       // Handle "Prospect" -> "Prospect Power" etc.
                       name.includes(trimmedName) ||
                       (alias && alias.includes(trimmedName));
              });

              if (site) {
                addToSite(site.id, employee);
              } else {
                // If still no match, treat as unmapped item
                addToOffSite(name.trim(), employee);
              }
            }
          });
        }
      };

      scheduleData.forEach(processRow);

      // Sort by seniority and calculate staffing levels
      Object.keys(staffingMap).forEach(siteId => {
        const site = jobsites.find(s => s.id === siteId);
        const minStaffing = site?.min_staffing || 2;
        staffingMap[siteId].employees.sort((a, b) => a.role_rank - b.role_rank);
        staffingMap[siteId].staffingLevel = Math.min(staffingMap[siteId].employees.length / minStaffing, 1);
      });

      setStaffing(staffingMap);
      setOffSite(offSiteMap);
    }
  };

  const customerColors = useMemo(() => {
    const colors: Record<string, string> = {};
    const palette = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    
    jobsites.forEach((site, i) => {
      if (!colors[site.customer]) {
        colors[site.customer] = palette[Object.keys(colors).length % palette.length];
      }
    });
    return colors;
  }, [jobsites]);

  const getStaffingColor = (level: number) => {
    if (level >= 1) return '#10b981'; // Green
    if (level >= 0.5) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  const sortedJobsites = useMemo(() => {
    return [...jobsites].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') comparison = a.jobsite_name.localeCompare(b.jobsite_name);
      if (sortBy === 'customer') comparison = a.customer.localeCompare(b.customer);
      if (sortBy === 'staffing') {
        const aLevel = staffing[a.id]?.staffingLevel || 0;
        const bLevel = staffing[b.id]?.staffingLevel || 0;
        comparison = aLevel - bLevel;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [jobsites, sortBy, sortOrder, staffing]);

  const activeJobsites = sortedJobsites.filter(j => 
    j.lat !== null && 
    j.lat !== undefined && 
    j.lng !== null && 
    j.lng !== undefined && 
    j.is_active &&
    (staffing[j.id]?.employees?.length > 0)
  );

  const legendItems = useMemo(() => {
    const groups: Record<string, { sites: Jobsite[], staffingLevel: number, customer: string }> = {};
    const ungrouped: Jobsite[] = [];

    activeJobsites.forEach(site => {
      if (site.group_id) {
        if (!groups[site.group_id]) {
          groups[site.group_id] = { sites: [], staffingLevel: 0, customer: site.customer };
        }
        groups[site.group_id].sites.push(site);
      } else {
        ungrouped.push(site);
      }
    });

    const result: any[] = [];

    // Add groups
    Object.entries(groups).forEach(([groupId, data]) => {
      // Calculate average staffing for the group
      const totalLevel = data.sites.reduce((acc, s) => acc + (staffing[s.id]?.staffingLevel || 0), 0);
      const groupName = jobsiteGroups.find(g => g.id === groupId)?.name || 'Unknown Group';
      result.push({
        id: `group-${groupId}`,
        jobsite_name: groupName,
        customer: data.customer,
        staffingLevel: totalLevel / data.sites.length,
        isGroup: true,
        count: data.sites.length
      });
    });

    // Add ungrouped
    ungrouped.forEach(site => {
      result.push({
        ...site,
        staffingLevel: staffing[site.id]?.staffingLevel || 0,
        isGroup: false
      });
    });

    // Sort result based on current sort settings
    return result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') comparison = a.jobsite_name.localeCompare(b.jobsite_name);
      if (sortBy === 'customer') comparison = a.customer.localeCompare(b.customer);
      if (sortBy === 'staffing') comparison = a.staffingLevel - b.staffingLevel;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [activeJobsites, staffing, sortBy, sortOrder]);

  const handleSiteClick = (item: any) => {
    if (item.isGroup) {
      const groupId = item.id.replace('group-', '');
      const groupSites = activeJobsites.filter(s => s.group_id === groupId);
      if (groupSites.length > 0) {
        const bounds = L.latLngBounds(groupSites.map(s => [s.lat!, s.lng!]));
        setMapTarget({ bounds: bounds.pad(0.2) });
      }
    } else {
      setMapTarget({ center: [item.lat!, item.lng!] });
    }
    setExpandedSiteId(expandedSiteId === item.id ? null : item.id);
  };

  return (
    <div className="h-[calc(100vh-200px)] lg:h-[calc(100vh-200px)] min-h-[500px] rounded-3xl overflow-hidden border border-emerald-900/30 relative map-portal-container">
      <style>{`
        .leaflet-tooltip-top.custom-map-label {
          background: #0A120F;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          padding: 4px 8px;
          color: white;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          margin-top: -10px;
        }
        .leaflet-tooltip-top.custom-map-label::before {
          border-top-color: rgba(255,255,255,0.1);
          bottom: -7px;
          border-width: 6px 6px 0;
        }
        .leaflet-tooltip-top.custom-map-label::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 1px;
          height: 10px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.3), transparent);
        }
        @media (max-width: 768px) {
          .leaflet-control-zoom {
            display: none;
          }
        }
      `}</style>
      <MapContainer 
        center={center} 
        zoom={4} 
        style={{ height: '100%', width: '100%', background: '#f8fafc' }}
      >
        <MapController target={mapTarget} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {activeJobsites.map((site) => {
          const siteStaff = staffing[site.id];
          const color = customerColors[site.customer];
          
          return (
            <Marker 
              key={site.id} 
              position={[site.lat!, site.lng!]}
              icon={createCustomIcon(color)}
            >
              <Tooltip 
                permanent 
                direction="top" 
                className="custom-map-label"
                offset={[0, -10]}
              >
                {site.jobsite_name}
              </Tooltip>
              <Popup className="custom-popup">
                <div className="p-3 min-w-[240px] bg-[#0A120F] text-white rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg">{site.jobsite_name}</h3>
                    <div className="flex items-center gap-2">
                      {siteStaff?.hasRotationConflict && (
                        <div className="flex items-center gap-1 text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 text-[8px] font-bold uppercase animate-pulse">
                          <RefreshCw size={8} />
                          Rotation Conflict
                        </div>
                      )}
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: getStaffingColor(siteStaff?.staffingLevel || 0) }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider mb-4">{site.customer}</p>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Assigned Personnel</p>
                      {siteStaff?.employees.length ? (
                        <div className="space-y-1.5">
                          {siteStaff.employees.map((emp, i) => {
                            const hasConflict = isRotationWeek(new Date(selectedWeek + 'T00:00:00'), rotationConfigs[emp.id], emp.rotation_group);
                            
                            const getGroupColor = (group: string | null | undefined) => {
                              switch (group) {
                                case 'A': return 'bg-black border-white/20';
                                case 'B': return 'bg-red-500 border-red-400/50';
                                case 'C': return 'bg-yellow-500 border-yellow-400/50';
                                case 'D': return 'bg-blue-500 border-blue-400/50';
                                default: return 'bg-gray-600 border-gray-500/50';
                              }
                            };

                            return (
                              <div key={emp.id} className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                                hasConflict ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'
                              }`}>
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full shadow-sm ${getGroupColor(emp.rotation_group)}`} title={`Group ${emp.rotation_group || 'None'}`} />
                                  <div className="flex flex-col">
                                    <span className={i === 0 ? 'text-emerald-400 font-bold' : 'text-gray-300'}>
                                      {emp.first_name} {emp.last_name}
                                    </span>
                                    {hasConflict && (
                                      <span className="text-[7px] font-bold uppercase text-emerald-500">
                                        Rotation Scheduled
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[10px] text-gray-500 uppercase">{emp.role}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 italic">No personnel assigned</p>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <MapPin size={12} />
                        <span>{site.city}, {site.state}</span>
                      </div>
                      <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                        <Navigation size={14} className="text-emerald-500" />
                      </button>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Week Selector */}
      <div className="absolute top-4 left-4 lg:top-6 lg:left-6 z-[1000]">
        <div className="bg-[#050A08]/90 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl p-1.5 lg:p-2 flex items-center gap-2 lg:gap-3">
          <div className="w-7 h-7 lg:w-10 lg:h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Calendar className="text-emerald-500 w-3.5 h-3.5 lg:w-5 lg:h-5" size={18} />
          </div>
          <div className="pr-1 lg:pr-4">
            <label className="block text-[6px] lg:text-[8px] font-black text-emerald-500/50 uppercase tracking-tighter mb-0.5">Logistics For</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="bg-transparent text-white text-[9px] lg:text-xs font-bold outline-none cursor-pointer appearance-none hover:text-emerald-400 transition-colors"
            >
              {mondays.map(monday => (
                <option key={monday.toISOString()} value={format(monday, 'yyyy-MM-dd')} className="bg-[#0A120F] text-white">
                  {format(monday, 'MMM dd')}
                </option>
              ))}
            </select>
          </div>
          <div className="h-6 lg:h-8 w-px bg-white/10" />
          <button 
            onClick={() => setSelectedWeek(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))}
            className="px-1.5 lg:px-3 py-2 text-[7px] lg:text-[9px] font-black text-gray-500 hover:text-emerald-500 uppercase tracking-widest transition-colors"
          >
            Now
          </button>
        </div>
      </div>

      {/* Professional Logistics Legend */}
      <div className={`absolute top-4 right-4 lg:top-6 lg:right-6 z-[1000] transition-all duration-500 ease-in-out ${legendOpen ? 'w-[calc(100%-2rem)] sm:w-80' : 'w-12 lg:w-14'}`}>
        <div className="bg-[#050A08]/90 backdrop-blur-xl border border-emerald-500/20 rounded-[1.5rem] lg:rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
          <button 
            onClick={() => setLegendOpen(!legendOpen)}
            className="w-full p-3 lg:p-5 flex items-center justify-between hover:bg-emerald-500/5 transition-colors group"
          >
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <div className="h-8 lg:h-10 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
                  <img src="/logo.png" alt="Greenergy Logo" className="h-full object-contain" referrerPolicy="no-referrer" />
                </div>
              </div>
              {legendOpen && (
                <div className="text-left border-l border-white/10 pl-3 ml-1">
                  <span className="block font-black text-white text-xs lg:text-sm uppercase tracking-widest">GreEnergy</span>
                  <span className="block text-[8px] lg:text-[10px] text-emerald-500 font-bold uppercase tracking-tighter">RESOURCES</span>
                </div>
              )}
            </div>
            {legendOpen ? <ChevronRight size={16} className="text-gray-500 lg:w-[18px] lg:h-[18px]" /> : null}
          </button>

          <AnimatePresence>
            {legendOpen && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 lg:px-5 pb-4 lg:pb-6 space-y-4 lg:space-y-6">
                  {/* Controls */}
                  <div className="flex items-center gap-2 p-1 bg-black/40 rounded-xl lg:rounded-2xl border border-white/5">
                    <button 
                      onClick={() => {
                        setSortBy('name');
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      }}
                      className={`flex-1 py-1.5 lg:py-2 rounded-lg lg:rounded-xl text-[8px] lg:text-[9px] font-black uppercase tracking-widest transition-all ${
                        sortBy === 'name' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      Alpha
                    </button>
                    <button 
                      onClick={() => {
                        setSortBy('staffing');
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      }}
                      className={`flex-1 py-1.5 lg:py-2 rounded-lg lg:rounded-xl text-[8px] lg:text-[9px] font-black uppercase tracking-widest transition-all ${
                        sortBy === 'staffing' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      Status
                    </button>
                  </div>

                  {/* List */}
                  <div className="max-h-[300px] lg:max-h-[450px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                    {/* Off-Site Personnel Section */}
                    {Object.keys(offSite).length > 0 && (
                      <div className="mb-4 space-y-2">
                        <h3 className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.2em] px-4 mb-2">
                          Off-Site Personnel
                        </h3>
                        {Object.entries(offSite).map(([key, data]) => {
                          const offSiteData = data as OffSitePersonnel;
                          const isExpanded = expandedSiteId === `offsite-${key}`;
                          return (
                            <div key={key} className="space-y-1">
                              <div 
                                onClick={() => setExpandedSiteId(isExpanded ? null : `offsite-${key}`)}
                                className={`p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-blue-500/5 hover:border-blue-500/20 transition-all cursor-pointer ${isExpanded ? 'bg-blue-500/5 border-blue-500/20' : ''}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-1.5 h-8 rounded-full bg-blue-500/30" />
                                  <div>
                                    <div className="text-xs font-black text-white uppercase tracking-tight">{offSiteData.status}</div>
                                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{offSiteData.employees.length} Personnel</div>
                                  </div>
                                </div>
                                <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                  <ChevronDown size={14} className="text-gray-600" />
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mx-2 p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                                      {offSiteData.employees.map((emp) => (
                                        <div key={emp.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                                          <span className="text-[10px] font-bold text-gray-300">{emp.first_name} {emp.last_name}</span>
                                          <span className="text-[8px] text-gray-500 uppercase font-black">{emp.role}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <h3 className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.2em] px-4 mb-2">
                      Active Jobsites
                    </h3>
                    {legendItems.map(item => {
                      const level = item.staffingLevel;
                      const color = customerColors[item.customer] || '#10b981';
                      const isExpanded = expandedSiteId === item.id;
                      
                      // Get employees for this site or group
                      const itemEmployees = item.isGroup 
                        ? (() => {
                            const allGroupEmployees = activeJobsites
                              .filter(s => s.jobsite_group === item.jobsite_name)
                              .flatMap(s => staffing[s.id]?.employees || []);
                            
                            // Unique by ID
                            const seen = new Set();
                            return allGroupEmployees.filter(emp => {
                              if (seen.has(emp.id)) return false;
                              seen.add(emp.id);
                              return true;
                            });
                          })()
                        : staffing[item.id]?.employees || [];

                      return (
                        <div key={item.id} className="space-y-1">
                          <div 
                            onClick={() => handleSiteClick(item)}
                            className={`p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all cursor-pointer ${isExpanded ? 'bg-emerald-500/5 border-emerald-500/20' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: color }} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="text-xs font-black text-white uppercase tracking-tight">{item.jobsite_name}</div>
                                  {item.isGroup && (
                                    <span className="text-[7px] bg-emerald-500/10 text-emerald-500 px-1 py-0.5 rounded border border-emerald-500/20 font-black uppercase">
                                      {item.count} Sites
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{item.customer}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col items-end gap-1">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ 
                                    backgroundColor: getStaffingColor(level),
                                    boxShadow: `0 0 12px ${getStaffingColor(level)}`
                                  }} 
                                />
                                <span className="text-[8px] font-black text-gray-600 uppercase">
                                  {level >= 1 ? 'Full' : level > 0.5 ? 'Good' : 'Alert'}
                                </span>
                              </div>
                              <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                <ChevronDown size={14} className="text-gray-600" />
                              </div>
                            </div>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mx-2 p-3 bg-black/40 rounded-xl border border-white/5 space-y-2">
                                  <div className="flex items-center justify-between mb-2 px-1">
                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                                      <Users size={10} />
                                      Current Staffing
                                    </span>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSiteClick(item);
                                      }}
                                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                      title="Zoom to location"
                                    >
                                      <Maximize2 size={10} />
                                    </button>
                                  </div>
                                  
                                  {itemEmployees.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-1">
                                      {itemEmployees.map((emp, idx) => {
                                        const getGroupColor = (group: string | null | undefined) => {
                                          switch (group) {
                                            case 'A': return 'bg-black border-white/20';
                                            case 'B': return 'bg-red-500 border-red-400/50';
                                            case 'C': return 'bg-yellow-500 border-yellow-400/50';
                                            case 'D': return 'bg-blue-500 border-blue-400/50';
                                            default: return 'bg-gray-600 border-gray-500/50';
                                          }
                                        };

                                        return (
                                          <div key={`${emp.id}-${idx}`} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                                            <div className="flex items-center gap-2">
                                              <div className={`w-2 h-2 rounded-full border ${getGroupColor(emp.rotation_group)}`} />
                                              <span className="text-[10px] font-bold text-gray-300">{emp.first_name} {emp.last_name}</span>
                                            </div>
                                            <span className="text-[8px] text-gray-500 uppercase font-black">{emp.role}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-center py-2">
                                      <span className="text-[9px] text-gray-600 italic">No personnel assigned</span>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Staffing Legend */}
      <div className="absolute bottom-6 left-6 z-[1000] bg-[#0A120F]/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl hidden sm:block">
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Staffing Status</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span className="text-[10px] text-white">Full</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
              <span className="text-[10px] text-white">Partial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
              <span className="text-[10px] text-white">Critical</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
