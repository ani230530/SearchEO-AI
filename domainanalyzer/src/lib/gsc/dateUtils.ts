import { format, subDays } from "date-fns";

/**
 * Calculates the default date range for GSC queries
 * End date is 2 days before today, start date is 27 days before end date (28 days total)
 * This calculation happens DYNAMICALLY each time this function is called
 */
export function getDefaultDateRange(): { startDate: string, endDate: string } {
  const today = new Date();
  const endDate = subDays(today, 2);
  const startDate = subDays(endDate, 27);
  
  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd')
  };
}

/**
 * Calculates a date range for a specific number of days
 * End date is 2 days before today, start date is (days-1) days before end date
 */
export function getDateRangeForDays(days: number): { startDate: string, endDate: string } {
  const today = new Date();
  const endDate = subDays(today, 2);
  const startDate = subDays(endDate, days - 1);
  
  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd')
  };
}

/**
 * Formats a date string from yyyy-MM-dd format to human-readable format (e.g. Apr 28, 2025)
 */
export function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return format(date, 'MMM d, yyyy');
  } catch (e) {
    console.error('Error formatting date:', e);
    return dateStr;
  }
}

/**
 * Gets a readable description of the date range type
 */
export function getDateRangeDescription(days: string | number): string {
  const daysNum = typeof days === 'string' ? parseInt(days, 10) : days;
  
  switch (daysNum) {
    case 7: return 'Last 7 Days';
    case 28: return 'Last 28 Days';
    case 90: return 'Last 90 Days';
    default: 
      return days === 'custom' ? 'Custom Range' : `Last ${daysNum} Days`;
  }
}

