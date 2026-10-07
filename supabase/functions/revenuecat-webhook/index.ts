import { handleRevenueCatWebhook } from './handler.ts';

Deno.serve(handleRevenueCatWebhook);
