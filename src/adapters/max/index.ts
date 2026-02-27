import type { Adapter } from '../../core/contracts.js';
import type { BotAdapter } from '../types.js';
import { createMaxReplyApi } from './reply-api.js';
import { createMaxBotApi } from './client.js';
import { createMaxPollingController } from './polling.js';
import { createReferenceAdapter } from '../reference-adapter/index.js';

export { Keyboard } from './keyboard.js';

export interface MaxAdapterConfig {
  token: string;
}

export function createMaxAdapter(config: MaxAdapterConfig): BotAdapter & Adapter {
  const { token } = config;
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new Error('BOT_TOKEN is required');
  }
  const api = createMaxBotApi({ token });
  const replyApi = createMaxReplyApi(api);
  const referenceAdapter = createReferenceAdapter(async (ctx, text, extra) => {
    const target = replyApi.getReplyTargetFromUpdate(ctx.update);
    if (!target) throw new Error('NotImplemented');
    return await replyApi.sendReply(target, text, extra);
  });

  return {
    ...referenceAdapter,
    createReplyApi(): ReturnType<typeof createMaxReplyApi> {
      return replyApi;
    },

    createPollingController(bot, pollConfig) {
      return createMaxPollingController(bot, {
        token,
        intervalMs: pollConfig.intervalMs,
        dedupeTtlMs: pollConfig.dedupeTtlMs,
        dedupeMaxSize: pollConfig.dedupeMaxSize as number | undefined,
        sdk: pollConfig.sdk,
      });
    },
  };
}
