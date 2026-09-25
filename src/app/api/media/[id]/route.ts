import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { mediaUrl } from "@/lib/media";
import { StorageUnavailable } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

/**
 * The one door to a photo (docs/marks-and-memories.md). Who is asking is checked first; then a signed URL good
 * for a minute is issued and the request is sent there. Nothing about a photo that this person may not see is
 * ever said, including whether it exists: signed out, unknown, or not theirs all read as 404. The browser never
 * holds a key: the signed URL is the whole capability, and it dies in sixty seconds.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "frame";
  try {
    const url = await mediaUrl(id, user.id, size);
    if (!url) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    if (err instanceof StorageUnavailable) return new NextResponse(null, { status: 503 });
    console.error("media: could not sign", { id, err: err instanceof Error ? err.message : err });
    return new NextResponse(null, { status: 502 });
  }
}
