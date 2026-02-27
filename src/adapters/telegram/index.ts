import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parse as parseUrl } from 'node:url';

import type { Adapter } from '../../core/contracts.js';
import type { BotAdapter, ReplyApi, ReplyTarget } from '../types.js';
import type { PollingController } from '../../transports/polling.js';
import type { UpdateHandler } from '../../core/types.js';
import { createReferenceAdapter } from '../reference-adapter/index.js';
import { createPollingTransport } from '../../transports/polling.js';
import { getNestedRecord, getNumber, isRecord } from '../../utils/index.js';

const API_BASE = 'https://api.telegram.org/bot';
const WEBHOOK_BODY_LIMIT = 1024 * 1024; // 1MB

export interface TelegramAdapterConfig {
  token: string;
}

export interface TelegramAdapter extends BotAdapter, Adapter {
  createWebhookController(bot: UpdateHandler): { controller: TelegramWebhookController };
}

function getMessage(update: unknown): Record<string, unknown> | undefined {
  return getNestedRecord(update, 'message');
}

function getCallbackQuery(update: unknown): Record<string, unknown> | undefined {
  return getNestedRecord(update, 'callback_query');
}

function normalizeUpdate(tg: Record<string, unknown>): Record<string, unknown> {
  const updateId = getNumber(tg['update_id']);
  const result: Record<string, unknown> = { update_id: updateId ?? 0 };

  let chatId: number | undefined;
  let userId: number | undefined;

  const message = getMessage(tg);
  if (isRecord(message)) {
    const chat = getNestedRecord(message, 'chat');
    const from = getNestedRecord(message, 'from');
    chatId = chat ? getNumber(chat['id']) : undefined;
    userId = from ? getNumber(from['id']) : undefined;
    const text = typeof message['text'] === 'string' ? message['text'] : undefined;
    result['message'] = {
      text,
      recipient: chatId !== undefined ? { chat_id: chatId } : undefined,
      sender: userId !== undefined ? { user_id: userId } : undefined,
    };
  }

  const cq = getCallbackQuery(tg);
  if (isRecord(cq)) {
    if (chatId === undefined) {
      const cqMessage = getNestedRecord(cq, 'message');
      const cqChat = cqMessage ? getNestedRecord(cqMessage, 'chat') : undefined;
      chatId = cqChat ? getNumber(cqChat['id']) : undefined;
    }
    if (userId === undefined) {
      const from = getNestedRecord(cq, 'from');
      userId = from ? getNumber(from['id']) : undefined;
    }
    const data = typeof cq['data'] === 'string' ? cq['data'] : undefined;
    result['callback_query'] = data !== undefined ? { data } : {};
  }

  if (chatId !== undefined) result['chat_id'] = chatId;
  if (userId !== undefined) result['user_id'] = userId;

  return result;
}

async function sendMessage(token: string, chatId: number, text: string): Promise<unknown> {
  const url = `${API_BASE}${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
  return res.json();
}

function getChatIdFromNormalized(update: unknown): number | undefined {
  if (!isRecord(update)) return undefined;
  const direct = getNumber(update['chat_id']);
  if (direct !== undefined) return direct;
  const message = getMessage(update);
  if (!isRecord(message)) return undefined;
  const recipient = getNestedRecord(message, 'recipient');
  return recipient ? getNumber(recipient['chat_id']) : undefined;
}

export interface TelegramWebhookOptions {
  port: number;
  path?: string;
}

export interface TelegramWebhookController {
  start(options: TelegramWebhookOptions): void;
  stop(): Promise<void>;
}

function readBodyWithLimit(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createWebhookController(bot: UpdateHandler): { controller: TelegramWebhookController } {
  let server: Server | undefined;
  return {
    controller: {
      start(options: TelegramWebhookOptions) {
        const path = options.path ?? '/webhook';
        server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
          const url = parseUrl(req.url ?? '', true);
          if (req.method !== 'POST' || url.pathname !== path) {
            res.writeHead(req.method === 'POST' ? 404 : 405);
            res.end();
            return;
          }
          try {
            const raw = await readBodyWithLimit(req, WEBHOOK_BODY_LIMIT);
            const body = JSON.parse(raw.toString()) as unknown;
            const normalized = isRecord(body) ? normalizeUpdate(body) : { update_id: 0 };
            await bot.handleUpdate(normalized);
            res.writeHead(200);
            res.end();
          } catch {
            res.writeHead(500);
            res.end();
          }
        });
        server.listen(options.port);
      },
      stop(): Promise<void> {
        return new Promise((resolve, reject) => {
          if (!server) {
            resolve();
            return;
          }
          server.close((err) => (err ? reject(err) : resolve()));
          server = undefined;
        });
      },
    },
  };
}

export function createTelegramAdapter(config: TelegramAdapterConfig): TelegramAdapter {
  const { token } = config;
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new Error('BOT_TOKEN is required');
  }
  const referenceAdapter = createReferenceAdapter(async (ctx, text) => {
    const chatId = getChatIdFromNormalized(ctx.update);
    if (chatId === undefined) throw new Error('No chat_id in update');
    return sendMessage(token, chatId, text);
  });

  return {
    ...referenceAdapter,
    createReplyApi(): ReplyApi {
      return {
        getReplyTargetFromUpdate(update: unknown): ReplyTarget | undefined {
          const chatId = getChatIdFromNormalized(update);
          return chatId !== undefined ? { chatId } : undefined;
        },
        sendReply(target: ReplyTarget, text: string) {
          return sendMessage(token, target.chatId, text);
        },
      };
    },
    createPollingController(
      bot: UpdateHandler,
      pollConfig: Record<string, unknown>,
    ): { controller: PollingController } {
      const intervalMs = (pollConfig.intervalMs as number | undefined) ?? 500;
      const controller = createPollingTransport({
        intervalMs,
        dedupe: {
          getUpdateId: (u) => (isRecord(u) ? getNumber(u['update_id']) : undefined),
          getKey: (u) => (isRecord(u) ? getNumber(u['update_id']) : undefined),
        },
        getUpdates: async ({ offset, signal }) => {
          if (signal.aborted) return [];
          const url = `${API_BASE}${token}/getUpdates?timeout=25${offset !== undefined ? `&offset=${offset}` : ''}`;
          const res = await fetch(url, { signal });
          if (!res.ok) return [];
          const data = (await res.json()) as { ok?: boolean; result?: unknown[] };
          const raw = Array.isArray(data?.result) ? data.result : [];
          return raw.filter(isRecord).map(normalizeUpdate);
        },
      });
      controller.start((update) => bot.handleUpdate(update));
      return { controller };
    },
    createWebhookController(bot: UpdateHandler): { controller: TelegramWebhookController } {
      return createWebhookController(bot);
    },
  };
}
