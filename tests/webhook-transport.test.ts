import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';

import { createReferenceAdapter } from '../src/adapters/reference-adapter/index.js';
import { Bot } from '../src/core/bot.js';

const testAdapter = createReferenceAdapter(async () => undefined);

describe('webhook transport', () => {
  it('webhookCallback invokes handleUpdate', async () => {
    const bot = new Bot({ adapter: testAdapter });
    const calls: unknown[] = [];

    bot.use(async (ctx) => {
      calls.push(ctx.update);
    });

    const webhook = bot.webhookCallback();
    await webhook({ message: { text: 'hi' } });

    expect(calls).toEqual([{ message: { text: 'hi' } }]);
  });

  it('http server parses POST JSON and passes update to bot.handleUpdate', async () => {
    const bot = new Bot({ adapter: testAdapter });
    const received: unknown[] = [];
    bot.use(async (ctx) => {
      received.push(ctx.update);
    });
    const handler = bot.webhookCallback();

    const server = createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/webhook') {
        res.writeHead(404);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        handler(body).then(() => {
          res.writeHead(200);
          res.end();
        });
      });
    });
    server.listen(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr?.port ? addr.port : 0;
    try {
      const payload = { update_id: 42, message: { text: 'ping' } };
      const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(received).toEqual([payload]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('webhookCallback calls onError when handleUpdate throws', async () => {
    const bot = new Bot({ adapter: testAdapter });
    bot.use(async () => {
      throw new Error('boom');
    });

    const handled: { err: unknown; update: unknown }[] = [];

    const webhook = bot.webhookCallback({
      onError: (err, update) => {
        handled.push({ err, update });
      },
    });

    await webhook({ update_id: 1 });

    expect(handled).toHaveLength(1);
    expect((handled[0]?.err as Error).message).toBe('boom');
    expect(handled[0]?.update).toEqual({ update_id: 1 });
  });
});
