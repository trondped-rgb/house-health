import { useEffect, useRef, useState } from 'react';
import { colorToT, type PaletteName } from '../lib/palette';
import { imageFlux, H_INT, H_EXT, type Settings } from '../lib/physics';
import { fmt, usePersisted } from '../lib/store';

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Lock = { id: number; rect: Rect; tAvg: number; tMin: number; q: number; u: number };
interface Cfg { tMin: number; tMax: number; palette: PaletteName; mode: 'interior' | 'exterior'; h: number }
const SAMPLE = import.meta.env.BASE_URL + 'sample-thermal.png';

export default function Viewer({ settings }: { settings: Settings }) {
  const cv = useRef<HTMLCanvasElement>(null), img = useRef<ImageData | null>(null);
  const [src, setSrc] = useState(SAMPLE), [loaded, setLoaded] = useState(0);
  const [cfg, setCfg] = usePersisted<Cfg>('hh.viewer', () => ({ tMin: 8, tMax: 22, palette: 'ironbow', mode: 'interior', h: H_INT }));
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [tool, setTool] = useState<'pan' | 'point' | 'region'>('pan');
  const [hover, setHover] = useState<{ t: number; q: number } | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [locks, setLocks] = useState<Lock[]>([]);
  const ptrs = useRef(new Map<number, { x: number; y: number }>()), last = useRef<{ x: number; y: number; d?: number } | null>(null);

  const fit = () => { const c = cv.current, d = img.current; if (!c || !d) return; const W = c.clientWidth, H = c.clientHeight, s = Math.min(W / d.width, H / d.height); setView({ s, x: (W - d.width * s) / 2, y: (H - d.height * s) / 2 }); };
  useEffect(() => {
    const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d')!; g.drawImage(im, 0, 0); img.current = g.getImageData(0, 0, im.width, im.height);
      fit(); setLocks([]); setLoaded((n) => n + 1);
    }; im.src = src;
  }, [src]);

  const tempAt = (x: number, y: number) => {
    const d = img.current!; x = Math.max(0, Math.min(d.width - 1, x | 0)); y = Math.max(0, Math.min(d.height - 1, y | 0));
    const o = (y * d.width + x) * 4; return cfg.tMin + colorToT(d.data[o], d.data[o + 1], d.data[o + 2], cfg.palette) * (cfg.tMax - cfg.tMin);
  };
  const stats = (r: Rect) => {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    const step = Math.max(1, Math.ceil(Math.max(x1 - x0, y1 - y0) / 120)); let sum = 0, n = 0, mn = Infinity, qs = 0;
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) { const t = tempAt(x, y); sum += t; n++; mn = Math.min(mn, t); qs += imageFlux(t, cfg.mode, settings, cfg.h).q; }
    const tAvg = sum / n, q = qs / n; return { tAvg, tMin: mn, q, u: q / Math.max(settings.tIn - settings.tOut, 0.1) };
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
      const label = `#${l.id} ${fmt(l.q, 1)} W/m²`; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(r.x0, r.y0 - 16 / view.s, g.measureText(label).width + 6 / view.s, 16 / view.s);
      g.fillStyle = '#0ff'; g.fillText(label, r.x0 + 3 / view.s, r.y0 - 4 / view.s);
    }
    if (drag) { g.strokeStyle = '#fff'; g.setLineDash([4 / view.s]); g.strokeRect(drag.x0, drag.y0, drag.x1 - drag.x0, drag.y1 - drag.y0); }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }, [view, locks, drag, loaded]);

  const lock = (r: Rect) => setLocks((ls) => [...ls, { id: (ls[ls.length - 1]?.id ?? 0) + 1, rect: { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) }, ...stats(r) }]);
  // re-evaluate locks when calibration changes
  useEffect(() => { setLocks((ls) => ls.map((l) => ({ ...l, ...stats(l.rect) }))); }, [cfg, settings]); // eslint-disable-line

  const pos = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const zoomAt = (cx: number, cy: number, f: number) => setView((v) => { const s = Math.max(0.2, Math.min(40, v.s * f)); const k = s / v.s; return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }; });
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId); const p = pos(e); ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) { last.current = p; if (tool === 'region') { const q = toImg(p.x, p.y); setDrag({ x0: q.x | 0, y0: q.y | 0, x1: q.x | 0, y1: q.y | 0 }); } }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pos(e); if (img.current) { const q = toImg(p.x, p.y); const d = img.current; if (q.x >= 0 && q.y >= 0 && q.x < d.width && q.y < d.height) { const t = tempAt(q.x, q.y); setHover({ t, q: imageFlux(t, cfg.mode, settings, cfg.h).q }); } else setHover(null); }
    if (!ptrs.current.has(e.pointerId)) return; ptrs.current.set(e.pointerId, p);
    const ps = [...ptrs.current.values()];
    if (ps.length === 2) { // pinch
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), m = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      if (last.current?.d) zoomAt(m.x, m.y, d / last.current.d); last.current = { ...m, d }; setDrag(null); return;
    }
    if (drag) { const q = toImg(p.x, p.y); setDrag({ ...drag, x1: q.x | 0, y1: q.y | 0 }); return; }
    if (tool === 'pan' && last.current) { const dx = p.x - last.current.x, dy = p.y - last.current.y; setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })); last.current = p; }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasSingle = ptrs.current.size === 1; ptrs.current.delete(e.pointerId); last.current = null;
    if (!wasSingle) return;
    if (drag) { if (Math.abs(drag.x1 - drag.x0) > 2 && Math.abs(drag.y1 - drag.y0) > 2) lock(drag); setDrag(null); }
    else if (tool === 'point') { const q = toImg(pos(e).x, pos(e).y); lock({ x0: (q.x | 0) - 3, y0: (q.y | 0) - 3, x1: (q.x | 0) + 3, y1: (q.y | 0) + 3 }); }
  };
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e) => { e.preventDefault(); const b = cv.current!.getBoundingClientRect(); zoomAt(e.clientX - b.left, e.clientY - b.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  useEffect(() => { const c = cv.current!; const h = (e: WheelEvent) => wheel.current(e); c.addEventListener('wheel', h, { passive: false }); return () => c.removeEventListener('wheel', h); }, []);
  const vr = loaded ? visible() : null, vs = vr && vr.x1 > vr.x0 ? stats(vr) : null;
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });

  return (
    <div className="viewer">
      <div className="toolbar">
        {(['pan', 'point', 'region'] as const).map((t) => <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>{t === 'pan' ? '✋ Pan' : t === 'point' ? '⊕ Point' : '▭ Region'}</button>)}
        <button onClick={() => zoomAt(cv.current!.width / 2, cv.current!.height / 2, 1.5)}>＋</button>
        <button onClick={() => zoomAt(cv.current!.width / 2, cv.current!.height / 2, 1 / 1.5)}>－</button>
        <button onClick={fit}>Fit</button>
        <button onClick={() => setLocks([])}>Clear locks</button>
        <label className="file">Load image… <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSrc(URL.createObjectURL(f)); }} /></label>
        <button onClick={() => setSrc(SAMPLE)}>Sample</button>
      </div>
      <div className="vwrap">
        <canvas ref={cv} className="tcanvas" style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover(null)} />
        <div className="overlay">
          <div className="big">{vs ? fmt(vs.q, 1) : '–'} <small>W/m²</small></div>
          <div>visible region · zoom {fmt(view.s, 2)}×</div>
          {vs && <div>T̄ {fmt(vs.tAvg, 1)} °C · min {fmt(vs.tMin, 1)} °C · U≈{fmt(vs.u, 2)}</div>}
          {hover && <div className="hov">cursor: {fmt(hover.t, 1)} °C → {fmt(hover.q, 1)} W/m²</div>}
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Calibration</h3>
          <div className="form">
            <label>Palette<select value={cfg.palette} onChange={(e) => set({ palette: e.target.value as PaletteName })}><option value="ironbow">Ironbow</option><option value="rainbow">Rainbow</option></select></label>
            <label>Scale min °C<input type="number" step="0.5" value={cfg.tMin} onChange={(e) => set({ tMin: +e.target.value })} /></label>
            <label>Scale max °C<input type="number" step="0.5" value={cfg.tMax} onChange={(e) => set({ tMax: +e.target.value })} /></label>
            <label>Shot<select value={cfg.mode} onChange={(e) => { const m = e.target.value as Cfg['mode']; set({ mode: m, h: m === 'interior' ? H_INT : H_EXT }); }}><option value="interior">Interior surface</option><option value="exterior">Exterior surface</option></select></label>
            <label>h (W/m²K)<input type="number" step="0.1" value={cfg.h} onChange={(e) => set({ h: +e.target.value })} /></label>
            <label>T air in / out<span>{settings.tIn} / {settings.tOut} °C (from Profile)</span></label>
          </div>
          <p className="note">{cfg.mode === 'interior' ? <>q = h<sub>i</sub>·(T<sub>air,in</sub> − T<sub>surface</sub>), h<sub>i</sub> ≈ 7.7 W/m²K (R<sub>si</sub> = 0.13, EN ISO 6946).</> : <>q = h<sub>e</sub>·(T<sub>surface</sub> − T<sub>out</sub>), h<sub>e</sub> ≈ 25 W/m²K (R<sub>se</sub> = 0.04). Very sensitive to wind and sky radiation; prefer interior shots.</>} Implied U = q/(T<sub>in</sub>−T<sub>out</sub>). Temperatures come from matching each pixel's colour to the palette between the min/max you set, so match these to the camera's scale bar. Emissivity, reflections and radiators (hot spots → 0 W/m²) aren't corrected. Treat values as indicative, ±30% or worse.</p>
        </div>
        <div className="card">
          <h3>Locked regions</h3>
          {locks.length === 0 ? <p className="note">Choose ⊕ Point and click, or ▭ Region and drag, to lock a local W/m² estimate.</p> :
            <table><thead><tr><th>#</th><th>T̄ °C</th><th>T min</th><th>W/m²</th><th>U≈</th><th></th></tr></thead><tbody>
              {locks.map((l) => <tr key={l.id}><td>{l.id}</td><td>{fmt(l.tAvg, 1)}</td><td>{fmt(l.tMin, 1)}</td><td><b>{fmt(l.q, 1)}</b></td><td>{fmt(l.u, 2)}</td><td><button className="x" onClick={() => setLocks(locks.filter((x) => x !== l))}>×</button></td></tr>)}
            </tbody></table>}
        </div>
      </div>
    </div>
  );
}
