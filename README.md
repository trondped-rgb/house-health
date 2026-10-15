# House Health: heat loss in W/m²

A browser app for homeowners and environmental engineers who want to check a house's health: thermal-camera analysis, envelope heat loss, annual energy use, cost, and a ranked retrofit plan. **W/m² is the primary output everywhere.** Everything is stored in your browser (localStorage). There's no backend.

```bash
npm install && npm run dev      # http://localhost:5173
npm run build                   # production build in dist/
node scripts/gen-sample.mjs     # regenerate the bundled sample thermal image
```

Deep links: `#thermal`, `#house`, `#fix`, `#dashboard`, `#report`.

## Features
- **Dashboard**: house-health score (0–100), average envelope W/m², design kW, annual kWh, annual cost, score breakdown, top issues.
- **Thermal camera**: load any ironbow/rainbow thermal JPG/PNG (a generated sample is bundled). Zoom with the scroll wheel, pinch or the +/− buttons, and pan by dragging. A live overlay shows the W/m² for the **visible region**, along with the mean and minimum °C and implied U. Use **Point** (click) or **Region** (drag a box) to lock local W/m² estimates.
- **House profile**: rooms → surfaces (wall/window/roof/floor/door), area, U-value presets (Norwegian building eras → TEK17), indoor and design outdoor temperature, degree-days by city, and price in NOK (default 1.50/kWh) or EUR.
- **Fix first**: retrofit measures ranked by savings ÷ cost ÷ effort, with a before/after scenario for the measures you select (score, W/m², kW, kWh, cost, investment, payback).

## Getting photos in (v0.4)
- **Take photo / Choose image** (`<input type="file" accept="image/*">` with no `capture`): iOS and Android offer camera, gallery and files. Thermal-camera apps (FLIR, Topdon, Seek…) save to the gallery, so pick the image from there.
- **Camera only**: the same input with `capture="environment"`, which opens the rear camera directly.
- **Paste image**: uses the clipboard button, or Ctrl+V / long-press → Paste anywhere on the page.
- **Share into House Health** (Web Share Target, `manifest.webmanifest` + `sw.js`, scope `/house-health/`): the service worker receives the POSTed file, stores it in Cache Storage and redirects to `?shared=1#thermal`, where the image loads. This only works after **Add to Home screen** on Android Chrome or Edge. iOS/Safari doesn't support share targets.
- Images are decoded with `createImageBitmap`, falling back to `<img>`, and downscaled to 1280 px. HEIC works only where the browser can decode it (Safari). Elsewhere a clear message suggests JPEG ("Most Compatible"). Files over 60 MB and non-images get a visible error. The input is reset after each pick, so picking the same file twice works.

## v0.3 changes

### Thermal W/m² audit and fix
The old exterior readings used the ISO 6946 design coefficient h = 25 W/m²K (R_se 0.04). That value assumes **4 m/s wind**. On a calm survey night the real exterior film coefficient is much lower, so every kelvin of surface excess was turned into 25 W/m² and readings came out about 2.5× too high. The old default luminance mapping added a second error: ironbow brightness isn't linear in temperature (luminance at palette position 0.46 is only 0.235), so on real ironbow images mid-scale surfaces read up to ~23% of the span too cold. Walls then went below T_e and were silently clamped to 0.

Fixes:
- **Auto h** from ISO 6946 Annex C: h_se = h_c + h_r = (4 + 4·v) + ε·4σT_m³. The default wind is v = 0.5 m/s, giving h ≈ 10.4 W/m²K at 0 °C. The wind speed is an input. Manual h is still available, with a one-click 25 (Thermetric/ISO design value).
- The default pixel → °C mapping is **palette colour match**. Luminance is still available, labelled as suitable only for grayscale or white-hot images.
- The cursor readout averages 5×5 px to suppress noise. The overlay shows the shot type and the h in use.
- Plausibility hints: clipped at the edge of the camera scale; surface on the wrong side of the air temperature (sky radiation, sun or wrong shot type), shown as 0 rather than a negative value; ΔT below 10 K; implied U above 6 W/m²K.
- The sample image is regenerated as a true palette-linear ironbow exterior shot.

Example: Te 0 °C, Ti 21 °C, scale −2…10 °C, true h 10.4. "Before" is v0.2; "after" is v0.3 with default settings.

