/**
 * Generates the PWA icon set from code, so there is no binary asset to keep in
 * sync by hand. Run with `node scripts/generate-icons.mjs`.
 *
 * Draws an open book on the brand teal. Everything is built from
 * inequalities over pixel coordinates, so no font or image library is needed.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [0x0f, 0x76, 0x6e];
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * An open book, in normalised icon coordinates.
 *
 * Built from inequalities rather than paths, because the PNG writer here fills
 * pixel by pixel and has no path rasteriser. Two colours only, so the lines of
 * "text" are cut back out of the white pages rather than drawn on top.
 */
function book(u, v, scale) {
  const x = (u - 0.5) / scale;
  const y = (v - 0.5) / scale;

  const side = Math.abs(x);
  if (side > 0.95) return false;

  // The top edge lifts towards the middle and the bottom edge drops away from
  // it, which is what makes a flat shape read as a book lying open.
  const top = -0.3 - 0.32 * (1 - side);
  const bottom = 0.62 - 0.1 * side;
  if (y < top || y > bottom) return false;

  // The crease where the two pages meet. A thin cut rather than a drawn spine:
  // with two colours, the gap is what says "book" instead of "envelope".
  if (side <= 0.03) return false;

  // Three lines of text per page, cut out of the white.
  for (const line of [-0.18, 0.06, 0.3]) {
    if (y >= line && y <= line + 0.09 && side >= 0.17 && side <= 0.82) return false;
  }
  return true;
}

function render(size, { maskable = false, rounded = true } = {}) {
  const px = Buffer.alloc(size * size * 4);
  // Maskable icons must keep their content inside the safe circle, so the book
  // shrinks while the background bleeds to the edges.
  const scale = maskable ? 0.3 : 0.4;
  const radius = rounded && !maskable ? size * 0.22 : 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      let inside = true;
      if (radius > 0) {
        const rx = Math.min(x + 0.5, size - x - 0.5);
        const ry = Math.min(y + 0.5, size - y - 0.5);
        if (rx < radius && ry < radius) {
          inside = (radius - rx) ** 2 + (radius - ry) ** 2 <= radius * radius;
        }
      }

      if (!inside) {
        px[i + 3] = 0;
        continue;
      }

      const [r, g, b] = book(u, v, scale) ? FG : BG;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return encodePng(size, px);
}

mkdirSync(OUT, { recursive: true });

const files = [
  ["pwa-192.png", render(192)],
  ["pwa-512.png", render(512)],
  ["pwa-512-maskable.png", render(512, { maskable: true })],
  ["apple-touch-icon.png", render(180, { rounded: false })],
];

for (const [name, buffer] of files) {
  writeFileSync(join(OUT, name), buffer);
  console.log(`wrote public/${name} (${buffer.length} bytes)`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f766e"/>
  <g fill="#fff">
    <path d="M32 20.5c-3.4-2.6-7.6-3.9-12.6-3.9-1.4 0-2.6.2-3.4.4v26c1-.2 2.1-.3 3.4-.3 5 0 9.2 1.3 12.6 3.8z"/>
    <path d="M32 20.5c3.4-2.6 7.6-3.9 12.6-3.9 1.4 0 2.6.2 3.4.4v26c-1-.2-2.1-.3-3.4-.3-5 0-9.2 1.3-12.6 3.8z"/>
    <rect x="30.6" y="20" width="2.8" height="27" rx="1.4"/>
  </g>
</svg>
`;
writeFileSync(join(OUT, "favicon.svg"), svg);
console.log("wrote public/favicon.svg");
