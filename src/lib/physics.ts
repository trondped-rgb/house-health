export type SurfaceType = 'wall' | 'window' | 'roof' | 'floor' | 'door';
export interface Surface { id: string; name: string; type: SurfaceType; area: number; u: number }
export interface Room { id: string; name: string; surfaces: Surface[] }
export type Currency = 'NOK' | 'EUR';
export interface Settings { tIn: number; tOut: number; degreeDays: number; location: string; price: number; currency: Currency }
export interface House { name: string; rooms: Room[]; settings: Settings }

/** Heating degree-days (Kd/year, base 17 °C, approx. normals) and winter design outdoor temperature. */
export const LOCATIONS: Record<string, { dd: number; tOut: number }> = {
  Oslo: { dd: 4000, tOut: -20 }, Bergen: { dd: 3300, tOut: -10 }, Stavanger: { dd: 3200, tOut: -9 },
  Trondheim: { dd: 4400, tOut: -19 }, 'Tromsø': { dd: 5500, tOut: -17 }, Kristiansand: { dd: 3600, tOut: -15 },
  Custom: { dd: 4000, tOut: -15 },
};
export const PRICE_DEFAULT: Record<Currency, number> = { NOK: 1.5, EUR: 0.13 };

/** U-value presets (W/m²K). */
export const U_PRESETS: Record<SurfaceType, { label: string; u: number }[]> = {
  wall: [{ label: 'Pre-1950 timber, uninsulated', u: 1.0 }, { label: '1970s, 10 cm insulation', u: 0.4 }, { label: '1990s (TEK87), 15 cm', u: 0.25 }, { label: 'TEK17, 25 cm', u: 0.18 }, { label: 'Passive house', u: 0.12 }],
  window: [{ label: 'Single glazing', u: 5.0 }, { label: 'Double (old, 1970-90)', u: 2.8 }, { label: 'Double low-E', u: 1.6 }, { label: 'Triple (TEK17)', u: 0.8 }],
  roof: [{ label: 'Uninsulated attic', u: 1.5 }, { label: '1970s, 10 cm', u: 0.35 }, { label: '1990s, 20 cm', u: 0.2 }, { label: 'TEK17, 35 cm', u: 0.13 }],
  floor: [{ label: 'Uninsulated slab/crawl', u: 0.8 }, { label: '1970s, 5 cm', u: 0.4 }, { label: '1990s, 10 cm', u: 0.2 }, { label: 'TEK17', u: 0.1 }],
  door: [{ label: 'Old wooden door', u: 2.5 }, { label: 'Insulated door', u: 1.2 }, { label: 'TEK17 door', u: 0.8 }],
};
/** Reference (TEK17 maximum) U-values used for scoring. */
export const U_REF: Record<SurfaceType, number> = { wall: 0.18, window: 0.8, roof: 0.13, floor: 0.1, door: 0.8 };

export const dT = (s: Settings) => s.tIn - s.tOut;
/** Steady-state transmission loss through a surface. q = U·ΔT [W/m²], P = q·A [W]. */
export const flux = (u: number, s: Settings) => u * dT(s);
/** Annual transmission heat demand: E = U·A·DD·24 / 1000 [kWh/yr]. */
export const annualKwh = (u: number, area: number, dd: number) => (u * area * dd * 24) / 1000;

export interface Totals { area: number; ua: number; watts: number; wpm2: number; kwh: number; cost: number; byType: Record<SurfaceType, { area: number; ua: number; kwh: number }> }
export function totals(h: House): Totals {
  const byType = Object.fromEntries((Object.keys(U_REF) as SurfaceType[]).map((t) => [t, { area: 0, ua: 0, kwh: 0 }])) as Totals['byType'];
  let area = 0, ua = 0;
  for (const r of h.rooms) for (const s of r.surfaces) { area += s.area; ua += s.u * s.area; const b = byType[s.type]; b.area += s.area; b.ua += s.u * s.area; b.kwh += annualKwh(s.u, s.area, h.settings.degreeDays); }
  const watts = ua * dT(h.settings), kwh = (ua * h.settings.degreeDays * 24) / 1000;
  return { area, ua, watts, wpm2: area ? watts / area : 0, kwh, cost: kwh * h.settings.price, byType };
}

