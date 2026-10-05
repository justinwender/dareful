import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { WriteUpInput, writeUp } from "@/lib/ledger/write-up";
import { viewerZone } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * The terms being written (docs/design.md 9.8): the write-up starts when the question step's Next is tapped and
 * streams into the terms step as it is written. Each line of the response is one JSON object: `{"t": "…"}` is a
 * piece of the model's answer as it arrived, and the last, `{"done": …}`, is the same result the server action
 * returns, plain fallback included, so the step ends exactly where the unstreamed path would. Signed in only:
 * the write-up is the asker's.
 */
export async function POST(req: Request): Promise<Response> {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = WriteUpInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ask it in a line." }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
      try {
        const result = await writeUp(body.data, me.id, await viewerZone(), (t) => send({ t }), () => send({ r: 1 }));
        send({ done: result });
      } catch (err) {
        console.error("the write-up stream failed", err);
        send({ done: { error: "The write-up didn’t come through." } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
