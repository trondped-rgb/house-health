export type SurfaceType = 'wall' | 'window' | 'roof' | 'floor' | 'door';
export interface Surface { id: string; name: string; type: SurfaceType; area: number; u: number }
export interface Room { id: string; name: string; surfaces: Surface[] }
export type Currency = 'NOK' | 'EUR';
export interface Settings { tIn: number; tOut: number; degreeDays: number; location: string; price: number; currency: Currency; co2?: number; co2Preset?: string }
/** Emission factors, kg CO₂e per kWh delivered. Only the NVE figure is a verified published value; the rest are rounded assumptions (see README). */
export const CO2_PRESETS: { id: string; label: string; kg: number }[] = [
  { id: 'no-nve', label: 'Norwegian electricity, physically delivered (NVE 2024: 11.9 g)', kg: 0.0119 },
  { id: 'nordic', label: 'Nordic electricity mix (approx. assumption)', kg: 0.09 },
  { id: 'ns3720', label: 'European long-term scenario, NS 3720-style (approx. 0.13)', kg: 0.13 },
  { id: 'eu', label: 'EU average grid mix (approx. assumption)', kg: 0.27 },
  { id: 'oil', label: 'Heating oil, per kWh fuel (approx. 0.27)', kg: 0.27 },
  { id: 'dh', label: 'District heating, Norway avg (approx. assumption)', kg: 0.1 },
  { id: 'custom', label: 'Custom', kg: 0.0119 },
];
export const co2Factor = (s: Settings) => s.co2 ?? CO2_PRESETS[0].kg;
export interface House { name: string; rooms: Room[]; settings: Settings }

/** Heating degree-days (Kd/year, base 17 °C), identical to Thermetric's climate table. */
export const LOCATIONS: Record<string, { dd: number }> = {
  Oslo: { dd: 4170 }, Bergen: { dd: 3280 }, Stavanger: { dd: 3210 }, Kristiansand: { dd: 3520 }, Trondheim: { dd: 4630 }, 'Tromsø': { dd: 5680 },
  Stockholm: { dd: 3900 }, 'København': { dd: 2900 }, Helsinki: { dd: 4600 }, 'Reykjavík': { dd: 4800 }, London: { dd: 2100 }, Amsterdam: { dd: 2500 },
  Bruxelles: { dd: 2400 }, Paris: { dd: 2300 }, Berlin: { dd: 3000 }, Wien: { dd: 2900 }, 'Zürich': { dd: 3200 }, Warszawa: { dd: 3400 }, Kyiv: { dd: 3600 },
  Madrid: { dd: 1600 }, Roma: { dd: 1200 }, Vancouver: { dd: 2800 }, Custom: { dd: 4170 },
};
/** Thermetric default: 0.28 EUR/kWh. NOK value is House Health's own (Thermetric has no NOK price). */
export const PRICE_DEFAULT: Record<Currency, number> = { EUR: 0.28, NOK: 1.5 };
/** Window k-value grade, Thermetric scale. */
export const kGrade = (k: number) => (k <= 0.5 ? 'very good' : k <= 1 ? 'good' : k <= 1.4 ? 'fair' : k <= 2.8 ? 'poor' : 'very poor');

