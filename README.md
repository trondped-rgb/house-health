# House Health: heat loss in W/m²

A browser app for homeowners and environmental engineers who want to check a house's health: thermal-camera analysis, envelope heat loss, annual energy use, cost, and a ranked retrofit plan. **W/m² is the primary output everywhere.** Everything is stored in your browser (localStorage). There's no backend.

```bash
npm install && npm run dev      # http://localhost:5173
npm run build                   # production build in dist/
node scripts/gen-sample.mjs     # regenerate the bundled sample thermal image
```

Deep links: `#thermal`, `#house`, `#fix`, `#dashboard`.

## Features
- **Dashboard**: house-health score (0–100), average envelope W/m², design kW, annual kWh, annual cost, score breakdown, top issues.
- **Thermal camera**: load any ironbow/rainbow thermal JPG/PNG (a generated sample is bundled). Zoom with the scroll wheel, pinch or the +/− buttons, and pan by dragging. A live overlay shows the W/m² for the **visible region**, along with the mean and minimum °C and implied U. Use **Point** (click) or **Region** (drag a box) to lock local W/m² estimates.
- **House profile**: rooms → surfaces (wall/window/roof/floor/door), area, U-value presets (Norwegian building eras → TEK17), indoor and design outdoor temperature, degree-days by city, and price in NOK (default 1.50/kWh) or EUR.
- **Fix first**: retrofit measures ranked by savings ÷ cost ÷ effort, with a before/after scenario for the measures you select (score, W/m², kW, kWh, cost, investment, payback).

## Settings aligned with Thermetric
As of v0.2, the defaults and formulas match [Thermetric](https://frost-maple-moon-raven.grok.me/physics) (Heatseeker Play / Heatseeker House):
- Exterior thermal shot: q = h·(T_se − T_e) − α·I, with h = 25 W/m²K (ISO 6946) and α = 0.5 (solar irradiance I on the wall, default 0). This is now the default shot type.
- Pixel → °C: Rec.709 luminance L = 0.2126R + 0.7152G + 0.0722B, then T = T_min + L·(T_max − T_min). The default scale is −2…10 °C. The ironbow stops are Thermetric's. Palette colour matching is kept as an option.
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
1. **Pixel → temperature.** By default t is the Rec.709 luminance (Thermetric). Optionally, t comes from the nearest entry of a 256-step ironbow or rainbow palette. Then T = T_min + t·(T_max − T_min), where you set T_min and T_max to match the camera's scale bar. Embedded radiometric data isn't read.
2. **Interior shot.** q = h_i · (T_air,in − T_surface), with h_i = 7.7 W/m²K (R_si = 0.13 m²K/W, EN ISO 6946; combined convection and radiation).
3. **Exterior shot (default).** q = h · (T_se − T_e) − α·I, with h = 25 W/m²K and α = 0.5. This is sensitive to wind, rain, sun and sky reflection.
4. **Implied U-value.** U ≈ q / (T_in − T_out). Region values are the mean of per-pixel q. Pixels warmer than the air (radiators) give 0.
5. Emissivity (taken as camera-corrected, ε ≈ 0.95), reflections, non-steady conditions and JPEG colour artefacts aren't corrected. Expect ±30% or worse. For reliable results, shoot with ΔT ≥ 10 K, no sun, and stable heating for several hours.

### House-health score
Per category: s = 100 · min(1, (U_ref / U_avg)^0.6), where U_ref is the TEK17 limit (wall 0.18, roof 0.13, floor 0.10, window/door 0.80 W/m²K). The total is the average of the category scores, weighted by each category's share of UA.

### Retrofit ranking
New U for added insulation: U' = 1 / (1/U + d/λ), with λ = 0.037 W/mK (attic +20 cm, wall +10 cm, floor +10 cm). Windows and doors go to U 0.8. Savings = (U − U')·A·DD·24/1000 · price. Rough installed costs in NOK/m²: attic 450, floor 900, wall 1800, window 8000, door 7000 (converted at 11.5 NOK/EUR). Priority = savings / (cost · effort), with effort from 1 to 3. Enova support isn't included.

## Tech
Vite + React + TypeScript with no runtime dependencies besides React. A ready-made GitHub Actions Pages workflow is in `docs/deploy.yml.example`. Live site: https://trondped-rgb.github.io/house-health/ (published from the `gh-pages` branch: `npm run build`, then push `dist/` to `gh-pages`, e.g. `npx gh-pages -d dist`).
