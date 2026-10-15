import { useEffect, useRef, useState } from 'react';
import { colorToT, luminance, type PaletteName } from '../lib/palette';
import { imageFlux, plausibility, hExterior, H_INT, type House, type Settings } from '../lib/physics';
import { correctEmissivity } from '../lib/construction';
import SpotPanel from './SpotPanel';
import { spotU, type SpotInfo, type SpotResult } from '../lib/spots';
import { fmt, usePersisted } from '../lib/store';

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Spot = { id: number; img: string; rect: Rect; info: SpotInfo; last?: SpotResult };
const IMG_KEY = 'hh.image';
/** Downscale an uploaded/captured photo and keep it in localStorage so spots survive reloads. */
function persistImage(file: File): Promise<string> {
  return new Promise((ok) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => {
    const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); const d = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(u);
    try { localStorage.setItem(IMG_KEY, JSON.stringify({ key: 'upload:' + Date.now(), data: d })); } catch { /* quota: keep in memory only */ }
    ok(d); }; im.src = u; });
}
interface Cfg { tMin: number; tMax: number; palette: PaletteName; mapping: 'luminance' | 'palette'; mode: 'interior' | 'exterior'; hMode: 'auto' | 'manual'; h: number; wind: number; solar: number }
const SAMPLE = import.meta.env.BASE_URL + 'sample-thermal.png';