| Surface | True q (U·ΔT) | Before: palette + h 25 | Before: luminance (old default) + h 25 | After |
|---|---|---|---|---|
| Wall U 0.40 | 8.4 | 20.1 | 0 (raw −14.9) | 8.4 |
| Thermal bridge U 1.5 | 31.5 | 75.4 | 14.6 | 31.5 |
| Old double window U 2.8 | 58.8 | 140.8 | 86.3 | 58.8 |
| Single pane U 5.8 | 121.8 | 291.7 | 244.8 | 121.8 (but clipped above 10 °C, so it gets flagged) |

### Tagged thermal spots with construction data
Tap or click the image (or draw a region) to tag a spot. A panel opens, as a bottom sheet on phones. Every field is optional: surface type (incl. thermal bridge), construction layers from a small λ library, known U, area, indoor and outdoor temperature, emissivity, and notes.
- U from layers: **R = R_si + Σ d/λ + R_se**, with R_si 0.13 (horizontal), 0.10 (up/roof), 0.17 (down/floor) and R_se 0.04. An unventilated air gap counts as a fixed R of 0.18. λ values (W/mK): mineral wool 0.037, glass wool 0.035, EPS 0.035, XPS 0.033, PIR 0.022, wood/plywood 0.13, gypsum 0.25, brick 0.77, Leca 0.20, concrete 1.8.
- The panel shows **measured W/m²** next to **expected U·ΔT** and the **implied U = q/ΔT**. Measured/expected > 1.3 flags a likely thermal bridge, missing insulation or air leak. Below 0.7 flags a check of ε, sun or the scale.
- Emissivity correction (the camera is assumed to use ε 0.95): ε_cam·T_a⁴ + (1−ε_cam)·T_r⁴ = ε·T_s⁴ + (1−ε)·T_r⁴, where the reflected temperature is T_out for exterior shots and T_in for interior ones.
- Spots and uploaded photos (downscaled to 1280 px) are saved in localStorage and listed. "Add to house profile" creates a surface (a thermal bridge becomes a wall named "… (thermal bridge)").
- Phone: "📷 Take photo" uses `<input type="file" accept="image/*" capture="environment">`. "Upload…" has no capture attribute. Pinch-zoom and tap work through pointer events.

### Climate account (klimaregnskap)
CO₂ saved per measure = kWh saved × emission factor [kg CO₂e/kWh]. Lifetime CO₂ = annual × assumed service life (insulation 40 yr, windows and doors 30 yr; assumptions). CO₂ per money invested = lifetime kg ÷ (cost / 1000). Embodied emissions of the materials are **not** subtracted. These figures appear in Fix first, in the before/after table, on the dashboard and in the printable **Report** tab (print CSS, A4 landscape).

| Preset | kg CO₂e/kWh | Status / source |
|---|---|---|
| Norwegian electricity, physically delivered (default) | 0.0119 | **Published:** NVE climate declaration for physically delivered electricity 2024, 11.9 g/kWh (2023: 15 g). https://www.nve.no/nytt-fra-nve/nyheter-energi/klimagassutslipp-knyttet-til-norsk-stroemforbruk-gaar-ned/ |
| Nordic electricity mix | 0.09 | Approximate assumption (commonly quoted range 0.08–0.10); not verified |
| European long-term scenario (NS 3720-style) | 0.13 | Approximate assumption (the scenario average used in Norwegian building LCA practice is about 0.13); not verified |
| EU average grid mix | 0.27 | Approximate assumption (range 0.25–0.30); not verified |
| Heating oil, per kWh of fuel | 0.27 | Approximate combustion factor; divide by boiler efficiency for per kWh of heat |
| District heating, Norway avg | 0.10 | Approximate assumption; varies widely by plant |
| Custom | user | |

With a Norwegian grid factor, the CO₂ benefit of saving electricity is small. Marginal or consumption-based views (the other presets) give 7–20× more.

