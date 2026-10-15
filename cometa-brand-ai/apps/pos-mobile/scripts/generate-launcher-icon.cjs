// Deterministic extraction only: source pixels, no tracing or generated artwork.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'artifacts/app-icon');
  fs.mkdirSync(out, { recursive: true });
  const source = path.join(root, 'assets/brand/cometa-logo-source.png');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 1200 || info.height !== 1200) throw new Error('Reinspect source geometry');
  // Tight union of the original O and its two separate upper strokes.
  const crop = { left: 305, top: 438, width: 287, height: 318 };
  const pixels = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
    const sx = x + crop.left, sy = y + crop.top;
    // The M enters the union's rectangle below the strokes: exclude it.
    if (sy > 565 && sx > 470) continue;
    data.copy(pixels, (y * crop.width + x) * 4, (sy * info.width + sx) * 4, (sy * info.width + sx) * 4 + 4);
  }
  const raw = { width: crop.width, height: crop.height, channels: 4 };
  const master = path.join(root, 'assets/brand/cometa-isotipo.png');
  await sharp(pixels, { raw }).png().toFile(master);
  const navy = '#061019';
  // Fit the entire bounding rectangle inside the guaranteed 66dp safe circle,
  // leaving another 3dp radial margin. Uniform scaling preserves geometry.
  const scale = 60 / Math.hypot(crop.width, crop.height);
  async function foreground(size) {
    const w = Math.round(crop.width * scale * size / 108);
    const h = Math.round(crop.height * scale * size / 108);
    const logo = await sharp(master).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
      .composite([{ input: logo, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }]).png().toBuffer();
  }
  async function masked(size, shape) {
    // A launcher mask exposes the central 72dp of the adaptive 108dp layer.
    const layer = await foreground(size * 3);
    const fg = await sharp(layer).extract({ left: size / 2, top: size / 2, width: size * 2, height: size * 2 }).resize(size, size).toBuffer();
    const base = await sharp({ create: { width: size, height: size, channels: 4, background: navy } }).composite([{ input: fg }]).png().toBuffer();
    let element;
    if (shape === 'circle') element = '<circle cx="0.5" cy="0.5" r="0.5" fill="white"/>';
    else if (shape === 'rounded-square') element = '<rect width="1" height="1" rx="0.18" fill="white"/>';
    else {
      const points = Array.from({ length: 360 }, (_, i) => {
        const a = i * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        return `${0.5 + 0.5 * Math.sign(c) * Math.sqrt(Math.abs(c))},${0.5 + 0.5 * Math.sign(s) * Math.sqrt(Math.abs(s))}`;
      });
      element = `<polygon points="${points.join(' ')}" fill="white"/>`;
    }
    const mask = Buffer.from(`<svg width="${size}" height="${size}" viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg">${element}</svg>`);
    return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  const previews = [];
  for (const [i, shape] of ['circle', 'squircle', 'rounded-square'].entries()) {
    const icon = await masked(288, shape);
    await sharp(icon).toFile(path.join(out, `${shape}.png`));
    previews.push({ input: icon, left: 36 + i * 348, top: 36 });
    const text = Buffer.from(`<svg width="320" height="90" xmlns="http://www.w3.org/2000/svg"><text x="160" y="28" text-anchor="middle" font-family="Arial" font-size="22" fill="white">COMETA POS</text><text x="160" y="62" text-anchor="middle" font-family="Arial" font-size="17" fill="#adc0cd">${shape}</text></svg>`);
    previews.push({ input: text, left: 20 + i * 348, top: 340 });
  }
  await sharp({ create: { width: 1056, height: 440, channels: 4, background: '#263440' } }).composite(previews).png().toFile(path.join(out, 'launcher-masks.png'));
  await sharp(await foreground(432)).toFile(path.join(out, 'adaptive-foreground.png'));
  if (process.argv.includes('--install')) {
    const res = path.join(root, 'android/app/src/main/res');
    for (const [density, launcher, adaptive] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]) {
      const dir = path.join(res, `mipmap-${density}`);
      await sharp(await foreground(adaptive)).toFile(path.join(dir, 'ic_launcher_foreground.png'));
      await sharp(await masked(launcher, 'rounded-square')).toFile(path.join(dir, 'ic_launcher.png'));
      await sharp(await masked(launcher, 'circle')).toFile(path.join(dir, 'ic_launcher_round.png'));
    }
    fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#061019</color>\n</resources>\n');
  }
  console.log(JSON.stringify({ crop, scale, safeCircleDiameterDp: 66, artworkBoundingDiagonalDp: 60, installed: process.argv.includes('--install') }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
