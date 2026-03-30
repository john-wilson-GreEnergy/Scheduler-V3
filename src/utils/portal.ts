
import { 
  format, 
  isWithinInterval, 
  addWeeks, 
  startOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfQuarter, 
  endOfQuarter, 
  subDays, 
  addDays, 
  getDate, 
  getDay, 
  getMonth,
  setDay,
  setDate,
  setMonth
} from 'date-fns';

export function isScheduledActive(item: any, now: Date): boolean {
  if (!item.active) return false;

  // Check simple date range if provided
  if (item.start_date && item.end_date) {
    const start = new Date(item.start_date + 'T00:00:00');
    const end = new Date(item.end_date + 'T23:59:59');
    if (!isWithinInterval(now, { start, end })) return false;
  } else if (item.start_date) {
    const start = new Date(item.start_date + 'T00:00:00');
    if (now < start) return false;
  } else if (item.end_date) {
    const end = new Date(item.end_date + 'T23:59:59');
    if (now > end) return false;
  }

  // Check Announcement specific scheduling
  if (item.scheduling_mode === 'weeks' && item.start_date) {
    const weekStart = new Date(item.start_date + 'T00:00:00');
    const endOfWeekRange = addWeeks(weekStart, item.weeks_count || 1);
    return isWithinInterval(now, { start: weekStart, end: endOfWeekRange });
  }

  // Check PortalAction specific schedule (legacy)
  if ('schedule_type' in item && item.schedule_type && item.schedule_type !== 'none') {
    const duration = item.duration_days || 7;
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const quarterStart = startOfQuarter(now);
    const quarterEnd = endOfQuarter(now);

    let triggerDate: Date;
    switch (item.schedule_type) {
      case 'first_week_month':
        triggerDate = monthStart;
        break;
      case 'last_week_month':
        triggerDate = subDays(monthEnd, 6);
        break;
      case 'first_week_quarter':
        triggerDate = quarterStart;
        break;
      case 'last_week_quarter':
        triggerDate = subDays(quarterEnd, 6);
        break;
      default:
        return true;
    }
    
    return isWithinInterval(now, { 
      start: triggerDate, 
      end: addDays(triggerDate, duration - 1) 
    });
  }

  // Check PortalAction specific recurrence
  if ('recurrence_type' in item && item.recurrence_type && item.recurrence_type !== 'none') {
    const duration = item.duration_days || 7;
    const dayOfMonth = getDate(now);
    const dayOfWeek = getDay(now); // 0-6
    const month = getMonth(now); // 0-11
    const year = now.getFullYear();

    let triggerDate: Date;

    switch (item.recurrence_type) {
      case 'weekly': {
        // Find the most recent occurrence of the recurrence_day
        triggerDate = setDay(now, item.recurrence_day || 1, { weekStartsOn: 1 });
        // If the calculated trigger date is in the future, go back one week
        if (triggerDate > now) {
          triggerDate = subDays(triggerDate, 7);
        }
        break;
      }
      case 'monthly': {
        triggerDate = setDate(now, item.recurrence_day || 1);
        if (triggerDate > now) {
          const prevMonth = subDays(startOfMonth(now), 1);
          triggerDate = setDate(prevMonth, item.recurrence_day || 1);
        }
        break;
      }
      case 'quarterly': {
        const currentQuarterStart = startOfQuarter(now);
        triggerDate = setDate(currentQuarterStart, item.recurrence_day || 1);
        if (triggerDate > now) {
          const prevQuarter = subDays(startOfQuarter(now), 1);
          triggerDate = setDate(startOfQuarter(prevQuarter), item.recurrence_day || 1);
        }
        break;
      }
      default:
        return true;
    }

    const interval = item.recurrence_interval || 1;
    if (interval > 1) {
      // Logic for interval (e.g. every 2 months) could be added here
      // For now, we'll assume interval 1 for simplicity or implement full logic if needed
    }
    
    return isWithinInterval(now, { 
      start: triggerDate, 
      end: addDays(triggerDate, duration - 1) 
    });
  }

  return true;
}
