import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelegramAdapter } from '../../src/adapters/telegram/index.js';
import { Bot } from '../../src/core/bot.js';

describe('Telegram adapter', () => {
  const token = 'test-token';

  describe('getReplyTargetFromUpdate', () => {
    it('returns ReplyTarget for normalized message update', () => {
      const adapter = createTelegramAdapter({ token });
      const api = adapter.createReplyApi({});
      const update = {
        update_id: 1,
        chat_id: 42,
        user_id: 10,
        message: {
          text: 'hi',
          recipient: { chat_id: 42 },
          sender: { user_id: 10 },
        },
      };
      const target = api.getReplyTargetFromUpdate(update);
      expect(target).toEqual({ chatId: 42 });
    });

    it('returns ReplyTarget for normalized callback_query update', () => {
      const adapter = createTelegramAdapter({ token });
      const api = adapter.createReplyApi({});
      const update = {
        update_id: 2,
        chat_id: 99,
        user_id: 20,
        callback_query: { data: 'action_yes' },
      };
      const target = api.getReplyTargetFromUpdate(update);
      expect(target).toEqual({ chatId: 99 });
    });

    it('returns undefined when update has no chat_id', () => {
      const adapter = createTelegramAdapter({ token });
      const api = adapter.createReplyApi({});
      const update = { update_id: 3 };
      expect(api.getReplyTargetFromUpdate(update)).toBeUndefined();
    });
  });

  describe('ctx.reply with message and callback_query updates', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sends reply for message update (chat_id from top level)', async () => {
      const bot = new Bot({ adapter: createTelegramAdapter({ token }) });
      bot.on('message', (ctx) => ctx.reply('Got message'));

      const update = {
        update_id: 1,
        chat_id: 100,
        user_id: 1,
        message: { text: 'hello', recipient: { chat_id: 100 }, sender: { user_id: 1 } },
      };
      await bot.handleUpdate(update);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${token}/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chat_id: 100, text: 'Got message' }),
        }),
      );
    });

    it('sends reply for callback_query update (chat_id from top level)', async () => {
      const bot = new Bot({ adapter: createTelegramAdapter({ token }) });
      bot.action('confirm', (ctx) => ctx.reply('Confirmed'));

      const update = {
        update_id: 2,
        chat_id: 200,
        user_id: 2,
        callback_query: { data: 'confirm' },
      };
      await bot.handleUpdate(update);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${token}/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chat_id: 200, text: 'Confirmed' }),
        }),
      );
    });
  });

  describe('registerWebhook', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('calls setWebhook API when WEBHOOK_URL would be set (registerWebhook called)', async () => {
      const adapter = createTelegramAdapter({ token });
      const url = 'https://example.com/webhook';
      const secret = 'my-secret';
      await adapter.registerWebhook({ url, secret });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${token}/setWebhook`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, secret_token: secret }),
        }),
      );
    });

    it('calls setWebhook without secret when secret not provided', async () => {
      const adapter = createTelegramAdapter({ token });
      const url = 'https://example.com/hook';
      await adapter.registerWebhook({ url });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ url });
    });
  });

  describe('webhook controller', () => {
    const webhookPort = 38472;
    const webhookPath = '/webhook';

    it('accepts POST with JSON body, normalizes and calls handleUpdate, returns 200', async () => {
      const adapter = createTelegramAdapter({ token });
      const bot = new Bot({ adapter });
      let handled: unknown = null;
      bot.on('message', (ctx) => {
        handled = ctx.update;
      });

      const { controller } = adapter.createWebhookController(bot);
      controller.start({ port: webhookPort, path: webhookPath });

      const rawUpdate = {
        update_id: 1,
        message: { chat: { id: 111 }, from: { id: 222 }, text: 'hi' },
      };
      const res = await fetch(`http://127.0.0.1:${webhookPort}${webhookPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rawUpdate),
      });

      await controller.stop();

      expect(res.status).toBe(200);
      expect(handled).not.toBeNull();
      expect(isRecord(handled) && (handled as Record<string, unknown>)['chat_id']).toBe(111);
    });

    it('returns 404 for wrong path', async () => {
      const adapter = createTelegramAdapter({ token });
      const bot = new Bot({ adapter });
      const { controller } = adapter.createWebhookController(bot);
      controller.start({ port: webhookPort, path: webhookPath });

      const res = await fetch(`http://127.0.0.1:${webhookPort}/other`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      await controller.stop();

      expect(res.status).toBe(404);
    });
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
