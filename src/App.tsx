import { useEffect, useState } from 'react';
import { download, shareFile } from './lib/share';
import Viewer from './components/Viewer';
import { LOCATIONS, PRICE_DEFAULT, kGrade, CO2_PRESETS, co2Factor, type Measure, U_PRESETS, U_REF, applyMeasures, flux, measures, score, surfaceScore, totals, annualKwh, type Currency, type House, type Surface, type SurfaceType } from './lib/physics';
import { demoHouse, fmt, uid, usePersisted } from './lib/store';

const TABS = ['Dashboard', 'Thermal camera', 'House profile', 'Fix first', 'Report'] as const;
const scoreColor = (s: number) => (s >= 80 ? '#2e9e5b' : s >= 55 ? '#d9a21b' : '#d64933');

export default function App() {
  const [house, setHouse] = usePersisted<House>('hh.house.v3', demoHouse);
  const [selIds, setSelIds] = usePersisted<string[] | null>('hh.sel', () => null);
  const [tab, setTab] = usePersisted<(typeof TABS)[number]>('hh.tab', () => 'Dashboard');
  useEffect(() => { const h = decodeURIComponent(location.hash.slice(1)).toLowerCase(); const m = TABS.find((t) => t.toLowerCase().startsWith(h)); if (h && m) setTab(m); }, []); // eslint-disable-line
  return (
    <div className="app">
      <header><div className="logo">◧ House Health</div><div className="sub">{house.name} · heat loss in W/m²</div>
        <nav>{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav></header>
      <main>
        {tab === 'Dashboard' && <Dashboard house={house} go={setTab} selIds={selIds} />}
        {tab === 'Thermal camera' && <Viewer settings={house.settings} house={house} setHouse={setHouse} />}
        {tab === 'House profile' && <Profile house={house} setHouse={setHouse} />}
        {tab === 'Fix first' && <FixFirst house={house} setHouse={setHouse} selIds={selIds} setSelIds={setSelIds} />}
        {tab === 'Report' && <Report house={house} selIds={selIds} />}
      </main>
      <footer>Steady-state transmission model (EN ISO 13790/6946 simplified). Excludes ventilation, infiltration, solar and internal gains. Data is stored only in this browser.</footer>
    </div>
  );
}

function Kpi({ label, value, unit, big }: { label: string; value: string; unit: string; big?: boolean }) {
  return <div className={'kpi' + (big ? ' primary' : '')}><div className="kl">{label}</div><div className="kv">{value} <span>{unit}</span></div></div>;
}

function Dashboard({ house, go, selIds }: { house: House; go: (t: (typeof TABS)[number]) => void; selIds: string[] | null }) {
  const t = totals(house), sc = score(house), ms = measures(house), cur = house.settings.currency, pl = plan(house, selIds);
  return (<>
    <div className="kpis">
      <div className="kpi score" style={{ borderColor: scoreColor(sc.total) }}><div className="kl">House-health score</div><div className="kv" style={{ color: scoreColor(sc.total) }}>{sc.total}<span>/100</span></div></div>
      <Kpi big label={`Avg. envelope heat loss @ ΔT ${house.settings.tIn - house.settings.tOut} K`} value={fmt(t.wpm2, 1)} unit="W/m²" />
      <Kpi label="Heat loss now" value={fmt(t.watts / 1000, 2)} unit="kW" />
      <Kpi label="Annual transmission energy" value={fmt(t.kwh)} unit="kWh/yr" />
      <Kpi label="Annual cost" value={fmt(t.cost)} unit={cur + '/yr'} />
    </div>
    <div className="grid2">
      <div className="card"><h3>Score breakdown</h3>
        {sc.parts.map((p) => <div key={p.type} className="bar"><span className="bl">{p.type}</span>
          <div className="track"><div style={{ width: p.score + '%', background: scoreColor(p.score) }} /></div>
          <span className="bv">{p.score}</span><span className="bs">{fmt(p.uAvg * (house.settings.tIn - house.settings.tOut), 1)} W/m² · {fmt(p.share * 100)}% of loss</span></div>)}
        <p className="note">Each category scores 100 at or below the TEK17 U-value limit and falls as (U<sub>ref</sub>/U)<sup>0.6</sup>. The total is weighted by each category's share of heat loss.</p>
      </div>
      <div className="card"><h3>Top issues</h3>
        <table><thead><tr><th>Surface</th><th>W/m²</th><th>Saves</th><th>Payback</th></tr></thead><tbody>
          {ms.slice(0, 5).map((m) => <tr key={m.id}><td>{m.room}: {m.type}<div className="dim">{m.label}</div></td><td>{fmt(m.uBefore * (house.settings.tIn - house.settings.tOut), 1)}</td><td>{fmt(m.moneySaved)} {cur}/yr</td><td>{fmt(m.payback, 1)} yr</td></tr>)}
        </tbody></table>
        {ms.length === 0 && <p className="note">No major issues. The envelope is near TEK17 level.</p>}
        <div className="co2sum" data-testid="co2-dash"><b>Climate account:</b> today ≈ {fmt(t.kwh * co2Factor(house.settings) / 1000, 2)} t CO₂e/yr. The selected retrofit ({pl.chosen.length} measures) saves <b>{fmt(pl.co2Year, 2)} t CO₂e/yr</b> and <b>{fmt(pl.co2Life, 1)} t</b> over its lifetime, at {fmt(co2Factor(house.settings) * 1000, 1)} g/kWh.</div>
        <button className="link" onClick={() => go('Fix first')}>Full retrofit plan →</button>
        <button className="link" onClick={() => go('Report')}>Printable report →</button>
        <button className="link" onClick={() => go('Thermal camera')}>Inspect thermal image →</button>
      </div>
    </div>
  </>);
}

function Profile({ house, setHouse }: { house: House; setHouse: (h: House) => void }) {
  const s = house.settings, t = totals(house);
  const setS = (p: Partial<House['settings']>) => setHouse({ ...house, settings: { ...s, ...p } });
  const upd = (rid: string, f: (ss: Surface[]) => Surface[]) => setHouse({ ...house, rooms: house.rooms.map((r) => (r.id === rid ? { ...r, surfaces: f(r.surfaces) } : r)) });
  return (<>
    <div className="card"><h3>Climate & price</h3><div className="form">
      <label>House name<input value={house.name} onChange={(e) => setHouse({ ...house, name: e.target.value })} /></label>
      <label>Location<select value={s.location} onChange={(e) => { const l = LOCATIONS[e.target.value]; setS({ location: e.target.value, degreeDays: l.dd }); }}>{Object.keys(LOCATIONS).map((l) => <option key={l}>{l}</option>)}</select></label>
      <label>Indoor °C<input type="number" value={s.tIn} onChange={(e) => setS({ tIn: +e.target.value })} /></label>
      <label>Outdoor °C (now)<input type="number" value={s.tOut} onChange={(e) => setS({ tOut: +e.target.value })} /></label>
      <label>Degree-days (Kd/yr)<input type="number" value={s.degreeDays} onChange={(e) => setS({ degreeDays: +e.target.value, location: 'Custom' })} /></label>
      <label>Currency<select value={s.currency} onChange={(e) => { const c = e.target.value as Currency; setS({ currency: c, price: PRICE_DEFAULT[c] }); }}><option>NOK</option><option>EUR</option></select></label>
      <label>Price ({s.currency}/kWh)<input type="number" step="0.01" value={s.price} onChange={(e) => setS({ price: +e.target.value })} /></label>
      <label>&nbsp;<button onClick={() => confirm('Replace profile with demo data?') && setHouse(demoHouse())}>Reset to demo</button></label>
    </div></div>
    {house.rooms.map((r) => (
      <div className="card" key={r.id}>
        <div className="rowh"><input className="rname" value={r.name} onChange={(e) => setHouse({ ...house, rooms: house.rooms.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })} />
          <button className="x" onClick={() => setHouse({ ...house, rooms: house.rooms.filter((x) => x.id !== r.id) })}>Remove room</button></div>
        <table><thead><tr><th>Surface</th><th>Type</th><th>Area m²</th><th>U preset</th><th>U W/m²K</th><th>W/m²</th><th>W</th><th>kWh/yr</th><th>Score</th><th></th></tr></thead><tbody>
          {r.surfaces.map((sf) => { const set = (p: Partial<Surface>) => upd(r.id, (ss) => ss.map((x) => (x.id === sf.id ? { ...x, ...p } : x))); return (
            <tr key={sf.id}>
              <td><input value={sf.name} onChange={(e) => set({ name: e.target.value })} /></td>
              <td><select value={sf.type} onChange={(e) => { const ty = e.target.value as SurfaceType; set({ type: ty, u: U_PRESETS[ty][1].u }); }}>{Object.keys(U_REF).map((k) => <option key={k}>{k}</option>)}</select></td>
              <td><input className="num" type="number" step="0.5" value={sf.area} onChange={(e) => set({ area: +e.target.value })} /></td>
              <td><select value="" onChange={(e) => e.target.value && set({ u: +e.target.value })}><option value="">choose…</option>{U_PRESETS[sf.type].map((p) => <option key={p.label} value={p.u}>{p.label} ({p.u})</option>)}</select></td>
              <td><input className="num" type="number" step="0.01" value={sf.u} onChange={(e) => set({ u: +e.target.value })} /></td>
              <td><b>{fmt(flux(sf.u, s), 1)}</b>{sf.type === 'window' && <div className="dim">k {kGrade(sf.u)}</div>}</td><td>{fmt(flux(sf.u, s) * sf.area)}</td><td>{fmt(annualKwh(sf.u, sf.area, s.degreeDays))}</td>
              <td style={{ color: scoreColor(surfaceScore(sf)) }}>{surfaceScore(sf)}</td>
              <td><button className="x" onClick={() => upd(r.id, (ss) => ss.filter((x) => x !== sf))}>×</button></td></tr>); })}
        </tbody></table>
        <button onClick={() => upd(r.id, (ss) => [...ss, { id: uid(), name: 'New surface', type: 'wall', area: 10, u: 0.4 }])}>+ Surface</button>
      </div>))}
    <button onClick={() => setHouse({ ...house, rooms: [...house.rooms, { id: uid(), name: 'New room', surfaces: [] }] })}>+ Room</button>
    <div className="card"><h3>Whole house</h3><p>Envelope {fmt(t.area)} m² · UA {fmt(t.ua, 1)} W/K · <b>{fmt(t.wpm2, 1)} W/m²</b> · {fmt(t.watts)} W at ΔT {s.tIn - s.tOut} K · {fmt(t.kwh)} kWh/yr · {fmt(t.cost)} {s.currency}/yr</p></div>
  </>);
}

function plan(house: House, selIds: string[] | null) {
  const ms = measures(house), sel = new Set(selIds ?? ms.slice(0, 3).map((m) => m.id));
  const chosen = ms.filter((m) => sel.has(m.id)), after = applyMeasures(house, chosen);
  const inv = chosen.reduce((x, m) => x + m.cost, 0), co2Year = chosen.reduce((x, m) => x + m.co2Year, 0), co2Life = chosen.reduce((x, m) => x + m.co2Life, 0);
  return { ms, sel, chosen, after, inv, co2Year, co2Life, b: totals(house), a: totals(after), sb: score(house).total, sa: score(after).total };
}
/** kg CO₂e saved over lifetime per 1000 currency units invested. */
const perK = (m: { co2Life: number; cost: number }) => (m.cost > 0 ? (m.co2Life * 1000) / (m.cost / 1000) : 0);

function Co2Select({ house, setHouse }: { house: House; setHouse: (h: House) => void }) {
  const s = house.settings, id = s.co2Preset ?? 'no-nve';
  return <div className="form co2sel">
    <label>Emission factor preset<select data-testid="co2-preset" value={id} onChange={(e) => { const p = CO2_PRESETS.find((x) => x.id === e.target.value)!; setHouse({ ...house, settings: { ...s, co2Preset: p.id, co2: p.id === 'custom' ? co2Factor(s) : p.kg } }); }}>{CO2_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}{p.id !== 'custom' ? ` · ${p.kg}` : ''}</option>)}</select></label>
    <label>kg CO₂e / kWh<input type="number" step="0.001" value={co2Factor(s)} onChange={(e) => setHouse({ ...house, settings: { ...s, co2Preset: 'custom', co2: +e.target.value } })} /></label>
  </div>;
}