## Settings aligned with Thermetric
As of v0.2, the defaults and formulas match [Thermetric](https://frost-maple-moon-raven.grok.me/physics) (Heatseeker Play / Heatseeker House):
- Exterior thermal shot: q = h·(T_se − T_e) − α·I, with α = 0.5 (solar irradiance I on the wall, default 0). This is the default shot type. v0.2 used Thermetric's h = 25; v0.3 uses an auto h (see above), and 25 is still available as a manual preset.
- Pixel → °C: Thermetric's Rec.709 luminance mapping is still available, but since v0.3 the default is palette colour matching (see audit). The default scale is −2…10 °C. The ironbow stops are Thermetric's.
- Emissivity: the camera's surface temperature is taken as already corrected (ε ≈ 0.95). ε isn't applied again.
- Defaults are indoor 21 °C and outdoor 0 °C (now, not a design temperature). The EUR price is 0.28 EUR/kWh (Thermetric). The default currency is NOK at 1.50 NOK/kWh (House Health choice).
- Degree-days use Thermetric's base-17 °C table: Oslo 4170, Bergen 3280, Stavanger 3210, Kristiansand 3520, Trondheim 4630, Tromsø 5680, plus its other European cities.
- Wall k presets are 2.1 / 1.4 / 0.6 / 0.3 / 0.25 / 0.18. Window presets are 5.8 / 2.8 / 1.4 / 0.8 / 0.5, graded ≤0.5 very good, ≤1 good, ≤1.4 fair, ≤2.8 poor. Door 2.2 and thermal bridge 3.5.
- Normal year: kWh = W / ΔT · HDD · 24 / 1000. This formula was already the same.

House Health's own additions are unchanged: interior mode (h_i 7.7), roof and floor presets, the NOK price (1.50, since Thermetric has none), TEK17 scoring and the retrofit catalogue.

## Formulas & assumptions

### Envelope (house profile)
| Quantity | Formula |
|---|---|
| Heat flux per surface | q = U · ΔT  [W/m²], ΔT = T_in − T_out |
| Heat loss per surface | P = q · A  [W] |
| Whole house | UA = Σ U·A [W/K]; P = UA·ΔT; **avg W/m² = P / ΣA** |
| Annual energy | E = UA · DD · 24 / 1000  [kWh/yr] |
| Cost | E · price |

Degree-days come from the Thermetric table above. These are steady-state transmission losses only. **Ventilation, infiltration, solar and internal gains are excluded**, so real consumption will differ.

### Thermal image → W/m²
1. **Pixel → temperature.** By default t comes from the nearest entry of a 256-step ironbow or rainbow palette. Optionally, t is the Rec.709 luminance (Thermetric). Then T = T_min + t·(T_max − T_min), where you set T_min and T_max to match the camera's scale bar. Embedded radiometric data isn't read.
2. **Interior shot.** q = h_i · (T_air,in − T_surface), with h_i = 7.7 W/m²K (R_si = 0.13 m²K/W, EN ISO 6946; combined convection and radiation).
3. **Exterior shot (default).** q = h · (T_se − T_e) − α·I, with auto h = 4 + 4v + 4εσT_m³ (≈10.4 at 0.5 m/s) and α = 0.5. This is sensitive to wind, rain, sun and sky reflection.
4. **Implied U-value.** U ≈ q / (T_in − T_out). Region values are the mean of per-pixel q. Pixels warmer than the air (radiators) give 0.
5. Emissivity (taken as camera-corrected, ε ≈ 0.95), reflections, non-steady conditions and JPEG colour artefacts aren't corrected. Expect ±30% or worse. For reliable results, shoot with ΔT ≥ 10 K, no sun, and stable heating for several hours.

### House-health score
Per category: s = 100 · min(1, (U_ref / U_avg)^0.6), where U_ref is the TEK17 limit (wall 0.18, roof 0.13, floor 0.10, window/door 0.80 W/m²K). The total is the average of the category scores, weighted by each category's share of UA.

### Retrofit ranking
New U for added insulation: U' = 1 / (1/U + d/λ), with λ = 0.037 W/mK (attic +20 cm, wall +10 cm, floor +10 cm). Windows and doors go to U 0.8. Savings = (U − U')·A·DD·24/1000 · price. Rough installed costs in NOK/m²: attic 450, floor 900, wall 1800, window 8000, door 7000 (converted at 11.5 NOK/EUR). Priority = savings / (cost · effort), with effort from 1 to 3. Enova support isn't included.

## Tech
Vite + React + TypeScript with no runtime dependencies besides React. A ready-made GitHub Actions Pages workflow is in `docs/deploy.yml.example`. Live site: https://trondped-rgb.github.io/house-health/ (published from the `gh-pages` branch: `npm run build`, then push `dist/` to `gh-pages`, e.g. `npx gh-pages -d dist`).
