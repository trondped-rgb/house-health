// Generates PWA icons (ironbow tile with a house outline) into public/.
import { writeFileSync } from 'fs'; import zlib from 'zlib';
const crcT = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
for (const N of [192, 512]) {
  const raw = Buffer.alloc((N * 3 + 1) * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, inHouse = (v > 0.45 && v < 0.82 && u > 0.25 && u < 0.75) || (v <= 0.45 && v > 0.18 && Math.abs(u - 0.5) < (v - 0.18) * 0.95);
    const t = inHouse ? 0.55 + 0.4 * (1 - v) : 0.1;
    const c = inHouse ? [Math.min(255, 180 + t * 75), 60 + t * 150, 20] : [20, 32, 46];
    const o = y * (N * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
  }
  const h = Buffer.alloc(13); h.writeUInt32BE(N, 0); h.writeUInt32BE(N, 4); h[8] = 8; h[9] = 2;
  writeFileSync(`public/icon-${N}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', h), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