/** U-value presets (W/m²K). */
export const U_PRESETS: Record<SurfaceType, { label: string; u: number }[]> = {
  // wall & window lists = Thermetric presets
  wall: [{ label: 'Solid brick, pre-1940', u: 2.1 }, { label: 'Cavity, empty', u: 1.4 }, { label: 'Cavity, filled', u: 0.6 }, { label: 'Insulated masonry', u: 0.3 }, { label: 'Timber frame', u: 0.25 }, { label: 'Modern wall (2010+)', u: 0.18 }, { label: '1970s timber, 10 cm (HH)', u: 0.4 }],
  window: [{ label: 'Single pane · very poor', u: 5.8 }, { label: 'Double glazing, air · poor', u: 2.8 }, { label: 'Low-e argon double · fair', u: 1.4 }, { label: 'Triple glazing · good', u: 0.8 }, { label: 'Passive house · very good', u: 0.5 }],
  roof: [{ label: 'Uninsulated attic', u: 1.5 }, { label: '1970s, 10 cm', u: 0.35 }, { label: '1990s, 20 cm', u: 0.2 }, { label: 'TEK17, 35 cm', u: 0.13 }],
  floor: [{ label: 'Uninsulated slab/crawl', u: 0.8 }, { label: '1970s, 5 cm', u: 0.4 }, { label: '1990s, 10 cm', u: 0.2 }, { label: 'TEK17', u: 0.1 }],
  door: [{ label: 'Door (Thermetric default)', u: 2.2 }, { label: 'Thermal bridge (Thermetric)', u: 3.5 }, { label: 'Insulated door', u: 1.2 }, { label: 'TEK17 door', u: 0.8 }],
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

export interface Measure { life: number; co2Year: number; co2Life: number; id: string; surfaceId: string; label: string; room: string; type: SurfaceType; uBefore: number; uAfter: number; area: number; cost: number; kwhSaved: number; moneySaved: number; payback: number; effort: 1 | 2 | 3; priority: number }
/** Retrofit catalogue: new U and installed cost per m² (NOK, rough 2026 Norway). λ insulation = 0.037 W/mK. */
const addIns = (u: number, cm: number) => 1 / (1 / u + cm / 100 / 0.037);
/** Assumed service life (years) used for lifetime CO₂: insulation 40, windows/doors 30. */
const CATALOG: Record<SurfaceType, { label: string; uAfter: (u: number) => number; costM2: number; effort: 1 | 2 | 3; life: number }> = {
  roof: { label: 'Blow in +20 cm attic insulation', uAfter: (u) => addIns(u, 20), costM2: 450, effort: 1, life: 40 },
  wall: { label: 'Add 10 cm exterior insulation + new cladding', uAfter: (u) => addIns(u, 10), costM2: 1800, effort: 3, life: 40 },
  floor: { label: 'Insulate floor/crawlspace +10 cm', uAfter: (u) => addIns(u, 10), costM2: 900, effort: 2, life: 40 },
  window: { label: 'Replace with triple glazing (U 0.8)', uAfter: () => 0.8, costM2: 8000, effort: 2, life: 30 },
  door: { label: 'Replace with insulated door (U 0.8)', uAfter: () => 0.8, costM2: 7000, effort: 1, life: 30 },
};
export const NOK_PER_EUR = 11.5;
export function measures(h: House): Measure[] {
  const fx = h.settings.currency === 'EUR' ? 1 / NOK_PER_EUR : 1, out: Measure[] = [];
  for (const r of h.rooms) for (const s of r.surfaces) {
    const c = CATALOG[s.type], uAfter = Math.min(s.u, c.uAfter(s.u));
    if (s.u - uAfter < 0.03 || s.u <= U_REF[s.type] * 1.05) continue;
    const kwhSaved = annualKwh(s.u - uAfter, s.area, h.settings.degreeDays), moneySaved = kwhSaved * h.settings.price, cost = c.costM2 * s.area * fx;
    const co2Year = (kwhSaved * co2Factor(h.settings)) / 1000;
    out.push({ life: c.life, co2Year, co2Life: co2Year * c.life, id: 'm-' + s.id, surfaceId: s.id, label: c.label, room: r.name, type: s.type, uBefore: s.u, uAfter, area: s.area, cost, kwhSaved, moneySaved, payback: cost / Math.max(moneySaved, 1e-6), effort: c.effort, priority: moneySaved / (cost * c.effort) });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
export function applyMeasures(h: House, ms: Measure[]): House {
  const m = new Map(ms.map((x) => [x.surfaceId, x.uAfter]));
  return { ...h, rooms: h.rooms.map((r) => ({ ...r, surfaces: r.surfaces.map((s) => (m.has(s.id) ? { ...s, u: m.get(s.id)! } : s)) })) };
}

/** Thermal-image physics (aligned with Thermetric).
 *  Exterior shot (default): q = h·(Tse − Te) − α·I, h = 25 W/m²K (ISO 6946), α = 0.5, I = solar irradiance on the wall.
 *  Interior shot (House Health extra): q = h_i·(T_air,in − T_si), h_i = 7.7 W/m²K (Rsi 0.13).
 *  Implied U = q / (T_in − T_out). Surface temps are taken as already emissivity-corrected by the camera (ε ≈ 0.95). */
export const H_INT = 7.7, H_EXT = 25, ALPHA_SOLAR = 0.5, SIGMA = 5.67e-8;
/** Exterior surface coefficient for the actual survey conditions, ISO 6946 Annex C:
 *  h_se = h_c + h_r, h_c = 4 + 4·v (wind m/s), h_r = ε·4σT_m³ (≈4.4 W/m²K at 0 °C).
 *  The design value h = 25 (R_se 0.04) corresponds to v = 4 m/s. Calm survey nights (v ≈ 0.5) give h ≈ 10. */
export const hExterior = (wind: number, eps = 0.95, tm = 0) => 4 + 4 * Math.max(0, wind) + eps * 4 * SIGMA * (tm + 273.15) ** 3;
export function imageFlux(tSurf: number, mode: 'interior' | 'exterior', s: Settings, hOverride?: number, solar = 0) {
  const raw = mode === 'interior' ? (hOverride ?? H_INT) * (s.tIn - tSurf) : (hOverride ?? H_EXT) * (tSurf - s.tOut) - ALPHA_SOLAR * solar;
  return { q: Math.max(0, raw), raw, u: Math.max(0, raw) / Math.max(dT(s), 0.1) };
}
/** Plausibility hint for a thermal reading. tNorm = position on the camera scale (0..1). */
export function plausibility(raw: number, s: Settings, tNorm?: number): string | null {
  const d = dT(s);
  if (tNorm != null && (tNorm <= 0.005 || tNorm >= 0.995)) return 'At the edge of the camera scale (clipped). Widen min/max.';
  if (raw < -1) return 'Surface is on the wrong side of the air temperature (sky radiation, sun, or a wrong shot type). Shown as 0.';
  if (d < 10) return `ΔT is only ${d.toFixed(0)} K. Thermography needs ≥10 K for reliable W/m².`;
  if (raw / Math.max(d, 0.1) > 6) return 'Implied U > 6 W/m²K is implausible. Check the scale, h, sun, and that the radiator is not in view.';
  return null;
}
