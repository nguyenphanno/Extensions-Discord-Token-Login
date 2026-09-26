/** Timing, concurrency and control-flow primitives. */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Full jitter backoff — avoids the thundering-herd pattern of fixed delays. */
export function backoffDelay(attempt: number, base: number, cap: number): number {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof TypeError) return true; // `fetch` rejects with TypeError on network failure.
  return false;
}

/** Retries `work` on transient failures. `shouldRetry` can veto the attempt. */
export async function retry<T>(
  work: (attempt: number) => Promise<T>,
  options: {
    attempts: number;
    base: number;
    cap: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      return await work(attempt);
    } catch (error) {
      lastError = error;
      const allowed = options.shouldRetry?.(error, attempt) ?? isRetryable(error);
      const isLast = attempt === options.attempts - 1;
      if (!allowed || isLast) break;
      await sleep(backoffDelay(attempt, options.base, options.cap));
    }
  }

  throw lastError;
}

/** Runs tasks with a fixed ceiling on concurrency; order of results is preserved. */
export async function mapLimit<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  task: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index] as TIn, index);
    }
  });

  await Promise.all(workers);
  return results;
}

