/**
 * Safely parse a value that could be a JSON string or an object
 */
export const safeParseObject = (val: any): Record<string, any> => {
  try {
    if (!val) return {};
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return {};
      }
    }
    return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
  } catch (err) {
    console.error('Error in safeParseObject:', err);
    return {};
  }
};

/**
 * Safely parse a value that could be a JSON string or an array
 */
export const safeParseArray = (val: any): any[] => {
  try {
    if (!val) return [];
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(val) ? val : [];
  } catch (err) {
    console.error('Error in safeParseArray:', err);
    return [];
  }
};
