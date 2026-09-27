/**
 * Replays a delivery Dynamic recorded for the delegation webhook through the door's own code, here, with the
 * same environment production has (the webhook secret, the private key, the store key). For the case where the
 * deployed door refused a real delivery (a shape the documentation did not show) and the fix is not yet
 * deployed: Dynamic's console can replay only to the registered URL. The signature is checked exactly as the
 * door checks it, over the delivery's body re-serialised; a body whose bytes cannot be reproduced fails that
 * check and is not replayed, since a replay that skipped the signature would prove nothing.
 *
 *   npx tsx --env-file=.env.local scripts/dev/delegation-replay.ts [messageId]
 *
 * Prints the door's answer and nothing from the payload.
 */
import { db } from "@/db";
import { receiveDelegationEvent, verifyWebhookSignature } from "@/lib/chain/delegated-signer";

/** The record keeps the body and the headers as they were sent, as text; an older record may hold them parsed. */
type Message = { messageId: string; eventId: string; status: string; createdAt: string; request: { body: unknown; headers: Record<string, string> | string }; response?: { status?: number } };
const asText = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));
const asHeaders = (v: Record<string, string> | string): Record<string, string> => (typeof v === "string" ? (JSON.parse(v) as Record<string, string>) : v);

async function main(): Promise<void> {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";
  const token = process.env.DYNAMIC_API_TOKEN ?? "";
  if (!env || !token) throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID and DYNAMIC_API_TOKEN are needed");
  const hooks = (await (await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/webhooks`, { headers: { authorization: `Bearer ${token}` } })).json()) as { data?: { webhookId: string; url: string }[] };
  const hook = hooks.data?.find((h) => /\/api\/delegation$/.test(h.url));
  if (!hook) throw new Error("no delegation webhook is registered");
  const messages = (await (await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/webhooks/${hook.webhookId}/messages`, { headers: { authorization: `Bearer ${token}` } })).json()) as { data?: Message[] };
  const wanted = process.argv[2];
  const byId = new Map<string, Message>();
  for (const m of messages.data ?? []) if (!byId.has(m.messageId) || m.createdAt > byId.get(m.messageId)!.createdAt) byId.set(m.messageId, m);
  const candidates = [...byId.values()].filter((m) => (wanted ? m.messageId === wanted : m.status === "failed")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (candidates.length === 0) {
    console.log(wanted ? `no message ${wanted}` : "no failed delivery to replay");
    return;
  }
  for (const m of candidates) {
    const body = asText(m.request.body);
    const header = asHeaders(m.request.headers)["x-dynamic-signature-256"] ?? null;
    let name = "?";
    try {
      name = (JSON.parse(body) as { eventName?: string }).eventName ?? "?";
    } catch {
      name = "?";
    }
    const verified = verifyWebhookSignature(process.env.DYNAMIC_WEBHOOK_SECRET ?? "", body, header);
    console.log(`${m.messageId} ${name} (${m.status}, production answered ${m.response?.status ?? "?"}): signature over the re-serialised body ${verified ? "verifies" : "does not verify; not replayed"}`);
    if (!verified) continue;
    const r = await receiveDelegationEvent(body, header);
    console.log(`   door: ${r.ok ? r.kind : `${r.status} ${r.reason}`}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
