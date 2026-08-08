#!/usr/bin/env node
/**
 * Genera los iconos PNG de la PWA.
 *
 * Se escriben pixel a pixel y se codifican con `zlib` (incluido en Node): el
 * proyecto no arrastra ninguna dependencia de imágenes y los iconos se pueden
 * regenerar en cualquier máquina con `npm run icons`.
 *
 * Para reemplazarlos por el logotipo definitivo basta con dejar los archivos
 * PNG en `public/icons/` con los mismos nombres.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BRAND = [29, 78, 216]; // --color-brand-700
const WHITE = [255, 255, 255];

// Glifos 7×7 para las iniciales de la marca.
// A 5 píxeles de ancho la diagonal de la «M» no se distingue; con 7 sí.
const GLYPH_WIDTH = 7;
const GLYPH_HEIGHT = 7;

const GLYPHS = {
  L: ["1000000", "1000000", "1000000", "1000000", "1000000", "1000000", "1111111"],
  M: ["1000001", "1100011", "1010101", "1001001", "1000001", "1000001", "1000001"],
};

// -----------------------------------------------------------------------------
// Codificación PNG
// -----------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  // Cada scanline lleva su byte de filtro (0 = sin filtro)
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // RGBA
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

// -----------------------------------------------------------------------------
// Dibujo
// -----------------------------------------------------------------------------
function createCanvas(size) {
  return { size, data: Buffer.alloc(size * size * 4) };
}

function setPixel(canvas, x, y, [r, g, b], alpha = 255) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const offset = (y * canvas.size + x) * 4;
  canvas.data[offset] = r;
  canvas.data[offset + 1] = g;
  canvas.data[offset + 2] = b;
  canvas.data[offset + 3] = alpha;
}

/** Fondo redondeado con antialiasing sencillo en las esquinas. */
function fillRoundedSquare(canvas, radius, color) {
  const { size } = canvas;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Distancia al centro del arco de la esquina más cercana
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const distance = Math.hypot(dx, dy);

      if (distance <= radius - 1) {
        setPixel(canvas, x, y, color);
      } else if (distance < radius) {
        setPixel(canvas, x, y, color, Math.round((radius - distance) * 255));
      }
    }
  }
}

function drawText(canvas, text, color, { scale, gap, offsetY }) {
  const glyphWidth = GLYPH_WIDTH * scale;
  const glyphHeight = GLYPH_HEIGHT * scale;
  const totalWidth = text.length * glyphWidth + (text.length - 1) * gap;

  let cursorX = Math.round((canvas.size - totalWidth) / 2);
  const startY = Math.round((canvas.size - glyphHeight) / 2) + offsetY;

  for (const character of text) {
    const glyph = GLYPHS[character];
    if (!glyph) continue;

    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") return;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) {
            setPixel(
              canvas,
              cursorX + columnIndex * scale + x,
              startY + rowIndex * scale + y,
              color,
            );
          }
        }
      });
    });

    cursorX += glyphWidth + gap;
  }
}

/**
 * @param size    lado en píxeles
 * @param padding proporción de margen — los iconos `maskable` necesitan zona
 *                segura porque Android los recorta en círculo
 */
function buildIcon(size, { padding = 0 } = {}) {
  const canvas = createCanvas(size);
  const inner = Math.round(size * (1 - padding * 2));

  if (padding > 0) {
    // Lienzo completo en color de marca para que el recorte nunca deje bordes
    fillRoundedSquare(canvas, 0, BRAND);
  } else {
    fillRoundedSquare(canvas, Math.round(size * 0.22), BRAND);
  }

  // Dos glifos de 7px más su separación: ~17 unidades a lo ancho
  const scale = Math.max(1, Math.floor(inner / 22));
  drawText(canvas, "LM", WHITE, { scale, gap: Math.max(1, Math.round(scale * 1.2)), offsetY: 0 });

  return encodePng(size, size, canvas.data);
}

// -----------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });

const OUTPUTS = [
  ["icon-192.png", buildIcon(192)],
  ["icon-512.png", buildIcon(512)],
  ["icon-maskable-512.png", buildIcon(512, { padding: 0.12 })],
  ["apple-touch-icon.png", buildIcon(180)],
  ["favicon-32.png", buildIcon(32)],
];

for (const [name, buffer] of OUTPUTS) {
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`  ✓ public/icons/${name} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

console.log("\n✅ Iconos generados");
