import {
  createTelegramAdapter,
  type TelegramAdapter,
  type TelegramAdapterConfig,
  type TelegramWebhookController,
} from '../telegram/index.js';

export interface ProductionAdapterConfig {
  token: string;
}

export type ProductionAdapter = TelegramAdapter;
export type ProductionWebhookController = TelegramWebhookController;

export function createProductionAdapter(
  config: ProductionAdapterConfig,
): ProductionAdapter {
  return createTelegramAdapter(config as TelegramAdapterConfig);
}
