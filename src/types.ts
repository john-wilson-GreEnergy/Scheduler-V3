export interface Announcement {
  id: string;
  title: string;
  message: string;
  start_date?: string;
  end_date?: string;
  active: boolean;
  scheduling_mode?: 'custom' | 'weeks';
  weeks_count?: number;
  is_reminder?: boolean;
  created_at?: string;
}

export interface AssignmentWeek {
  id: string;
  employee_fk: string;
  week_start: string;
  status: string;
  assignment_type?: string;
  created_at: string;
  assignment_items?: AssignmentItem[];
}

export interface AssignmentItem {
  id: string;
  assignment_week_fk: string;
  jobsite_fk: string;
  days: string[];
  item_order: number;
  assignment_type?: string;
  week_start: string;
  created_at: string;
  jobsites?: Jobsite;
}

export interface JobsiteGroup {
  id: string;
  name: string;
  created_at: string;
}

export interface Jobsite {
  id: string;
  jobsite_id_ref?: string;
  jobsite_name: string;
  group_id?: string; // Replaces jobsite_group
  jobsite_group?: string; // Alias for backward compatibility
  jobsite_alias?: string;
  customer: string;
  address1?: string;
  full_address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  contact_name?: string;
  contact_phone?: string;
  manager?: string;
  drive_time_minutes?: number;
  wage?: string;
  notes?: string;
  is_active: boolean;
  safety_score?: number;
  min_staffing?: number;
  internal?: boolean;
  required_credentials?: string;
  chat_space_id?: string;
}

export interface Notification {
  id: string;
  employee_fk: string;
  title: string;
  message: string;
  read: boolean;
  type: 'info' | 'warning' | 'alert';
  created_at: string;
}

export interface PortalAction {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: string;
  priority: string;
  audience: string;
  category: string;
  sort_order: number;
  open_in_new_tab: boolean;
  featured: boolean;
  active: boolean;
  start_date?: string;
  end_date?: string;
  recurrence_type?: 'none' | 'weekly' | 'monthly' | 'quarterly';
  recurrence_interval?: number;
  recurrence_day?: number;
  duration_days?: number;
  automated?: boolean;
  embed_in_portal?: boolean;
  created_at?: string;
}

export type Role = 'admin' | 'super_admin' | 'site_manager' | 'site_lead' | 'bess_tech' | 'hr';

export interface Employee {
  id: string;
  employee_id_ref: number;
  email: string;
  first_name: string;
  last_name: string;
  job_title: string;
  role: Role;
  credentials?: string;
  is_active: boolean;
  auth_user_id: string;
  rotation_group?: string;
  rotation_config?: RotationConfig;
  uses_group_rotation: boolean;
  updated_by?: string;
  updated_at?: string;
  portal_role?: string;
  portal_access?: boolean;
}

export interface RotationConfig {
  id: string;
  employee_fk: string;
  weeks_on: number;
  weeks_off: number;
  anchor_date: string;
  is_active: boolean;
}
export interface SiteEmployee extends Employee {
  rotation_config?: RotationConfig;
  current_assignments?: AssignmentItem[];
  is_on_rotation?: boolean;
}

export interface PortalRequest {
  id: string;
  employee_fk: string;
  request_type: 'vacation' | 'time_off' | 'rotation_change' | 'jobsite_change' | 'other';
  status: 'pending' | 'approved' | 'denied';
  details: string;
  start_date?: string;
  end_date?: string;
  requested_jobsite?: string;
  requested_week_start?: string;
  target_week_start?: string;
  deny_reason?: string;
  created_at: string;
  approver_fk?: string;
  approved_at?: string;
  employee?: Employee;
  approver?: Employee;
}
