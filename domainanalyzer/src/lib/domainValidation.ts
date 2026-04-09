export interface ParsedDomainInput {
  hostname: string;
  normalizedHostname: string;
  normalizedUrl: string;
}

const DOMAIN_ERROR_MESSAGE =
  "Please enter a valid domain or URL (e.g., example.org or brand.co.uk)";

const HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const HAS_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isValidHostname(hostname: string) {
  if (!hostname || hostname.length > 253) {
    return false;
  }

  if (hostname.startsWith(".") || hostname.endsWith(".") || hostname.includes("..")) {
    return false;
  }

  if (IPV4_REGEX.test(hostname)) {
    return false;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) {
    return false;
  }

  return labels.every((label) => HOST_LABEL_REGEX.test(label));
}

export function parseDomainInput(value: string): ParsedDomainInput | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.includes("@")) {
    return null;
  }

  const hasScheme = HAS_SCHEME_REGEX.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  if (!hasScheme && /[/?#]/.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    const hostname = url.hostname.toLowerCase();

    if (!isValidHostname(hostname)) {
      return null;
    }

    return {
      hostname,
      normalizedHostname: hostname,
      normalizedUrl: `https://${hostname}`,
    };
  } catch {
    return null;
  }
}

export function validateDomainInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: "Domain is required",
      parsed: null,
    };
  }

  const parsed = parseDomainInput(trimmed);
  if (!parsed) {
    return {
      valid: false,
      error: DOMAIN_ERROR_MESSAGE,
      parsed: null,
    };
  }

  return {
    valid: true,
    error: "",
    parsed,
  };
}
