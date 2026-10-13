// Generates public/sample-thermal.png: interior view of an exterior wall with a window,
// cold corners, a thermal bridge at the floor slab and a leaky window frame. Ironbow, 8..22 °C.
import { writeFileSync, mkdirSync } from 'fs'; import zlib from 'zlib';
const STOPS = [[0,0,0,0],[0.15,30,0,90],[0.3,110,0,150],[0.45,190,20,120],[0.6,230,70,40],[0.75,250,140,0],[0.9,255,220,50],[1,255,255,240]];
const ib = t => { t = Math.max(0, Math.min(1, t)); for (let i = 1; i < STOPS.length; i++) { const [p1,r1,g1,b1]=STOPS[i],[p0,r0,g0,b0]=STOPS[i-1]; if (t<=p1){const f=(t-p0)/(p1-p0);return [r0+f*(r1-r0),g0+f*(g1-g0),b0+f*(b1-b0)].map(Math.round);} } return [255,255,240]; };
const W = 640, H = 480, TMIN = 8, TMAX = 22;
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const temp = (x, y) => {
  let T = 19.5;                                  // wall
  const cx = Math.min(x, W - x), cy = Math.min(y, H - y);
  T -= 4.5 * Math.exp(-Math.min(cx, cy) / 35);    // cold edges / corners
  T -= 3.5 * Math.exp(-(H - y) / 25);             // floor slab thermal bridge
  if (y > 0.8 * H && x > 0.15 * W && x < 0.85 * W && y < 0.86 * H) T = 21.5; // radiator
  const wx0 = 220, wx1 = 440, wy0 = 110, wy1 = 300;
  if (x > wx0 && x < wx1 && y > wy0 && y < wy1) {
    T = 13.5;                                     // glazing
    if (x < wx0 + 14 || x > wx1 - 14 || y < wy0 + 14 || y > wy1 - 14) T = 15;
    if (y < wy0 + 40 && x > wx1 - 70) T -= 3.5 * Math.exp(-((x - wx1) ** 2 + (y - wy0) ** 2) / 900); // draught
  } else {
    const d = Math.max(Math.max(wx0 - x, x - wx1, 0), Math.max(wy0 - y, y - wy1, 0));
    T -= 2.5 * Math.exp(-d / 12);                 // reveal bridge
  }
  return T + (rnd() - 0.5) * 0.3;
};
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const [r,g,b] = ib((temp(x,y)-TMIN)/(TMAX-TMIN)); const o = y*(W*3+1)+1+x*3; raw[o]=r; raw[o+1]=g; raw[o+2]=b; } }
const crcT = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
mkdirSync('public', { recursive: true });
writeFileSync('public/sample-thermal.png', Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote public/sample-thermal.png');
