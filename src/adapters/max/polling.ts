import { Bot as MaxBotSdk } from '@maxhub/max-bot-api';

import type { UpdateHandler } from '../../core/types.js';
import type { PollingConfig } from '../types.js';
import { getNestedRecord, getNumber, isRecord } from '../../utils/index.js';
import { createPollingController, type PollingController } from '../../transports/polling.js';
import { createMaxReplyApi } from './reply-api.js';

interface MaxSdkLike {
  api: unknown;
}

interface MaxApiLike {
  getUpdates: (a?: unknown, b?: unknown) => Promise<unknown>;
}

function hasGetUpdates(api: unknown): api is MaxApiLike {
  return isRecord(api) && typeof api['getUpdates'] === 'function';
}

function normalizeMaxUpdate(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const updateId = getNumber(raw['update_id']);
  const updateType = typeof raw['update_type'] === 'string' ? raw['update_type'] : undefined;
  const timestamp = getNumber(raw['timestamp']);

  const callbackId =
    (() => {
      const cb = getNestedRecord(raw, 'callback');
      const id = cb ? cb['callback_id'] : undefined;
      return typeof id === 'string' ? id : undefined;
    })() ?? undefined;

  const messageId =
    (() => {
      const msg = getNestedRecord(raw, 'message');
      const body = msg ? getNestedRecord(msg, 'body') : undefined;
      const mid = body ? body['mid'] : undefined;
      return typeof mid === 'string' ? mid : undefined;
    })() ?? undefined;

  const chatId =
    getNumber(raw['chat_id']) ??
    (() => {
      const msg = getNestedRecord(raw, 'message');
      const recipient = msg ? getNestedRecord(msg, 'recipient') : undefined;
      if (recipient) return getNumber(recipient['chat_id']);
      const cb = getNestedRecord(raw, 'callback');
      const cbRecipient = cb ? getNestedRecord(cb, 'recipient') : undefined;
      if (cbRecipient) return getNumber(cbRecipient['chat_id']);
      const cbMsg = cb ? getNestedRecord(cb, 'message') : undefined;
      const cbMsgRecipient = cbMsg ? getNestedRecord(cbMsg, 'recipient') : undefined;
      if (cbMsgRecipient) return getNumber(cbMsgRecipient['chat_id']);
      const cq = getNestedRecord(raw, 'callback_query');
      const cqMsg = cq ? getNestedRecord(cq, 'message') : undefined;
      const cqMsgRecipient = cqMsg ? getNestedRecord(cqMsg, 'recipient') : undefined;
      if (cqMsgRecipient) return getNumber(cqMsgRecipient['chat_id']);
      const cqChat = cqMsg ? getNestedRecord(cqMsg, 'chat') : undefined;
      return cqChat ? getNumber(cqChat['id']) : undefined;
    })();

  const messageText =
    (() => {
      const msg = getNestedRecord(raw, 'message');
      if (!msg) return undefined;

      const direct = msg['text'];
      if (typeof direct === 'string') return direct;

      const body = getNestedRecord(msg, 'body');
      const text = body ? body['text'] : undefined;
      return typeof text === 'string' ? text : undefined;
    })() ?? undefined;

  const callbackData =
    (() => {
      const direct = getNestedRecord(raw, 'callback_query');
      const directData = direct ? direct['data'] : undefined;
      if (typeof directData === 'string') return directData;

      const directPayload = direct ? direct['payload'] : undefined;
      if (typeof directPayload === 'string') return directPayload;

      const cb = getNestedRecord(raw, 'callback');
      const payload = cb ? cb['payload'] : undefined;
      return typeof payload === 'string' ? payload : undefined;
    })() ?? undefined;

  const userId =
    getNumber(raw['user_id']) ??
    (() => {
      const msg = getNestedRecord(raw, 'message');
      const sender = msg ? getNestedRecord(msg, 'sender') : undefined;
      return sender ? getNumber(sender['user_id']) : undefined;
    })();

  const normalized: Record<string, unknown> = {
    ...(updateId === undefined ? {} : { update_id: updateId }),
    ...(updateType === undefined ? {} : { update_type: updateType }),
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(chatId === undefined ? {} : { chat_id: chatId }),
    ...(userId === undefined ? {} : { user_id: userId }),
    ...(callbackId === undefined ? {} : { callback_id: callbackId }),
    ...(messageId === undefined ? {} : { message_id: messageId }),
    ...(messageText === undefined
      ? {}
      : {
          message: {
            text: messageText,
            recipient: { chat_id: chatId },
            ...(userId === undefined ? {} : { sender: { user_id: userId } }),
          },
        }),
    ...(callbackData === undefined ? {} : { callback_query: { payload: callbackData } }),
  };

  return normalized;
}

export interface MaxPollingConfig extends PollingConfig {
  token: string;
  sdk?: unknown;
}

export function createMaxPollingController(
  bot: UpdateHandler,
  options: MaxPollingConfig,
): { controller: PollingController; api: ReturnType<typeof createMaxReplyApi> } {
  const sdk: unknown = options.sdk ?? new MaxBotSdk(options.token);
  if (!isRecord(sdk) || !('api' in sdk)) {
    throw new Error('NotImplemented');
  }

  const api = (sdk as unknown as MaxSdkLike).api;
  if (!hasGetUpdates(api)) {
    throw new Error('NotImplemented');
  }

  let marker: unknown = undefined;

  const controller = createPollingController(bot, {
    intervalMs: options.intervalMs,
    dedupe: {
      ttlMs: options.dedupeTtlMs,
      maxSize: options.dedupeMaxSize as number | undefined,
      getUpdateId: (update) => {
        if (!isRecord(update)) return undefined;
        const v = update['update_id'];
        return typeof v === 'number' ? v : undefined;
      },
      getKey: (update) => {
        if (!isRecord(update)) return undefined;
        const messageId2 = update['message_id'];
        if (typeof messageId2 === 'string' && messageId2) return messageId2;
        const callbackId2 = update['callback_id'];
        if (typeof callbackId2 === 'string' && callbackId2) return callbackId2;
        const type = update['update_type'];
        const ts = update['timestamp'];
        const chat = update['chat_id'];
        if (typeof type === 'string' && typeof ts === 'number' && typeof chat === 'number') {
          return `${type}:${ts}:${chat}`;
        }
        return undefined;
      },
    },
    getUpdates: async ({ signal }) => {
      if (signal.aborted) return [];

      const res = await api.getUpdates(undefined, marker === undefined ? undefined : { marker });
      if (!isRecord(res)) return [];

      marker = res['marker'];
      const updates = res['updates'];
      if (!Array.isArray(updates)) return [];
      return updates.map(normalizeMaxUpdate);
    },
  });

  const replyApi = createMaxReplyApi(
    api as unknown as {
      sendMessageToChat: (chatId: number, text: string, extra?: Record<string, unknown>) => Promise<unknown>;
    },
  );
  return { controller, api: replyApi };
}