function BeforeAfter({ house, pl }: { house: House; pl: ReturnType<typeof plan> }) {
  const { b, a, sb, sa, inv } = pl, cur = house.settings.currency, f = co2Factor(house.settings);
  return <>
    <table className="ba"><thead><tr><th></th><th>Score</th><th>W/m²</th><th>kW now</th><th>kWh/yr</th><th>{cur}/yr</th><th>t CO₂e/yr</th></tr></thead><tbody>
      <tr><td>Before</td><td>{sb}</td><td>{fmt(b.wpm2, 1)}</td><td>{fmt(b.watts / 1000, 2)}</td><td>{fmt(b.kwh)}</td><td>{fmt(b.cost)}</td><td>{fmt(b.kwh * f / 1000, 2)}</td></tr>
      <tr><td>After</td><td><b>{sa}</b></td><td><b>{fmt(a.wpm2, 1)}</b></td><td>{fmt(a.watts / 1000, 2)}</td><td>{fmt(a.kwh)}</td><td>{fmt(a.cost)}</td><td>{fmt(a.kwh * f / 1000, 2)}</td></tr>
      <tr className="dim"><td>Change</td><td>+{sa - sb}</td><td>−{fmt(b.wpm2 - a.wpm2, 1)}</td><td>−{fmt((b.watts - a.watts) / 1000, 2)}</td><td>−{fmt(b.kwh - a.kwh)}</td><td>−{fmt(b.cost - a.cost)}</td><td>−{fmt(pl.co2Year, 2)}</td></tr>
    </tbody></table>
    <p data-testid="co2-total">Investment ≈ <b>{fmt(inv)} {cur}</b> · simple payback <b>{fmt(inv / Math.max(b.cost - a.cost, 1e-6), 1)} yr</b> · CO₂ saved <b>{fmt(pl.co2Year, 2)} t/yr</b>, <b>{fmt(pl.co2Life, 1)} t over the measures' lifetimes</b> · {fmt(perK({ co2Life: pl.co2Life, cost: inv }), 1)} kg CO₂e per 1000 {cur} invested</p>
  </>;
}

