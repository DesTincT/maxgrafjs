import type { OnUpdate, Transport } from '../core/contracts.js';

export type PollingGetUpdates = (params: { offset?: number; signal: AbortSignal }) => Promise<readonly unknown[]>;

export interface PollingOptions {
  getUpdates: PollingGetUpdates;
  intervalMs?: number;
  /** Base delay (ms) for backoff on getUpdates error. Default 500. */
  backoffBaseMs?: number;
  /** Max delay (ms) for backoff. Default 5000. */
  backoffMaxMs?: number;
  /** Min interval (ms) between warning logs. Default 10000. */
  logThrottleMs?: number;
  /** Logger for backoff warnings. Default console. */
  logger?: { warn: (msg: string) => void };
  dedupe?: {
    getUpdateId?: (update: unknown) => number | undefined;
    getKey?: (update: unknown) => string | number | undefined;
    ttlMs?: number;
    maxSize?: number;
  };
}

export interface PollingController extends Transport {
  isRunning(): boolean;
}

function defaultGetKey(
  update: unknown,
  getUpdateId: (update: unknown) => number | undefined,
): string | number | undefined {
  const id = getUpdateId(update);
  return id === undefined ? undefined : id;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };

    signal.addEventListener('abort', onAbort);
  });
}

function cleanupDedupeStore(store: Map<string | number, number>, now: number, maxSize: number): void {
  for (const [id, expiresAt] of store) {
    if (expiresAt <= now) {
      store.delete(id);
    }
  }

  while (store.size > maxSize) {
    const first = store.keys().next();
    if (first.done) break;
    store.delete(first.value);
  }
}

function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  if (attempt <= 0) return baseMs;
  const exp = baseMs * Math.pow(2, attempt - 1);
  return Math.min(Math.max(exp, baseMs), maxMs);
}

export function createPollingTransport(options: PollingOptions): PollingController {
  const intervalMs = options.intervalMs ?? 250;
  const backoffBaseMs = options.backoffBaseMs ?? 500;
  const backoffMaxMs = options.backoffMaxMs ?? 5000;
  const logThrottleMs = options.logThrottleMs ?? 10_000;
  const logger = options.logger ?? console;
  const getUpdateId = options.dedupe?.getUpdateId ?? (() => undefined);
  const getKey = options.dedupe?.getKey ?? ((u) => defaultGetKey(u, getUpdateId));
  const ttlMs = options.dedupe?.ttlMs ?? 60_000;
  const maxSize = options.dedupe?.maxSize ?? 1_000;
  const dedupeEnabled = ttlMs > 0 && maxSize > 0;

  const abortController = new AbortController();
  let running = false;
  let onUpdateHandler: OnUpdate | undefined;
  let loopPromise: Promise<void> | undefined;

  let lastUpdateId: number | undefined;
  const seen = new Map<string | number, number>();
  let nextCleanupAt = 0;
  let errorCount = 0;
  let lastLogAt = 0;

  return {
    start(onUpdate: OnUpdate): void {
      if (onUpdateHandler) {
        throw new Error('Transport already started');
      }
      onUpdateHandler = onUpdate;
      running = true;

      loopPromise = (async () => {
        const onUpdate = onUpdateHandler!;
        while (!abortController.signal.aborted) {
          const offset = lastUpdateId === undefined ? undefined : lastUpdateId + 1;

          let updates: readonly unknown[];
          try {
            updates = await options.getUpdates({ offset, signal: abortController.signal });
            errorCount = 0;
          } catch (err) {
            if (abortController.signal.aborted) break;
            errorCount += 1;
            const now = Date.now();
            if (now - lastLogAt >= logThrottleMs) {
              lastLogAt = now;
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn(`[polling] getUpdates error (${errorCount}x): ${msg}`);
            }
            const backoffMs = computeBackoffMs(errorCount, backoffBaseMs, backoffMaxMs);
            await sleep(backoffMs, abortController.signal);
            if (abortController.signal.aborted) break;
            continue;
          }

          for (const update of updates) {
            const id = getUpdateId(update);
            if (id !== undefined) {
              lastUpdateId = lastUpdateId === undefined ? id : Math.max(lastUpdateId, id);
            }

            const key = getKey(update);

            if (dedupeEnabled && key !== undefined) {
              const now = Date.now();
              if (now >= nextCleanupAt) {
                cleanupDedupeStore(seen, now, maxSize);
                nextCleanupAt = now + ttlMs;
              }

              const expiresAt = seen.get(key);
              if (expiresAt !== undefined && expiresAt > now) {
                continue;
              }
            }

            await onUpdate(update);

            if (dedupeEnabled && key !== undefined) {
              const now = Date.now();
              seen.set(key, now + ttlMs);
              if (seen.size > maxSize) {
                cleanupDedupeStore(seen, now, maxSize);
              }
            }
          }

          if (abortController.signal.aborted) break;
          await sleep(intervalMs, abortController.signal);
        }
      })().finally(() => {
        running = false;
      });
    },
    stop: async (): Promise<void> => {
      if (!running || !loopPromise) return;
      abortController.abort();
      await loopPromise;
    },
    isRunning: (): boolean => running,
  };
}

export function createPollingController(
  bot: { handleUpdate: (update: unknown) => Promise<unknown> },
  options: PollingOptions,
): PollingController {
  const transport = createPollingTransport(options);
  transport.start((update) => bot.handleUpdate(update));
  return transport;
}
