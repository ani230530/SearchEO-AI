export const getRedisUrl = (rawUrl?: string): string => {
  const fallbackUrl = 'redis://localhost:6379';
  const resolvedUrl = (rawUrl || fallbackUrl).trim();

  try {
    const parsedUrl = new URL(resolvedUrl);
    if (parsedUrl.hostname === 'localhost') {
      parsedUrl.hostname = '127.0.0.1';
      return parsedUrl.toString();
    }
  } catch {
    // If the URL is malformed, let ioredis handle validation later.
  }

  return resolvedUrl;
};

export const formatRedisError = (error: unknown): string => {
  const maybeAggregate = error as { errors?: unknown } | null;
  if (maybeAggregate && Array.isArray(maybeAggregate.errors)) {
    const nestedMessages = maybeAggregate.errors
      .map((nestedError: unknown) => {
        if (nestedError instanceof Error && nestedError.message) {
          return nestedError.message;
        }
        return String(nestedError);
      })
      .filter(Boolean);

    if (nestedMessages.length > 0) {
      return nestedMessages.join('; ');
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'cause' in error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return cause.message;
    }
    if (cause != null) {
      return String(cause);
    }
  }

  return 'Unknown Redis connection error';
};