function MeasureTable({ house, pl, toggle }: { house: House; pl: ReturnType<typeof plan>; toggle?: (m: Measure) => void }) {
  const cur = house.settings.currency, dt = house.settings.tIn - house.settings.tOut, rows = toggle ? pl.ms : pl.chosen;
  return <table><thead><tr>{toggle && <th></th>}<th>#</th><th>Measure</th><th>Where</th><th>m²</th><th>U → U'</th><th>W/m² →</th><th>kWh/yr saved</th><th>{cur}/yr saved</th><th>Cost {cur}</th><th>Payback</th><th>t CO₂e/yr</th><th>Life yr</th><th>t CO₂e life</th><th>kg/1000 {cur}</th>{toggle && <th>Effort</th>}</tr></thead><tbody>
    {rows.map((m, i) => <tr key={m.id}>{toggle && <td><input type="checkbox" checked={pl.sel.has(m.id)} onChange={() => toggle(m)} /></td>}
      <td>{i + 1}</td><td>{m.label}</td><td>{m.room}</td><td>{fmt(m.area, 1)}</td><td>{fmt(m.uBefore, 2)} → {fmt(m.uAfter, 2)}</td><td>{fmt(m.uBefore * dt, 1)} → {fmt(m.uAfter * dt, 1)}</td>
      <td>{fmt(m.kwhSaved)}</td><td><b>{fmt(m.moneySaved)}</b></td><td>{fmt(m.cost)}</td><td>{fmt(m.payback, 1)} yr</td><td>{fmt(m.co2Year, 3)}</td><td>{m.life}</td><td>{fmt(m.co2Life, 2)}</td><td>{fmt(perK(m), 1)}</td>{toggle && <td>{'●'.repeat(m.effort)}{'○'.repeat(3 - m.effort)}</td>}</tr>)}
  </tbody></table>;
}

