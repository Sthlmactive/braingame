import { deflateSync } from "node:zlib";

/**
 * A minimal PNG writer. The app only needs a handful of flat coloured icons,
 * so encoding them by hand is cheaper than adding an image dependency.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([len, typed, crc]);
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** RGBA pixel buffer with a couple of drawing primitives. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Source over blend of one pixel, `cov` being 0..1 antialiasing coverage. */
  blend(x: number, y: number, c: Rgba, cov: number): void {
    if (cov <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = (c.a / 255) * Math.min(1, cov);
    if (a <= 0) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const da = d[i + 3]! / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    d[i] = (c.r * a + d[i]! * da * (1 - a)) / outA;
    d[i + 1] = (c.g * a + d[i + 1]! * da * (1 - a)) / outA;
    d[i + 2] = (c.b * a + d[i + 2]! * da * (1 - a)) / outA;
    d[i + 3] = outA * 255;
  }

  fill(c: Rgba): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = c.r;
      this.data[i + 1] = c.g;
      this.data[i + 2] = c.b;
      this.data[i + 3] = c.a;
    }
  }

  /**
   * Fill every pixel whose signed distance to a shape is negative, with a one
   * pixel antialiased edge. Every icon shape is expressed as a distance field.
   */
  fillSdf(sdf: (x: number, y: number) => number, c: Rgba): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const d = sdf(x + 0.5, y + 0.5);
        // 0.5px feather either side of the boundary.
        const cov = Math.min(1, Math.max(0, 0.5 - d));
        this.blend(x, y, c, cov);
      }
    }
  }

  toPng(): Buffer {
    const { width, height, data } = this;
    // One filter byte (0 = None) per scanline, then raw RGBA.
    const raw = Buffer.alloc(height * (width * 4 + 1));
    let p = 0;
    for (let y = 0; y < height; y++) {
      raw[p++] = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        raw[p++] = data[i]!;
        raw[p++] = data[i + 1]!;
        raw[p++] = data[i + 2]!;
        raw[p++] = data[i + 3]!;
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

export function hex(h: string, alpha = 255): Rgba {
  const s = h.replace("#", "");
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: alpha,
  };
}

/** Signed distance to a rounded rectangle centred on (cx, cy). */
export function roundedRect(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  radius: number,
): (x: number, y: number) => number {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (halfW - radius);
    const qy = Math.abs(y - cy) - (halfH - radius);
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
  };
}

/** Signed distance to an annulus, used for the O of Ordlek. */
export function ring(
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
): (x: number, y: number) => number {
  return (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - radius) - thickness / 2;
}

/** Intersection of two distance fields. */
export function intersect(
  a: (x: number, y: number) => number,
  b: (x: number, y: number) => number,
): (x: number, y: number) => number {
  return (x, y) => Math.max(a(x, y), b(x, y));
}
