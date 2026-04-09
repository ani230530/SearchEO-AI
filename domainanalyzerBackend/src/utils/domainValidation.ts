export interface ParsedDomainInput {
  hostname: string;
  normalizedUrl: string;
}

export interface ParsedSiteUrlInput {
  hostname: string;
  normalizedSiteUrl: string;
}

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
      normalizedUrl: `https://${hostname}`,
    };
  } catch {
    return null;
  }
}

export function parseSiteUrlInput(value: string): ParsedSiteUrlInput | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.includes("@")) {
    return null;
  }

  const hasScheme = HAS_SCHEME_REGEX.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    const hostname = url.hostname.toLowerCase();

    if (!isValidHostname(hostname) || url.username || url.password) {
      return null;
    }

    const port = url.port ? `:${url.port}` : "";
    const normalizedPathname =
      url.pathname && url.pathname !== "/" ? url.pathname.replace(/\/+$/, "") : "";

    return {
      hostname,
      normalizedSiteUrl: `${url.protocol}//${hostname}${port}${normalizedPathname}`,
    };
  } catch {
    return null;
  }
}

export function getDomainLookupCandidates(input: ParsedDomainInput | string) {
  const parsed = typeof input === "string" ? parseDomainInput(input) : input;
  if (!parsed) {
    return [];
  }

  return Array.from(
    new Set([parsed.normalizedUrl, `http://${parsed.hostname}`, parsed.hostname])
  );
}