function FixFirst({ house, setHouse, selIds, setSelIds }: { house: House; setHouse: (h: House) => void; selIds: string[] | null; setSelIds: (s: string[]) => void }) {
  const pl = plan(house, selIds);
  const toggle = (m: Measure) => { const n = new Set(pl.sel); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); setSelIds([...n]); };
  return (<>
    <div className="card"><h3>Before / after the selected retrofit</h3><BeforeAfter house={house} pl={pl} /></div>
    <div className="card"><h3>Climate account (klimaregnskap)</h3><Co2Select house={house} setHouse={setHouse} />
      <p className="note">CO₂ saved = kWh saved × emission factor. Lifetime = annual × assumed service life (insulation 40 yr, windows/doors 30 yr). Embodied emissions of the materials are not subtracted. With Norwegian grid electricity (~12 g/kWh), the climate benefit is small. If the saved kWh displace imported or fossil power at the margin, it is much larger, so try the other presets.</p></div>
    <div className="card"><h3>Prioritised measures (savings ÷ cost ÷ effort)</h3>
      <MeasureTable house={house} pl={pl} toggle={toggle} />
      <p className="note">Costs are rough Norwegian installed prices (NOK/m²: attic 450, floor 900, external wall 1800, windows 8000, doors 7000). Insulation λ = 0.037 W/mK. Enova grants aren't included. Get local quotes before you decide.</p></div>
  </>);
}

