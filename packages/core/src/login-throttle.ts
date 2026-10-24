export interface LoginThrottleOptions {
  maxFailures?: number;
  windowMs?: number;
}

export interface LoginThrottle {
  retryAfterMs(key: string, now: Date): number;
  recordFailure(key: string, now: Date): void;
  reset(key: string): void;
}

export function createLoginThrottle({
  maxFailures = 5,
  windowMs = 15 * 60_000,
}: LoginThrottleOptions = {}): LoginThrottle {
  const failures = new Map<string, number[]>();

  function recent(key: string, now: Date) {
    const since = now.getTime() - windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > since);
    if (kept.length === 0) {
      failures.delete(key);
    } else {
      failures.set(key, kept);
    }
    return kept;
  }

  return {
    retryAfterMs(key, now) {
      const kept = recent(key, now);
      if (kept.length < maxFailures) {
        return 0;
      }
      const oldest = kept[kept.length - maxFailures] ?? now.getTime();
      return oldest + windowMs - now.getTime();
    },
    recordFailure(key, now) {
      failures.set(key, [...recent(key, now), now.getTime()]);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