/** Surface score 0..100: 100 at/below TEK17 reference, falls as (Uref/U)^0.6. */
export const surfaceScore = (s: Surface) => Math.round(100 * Math.min(1, (U_REF[s.type] / Math.max(s.u, 1e-3)) ** 0.6));
export function score(h: House) {
  const t = totals(h);
  const parts = (Object.keys(U_REF) as SurfaceType[]).filter((k) => t.byType[k].area > 0).map((k) => {
    const b = t.byType[k], uAvg = b.ua / b.area;
    return { type: k, uAvg, score: Math.round(100 * Math.min(1, (U_REF[k] / uAvg) ** 0.6)), share: t.ua ? b.ua / t.ua : 0 };
  });
  // Weight each category by its share of total heat loss (worst offenders dominate).
  const total = parts.length ? Math.round(parts.reduce((a, p) => a + p.score * p.share, 0)) : 0;
  return { total, parts };
}

export interface Measure { id: string; surfaceId: string; label: string; room: string; type: SurfaceType; uBefore: number; uAfter: number; area: number; cost: number; kwhSaved: number; moneySaved: number; payback: number; effort: 1 | 2 | 3; priority: number }
/** Retrofit catalogue: new U and installed cost per m² (NOK, rough 2026 Norway). λ insulation = 0.037 W/mK. */
const addIns = (u: number, cm: number) => 1 / (1 / u + cm / 100 / 0.037);
const CATALOG: Record<SurfaceType, { label: string; uAfter: (u: number) => number; costM2: number; effort: 1 | 2 | 3 }> = {
  roof: { label: 'Blow in +20 cm attic insulation', uAfter: (u) => addIns(u, 20), costM2: 450, effort: 1 },
  wall: { label: 'Add 10 cm exterior insulation + new cladding', uAfter: (u) => addIns(u, 10), costM2: 1800, effort: 3 },
  floor: { label: 'Insulate floor/crawlspace +10 cm', uAfter: (u) => addIns(u, 10), costM2: 900, effort: 2 },
  window: { label: 'Replace with triple glazing (U 0.8)', uAfter: () => 0.8, costM2: 8000, effort: 2 },
  door: { label: 'Replace with insulated door (U 0.8)', uAfter: () => 0.8, costM2: 7000, effort: 1 },
};
export const NOK_PER_EUR = 11.5;
export function measures(h: House): Measure[] {
  const fx = h.settings.currency === 'EUR' ? 1 / NOK_PER_EUR : 1, out: Measure[] = [];
  for (const r of h.rooms) for (const s of r.surfaces) {
    const c = CATALOG[s.type], uAfter = Math.min(s.u, c.uAfter(s.u));
    if (s.u - uAfter < 0.03 || s.u <= U_REF[s.type] * 1.05) continue;
    const kwhSaved = annualKwh(s.u - uAfter, s.area, h.settings.degreeDays), moneySaved = kwhSaved * h.settings.price, cost = c.costM2 * s.area * fx;
    out.push({ id: 'm-' + s.id, surfaceId: s.id, label: c.label, room: r.name, type: s.type, uBefore: s.u, uAfter, area: s.area, cost, kwhSaved, moneySaved, payback: cost / Math.max(moneySaved, 1e-6), effort: c.effort, priority: moneySaved / (cost * c.effort) });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
export function applyMeasures(h: House, ms: Measure[]): House {
  const m = new Map(ms.map((x) => [x.surfaceId, x.uAfter]));
  return { ...h, rooms: h.rooms.map((r) => ({ ...r, surfaces: r.surfaces.map((s) => (m.has(s.id) ? { ...s, u: m.get(s.id)! } : s)) })) };
}

/** Thermal-image physics. Interior shot: q = h_i·(T_air,in − T_surface); h_i = 7.7 W/m²K (Rsi 0.13, EN ISO 6946).
 *  Exterior shot: q = h_e·(T_surface − T_out); h_e = 25 W/m²K (Rse 0.04) – crude, sensitive to wind/sky radiation.
 *  Implied U = q / (T_in − T_out). */
export const H_INT = 7.7, H_EXT = 25;
export function imageFlux(tSurf: number, mode: 'interior' | 'exterior', s: Settings, hOverride?: number) {
  const q = mode === 'interior' ? (hOverride ?? H_INT) * (s.tIn - tSurf) : (hOverride ?? H_EXT) * (tSurf - s.tOut);
  return { q: Math.max(0, q), u: Math.max(0, q) / Math.max(dT(s), 0.1) };
}
