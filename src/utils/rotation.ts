import { RotationConfig, Employee } from '../types';

export const GROUP_COLORS = {
  'A': '#000000', // Black
  'B': '#ef4444', // Red
  'C': '#facc15', // Yellow
  'D': '#3b82f6', // Blue
};

/**
 * Standard A/B/C/D rotation definitions (3 weeks on, 1 week off)
 * Staggered by 1 week each.
 */
const ROTATION_GROUPS = {
  'A': { weeks_on: 3, weeks_off: 1, offset: 3 },
  'B': { weeks_on: 3, weeks_off: 1, offset: 2 },
  'C': { weeks_on: 3, weeks_off: 1, offset: 1 },
  'D': { weeks_on: 3, weeks_off: 1, offset: 0 },
};

// Fixed anchor for all group-based rotations
const GROUP_ANCHOR = '2026-03-09';

/**
 * Calculates if a given date falls on a rotation week for an employee.
 * @param date The date to check (usually the start of a week).
 * @param config The rotation configuration for the employee.
 * @param group The rotation group (A, B, C, D)
 * @returns true if it's a rotation week, false if it's a work week.
 */
export function isRotationWeek(date: Date, employeeOrConfig: Employee | RotationConfig | undefined, group?: string): boolean {
  // If first argument is an Employee object
  if (employeeOrConfig && 'id' in employeeOrConfig) {
    const employee = employeeOrConfig as Employee;
    // 1. Custom config-based rotation (Flexible system) - PRIORITIZE THIS
    if (!employee.uses_group_rotation && employee.rotation_config && employee.rotation_config.is_active) {
      const config = employee.rotation_config;
      const anchor = new Date(config.anchor_date);
      
      // Normalize both dates to the start of their respective weeks (Sunday)
      const getWeekStart = (d: Date) => {
        const temp = new Date(d);
        // Use UTC to avoid timezone issues
        temp.setUTCHours(0, 0, 0, 0);
        const day = temp.getUTCDay();
        const diff = temp.getUTCDate() - day;
        return new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff)).getTime();
      };

      const anchorStart = getWeekStart(anchor);
      const targetStart = getWeekStart(date);

      // Calculate weeks difference
      const msPerWeek = 1000 * 60 * 60 * 24 * 7;
      const weeksDiff = Math.round((targetStart - anchorStart) / msPerWeek);

      // If the target is before the anchor, we handle it by shifting the cycle
      const cycle = config.weeks_on + config.weeks_off;
      const normalizedWeeks = ((weeksDiff % cycle) + cycle) % cycle;

      // If normalizedWeeks is >= weeks_on, it's a rotation week
      return normalizedWeeks >= config.weeks_on;
    }

    // 2. Group-based rotation (Fixed system) - FALLBACK
    if (employee.uses_group_rotation && employee.rotation_group && ROTATION_GROUPS[employee.rotation_group]) {
      const { weeks_on, weeks_off, offset } = ROTATION_GROUPS[employee.rotation_group];
      const anchor = new Date(GROUP_ANCHOR);
      const getWeekStart = (d: Date) => {
        const temp = new Date(d);
        // Use UTC to avoid timezone issues
        temp.setUTCHours(0, 0, 0, 0);
        const day = temp.getUTCDay();
        const diff = temp.getUTCDate() - day;
        return new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff)).getTime();
      };

      const anchorStart = getWeekStart(anchor);
      const targetStart = getWeekStart(date);
      const msPerWeek = 1000 * 60 * 60 * 24 * 7;
      const weeksDiff = Math.round((targetStart - anchorStart) / msPerWeek);
      
      const cycle = weeks_on + weeks_off;
      // Apply offset for staggered groups
      const normalizedWeeks = (((weeksDiff - offset) % cycle) + cycle) % cycle;
      
      return normalizedWeeks >= weeks_on;
    }

    return false;
  }

  // Backwards compatibility for config/group arguments
  const config = employeeOrConfig as RotationConfig | undefined;
  if (config && config.is_active) {
    const anchor = new Date(config.anchor_date);
    
    // Normalize both dates to the start of their respective weeks (Sunday)
    const getWeekStart = (d: Date) => {
      const temp = new Date(d);
      // Use UTC to avoid timezone issues
      temp.setUTCHours(0, 0, 0, 0);
      const day = temp.getUTCDay();
      const diff = temp.getUTCDate() - day;
      return new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff)).getTime();
    };

    const anchorStart = getWeekStart(anchor);
    const targetStart = getWeekStart(date);

    // Calculate weeks difference
    const msPerWeek = 1000 * 60 * 60 * 24 * 7;
    const weeksDiff = Math.round((targetStart - anchorStart) / msPerWeek);

    // If the target is before the anchor, we handle it by shifting the cycle
    const cycle = config.weeks_on + config.weeks_off;
    const normalizedWeeks = ((weeksDiff % cycle) + cycle) % cycle;

    // If normalizedWeeks is >= weeks_on, it's a rotation week
    return normalizedWeeks >= config.weeks_on;
  }

  // 2. Group-based rotation (Fixed system) - FALLBACK
  if (group && ROTATION_GROUPS[group]) {
    const { weeks_on, weeks_off, offset } = ROTATION_GROUPS[group];
    const anchor = new Date(GROUP_ANCHOR);
    const getWeekStart = (d: Date) => {
      const temp = new Date(d);
      // Use UTC to avoid timezone issues
      temp.setUTCHours(0, 0, 0, 0);
      const day = temp.getUTCDay();
      const diff = temp.getUTCDate() - day;
      return new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff)).getTime();
    };

    const anchorStart = getWeekStart(anchor);
    const targetStart = getWeekStart(date);
    const msPerWeek = 1000 * 60 * 60 * 24 * 7;
    const weeksDiff = Math.round((targetStart - anchorStart) / msPerWeek);
    
    const cycle = weeks_on + weeks_off;
    // Apply offset for staggered groups
    const normalizedWeeks = (((weeksDiff - offset) % cycle) + cycle) % cycle;
    
    return normalizedWeeks >= weeks_on;
  }

  return false;
}

/**
 * Gets the status of an employee for a given date.
 */
export function getRotationStatus(date: Date, employee: Employee): 'work' | 'rotation' | 'unknown' {
  if (!employee.rotation_config && !employee.rotation_group) return 'unknown';
  return isRotationWeek(date, employee) ? 'rotation' : 'work';
}
