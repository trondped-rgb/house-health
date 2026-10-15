import { layersU, type Layer, type SpotType } from './construction';
import { fmt } from './store';

export interface SpotInfo { type?: SpotType; layers: Layer[]; uKnown?: number; uSource: 'known' | 'layers'; area?: number; tIn?: number; tOut?: number; eps?: number; notes?: string }
export interface SpotResult { tApp: number; tSurf: number; q: number; tIn: number; tOut: number; hint?: string | null }

export function spotU(info: SpotInfo) {
  const fromLayers = layersU(info.layers, info.type ?? 'wall');
  if (info.uSource === 'layers' && fromLayers) return { u: fromLayers.U, src: `layers (R ${fmt(fromLayers.R, 2)} m²K/W)` };
  if (info.uKnown && info.uKnown > 0) return { u: info.uKnown, src: 'known U' };
  if (fromLayers) return { u: fromLayers.U, src: `layers (R ${fmt(fromLayers.R, 2)} m²K/W)` };
  return null;
}

