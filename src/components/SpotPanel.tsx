import { useRef, useState } from 'react';
import { MATERIALS, deviation, layersU, type SpotType } from '../lib/construction';
import { spotU, type SpotInfo, type SpotResult } from '../lib/spots';
import { kGrade, type House, type SurfaceType } from '../lib/physics';
import { fmt, uid } from '../lib/store';

const num = (v: string) => (v.trim() === '' ? undefined : +v);
const TYPES: SpotType[] = ['wall', 'window', 'roof', 'floor', 'door', 'bridge'];

export default function SpotPanel({ id, info, res, onChange, onClose, onDelete, house, setHouse }: {
  id: number; info: SpotInfo; res: SpotResult | null; onChange: (i: SpotInfo) => void; onClose: () => void; onDelete: () => void; house: House; setHouse: (h: House) => void;
}) {
  const set = (p: Partial<SpotInfo>) => onChange({ ...info, ...p });
  // the tap that opened the panel can fire a follow-up 'click' on whatever button now sits under the finger — swallow it
  // Only action controls are guarded; close (data-noguard) always works on the first tap.
  const opened = useRef(Date.now()), guard = (e: React.SyntheticEvent) => { if ((e.target as Element).closest('[data-noguard]')) return; if (Date.now() - opened.current < 450) { e.preventDefault(); e.stopPropagation(); } };
  const [room, setRoom] = useState(house.rooms[0]?.id ?? '__new'), [added, setAdded] = useState('');
  const U = spotU(info), lu = layersU(info.layers, info.type ?? 'wall');
  const dT = res ? res.tIn - res.tOut : 0, expected = U ? U.u * dT : null, implied = res && dT > 0.1 ? res.q / dT : null;
  const dev = res ? deviation(res.q, expected) : null;
  const addToProfile = () => {
    const u = U?.u ?? implied ?? 0.4, t: SurfaceType = info.type === 'bridge' || !info.type ? 'wall' : info.type;
    const s = { id: uid(), name: (info.notes?.split('\n')[0] || `Thermal spot #${id}`).slice(0, 40) + (info.type === 'bridge' ? ' (thermal bridge)' : ''), type: t, area: info.area ?? 1, u: +u.toFixed(3) };
    const rooms = room === '__new' || !house.rooms.some((r) => r.id === room)
      ? [...house.rooms, { id: uid(), name: 'Thermal camera spots', surfaces: [s] }]
      : house.rooms.map((r) => (r.id === room ? { ...r, surfaces: [...r.surfaces, s] } : r));
    setHouse({ ...house, rooms }); setAdded(`Added "${s.name}" (U ${fmt(s.u, 2)}, ${s.area} m²)`);
  };
  return (
    <div className="spotpanel" onClickCapture={guard} role="dialog" aria-label={`Spot ${id}`} data-testid="spot-panel">
      <div className="sph"><b>Spot #{id}</b><span className="dim">all fields optional</span><button className="x" data-noguard onClick={onClose} aria-label="Close">✕</button></div>
      <div className="spres" data-testid="spot-result">
        <div><span className="kl">Measured</span><b className="kvs">{res ? fmt(res.q, 1) : '–'}</b> W/m²</div>
        <div><span className="kl">Expected U·ΔT</span><b className="kvs">{expected != null ? fmt(expected, 1) : '–'}</b> W/m²</div>
        <div><span className="kl">Implied U</span><b className="kvs">{implied != null ? fmt(implied, 2) : '–'}</b> W/m²K</div>
      </div>
      {res && <p className="dim">T surface {fmt(res.tSurf, 1)} °C{Math.abs(res.tSurf - res.tApp) > 0.05 && ` (apparent ${fmt(res.tApp, 1)} °C, ε-corrected)`} · ΔT {fmt(dT, 1)} K{U && ` · U ${fmt(U.u, 2)} from ${U.src}`}{info.type === 'window' && U && ` · k ${kGrade(U.u)}`}</p>}
      {res?.hint && <div className="flag low">⚠ {res.hint}</div>}
      {dev ? <div className={'flag ' + dev.level} data-testid="spot-flag">{dev.level === 'high' ? '⚠ ' : dev.level === 'low' ? '↓ ' : '✓ '}{dev.text}</div>
        : <div className="flag none">Enter a U-value or layers to compare the measurement against the construction.</div>}
      <div className="form spform">
        <label>Surface type<select value={info.type ?? ''} onChange={(e) => set({ type: (e.target.value || undefined) as SpotType })}><option value="">—</option>{TYPES.map((t) => <option key={t} value={t}>{t === 'bridge' ? 'thermal bridge' : t}</option>)}</select></label>
        <label>Known U (W/m²K)<input inputMode="decimal" type="number" step="0.01" value={info.uKnown ?? ''} onChange={(e) => set({ uKnown: num(e.target.value), uSource: 'known' })} /></label>
        <label>Area m²<input inputMode="decimal" type="number" step="0.1" value={info.area ?? ''} onChange={(e) => set({ area: num(e.target.value) })} /></label>
        <label>Emissivity ε<input inputMode="decimal" type="number" step="0.01" min="0.05" max="1" placeholder="0.95" value={info.eps ?? ''} onChange={(e) => set({ eps: num(e.target.value) })} /></label>
        <label>Indoor °C<input inputMode="decimal" type="number" step="0.5" placeholder={res ? String(res.tIn) : ''} value={info.tIn ?? ''} onChange={(e) => set({ tIn: num(e.target.value) })} /></label>
        <label>Outdoor °C<input inputMode="decimal" type="number" step="0.5" placeholder={res ? String(res.tOut) : ''} value={info.tOut ?? ''} onChange={(e) => set({ tOut: num(e.target.value) })} /></label>
      </div>
      <h4>Construction layers <span className="dim">(inside → outside)</span></h4>
      {info.layers.map((l, i) => (
        <div className="layer" key={i}>
          <select value={l.material} onChange={(e) => set({ layers: info.layers.map((x, j) => (j === i ? { ...x, material: e.target.value } : x)), uSource: 'layers' })}>{MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}{m.fixedR ? '' : ` λ ${m.lambda}`}</option>)}</select>
          <input inputMode="numeric" type="number" step="5" value={l.mm} onChange={(e) => set({ layers: info.layers.map((x, j) => (j === i ? { ...x, mm: +e.target.value } : x)), uSource: 'layers' })} /><span>mm</span>
          <button className="x" onClick={() => set({ layers: info.layers.filter((_, j) => j !== i) })}>×</button>
        </div>))}
      <button onClick={() => set({ layers: [...info.layers, { material: 'mineral-wool', mm: 100 }], uSource: 'layers' })}>+ Layer</button>
      {lu && <p className="dim">R = Rsi + Σd/λ + Rse = {fmt(lu.R, 2)} m²K/W → U = {fmt(lu.U, 3)} W/m²K
        {info.uKnown ? <> · use <label className="inl"><input type="radio" checked={info.uSource === 'layers'} onChange={() => set({ uSource: 'layers' })} />layers</label><label className="inl"><input type="radio" checked={info.uSource === 'known'} onChange={() => set({ uSource: 'known' })} />known U</label></> : null}</p>}
      <label className="notes">Notes<textarea rows={2} value={info.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></label>
      <div className="spadd">
        <select value={room} onChange={(e) => setRoom(e.target.value)}>{house.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}<option value="__new">+ New room "Thermal camera spots"</option></select>
        <button onClick={addToProfile}>Add to house profile</button>
        <button className="x" onClick={onDelete}>Delete spot</button>
      </div>
      {added && <p className="ok">{added}</p>}
    </div>
  );
}
