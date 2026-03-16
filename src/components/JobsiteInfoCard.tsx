import React from 'react';
import { MapPin, Phone, User, Clock, DollarSign, Shield, Users, Navigation, Info } from 'lucide-react';
import { Jobsite } from '../types';

interface JobsiteInfoCardProps {
  jobsite: Jobsite;
  title?: string;
}

const JobsiteInfoCard: React.FC<JobsiteInfoCardProps> = ({ jobsite, title = "Jobsite Information" }) => {
  const googleMapsUrl = jobsite.lat && jobsite.lng 
    ? `https://www.google.com/maps/dir/?api=1&destination=${jobsite.lat},${jobsite.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobsite.full_address || jobsite.jobsite_name)}`;

  return (
    <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <MapPin size={20} className="text-emerald-500" />
          {title}
        </h3>
        <a 
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black border border-emerald-500/20 rounded-xl text-xs font-bold transition-all group"
        >
          <Navigation size={14} className="group-hover:animate-pulse" />
          Get Directions
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Site Name</p>
            <p className="text-sm text-white font-bold mt-0.5">{jobsite.jobsite_name}</p>
            {jobsite.jobsite_alias && (
              <p className="text-xs text-gray-500 mt-0.5 italic">"{jobsite.jobsite_alias}"</p>
            )}
          </div>
          
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Address</p>
            <p className="text-sm text-gray-300 mt-0.5 leading-relaxed">{jobsite.full_address}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Customer</p>
              <p className="text-sm text-gray-300 mt-0.5">{jobsite.customer}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Site ID</p>
              <p className="text-sm text-gray-300 mt-0.5 font-mono">{jobsite.jobsite_id_ref || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Contact & Logistics */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Site Manager</p>
              <div className="flex items-center gap-2 mt-1">
                <User size={12} className="text-emerald-500" />
                <p className="text-sm text-gray-300">{jobsite.manager || 'Unassigned'}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Contact Person</p>
              <div className="flex items-center gap-2 mt-1">
                <User size={12} className="text-emerald-500" />
                <p className="text-sm text-gray-300">{jobsite.contact_name || 'N/A'}</p>
              </div>
            </div>
          </div>

          {jobsite.contact_phone && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Contact Phone</p>
              <a href={`tel:${jobsite.contact_phone}`} className="flex items-center gap-2 mt-1 text-emerald-500 hover:text-emerald-400 transition-colors">
                <Phone size={12} />
                <p className="text-sm font-bold">{jobsite.contact_phone}</p>
              </a>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Drive Time</p>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={12} className="text-gray-500" />
                <p className="text-sm text-gray-300">{jobsite.drive_time_minutes ? `${jobsite.drive_time_minutes} mins` : 'N/A'}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Min Staffing</p>
              <div className="flex items-center gap-2 mt-1">
                <Users size={12} className="text-gray-500" />
                <p className="text-sm text-gray-300">{jobsite.min_staffing || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
            <DollarSign size={14} />
          </div>
          <div>
            <p className="text-[8px] uppercase font-bold text-gray-500">Wage Rate</p>
            <p className="text-xs font-bold text-white">{jobsite.wage || 'Standard'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
            <Shield size={14} />
          </div>
          <div>
            <p className="text-[8px] uppercase font-bold text-gray-500">Safety Score</p>
            <p className="text-xs font-bold text-white">{jobsite.safety_score || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
            <Navigation size={14} />
          </div>
          <div>
            <p className="text-[8px] uppercase font-bold text-gray-500">Coordinates</p>
            <p className="text-xs font-bold text-white font-mono">
              {jobsite.lat && jobsite.lng ? `${jobsite.lat.toFixed(4)}, ${jobsite.lng.toFixed(4)}` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {jobsite.notes && (
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} className="text-amber-500" />
            <p className="text-[10px] uppercase font-bold text-amber-500/70">Site Notes</p>
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">{jobsite.notes}</p>
        </div>
      )}
    </div>
  );
};

export default JobsiteInfoCard;
