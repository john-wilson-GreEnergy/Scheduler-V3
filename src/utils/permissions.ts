import { Role } from '../types';

export const canAccessManagerPortal = (role: Role): boolean => {
  return role === 'admin' || role === 'super_admin' || role === 'site_manager' || role === 'site_lead';
};

export const canEditManagerPortal = (role: Role): boolean => {
  return role === 'admin' || role === 'super_admin' || role === 'site_manager';
};

export const canAccessEmployeePortal = (role: Role): boolean => {
  return true; // All roles can access the employee portal
};
