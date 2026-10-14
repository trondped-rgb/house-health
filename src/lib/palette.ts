// Ironbow palette: black -> blue/purple -> red -> orange -> yellow -> white
// Stops identical to Thermetric's ironbow.
const STOPS: [number, number, number, number][] = [
  [0, 0, 0, 4], [0.08, 18, 0, 48], [0.18, 64, 0, 112], [0.32, 132, 8, 128], [0.46, 188, 22, 58],
  [0.6, 228, 72, 8], [0.74, 248, 148, 4], [0.86, 255, 214, 48], [1, 255, 252, 224],
];
export function ironbow(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, r1, g1, b1] = STOPS[i], [p0, r0, g0, b0] = STOPS[i - 1];
    if (t <= p1) { const f = (t - p0) / (p1 - p0); return [r0 + f * (r1 - r0), g0 + f * (g1 - g0), b0 + f * (b1 - b0)].map(Math.round) as [number, number, number]; }
  }
  return [255, 252, 224];
}
/** Thermetric mapping: Rec.709 luminance 0..1, then T = Tmin + L·(Tmax − Tmin). */
export const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
export function rainbow(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const h = (1 - t) * 240, x = 1 - Math.abs(((h / 60) % 2) - 1);
  const [r, g, b] = h < 60 ? [1, x, 0] : h < 120 ? [x, 1, 0] : h < 180 ? [0, 1, x] : [0, x, 1];
  return [r * 255, g * 255, b * 255].map(Math.round) as [number, number, number];
}
export type PaletteName = 'ironbow' | 'rainbow';
const LUTS: Record<string, [number, number, number][]> = {};
function lut(name: PaletteName) {
  if (!LUTS[name]) LUTS[name] = Array.from({ length: 256 }, (_, i) => (name === 'ironbow' ? ironbow : rainbow)(i / 255));
  return LUTS[name];
}
const cache = new Map<string, number>();
/** Map an RGB pixel to normalized 0..1 by nearest palette entry (squared RGB distance). */
export function colorToT(r: number, g: number, b: number, name: PaletteName): number {
  const key = name + ((r >> 2) << 12 | (g >> 2) << 6 | (b >> 2));
  const c = cache.get(key); if (c !== undefined) return c;
  const L = lut(name); let best = 0, bd = Infinity;
  for (let i = 0; i < 256; i++) { const [a, bb, cc] = L[i]; const d = (a - r) ** 2 + (bb - g) ** 2 + (cc - b) ** 2; if (d < bd) { bd = d; best = i; } }
  const v = best / 255; cache.set(key, v); return v;
}
