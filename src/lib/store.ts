import { useEffect, useState } from 'react';
import type { House } from './physics';
let n = 0; export const uid = () => Date.now().toString(36) + (n++).toString(36);
export const demoHouse = (): House => ({
  name: 'Demo: 1975 detached house, Oslo',
  settings: { tIn: 21, tOut: 0, degreeDays: 4170, location: 'Oslo', price: 0.28, currency: 'EUR' },
  rooms: [
    { id: 'r1', name: 'Living room', surfaces: [
      { id: 's1', name: 'North wall', type: 'wall', area: 18, u: 0.4 }, { id: 's2', name: 'West wall', type: 'wall', area: 12, u: 0.4 },
      { id: 's3', name: 'Picture window', type: 'window', area: 6, u: 2.8 }, { id: 's4', name: 'Floor over crawlspace', type: 'floor', area: 35, u: 0.4 } ] },
    { id: 'r2', name: 'Bedrooms (1st floor)', surfaces: [
      { id: 's5', name: 'External walls', type: 'wall', area: 40, u: 0.4 }, { id: 's6', name: 'Windows', type: 'window', area: 5, u: 2.8 },
      { id: 's7', name: 'Attic ceiling', type: 'roof', area: 70, u: 0.35 } ] },
    { id: 'r3', name: 'Kitchen & hall', surfaces: [
      { id: 's8', name: 'External walls', type: 'wall', area: 25, u: 0.4 }, { id: 's9', name: 'Window', type: 'window', area: 2.5, u: 1.6 },
      { id: 's10', name: 'Front door', type: 'door', area: 2, u: 2.2 }, { id: 's11', name: 'Slab floor', type: 'floor', area: 35, u: 0.4 } ] },
  ],
});
export function usePersisted<T>(key: string, init: () => T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init(); } catch { return init(); } });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
  return [v, setV] as const;
}
export const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
