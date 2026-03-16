export interface Announcement {
  id: string;
  title: string;
  message: string;
  level: string;
  start_date: string;
  end_date: string;
  active: boolean;
  schedule_type?: 'none' | 'first_week_month' | 'last_week_month' | 'first_week_quarter' | 'last_week_quarter';
  is_reminder?: boolean;
  duration_days?: number;
  created_at?: string;
}

export interface AssignmentWeek {
  id: string;
  employee_fk: string;
  employee_id?: string;
  week_start: string;
  display_value: string;
  value_type: string;
  customer: string;
  created_at: string;
  first_name?: string;
  last_name?: string;
  assignment_name?: string;
}

export interface AssignmentItem {
  id: string;
  assignment_week_fk: string;
  item_order: number;
  raw_value: string;
  normalized_value: string;
  item_type: string;
  jobsite_fk: string;
  customer: string;
  jobsite?: Jobsite;
}

export interface Jobsite {
  id: string;
  jobsite_id_ref?: string;
  jobsite_name: string;
  jobsite_group?: string;
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

export type Role = 'admin' | 'site_manager' | 'site_lead' | 'bess_tech';

export interface Employee {
  id: string;
  employee_id_ref: string;
  email: string;
  first_name: string;
  last_name: string;
  job_title: string;
  role: Role;
  is_active: boolean;
  auth_user_id: string;
  rotation_group?: 'A' | 'B' | 'C' | 'D';
  rotation_config?: RotationConfig;
  updated_by?: string;
  updated_at?: string;
}

export interface RotationConfig {
  id: string;
  employee_fk: string;
  weeks_on: number;
  weeks_off: number;
  anchor_date: string;
  is_active: boolean;
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
