import { ApiError } from "./errors";

/**
 * Just enough image parsing to answer two questions about an upload: what is
 * it, and is it square?
 *
 * Written out rather than pulled in, because a dependency that decodes
 * arbitrary image formats is a large amount of C running over bytes a stranger
 * sent you. Reading a handful of header fields is a much smaller thing to be
 * wrong about, and dimensions are all the app actually needs.
 */

export const LOGO_MAX_BYTES = 512 * 1024;

/** Formats a browser will render everywhere, which is the whole requirement. */
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ImageInfo {
  type: string;
  width: number;
  height: number;
}

/**
 * A `Buffer` is a `Uint8Array` whose backing store Node will not promise is a
 * plain `ArrayBuffer`, and Prisma's `Bytes` column insists on one. Copying into
 * a fresh view is the honest way across that line.
 */
export function toStorableBytes(bytes: Buffer): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

export function describeImage(bytes: Buffer): ImageInfo {
  const info = readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);

  if (!info) {
    throw ApiError.badRequest("That file is not a PNG, JPEG or WebP image.");
  }
  if (!ALLOWED.has(info.type)) {
    throw ApiError.badRequest(`${info.type} is not a supported image format.`);
  }
  if (info.width < 32 || info.height < 32) {
    throw ApiError.badRequest("That image is too small to read at icon size - use at least 32x32.");
  }

  return info;
}

/**
 * Account marks are drawn full bleed in a fixed square box, so anything that is
 * not square arrives stretched or cropped. Refusing it is kinder than silently
 * distorting somebody's brand.
 */
export function assertSquare(info: ImageInfo): void {
  if (info.width !== info.height) {
    throw ApiError.badRequest(
      `A logo has to be square. That one is ${info.width}x${info.height}.`,
    );
  }
}

// ---- format readers ---------------------------------------------------------

function readPng(b: Buffer): ImageInfo | null {
  // 8-byte signature, then an IHDR chunk whose width and height are the first
  // two big-endian 32-bit fields of its payload.
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (b.toString("ascii", 12, 16) !== "IHDR") return null;

  return { type: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function readJpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;

  // Walk the segment chain to the start-of-frame marker, which is the only one
  // carrying the dimensions.
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) return null;

    const marker = b[offset + 1] ?? 0;
    // Standalone markers: no length field to skip over.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Every SOFn except the four that are not frames at all.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        type: "image/jpeg",
        height: b.readUInt16BE(offset + 5),
        width: b.readUInt16BE(offset + 7),
      };
    }

    const length = b.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }

  return null;
}

function readWebp(b: Buffer): ImageInfo | null {
  if (b.length < 30) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;

  const format = b.toString("ascii", 12, 16);

  // Lossy: dimensions are 14 bits each, after the 3-byte start code.
  if (format === "VP8 ") {
    return {
      type: "image/webp",
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    };
  }

  // Lossless: 14 bits each again, packed across four bytes, minus one.
  if (format === "VP8L") {
    const bits = b.readUInt32LE(21);
    return {
      type: "image/webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  // Extended: 24-bit dimensions, stored minus one.
  if (format === "VP8X") {
    const width = 1 + (b.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (b.readUIntLE(27, 3) & 0xffffff);
    return { type: "image/webp", width, height };
  }

  return null;
}

/**
 * Accept either a bare base64 payload or a full `data:` URL, because both are
 * what a browser hands you depending on how the file was read.
 */
export function decodeUpload(input: string): Buffer {
  const base64 = input.startsWith("data:") ? (input.split(",")[1] ?? "") : input;
  const bytes = Buffer.from(base64, "base64");

  if (bytes.length === 0) throw ApiError.badRequest("That upload was empty.");
  if (bytes.length > LOGO_MAX_BYTES) {
    throw ApiError.badRequest(
      `A logo has to be under ${Math.round(LOGO_MAX_BYTES / 1024)} KB. That one is ${Math.round(
        bytes.length / 1024,
      )} KB.`,
    );
  }

  return bytes;
}
