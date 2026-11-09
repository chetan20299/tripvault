// Generates PWA + native source icons from public/logo.svg.  Run: node scripts/icons.mjs
// Native icon/splash sets: npx @capacitor/assets generate  (reads assets/*.png)
import sharp from 'sharp';
const svg = 'public/logo.svg';
for (const s of [192, 512]) await sharp(svg, { density: 300 }).resize(s, s).png().toFile(`public/icon-${s}.png`);
await sharp(svg, { density: 300 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');
await sharp(svg, { density: 600 }).resize(1024, 1024).png().toFile('assets/icon-only.png');
const logo = await sharp(svg, { density: 600 }).resize(700, 700).png().toBuffer();
for (const [name, bg] of [['splash', '#0B4F6C'], ['splash-dark', '#06293A']])
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(`assets/${name}.png`);
console.log('icons generated');

// ---- Native projects (only if generated with `npx cap add android|ios`) ----
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
// Adaptive-icon foreground: logo without its background tile, padded into the 66% safe zone.
const fg = Buffer.from((await import('node:fs')).readFileSync(svg, 'utf8').replace(/<rect[^>]*\/>/, '').replace('viewBox="0 0 512 512"', 'viewBox="-150 -150 812 812"'));
const res = 'android/app/src/main/res';
if (existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    await sharp(svg, { density: 400 }).resize(48 * k, 48 * k).png().toFile(`${res}/mipmap-${d}/ic_launcher.png`);
    const r = 48 * k;
    await sharp(svg, { density: 400 }).resize(r, r).composite([{ input: Buffer.from(`<svg width="${r}" height="${r}"><circle cx="${r / 2}" cy="${r / 2}" r="${r / 2}"/></svg>`), blend: 'dest-in' }]).png().toFile(`${res}/mipmap-${d}/ic_launcher_round.png`);
    const f = 108 * k;
    await sharp(fg, { density: 400 }).resize(f, f).png().toFile(`${res}/mipmap-${d}/ic_launcher_foreground.png`);
  }
  writeFileSync(`${res}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B4F6C</color>\n</resources>\n');
  for (const dir of readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const file = `${res}/${dir}/splash.png`;
    if (!existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const size = Math.round(Math.min(width, height) * 0.35);
    const l = await sharp(svg, { density: 600 }).resize(size, size).png().toBuffer();
    const buf = await sharp({ create: { width, height, channels: 4, background: '#0B4F6C' } }).composite([{ input: l, gravity: 'center' }]).png().toBuffer();
    writeFileSync(file, buf);
  }
}
const ios = 'ios/App/App/Assets.xcassets';
if (existsSync(ios)) {
  await sharp(svg, { density: 600 }).resize(1024, 1024).flatten({ background: '#0B4F6C' }).png().toFile(`${ios}/AppIcon.appiconset/AppIcon-512@2x.png`);
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
    await sharp('assets/splash.png').toFile(`${ios}/Splash.imageset/${f}`);
}
console.log('native assets updated');
