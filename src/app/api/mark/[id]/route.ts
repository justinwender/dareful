import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { markUrl } from "@/lib/media/marks";
import { StorageUnavailable } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

/**
 * The one door to a sticker (docs/design.md 3.28; docs/marks-and-memories.md). The same shape as the photo's
 * door: who is asking is checked first, then a signed URL good for a minute, and nothing is said about a mark
 * this person may not see, including whether it exists. `size=source` is the 512px cutout with no edge, drawn
 * only at the 20px stamp (1.7); anything else gets the 256px derivative with the die-cut edge baked in.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const size = new URL(req.url).searchParams.get("size") === "source" ? "source" : "stamp";
  try {
    const url = await markUrl(id, user.id, size);
    if (!url) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    if (err instanceof StorageUnavailable) return new NextResponse(null, { status: 503 });
    console.error("mark: could not sign", { id, err: err instanceof Error ? err.message : err });
    return new NextResponse(null, { status: 502 });
  }
}
