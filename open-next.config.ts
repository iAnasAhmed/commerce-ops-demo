import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Defaults are deliberate. The dashboard reads live Meta and Shopify data on
 * every request (`export const dynamic = "force-dynamic"` on the API route),
 * so there is nothing to incrementally cache and no need for R2 or KV.
 */
export default defineCloudflareConfig();