export default function Viewer({ settings, house, setHouse }: { settings: Settings; house: House; setHouse: (h: House) => void }) {
  const cv = useRef<HTMLCanvasElement>(null), img = useRef<ImageData | null>(null);
  const [cur, setCur] = useState<{ key: string; src: string }>(() => { try { const j = JSON.parse(localStorage.getItem(IMG_KEY) || 'null'); if (j?.data && localStorage.getItem('hh.imgsel') === j.key) return { key: j.key, src: j.data }; } catch { /* ignore */ } return { key: 'sample', src: SAMPLE }; });
  const src = cur.src, [loaded, setLoaded] = useState(0);
  useEffect(() => { localStorage.setItem('hh.imgsel', cur.key); }, [cur.key]);
  const loadFile = async (f?: File) => { if (!f) return; const d = await persistImage(f); let key = 'upload:' + Date.now(); try { key = JSON.parse(localStorage.getItem(IMG_KEY)!).key; } catch { /* in-memory */ } setCur({ key, src: d }); };
  const [cfg, setCfg] = usePersisted<Cfg>('hh.viewer.v3', () => ({ tMin: -2, tMax: 10, palette: 'ironbow', mapping: 'palette', mode: 'exterior', hMode: 'auto', h: 10, wind: 0.5, solar: 0 }));
  /** Effective film coefficient used everywhere below. */
  const hEff = cfg.hMode === 'manual' ? cfg.h : cfg.mode === 'interior' ? H_INT : hExterior(cfg.wind, 0.95, settings.tOut);
  const flux = (t: number, s: Settings = settings) => imageFlux(t, cfg.mode, s, hEff, cfg.solar);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [tool, setTool] = useState<'pan' | 'region'>('pan');
  const [hover, setHover] = useState<{ t: number; q: number; hint: string | null } | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [spots, setSpots] = usePersisted<Spot[]>('hh.spots', () => []), [open, setOpen] = useState<number | null>(null);
  const tap = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const locks = spots.filter((x) => x.img === cur.key);
  const ptrs = useRef(new Map<number, { x: number; y: number }>()), last = useRef<{ x: number; y: number; d?: number } | null>(null);

  const fit = () => { const c = cv.current, d = img.current; if (!c || !d) return; const W = c.clientWidth, H = c.clientHeight, s = Math.min(W / d.width, H / d.height); setView({ s, x: (W - d.width * s) / 2, y: (H - d.height * s) / 2 }); };
  useEffect(() => {
    const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d')!; g.drawImage(im, 0, 0); img.current = g.getImageData(0, 0, im.width, im.height);
      fit(); setLoaded((n) => n + 1);
    }; im.src = src;
  }, [src]);

  const tempAt = (x: number, y: number) => {
    const d = img.current!; x = Math.max(0, Math.min(d.width - 1, x | 0)); y = Math.max(0, Math.min(d.height - 1, y | 0));
    const o = (y * d.width + x) * 4; const t = cfg.mapping === 'luminance' ? luminance(d.data[o], d.data[o + 1], d.data[o + 2]) : colorToT(d.data[o], d.data[o + 1], d.data[o + 2], cfg.palette); return cfg.tMin + t * (cfg.tMax - cfg.tMin);
  };
  const stats = (r: Rect) => {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    const step = Math.max(1, Math.ceil(Math.max(x1 - x0, y1 - y0) / 120)); let sum = 0, n = 0, mn = Infinity, qs = 0, raws = 0;
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) { const t = tempAt(x, y); sum += t; n++; mn = Math.min(mn, t); const f = flux(t); qs += f.q; raws += f.raw; }
    const tAvg = sum / n, q = qs / n; return { tAvg, tMin: mn, q, raw: raws / n, u: q / Math.max(settings.tIn - settings.tOut, 0.1) };
  };
  const spotResult = (sp: Spot): SpotResult => {
    const r = sp.rect, i = sp.info, tIn = i.tIn ?? settings.tIn, tOut = i.tOut ?? settings.tOut;
    const step = Math.max(1, Math.ceil(Math.max(r.x1 - r.x0, r.y1 - r.y0) / 120)); let sum = 0, n = 0;
    for (let y = r.y0; y <= r.y1; y += step) for (let x = r.x0; x <= r.x1; x += step) { sum += tempAt(x, y); n++; }
    const tApp = sum / n, tSurf = correctEmissivity(tApp, i.eps ?? 0.95, cfg.mode === 'exterior' ? tOut : tIn);
    const f = flux(tSurf, { ...settings, tIn, tOut }); return { tApp, tSurf, q: f.q, tIn, tOut, hint: plausibility(f.raw, { ...settings, tIn, tOut }, (tApp - cfg.tMin) / (cfg.tMax - cfg.tMin)) };
  };
  const toImg = (cx: number, cy: number) => ({ x: (cx - view.x) / view.s, y: (cy - view.y) / view.s });
  const visible = (): Rect | null => {
    const c = cv.current, d = img.current; if (!c || !d) return null;
    const a = toImg(0, 0), b = toImg(c.width, c.height);
    return { x0: Math.max(0, a.x | 0), y0: Math.max(0, a.y | 0), x1: Math.min(d.width - 1, b.x | 0), y1: Math.min(d.height - 1, b.y | 0) };
  };

  useEffect(() => {
    const c = cv.current, d = img.current; if (!c || !d) return;
    c.width = c.clientWidth; c.height = c.clientHeight; const g = c.getContext('2d')!;
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = view.s < 2;
    const tmp = document.createElement('canvas'); tmp.width = d.width; tmp.height = d.height; tmp.getContext('2d')!.putImageData(d, 0, 0);
    g.setTransform(view.s, 0, 0, view.s, view.x, view.y); g.drawImage(tmp, 0, 0);
    g.lineWidth = 2 / view.s; g.font = `${12 / view.s}px ui-monospace,monospace`;
    for (const l of locks) {
      const r = l.rect, w = r.x1 - r.x0 || 1, h = r.y1 - r.y0 || 1; g.strokeStyle = '#0ff'; g.strokeRect(r.x0, r.y0, w, h);
      const q = img.current ? spotResult(l).q : 0, label = `#${l.id} ${fmt(q, 1)} W/m²`; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(r.x0, r.y0 - 16 / view.s, g.measureText(label).width + 6 / view.s, 16 / view.s);
      g.fillStyle = '#0ff'; g.fillText(label, r.x0 + 3 / view.s, r.y0 - 4 / view.s);
    }
    if (drag) { g.strokeStyle = '#fff'; g.setLineDash([4 / view.s]); g.strokeRect(drag.x0, drag.y0, drag.x1 - drag.x0, drag.y1 - drag.y0); }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }, [view, spots, drag, loaded, cfg, settings]); // eslint-disable-line

  const lock = (r: Rect) => { const d = img.current!, cl = (v: number, m: number) => Math.max(0, Math.min(m - 1, v));
    const rect = { x0: cl(Math.min(r.x0, r.x1), d.width), y0: cl(Math.min(r.y0, r.y1), d.height), x1: cl(Math.max(r.x0, r.x1), d.width), y1: cl(Math.max(r.y0, r.y1), d.height) };
    const id = spots.reduce((a, x) => Math.max(a, x.id), 0) + 1;
    setSpots([...spots, { id, img: cur.key, rect, info: { layers: [], uSource: 'known' } }]); setOpen(id); };
  const hitSpot = (q: { x: number; y: number }) => { const pad = 8 / view.s; return [...locks].reverse().find((l) => q.x >= l.rect.x0 - pad && q.x <= l.rect.x1 + pad && q.y >= l.rect.y0 - pad && q.y <= l.rect.y1 + pad); };
  // keep a snapshot of each spot's latest result (for the list when another image is shown)
  useEffect(() => { if (!img.current) return; setSpots((ss) => ss.map((x) => (x.img === cur.key ? { ...x, last: spotResult(x) } : x))); }, [cfg, settings, loaded, open]); // eslint-disable-line

  const pos = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const zoomAt = (cx: number, cy: number, f: number) => setView((v) => { const s = Math.max(0.2, Math.min(40, v.s * f)); const k = s / v.s; return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }; });
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId); const p = pos(e); ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) { last.current = p; tap.current = { ...p, t: Date.now(), moved: false }; if (tool === 'region') { const q = toImg(p.x, p.y); setDrag({ x0: q.x | 0, y0: q.y | 0, x1: q.x | 0, y1: q.y | 0 }); } }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pos(e); if (img.current) { const q = toImg(p.x, p.y); const d = img.current; if (q.x >= 0 && q.y >= 0 && q.x < d.width && q.y < d.height) { let t = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t += tempAt(q.x + dx, q.y + dy); t /= 25; const f = flux(t); setHover({ t, q: f.q, hint: plausibility(f.raw, settings, (t - cfg.tMin) / (cfg.tMax - cfg.tMin)) }); } else setHover(null); }
    if (!ptrs.current.has(e.pointerId)) return; ptrs.current.set(e.pointerId, p);
    if (tap.current && Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > 8) tap.current.moved = true;
    const ps = [...ptrs.current.values()];
    if (ps.length === 2) { // pinch
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), m = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      if (last.current?.d) zoomAt(m.x, m.y, d / last.current.d); last.current = { ...m, d }; setDrag(null); tap.current = null; return;
    }
    if (drag) { const q = toImg(p.x, p.y); setDrag({ ...drag, x1: q.x | 0, y1: q.y | 0 }); return; }
    if (tool === 'pan' && last.current) { const dx = p.x - last.current.x, dy = p.y - last.current.y; setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })); last.current = p; }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasSingle = ptrs.current.size === 1; ptrs.current.delete(e.pointerId); last.current = null;
    if (!wasSingle) return;
    const t = tap.current; tap.current = null;
    if (drag && (Math.abs(drag.x1 - drag.x0) > 2 && Math.abs(drag.y1 - drag.y0) > 2)) { lock(drag); setDrag(null); return; }
    setDrag(null);
    if (t && !t.moved && e.type === 'pointerup' && img.current) { // tap / click → open existing spot or create one
      const q = toImg(pos(e).x, pos(e).y), d = img.current; if (q.x < 0 || q.y < 0 || q.x >= d.width || q.y >= d.height) return;
      const hit = hitSpot(q); if (hit) { setOpen(hit.id); return; }
      lock({ x0: (q.x | 0) - 3, y0: (q.y | 0) - 3, x1: (q.x | 0) + 3, y1: (q.y | 0) + 3 });
    }
  };
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e) => { e.preventDefault(); const b = cv.current!.getBoundingClientRect(); zoomAt(e.clientX - b.left, e.clientY - b.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  useEffect(() => { const c = cv.current!; const h = (e: WheelEvent) => wheel.current(e); c.addEventListener('wheel', h, { passive: false }); return () => c.removeEventListener('wheel', h); }, []);
  const vr = loaded ? visible() : null, vs = vr && vr.x1 > vr.x0 ? stats(vr) : null;
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });

  return (
    <div className="viewer">
      <div className="toolbar">
        {(['pan', 'region'] as const).map((t) => <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>{t === 'pan' ? '✋ Pan · tap = spot' : '▭ Draw region'}</button>)}
        <button onClick={() => zoomAt(cv.current!.width / 2, cv.current!.height / 2, 1.5)}>＋</button>
        <button onClick={() => zoomAt(cv.current!.width / 2, cv.current!.height / 2, 1 / 1.5)}>－</button>
        <button onClick={fit}>Fit</button>
        <label className="file">📷 Take photo <input type="file" accept="image/*" capture="environment" data-testid="capture" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
        <label className="file">Upload… <input type="file" accept="image/*" data-testid="upload" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
        <button onClick={() => setCur({ key: 'sample', src: SAMPLE })}>Sample</button>
      </div>
      <div className="vwrap">
        {(() => { const sp = open != null ? locks.find((x) => x.id === open) : undefined; return sp && img.current ? <SpotPanel key={sp.id} id={sp.id} info={sp.info} res={spotResult(sp)} house={house} setHouse={setHouse}
          onChange={(info) => setSpots(spots.map((x) => (x.id === sp.id ? { ...x, info } : x)))} onClose={() => setOpen(null)} onDelete={() => { setSpots(spots.filter((x) => x.id !== sp.id)); setOpen(null); }} /> : null; })()}
        <canvas ref={cv} className="tcanvas" data-testid="thermal-canvas" style={{ cursor: tool === 'pan' ? 'pointer' : 'crosshair' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover(null)} />
        <div className="overlay">
          <div className="big">{vs ? fmt(vs.q, 1) : '–'} <small>W/m²</small></div>
          <div>{cfg.mode} · h {fmt(hEff, 1)} W/m²K · visible region · zoom {fmt(view.s, 2)}×</div>
          {vs && <div>T̄ {fmt(vs.tAvg, 1)} °C · min {fmt(vs.tMin, 1)} °C · U≈{fmt(vs.u, 2)}</div>}
          {vs && (() => { const h = plausibility(vs.raw, settings); return h ? <div className="warn">⚠ {h}</div> : null; })()}
          {hover && <div className="hov">cursor (5×5 px): {fmt(hover.t, 1)} °C → {fmt(hover.q, 1)} W/m²</div>}
          {hover?.hint && <div className="warn">⚠ {hover.hint}</div>}
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Calibration</h3>
          <div className="form">
            <label>Pixel → °C<select value={cfg.mapping} onChange={(e) => set({ mapping: e.target.value as Cfg['mapping'] })}><option value="palette">Palette colour match (recommended)</option><option value="luminance">Luminance (Thermetric, grayscale images only)</option></select></label>
            <label>Palette<select value={cfg.palette} onChange={(e) => set({ palette: e.target.value as PaletteName })}><option value="ironbow">Ironbow</option><option value="rainbow">Rainbow</option></select></label>
            <label>Scale min °C<input type="number" step="0.5" value={cfg.tMin} onChange={(e) => set({ tMin: +e.target.value })} /></label>
            <label>Scale max °C<input type="number" step="0.5" value={cfg.tMax} onChange={(e) => set({ tMax: +e.target.value })} /></label>
            <label>Shot<select value={cfg.mode} onChange={(e) => { const m = e.target.value as Cfg['mode']; set({ mode: m, solar: m === 'interior' ? 0 : cfg.solar }); }}><option value="interior">Interior surface</option><option value="exterior">Exterior surface</option></select></label>
            <label>Film coefficient h<select value={cfg.hMode} onChange={(e) => set({ hMode: e.target.value as Cfg['hMode'], h: e.target.value === 'manual' ? Math.round(hEff * 10) / 10 : cfg.h })}><option value="auto">Auto · {fmt(hEff, 1)} W/m²K</option><option value="manual">Manual</option></select></label>
            {cfg.hMode === 'manual' ? <label>h manual (W/m²K)<span style={{ display: 'flex', gap: 4 }}><input type="number" step="0.1" value={cfg.h} onChange={(e) => set({ h: +e.target.value })} /><button type="button" onClick={() => set({ h: 25 })} title="Thermetric / ISO 6946 design value (4 m/s wind)">25</button></span></label>
              : cfg.mode === 'exterior' && <label>Wind at wall (m/s)<input type="number" step="0.5" min="0" value={cfg.wind} onChange={(e) => set({ wind: +e.target.value })} /></label>}
            {cfg.mode === 'exterior' && <label>Sun on wall I (W/m²)<input type="number" step="10" value={cfg.solar} onChange={(e) => set({ solar: +e.target.value })} /></label>}
            <label>T air in / out<span>{settings.tIn} / {settings.tOut} °C (from Profile)</span></label>
          </div>
          <p className="note">{cfg.mode === 'interior' ? <>q = h<sub>i</sub>·(T<sub>air,in</sub> − T<sub>surface</sub>), h<sub>i</sub> ≈ 7.7 W/m²K (R<sub>si</sub> = 0.13, EN ISO 6946).</> : <>q = h·(T<sub>se</sub> − T<sub>e</sub>) − α·I, α = 0.5. Auto h = 4 + 4·v + 4εσT<sub>m</sub>³ (ISO 6946 Annex C), about 10 W/m²K at 0.5 m/s wind. The design value 25 W/m²K (Thermetric) assumes 4 m/s wind and overstates calm-night readings ~2.5×. Shoot overcast or after dusk.</>} Implied U = q/(T<sub>in</sub>−T<sub>out</sub>). {cfg.mapping === 'luminance' ? 'Luminance mapping: T = Tmin + L·(Tmax − Tmin). Ironbow brightness is not linear in temperature (mid-scale reads up to ~23% of the span too cold), so only use this for grayscale/white-hot images.' : 'Pixel temperature comes from the nearest palette colour between min and max.'} Set min and max to match the camera's scale bar. Surface temperatures are assumed to be emissivity-corrected by the camera (ε ≈ 0.95). Reflections and radiators (hot spots → 0 W/m²) aren't corrected. Treat values as indicative, ±30% or worse.</p>
        </div>
        <div className="card">
          <h3>Tagged spots ({spots.length})</h3>
          {spots.length === 0 ? <p className="note">Tap or click anywhere on the image, or use ▭ Draw region, to tag a spot. Then enter what you know about the construction. Spots are saved in this browser.</p> :
            <table data-testid="spot-list"><thead><tr><th>#</th><th>Type</th><th>T °C</th><th>W/m²</th><th>exp.</th><th>U≈</th><th></th></tr></thead><tbody>
              {spots.map((l) => { const here = l.img === cur.key && !!img.current, r = here ? spotResult(l) : l.last; const u = r && r.tIn - r.tOut > 0.1 ? r.q / (r.tIn - r.tOut) : null; const U = spotU(l.info);
                return <tr key={l.id} className={open === l.id ? 'sel' : ''} onClick={() => here && setOpen(l.id)} style={{ cursor: here ? 'pointer' : 'default' }}>
                  <td>{l.id}</td><td>{l.info.type ?? '—'}{!here && <div className="dim">other image</div>}{l.info.notes && <div className="dim">{l.info.notes.slice(0, 30)}</div>}</td>
                  <td>{r ? fmt(r.tSurf, 1) : '–'}</td><td><b>{r ? fmt(r.q, 1) : '–'}</b></td><td>{U && r ? fmt(U.u * (r.tIn - r.tOut), 1) : '–'}</td><td>{u != null ? fmt(u, 2) : '–'}</td>
                  <td><button className="x" onClick={(ev) => { ev.stopPropagation(); setSpots(spots.filter((x) => x !== l)); if (open === l.id) setOpen(null); }}>×</button></td></tr>; })}
            </tbody></table>}
        </div>
      </div>
    </div>
  );
}
