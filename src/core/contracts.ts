export interface ReplyTarget {
  chatId: number;
}

export interface ReplyHandler {
  getReplyTargetFromUpdate(update: unknown): ReplyTarget | undefined;
  sendReply(target: ReplyTarget, text: string, extra?: unknown): Promise<unknown>;
}

export interface CommandResult {
  name: string;
  payload: string;
}

export interface AdapterContext {
  readonly update: unknown;
  readonly messageText: string | undefined;
  readonly callbackData: string | undefined;
  readonly command: CommandResult | undefined;
  readonly chatId: number | undefined;
  readonly userId: number | undefined;
  message?: Record<string, unknown>;
  callbackQuery?: Record<string, unknown>;
  inlineQuery?: Record<string, unknown>;
}

export interface Adapter {
  createContext(update: unknown): AdapterContext;
  reply(ctx: { update: unknown }, text: string, extra?: unknown): Promise<unknown>;
  getUpdateId(update: unknown): number | string | undefined;
  getMessageText(update: unknown): string | undefined;
  getCommand(update: unknown): CommandResult | undefined;
  getCallbackData(update: unknown): string | undefined;
  getChatId(update: unknown): number | undefined;
  getUserId(update: unknown): number | undefined;
}

export type OnUpdate = (update: unknown) => Promise<unknown>;

export interface Transport {
  start(onUpdate: OnUpdate): void | Promise<void>;
  stop(): Promise<void>;
}

export interface PollingTransportOptions {
  getUpdates: (params: { offset?: number; signal: AbortSignal }) => Promise<readonly unknown[]>;
  intervalMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  logThrottleMs?: number;
  logger?: { warn: (msg: string) => void };
  dedupe?: {
    getUpdateId?: (update: unknown) => number | undefined;
    getKey?: (update: unknown) => string | number | undefined;
    ttlMs?: number;
    maxSize?: number;
  };
}

export interface PollingTransport extends Transport {
  isRunning?(): boolean;
}

export type CreatePollingTransport = (options: PollingTransportOptions) => PollingTransport;

export interface WebhookOptions {
  onError?: (err: unknown, update: unknown) => unknown | Promise<unknown>;
}

export type WebhookCallback = (update: unknown) => Promise<void>;
