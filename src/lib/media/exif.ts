/**
 * The one thing read out of a photo's EXIF before every field of it is thrown away: when it was taken. The
 * block is TIFF: a byte-order mark, IFD0, and inside it a pointer to the Exif IFD, where DateTimeOriginal
 * (0x9003) is "YYYY:MM:DD HH:MM:SS" in the camera's own clock and OffsetTimeOriginal (0x9011) says which
 * clock, when the camera wrote one. Nothing else is looked at, GPS least of all; the parser has no path into
 * the GPS IFD.
 */
const DATE_TIME_ORIGINAL = 0x9003;
const OFFSET_TIME_ORIGINAL = 0x9011;
const EXIF_IFD_POINTER = 0x8769;
const GPS_IFD_POINTER = 0x8825;

type Reader = { u16: (at: number) => number; u32: (at: number) => number };

function reader(buf: Buffer, littleEndian: boolean): Reader {
  return {
    u16: (at) => (littleEndian ? buf.readUInt16LE(at) : buf.readUInt16BE(at)),
    u32: (at) => (littleEndian ? buf.readUInt32LE(at) : buf.readUInt32BE(at)),
  };
}

/** The ASCII value of one tag in one IFD, or null. */
function ascii(buf: Buffer, r: Reader, ifd: number, tag: number): string | null {
  if (ifd + 2 > buf.length) return null;
  const count = r.u16(ifd);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > buf.length) return null;
    if (r.u16(at) !== tag) continue;
    const type = r.u16(at + 2);
    const n = r.u32(at + 4);
    if (type !== 2 || n === 0) return null;
    const start = n <= 4 ? at + 8 : r.u32(at + 8);
    if (start + n > buf.length) return null;
    return buf.toString("latin1", start, start + n).replace(/\0+$/, "");
  }
  return null;
}

function u32Tag(buf: Buffer, r: Reader, ifd: number, tag: number): number | null {
  if (ifd + 2 > buf.length) return null;
  const count = r.u16(ifd);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > buf.length) return null;
    if (r.u16(at) === tag) return r.u32(at + 8);
  }
  return null;
}

function tiffOf(exif: Buffer | undefined): { tiff: Buffer; r: Reader; ifd0: number } | null {
  if (!exif || exif.length < 14) return null;
  // sharp hands back the APP1 payload, which starts with "Exif\0\0"; a bare TIFF block starts at the byte order.
  const tiff = exif.subarray(0, 6).toString("latin1") === "Exif\0\0" ? exif.subarray(6) : exif;
  const order = tiff.subarray(0, 2).toString("latin1");
  if (order !== "II" && order !== "MM") return null;
  const r = reader(tiff, order === "II");
  if (r.u16(2) !== 42) return null;
  return { tiff, r, ifd0: r.u32(4) };
}

/**
 * When the photo was taken, from its EXIF block, or null. `fallbackZone` is used when the camera wrote no
 * offset: the viewer's own zone, since the person uploading is almost always the person who took it.
 */
export function capturedAtFrom(exif: Buffer | undefined, fallbackZone: string | null): Date | null {
  const t = tiffOf(exif);
  if (!t) return null;
  const exifIfd = u32Tag(t.tiff, t.r, t.ifd0, EXIF_IFD_POINTER);
  if (exifIfd === null) return null;
  const stamp = ascii(t.tiff, t.r, exifIfd, DATE_TIME_ORIGINAL);
  const m = stamp ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(stamp) : null;
  if (!m) return null;
  const offset = ascii(t.tiff, t.r, exifIfd, OFFSET_TIME_ORIGINAL);
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) return finite(new Date(`${iso}${offset}`));
  return finite(zoned(iso, fallbackZone));
}

/**
 * What an EXIF block carries, for the checks: whether there is a GPS IFD at all (a pointer in IFD0 is enough;
 * nothing behind it is ever read) and the capture time. Never used to keep anything.
 */
export function describeExif(exif: Buffer | undefined): { gps: boolean; capturedAt: Date | null } {
  const t = tiffOf(exif);
  return { gps: t !== null && u32Tag(t.tiff, t.r, t.ifd0, GPS_IFD_POINTER) !== null, capturedAt: capturedAtFrom(exif, null) };
}

function finite(d: Date): Date | null {
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A wall-clock time in a zone, as an instant: the UTC reading, corrected by that zone's offset at that moment. */
function zoned(iso: string, zone: string | null): Date {
  const naive = new Date(`${iso}Z`);
  if (!zone) return naive;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(naive);
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asIfUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    return new Date(naive.getTime() - (asIfUtc - naive.getTime()));
  } catch {
    return naive;
  }
}
