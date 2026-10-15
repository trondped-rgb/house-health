/** Small material library, design λ in W/mK (typical EN ISO 10456 / manufacturer values). */
export const MATERIALS: { id: string; name: string; lambda: number; fixedR?: number }[] = [
  { id: 'mineral-wool', name: 'Mineral wool', lambda: 0.037 },
  { id: 'glass-wool', name: 'Glass wool', lambda: 0.035 },
  { id: 'eps', name: 'EPS', lambda: 0.035 },
  { id: 'xps', name: 'XPS', lambda: 0.033 },
  { id: 'pir', name: 'PIR/PUR board', lambda: 0.022 },
  { id: 'wood', name: 'Wood (softwood)', lambda: 0.13 },
  { id: 'osb', name: 'Plywood / OSB', lambda: 0.13 },
  { id: 'gypsum', name: 'Gypsum board', lambda: 0.25 },
  { id: 'brick', name: 'Brick (solid)', lambda: 0.77 },
  { id: 'lwa', name: 'Lightweight concrete (Leca)', lambda: 0.2 },
  { id: 'concrete', name: 'Concrete', lambda: 1.8 },
  { id: 'air', name: 'Air gap, unventilated (R 0.18)', lambda: 0, fixedR: 0.18 },
];
export type SpotType = 'wall' | 'window' | 'roof' | 'floor' | 'door' | 'bridge';
export interface Layer { material: string; mm: number }
/** Surface resistances per ISO 6946: horizontal flow 0.13, upward (roof) 0.10, downward (floor) 0.17; Rse 0.04. */
export const RSI: Record<SpotType, number> = { wall: 0.13, window: 0.13, door: 0.13, bridge: 0.13, roof: 0.1, floor: 0.17 };
export const RSE = 0.04;
export function layersU(layers: Layer[], type: SpotType = 'wall') {
  const valid = layers.filter((l) => l.mm > 0 && MATERIALS.some((m) => m.id === l.material));
  if (!valid.length) return null;
  const R = RSI[type] + RSE + valid.reduce((a, l) => { const m = MATERIALS.find((x) => x.id === l.material)!; return a + (m.fixedR ?? l.mm / 1000 / m.lambda); }, 0);
  return { R, U: 1 / R };
}
/** Camera reports apparent temperature assuming ε_cam. Correct to true surface temperature for actual ε,
 *  with reflected apparent temperature T_refl:  ε_cam·Ta⁴ + (1−ε_cam)·Tr⁴ = ε·Ts⁴ + (1−ε)·Tr⁴. */
export function correctEmissivity(tApp: number, eps: number, tRefl: number, epsCam = 0.95) {
  if (!(eps > 0 && eps <= 1) || Math.abs(eps - epsCam) < 1e-6) return tApp;
  const K = 273.15, a = (tApp + K) ** 4, r = (tRefl + K) ** 4;
  const s = (epsCam * a + (1 - epsCam) * r - (1 - eps) * r) / eps;
  return s > 0 ? s ** 0.25 - K : tApp;
}
/** Measured vs expected: ratio > 1.3 = more loss than construction predicts. */
export function deviation(measured: number, expected: number | null) {
  if (expected == null || expected <= 0.01) return null;
  const ratio = measured / expected;
  if (ratio > 1.3) return { ratio, level: 'high' as const, text: `${Math.round((ratio - 1) * 100)}% more heat loss than the construction predicts. Possible causes: a thermal bridge, missing or settled insulation, an air leak, or moisture.` };
  if (ratio < 0.7) return { ratio, level: 'low' as const, text: `${Math.round((1 - ratio) * 100)}% less heat loss than predicted. Check emissivity, sun or sky reflection, the camera scale, or whether the stated U-value is too pessimistic.` };
  return { ratio, level: 'ok' as const, text: 'Within ±30% of the expected value. Consistent with the stated construction.' };
}
