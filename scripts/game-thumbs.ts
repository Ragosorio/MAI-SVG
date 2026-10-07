// Light vector tier for the game: the source raster is downscaled to `size` px and traced with the
// approved high-color-preserved preset (same tracer, same vector alpha mask), then compacted and
// stamped with width/height = 700 so the engine keeps the same logical size and rig coordinates as
// the full-detail SVG. Output stays pure vector (zero embedded images).
// Usage: npx tsx scripts/game-thumbs.ts <srcDir> <outDir> [size=240] [name...]
import sharp from 'sharp';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { PRESETS, vectorizeRaster } from '../packages/converter/index.js';
import { compactSvg } from './game-export.js';

const LOGICAL = 700;
/** premultiplied RGB MAE (0–255) above which a trace is considered broken */
const MAX_MAE = 22;

async function main() {
  const [src, out, sizeArg, ...only] = process.argv.slice(2);
  if (!src || !out) throw new Error('Usage: tsx scripts/game-thumbs.ts <srcDir> <outDir> [size] [name...]');
  const size = Number(sizeArg) || 240;
  const preset = PRESETS.find((p) => p.id === 'high-color-preserved')!;
  await mkdir(out, { recursive: true });
  const files = (await readdir(src)).filter((f) => /\.(png|webp|jpe?g)$/i.test(f) && !f.startsWith('_') && (!only.length || only.includes(basename(f).replace(/\.[^.]+$/, ''))));
  const report: Record<string, unknown> = {};
  for (const f of files) {
    const name = basename(f).replace(/\.[^.]+$/, '');
    const input = await readFile(join(src, f));
    const meta = await sharp(input).metadata();
    // Quality gate: some sizes make the tracer collapse into one flat layer (seen at exactly 256 px:
    // MAE 63, a silhouette). Retry nearby sizes until the trace is faithful.
    let svg = '';
    let r: { premultipliedRgbMae?: number; paths?: number } = {};
    for (const s of [size, size + 16, size - 16, size + 32]) {
      const small = await sharp(input).resize(s, Math.round((s * (meta.height ?? s)) / (meta.width ?? s)), { kernel: 'mitchell' }).png().toBuffer();
      const res = await vectorizeRaster(small, preset);
      svg = res.svg;
      r = res.report as typeof r;
      if ((r.premultipliedRgbMae ?? 99) < MAX_MAE) break;
      console.warn(`${name}: ${s}px trace rejected (MAE ${r.premultipliedRgbMae}), retrying`);
    }
    if ((r.premultipliedRgbMae ?? 99) >= MAX_MAE) throw new Error(`${name}: no faithful trace (MAE ${r.premultipliedRgbMae})`);
    if (/<image\b/.test(svg)) throw new Error(`${name}: raster leaked into vector output`);
    const w = LOGICAL;
    const h = Math.round((LOGICAL * (meta.height ?? size)) / (meta.width ?? size));
    const stamped = compactSvg(svg).replace(/<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${w}" height="${h}"`);
    await writeFile(join(out, `${name}.svg`), stamped);
    report[name] = { bytes: stamped.length, paths: r.paths, premultipliedRgbMae: r.premultipliedRgbMae };
    console.log(`${name}: ${(stamped.length / 1e3).toFixed(0)} KB`);
  }
  await writeFile(join(out, 'game-thumbs.json'), JSON.stringify({ profile: 'game-thumb/v1', preset: preset.id, sourceSize: size, logicalSize: LOGICAL, files: report }, null, 2));
}
await main();
