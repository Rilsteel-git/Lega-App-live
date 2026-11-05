import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/* Regenerates every Android/iOS launcher icon and splash image from the Lega
 * brand SVGs in public/brand/. Run with: npm run generate:native-assets */

const root = process.cwd();
const brandDir = path.join(root, 'public', 'brand');

/** Lega brand green. Mirrors --green in src/styles/design-system.css. */
const BRAND_GREEN = '#0B7A43';
/** App canvas, used behind the legacy splash on the web/app window. */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Rasterises a brand SVG. The high density keeps edges crisp before resize. */
async function renderSvg(name, width, height = width) {
  const svg = await readFile(path.join(brandDir, name));
  return sharp(svg, { density: 1200 })
    .resize(width, height, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
}

/** Centres the white Lega mark on a solid-colour canvas. */
async function createCanvasWithMark(width, height, markScale, background, outputPath) {
  const markSize = Math.round(Math.min(width, height) * markScale);
  const mark = await renderSvg('lega-mark-white.svg', markSize);

  await sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(outputPath);
}

/** Pads a layer onto a transparent square — used for adaptive-icon layers. */
async function createTransparentLayer(name, canvasSize, outputPath) {
  const layer = await renderSvg(name, canvasSize);
  await sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: TRANSPARENT } })
    .composite([{ input: layer, gravity: 'centre' }])
    .png()
    .toFile(outputPath);
}

async function generateAndroidIcons() {
  const densities = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192]
  ];

  for (const [density, size] of densities) {
    const directory = path.join(root, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`);
    await mkdir(directory, { recursive: true });

    // Legacy launcher icons: the full rounded-square app icon.
    const icon = await renderSvg('lega-app-icon.svg', size);
    await writeFile(path.join(directory, 'ic_launcher.png'), icon);
    await writeFile(path.join(directory, 'ic_launcher_round.png'), icon);

    // Adaptive icon layers live on a 108dp canvas (2.25x the 48dp icon).
    const layerSize = Math.round(size * 2.25);
    await createTransparentLayer('lega-android-foreground.svg', layerSize, path.join(directory, 'ic_launcher_foreground.png'));
    await createTransparentLayer('lega-android-monochrome.svg', layerSize, path.join(directory, 'ic_launcher_monochrome.png'));
  }

  const backgroundPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'ic_launcher_background.xml');
  await writeFile(backgroundPath, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND_GREEN}</color>\n</resources>\n`);
}

/** Android 12+ splash icon: masked to a circle, so the mark goes in alone. */
async function generateAndroidSplashIcon() {
  const directory = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi');
  await mkdir(directory, { recursive: true });
  const canvasSize = 288;
  const markSize = 128;
  const mark = await renderSvg('lega-mark-white.svg', markSize);
  await sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: TRANSPARENT } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(path.join(directory, 'splash_icon.png'));
}

async function generateSplashImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await generateSplashImages(path.join(directory, entry.name));
      continue;
    }
    if (entry.name !== 'splash.png' && !entry.name.startsWith('splash-2732x2732')) continue;

    const outputPath = path.join(directory, entry.name);
    const { width, height } = await sharp(outputPath).metadata();
    if (!width || !height) continue;
    await createCanvasWithMark(width, height, 0.2, BRAND_GREEN, outputPath);
  }
}

/** iOS app icons must be opaque squares, so use the square brand icon. */
async function generateIosIcon() {
  const outputPath = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
  const icon = await renderSvg('lega-app-icon-square.svg', 1024);
  await sharp(icon).flatten({ background: BRAND_GREEN }).png().toFile(outputPath);
}

await generateAndroidIcons();
await generateAndroidSplashIcon();
await generateSplashImages(path.join(root, 'android', 'app', 'src', 'main', 'res'));
await generateIosIcon();
await generateSplashImages(path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset'));
console.log('Generated Lega icons and splash images for Android and iOS.');
