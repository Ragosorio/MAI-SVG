// Game delivery profile: compacts the approved high-color-preserved vectors for a game engine that
// rasterizes SVG at load time (NO ONE LIKE CATS / PixiJS). Geometry is preserved exactly: only collinear
// L runs are merged and commands are rewritten relative. IDs, colors, mask and paint order stay untouched.
// Usage: npx tsx scripts/game-export.ts <inputDir> <outputDir> [name...]
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

type Pt = { x: number; y: number };
const fmt = (n: number) => {
  let s = (Math.round(n * 1000) / 1000).toString();
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s === '-0' ? '0' : s;
};
// Joins numbers with the shortest valid separator (a sign or a leading dot can follow without space).
function nums(values: number[]) {
  let out = '';
  for (const v of values) {
    const s = fmt(v);
    if (!out) { out = s; continue; }
    const prevHasDot = /\.\d*$/.test(out.split(/[ -]/).pop() ?? '');
    out += s.startsWith('-') || (s.startsWith('.') && prevHasDot) ? s : ' ' + s;
  }
  return out;
}

export function compactPath(d: string): string {
  const tokens = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  if (tokens.some(t => /[mlc]/.test(t))) return d; // only absolute input is rewritten
  let i = 0, cmd = '';
  const read = () => Number(tokens[i++]);
  let out = '', cur: Pt = { x: 0, y: 0 }, start: Pt = { x: 0, y: 0 };
  let pending: Pt[] = []; // absolute L targets not yet emitted
  const flushLines = () => {
    // Merge collinear, same-direction consecutive segments (exact integer/decimal geometry, no tolerance).
    const merged: Pt[] = [];
    let from = cur;
    for (const p of pending) {
      const last = merged[merged.length - 1];
      if (last) {
        const prev = merged.length > 1 ? merged[merged.length - 2] : from;
        const ax = last.x - prev.x, ay = last.y - prev.y, bx = p.x - last.x, by = p.y - last.y;
        if (Math.abs(ax * by - ay * bx) < 1e-9 && ax * bx + ay * by > 0) { merged[merged.length - 1] = p; continue; }
      }
      merged.push(p);
    }
    for (const p of merged) {
      const dx = p.x - from.x, dy = p.y - from.y;
      out += dy === 0 ? 'h' + fmt(dx) : dx === 0 ? 'v' + fmt(dy) : 'l' + nums([dx, dy]);
      from = p;
    }
    if (merged.length) cur = merged[merged.length - 1];
    pending = [];
  };
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') {
      flushLines();
      const p = { x: read(), y: read() };
      out += 'M' + nums([p.x, p.y]);
      cur = start = p;
      cmd = 'L'; // implicit lineto after moveto
    } else if (cmd === 'L') {
      pending.push({ x: read(), y: read() });
    } else if (cmd === 'C') {
      flushLines();
      const v = [read(), read(), read(), read(), read(), read()];
      out += 'c' + nums([v[0] - cur.x, v[1] - cur.y, v[2] - cur.x, v[3] - cur.y, v[4] - cur.x, v[5] - cur.y]);
      cur = { x: v[4], y: v[5] };
    } else if (cmd === 'Z') {
      flushLines();
      out += 'z';
      cur = start;
      cmd = '';
    } else {
      throw new Error(`Unexpected token ${tokens[i]} in path`);
    }
  }
  flushLines();
  return out;
}

export function compactSvg(svg: string) {
  return svg.replace(/ d="([^"]*)"/g, (_m, d: string) => ` d="${compactPath(d)}"`);
}

async function main() {
  const [inputDir, outputDir, ...only] = process.argv.slice(2);
  if (!inputDir || !outputDir) throw new Error('Usage: tsx scripts/game-export.ts <inputDir> <outputDir> [name...]');
  await mkdir(outputDir, { recursive: true });
  const files = (await readdir(inputDir)).filter(f => f.endsWith('.svg') && (!only.length || only.includes(basename(f, '.svg'))));
  const report: Record<string, { bytesIn: number; bytesOut: number }> = {};
  for (const f of files) {
    const src = await readFile(join(inputDir, f), 'utf8');
    if (/<image\b/.test(src)) throw new Error(`${f} embeds a raster image; the game profile only ships pure vectors`);
    const out = compactSvg(src);
    await writeFile(join(outputDir, f), out);
    report[basename(f, '.svg')] = { bytesIn: src.length, bytesOut: out.length };
    console.log(`${f}: ${(src.length / 1e6).toFixed(2)} MB -> ${(out.length / 1e6).toFixed(2)} MB`);
  }
  await writeFile(join(outputDir, 'game-export.json'), JSON.stringify({ profile: 'game-compact/v1', source: 'high-color-preserved', lossless: 'collinear L merge + relative commands, 3-decimal numbers (input precision)', files: report }, null, 2));
}
if (process.argv[1]?.endsWith('game-export.ts')) await main();
