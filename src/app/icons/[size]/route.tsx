import { ImageResponse } from "next/og";

const SIZES = new Set([96, 180, 192, 512]);

/** The app icon at the sizes a manifest, a notification and an iOS home screen ask for: a chalk d on ground. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }): Promise<Response> {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#121110" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "64%", height: "64%", borderRadius: "50%", background: "#F2EDE3", color: "#121110", fontSize: size * 0.4, fontWeight: 700, lineHeight: 1 }}>d</div>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