function Report({ house, selIds }: { house: House; selIds: string[] | null }) {
  const pl = plan(house, selIds), sc = score(house), s = house.settings, t = pl.b, [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pdf = async () => { setMsg({ ok: true, text: 'Generating PDF…' }); const { buildReportPdf } = await import('./lib/pdf'); const f = await buildReportPdf(house, pl, sc); (window as unknown as { __hhLastShare?: File }).__hhLastShare = f; return f; };
  const summary = () => `House Health: score ${sc.total}/100, ${fmt(t.wpm2, 1)} W/m², ${fmt(t.kwh)} kWh/yr, ${fmt(t.cost)} ${s.currency}/yr. Selected retrofit saves ${fmt(t.cost - pl.a.cost)} ${s.currency}/yr and ${fmt(pl.co2Year, 2)} t CO₂e/yr (${fmt(pl.co2Life, 1)} t over its lifetime).`;
  const onShare = async () => { try { const f = await pdf(); setMsg(await shareFile(f, 'House Health report', summary())); } catch (e) { setMsg({ ok: false, text: 'Could not create the PDF: ' + (e as Error).message }); } };
  const onDownload = async () => { try { const f = await pdf(); download(f); setMsg({ ok: true, text: `Downloaded ${f.name}.` }); } catch (e) { setMsg({ ok: false, text: 'Could not create the PDF: ' + (e as Error).message }); } };
  return <div className="report" data-testid="report">
    <div className="noprint toolbar"><button className="on" data-testid="share-report" onClick={onShare}>📤 Share report (PDF)</button><button data-testid="download-pdf" onClick={onDownload}>⬇ Download PDF</button><button onClick={() => window.print()}>🖨 Print</button></div>
    {msg && <div className={'noprint photomsg ' + (msg.ok ? 'ok' : 'err')} role="status" data-testid="report-msg">{msg.text}</div>}
    <h1>House Health report</h1>
    <p className="dim">{house.name} · {s.location}, {s.degreeDays} degree-days · indoor {s.tIn} °C / outdoor {s.tOut} °C · {s.price} {s.currency}/kWh · {fmt(co2Factor(s) * 1000, 1)} g CO₂e/kWh · {new Date().toLocaleDateString()}</p>
    <div className="kpis"><Kpi label="Health score" value={String(sc.total)} unit="/100" /><Kpi big label="Avg. envelope heat loss" value={fmt(t.wpm2, 1)} unit="W/m²" /><Kpi label="Annual energy" value={fmt(t.kwh)} unit="kWh/yr" /><Kpi label="Annual cost" value={fmt(t.cost)} unit={s.currency + '/yr'} /><Kpi label="Emissions" value={fmt(t.kwh * co2Factor(s) / 1000, 2)} unit="t CO₂e/yr" /></div>
    <h2>Score breakdown</h2>
    <table><thead><tr><th>Category</th><th>Score</th><th>Avg U</th><th>W/m²</th><th>Share of loss</th></tr></thead><tbody>{sc.parts.map((p) => <tr key={p.type}><td>{p.type}</td><td>{p.score}</td><td>{fmt(p.uAvg, 2)}</td><td>{fmt(p.uAvg * (s.tIn - s.tOut), 1)}</td><td>{fmt(p.share * 100)}%</td></tr>)}</tbody></table>
    <h2>Selected retrofit: before / after</h2><BeforeAfter house={house} pl={pl} />
    <h2>Selected measures, incl. climate account</h2><MeasureTable house={house} pl={pl} />
    <p className="note">Steady-state transmission model (ISO 6946 / degree-days). Ventilation, infiltration and solar/internal gains are excluded. Costs are rough estimates. CO₂ uses the emission factor shown above and assumed service lives, and excludes embodied emissions. This is an engineering note, not an official energy certificate (energiattest).</p>
  </div>;
}
