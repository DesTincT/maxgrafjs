import { getNumber, isRecord } from '../../utils/index.js';
import type { ReplyApi, ReplyTarget } from '../types.js';

interface MaxBotApi {
  sendMessageToChat: (chatId: number, text: string, extra?: Record<string, unknown>) => Promise<unknown>;
}

function asExtra(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value)) return undefined;
  return value;
}

function getChatIdFromUpdate(update: unknown): number | undefined {
  if (!isRecord(update)) return undefined;

  const direct = getNumber(update['chat_id']);
  if (direct !== undefined) return direct;

  const message = update['message'];
  if (isRecord(message)) {
    const recipient = message['recipient'];
    if (isRecord(recipient)) return getNumber(recipient['chat_id']);
  }

  const cq = update['callback_query'];
  if (isRecord(cq)) {
    const cqMsg = cq['message'];
    if (isRecord(cqMsg)) {
      const recipient = cqMsg['recipient'];
      if (isRecord(recipient)) return getNumber(recipient['chat_id']);
      const chat = cqMsg['chat'];
      if (isRecord(chat)) return getNumber(chat['id']);
    }
  }

  return undefined;
}

export function createMaxReplyApi(api: MaxBotApi): ReplyApi {
  return {
    getReplyTargetFromUpdate(update: unknown): ReplyTarget | undefined {
      const chatId = getChatIdFromUpdate(update);
      if (chatId === undefined) return undefined;
      return { chatId };
    },

    async sendReply(target: ReplyTarget, text: string, extra?: unknown): Promise<unknown> {
      return await api.sendMessageToChat(target.chatId, text, asExtra(extra));
    },
  };
}
