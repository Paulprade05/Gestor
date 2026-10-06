// Genera los iconos PNG de la PWA y las pantallas de arranque de iOS sin dependencias
// (zlib de Node + codificador PNG mínimo).
// Uso: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ICONOS = new URL('../public/icons/', import.meta.url);
const SPLASH = new URL('../public/splash/', import.meta.url);
mkdirSync(ICONOS, { recursive: true });
mkdirSync(SPLASH, { recursive: true });

// ─── PNG ────────────────────────────────────────────────────────────────────
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bloque = (tipo, datos) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** `rgb`: Buffer de ancho*alto*3 bytes (sin transparencia: iOS pinta de negro el canal alfa). */
function png(ancho, alto, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) rgb.copy(filas, y * (ancho * 3 + 1) + 1, y * ancho * 3, (y + 1) * ancho * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Dibujo del icono (coordenadas normalizadas 0..1) ───────────────────────
const BARRAS = [
  { x: 0.24, alto: 0.18 },
  { x: 0.435, alto: 0.3 },
  { x: 0.63, alto: 0.42 },
];
const ANCHO_BARRA = 0.13;
const BASE = 0.76;
const CORAZON = { x: 0.695, y: 0.2, s: 0.072 };

const ROSA_A = [0xff, 0x7a, 0xaf]; // arriba-izquierda
const ROSA_B = [0xd8, 0x1b, 0x60]; // abajo-derecha
const BLUSH_A = [0xff, 0xf5, 0xf8];
const BLUSH_B = [0xff, 0xdd, 0xea];

const mezcla = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const dentroRect = (px, py, x0, y0, x1, y1, r) => {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.max(x0 + r, Math.min(px, x1 - r));
  const cy = Math.max(y0 + r, Math.min(py, y1 - r));
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};

function dentroCorazon(px, py) {
  const x = (px - CORAZON.x) / CORAZON.s;
  const y = -(py - CORAZON.y) / CORAZON.s;
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function figura(px, py) {
  return dentroCorazon(px, py) || BARRAS.some((b) => dentroRect(px, py, b.x, BASE - b.alto, b.x + ANCHO_BARRA, BASE, 0.035));
}

/** Color del icono en (u, v) ∈ [0,1]² con supermuestreo de la figura blanca. */
function colorIcono(u0, v0, paso, escala, ss = 4) {
  let blanco = 0;
  for (let sy = 0; sy < ss; sy++)
    for (let sx = 0; sx < ss; sx++) {
      // La escala encoge el dibujo hacia el centro (zona segura de los iconos maskable).
      const u = (u0 + ((sx + 0.5) / ss) * paso - 0.5) / escala + 0.5;
      const v = (v0 + ((sy + 0.5) / ss) * paso - 0.5) / escala + 0.5;
      if (figura(u, v)) blanco++;
    }
  const a = blanco / (ss * ss);
  const fondo = mezcla(ROSA_A, ROSA_B, (u0 + v0) / 2);
  return fondo.map((c) => c * (1 - a) + 255 * a);
}

function icono(tam, { escala = 1 } = {}) {
  const datos = Buffer.alloc(tam * tam * 3);
  for (let y = 0; y < tam; y++)
    for (let x = 0; x < tam; x++) {
      const c = colorIcono(x / tam, y / tam, 1 / tam, escala);
      datos.set(c.map(Math.round), (y * tam + x) * 3);
    }
  return png(tam, tam, datos);
}

/** Pantalla de arranque: degradado rosa muy claro con el icono redondeado en el centro. */
function splash(ancho, alto) {
  const datos = Buffer.alloc(ancho * alto * 3);
  const lado = Math.round(ancho * 0.3);
  const x0 = Math.round((ancho - lado) / 2);
  const y0 = Math.round((alto - lado) / 2 - alto * 0.04);
  const radio = lado * 0.225;
  for (let y = 0; y < alto; y++) {
    const fondo = mezcla(BLUSH_A, BLUSH_B, y / alto).map(Math.round);
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 3;
      const lx = x - x0;
      const ly = y - y0;
      if (lx < -1 || ly < -1 || lx > lado || ly > lado) {
        datos.set(fondo, i);
        continue;
      }
      // Antialias del borde redondeado con 2×2 muestras.
      let dentro = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]])
        if (dentroRect(lx + ox, ly + oy, 0, 0, lado, lado, radio)) dentro++;
      if (dentro === 0) {
        datos.set(fondo, i);
        continue;
      }
      const c = colorIcono(lx / lado, ly / lado, 1 / lado, 1, 2);
      const t = dentro / 4;
      datos.set(c.map((v, k) => Math.round(fondo[k] * (1 - t) + v * t)), i);
    }
  }
  return png(ancho, alto, datos);
}

const iconos = {
  'apple-touch-icon.png': icono(180),
  'icon-192.png': icono(192),
  'icon-512.png': icono(512),
  'icon-maskable-512.png': icono(512, { escala: 0.78 }),
};
for (const [nombre, buf] of Object.entries(iconos)) {
  writeFileSync(new URL(nombre, ICONOS), buf);
  console.log(`✓ public/icons/${nombre} (${buf.length} bytes)`);
}

const barrasSvg = BARRAS.map((b) => `<rect x="${b.x * 64}" y="${(BASE - b.alto) * 64}" width="${ANCHO_BARRA * 64}" height="${b.alto * 64}" rx="2.2" fill="#fff"/>`).join('');
const corazonSvg = `<path transform="translate(${CORAZON.x * 64 - 6} ${CORAZON.y * 64 - 6.4}) scale(.5)" fill="#fff" d="M12 21s-7-4.35-9.5-8.5C.5 9 2.5 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 4 0 6 4 4 7.5C19 16.65 12 21 12 21z"/>`;
writeFileSync(
  new URL('favicon.svg', ICONOS),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7aaf"/><stop offset="1" stop-color="#d81b60"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/>${barrasSvg}${corazonSvg}</svg>\n`,
);
console.log('✓ public/icons/favicon.svg');

// Pantallas de arranque (apple-touch-startup-image): tamaño en puntos y densidad de cada iPhone.
// Deben coincidir con las <link> de index.html.
export const PANTALLAS = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 15/14 Pro Max, 15/16 Plus
  [393, 852, 3], // 15, 15 Pro, 14 Pro, 16
  [428, 926, 3], // 14 Plus, 13/12 Pro Max
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [375, 812, 3], // X, XS, 11 Pro, 13 mini, 12 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE (2.ª y 3.ª gen.), 8
];
for (const [w, h, d] of PANTALLAS) {
  const nombre = `splash-${w * d}x${h * d}.png`;
  const buf = splash(w * d, h * d);
  writeFileSync(new URL(nombre, SPLASH), buf);
  console.log(`✓ public/splash/${nombre} (${Math.round(buf.length / 1024)} KB)`);
}
