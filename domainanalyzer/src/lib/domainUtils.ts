/**
 * Utility functions for domain ID masking and unmasking
 * This helps hide the actual domain ID from the URL while maintaining functionality
 */

// Simple base64-like encoding for domain IDs (not secure, just for obfuscation)
const encodeDomainId = (id: number): string => {
  // Convert to base36 and add some padding
  const encoded = id.toString(36);
  // Add a prefix to make it look like a domain identifier
  return `d-${encoded}`;
};

const decodeDomainId = (encoded: string): number | null => {
  try {
    // Remove the prefix and decode
    const clean = encoded.replace(/^d-/, '');
    const decoded = parseInt(clean, 36);
    return isNaN(decoded) ? null : decoded;
  } catch {
    return null;
  }
};

// Alternative: Use a hash-based approach for better obfuscation
const hashDomainId = (id: number): string => {
  // Simple hash function (not cryptographically secure) - deterministic
  let hash = 0;
  const str = `domain-${id}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive number and then to base36
  return Math.abs(hash).toString(36);
};

// Store mapping between hashed IDs and actual IDs in sessionStorage
const getDomainIdMapping = (): Record<string, number> => {
  try {
    const stored = sessionStorage.getItem('domainIdMapping');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const setDomainIdMapping = (mapping: Record<string, number>) => {
  try {
    sessionStorage.setItem('domainIdMapping', JSON.stringify(mapping));
  } catch {
    // Ignore storage errors
  }
};

// Main functions for external use
export const maskDomainId = (id: number): string => {
  const mapping = getDomainIdMapping();
  const masked = hashDomainId(id);
  mapping[masked] = id;
  setDomainIdMapping(mapping);
  return masked;
};

export const unmaskDomainId = (masked: string): number | null => {
  const mapping = getDomainIdMapping();
  const idFromMapping = mapping[masked];
  if (idFromMapping) return idFromMapping;

  // If not in mapping, try to see if it's a direct ID or fallback encoded
  if (/^\d+$/.test(masked)) return parseInt(masked, 10);
  
  return fallbackUnmaskDomainId(masked);
};

// Fallback to simple encoding if mapping fails
export const fallbackMaskDomainId = (id: number): string => {
  return encodeDomainId(id);
};

export const fallbackUnmaskDomainId = (masked: string): number | null => {
  return decodeDomainId(masked);
};

// Clean up old mappings (call periodically)
export const cleanupDomainMappings = () => {
  try {
    sessionStorage.removeItem('domainIdMapping');
  } catch {
    // Ignore cleanup errors
  }
};

