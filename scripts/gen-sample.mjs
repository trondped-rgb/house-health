// Generates public/sample-thermal.png: EXTERIOR winter view of a wall (Thermetric default scale −2..10 °C,
// outdoor 0 °C, indoor 21 °C): insulated wall, double-glazed window, warm frame leak, slab-edge bridge.
import { writeFileSync, mkdirSync } from 'fs'; import zlib from 'zlib';
// Thermetric ironbow stops. Colour is palette-linear in T, as real camera ironbow images are.
const STOPS = [[0,0,0,4],[0.08,18,0,48],[0.18,64,0,112],[0.32,132,8,128],[0.46,188,22,58],[0.6,228,72,8],[0.74,248,148,4],[0.86,255,214,48],[1,255,252,224]];
const ib = t => { t = Math.max(0, Math.min(1, t)); for (let i = 1; i < STOPS.length; i++) { const [p1,r1,g1,b1]=STOPS[i],[p0,r0,g0,b0]=STOPS[i-1]; if (t<=p1){const f=(t-p0)/(p1-p0);return [r0+f*(r1-r0),g0+f*(g1-g0),b0+f*(b1-b0)].map(Math.round);} } return [255,252,224]; };
const lum = c => (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255;
const LUT = Array.from({length:1024},(_,i)=>ib(i/1023)); const LL = LUT.map(lum);
const forLum = L => { let b=0,bd=9; for (let i=0;i<LUT.length;i++){const d=Math.abs(LL[i]-L); if(d<bd){bd=d;b=i;}} return LUT[b]; };
const W = 640, H = 480, TMIN = -2, TMAX = 10;
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
// Exterior surface temps: Tse = Te + (U/h)·(Ti − Te), Ti = 21, Te = 0.
// True calm-night film coefficient (ISO 6946 Annex C, v = 0.5 m/s): h ≈ 10.4 W/m²K.
const H_TRUE = 4 + 4 * 0.5 + 4 * 0.95 * 5.67e-8 * 274.15 ** 3;
const tse = u => (u / H_TRUE) * 21;
const temp = (x, y) => {
  let T = tse(0.4);                                   // 1970s wall ≈ 0.8 °C → 8.4 W/m²
  T += 2.2 * Math.exp(-(H - y) / 22);                 // slab-edge thermal bridge
  const cx = Math.min(x, W - x); T += 0.6 * Math.exp(-cx / 30); // corners
  const wx0 = 220, wx1 = 440, wy0 = 110, wy1 = 300;
  if (x > wx0 && x < wx1 && y > wy0 && y < wy1) {
    T = tse(2.8);                                     // old double glazing ≈ 5.6 °C → 58.8 W/m²
    if (x < wx0 + 14 || x > wx1 - 14 || y < wy0 + 14 || y > wy1 - 14) T = tse(2.2);
    if (y < wy0 + 40 && x > wx1 - 70) T += 3.5 * Math.exp(-((x - wx1) ** 2 + (y - wy0) ** 2) / 900); // air leak at frame
  } else {
    const d = Math.max(Math.max(wx0 - x, x - wx1, 0), Math.max(wy0 - y, y - wy1, 0));
    T += 1.2 * Math.exp(-d / 12);                     // reveal/lintel bridge
  }
  return T + (rnd() - 0.5) * 0.15;
};
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const [r,g,b] = ib(Math.max(0,Math.min(1,(temp(x,y)-TMIN)/(TMAX-TMIN)))); const o = y*(W*3+1)+1+x*3; raw[o]=r; raw[o+1]=g; raw[o+2]=b; } }
const crcT = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
mkdirSync('public', { recursive: true });
writeFileSync('public/sample-thermal.png', Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote public/sample-thermal.png');
