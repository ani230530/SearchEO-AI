const STORAGE_KEY = "wizard:google-signup-resume:v1";
const RESUME_TTL_MS = 30 * 60 * 1000;

export interface GoogleSignupResume {
  domainId: number;
  savedAt: number;
}

function writeStorage(storage: Storage, value: string) {
  try {
    storage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable in private mode.
  }
}

function readStorage(storage: Storage): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStorage(storage: Storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function saveGoogleSignupResume(domainId: number | null | undefined) {
  if (typeof domainId !== "number" || !Number.isFinite(domainId) || domainId <= 0) {
    return;
  }

  const value = JSON.stringify({
    domainId,
    savedAt: Date.now(),
  } satisfies GoogleSignupResume);

  writeStorage(sessionStorage, value);
  writeStorage(localStorage, value);
}

export function consumeGoogleSignupResume(): GoogleSignupResume | null {
  const raw = readStorage(sessionStorage) ?? readStorage(localStorage);
  clearStorage(sessionStorage);
  clearStorage(localStorage);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GoogleSignupResume>;
    if (
      typeof parsed.domainId !== "number" ||
      !Number.isFinite(parsed.domainId) ||
      parsed.domainId <= 0 ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > RESUME_TTL_MS
    ) {
      return null;
    }
    return { domainId: parsed.domainId, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}
