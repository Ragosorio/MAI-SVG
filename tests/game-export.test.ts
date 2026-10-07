import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactPath, compactSvg } from '../scripts/game-export.js';

// Rebuild absolute vertices from the compact relative output to compare geometry exactly.
function absolutePoints(d: string) {
  const tokens = d.match(/[MLCZHVmlczhv]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const pts: number[][] = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') { x = n(); y = n(); sx = x; sy = y; pts.push([x, y]); cmd = 'L'; }
    else if (cmd === 'L') { x = n(); y = n(); pts.push([x, y]); }
    else if (cmd === 'l') { x += n(); y += n(); pts.push([x, y]); }
    else if (cmd === 'h') { x += n(); pts.push([x, y]); }
    else if (cmd === 'v') { y += n(); pts.push([x, y]); }
    else if (cmd === 'c') { const v = [n(), n(), n(), n(), n(), n()]; pts.push([x + v[0], y + v[1]], [x + v[2], y + v[3]]); x += v[4]; y += v[5]; pts.push([x, y]); }
    else if (cmd === 'C') { const v = [n(), n(), n(), n(), n(), n()]; pts.push([v[0], v[1]], [v[2], v[3]]); x = v[4]; y = v[5]; pts.push([x, y]); }
    else if (/[zZ]/.test(cmd)) { x = sx; y = sy; cmd = ''; }
  }
  return pts.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
}

test('game-compact merges collinear staircase runs and keeps every corner', () => {
  const d = 'M325,12L326,12L327,12L328,12L329,13L330,14L331,14C340.934,24.01,341.044,24.867,340,28L339,29Z';
  const out = compactPath(d);
  assert.ok(out.length < d.length);
  const corners = absolutePoints(out);
  // collinear 325→328 collapses to one segment; diagonal 328→330 collapses; curve control points survive
  assert.deepEqual(corners, [[325, 12], [328, 12], [330, 14], [331, 14], [340.934, 24.01], [341.044, 24.867], [340, 28], [339, 29]]);
});

test('game-compact never merges a reversal (same line, opposite direction)', () => {
  const corners = absolutePoints(compactPath('M0,0L5,0L2,0L2,3Z'));
  assert.deepEqual(corners, [[0, 0], [5, 0], [2, 0], [2, 3]]);
});

test('game-compact leaves ids, fills and mask references untouched', () => {
  const svg = '<svg><defs><mask id="mai-alpha"><path d="M0,0L1,0L2,0Z" fill="#fff"/></mask></defs><g id="mai-artwork" mask="url(#mai-alpha)"><path id="p1" fill="#123456" d="M1,1L1,2L1,3Z"/></g></svg>';
  const out = compactSvg(svg);
  assert.match(out, /id="mai-alpha"/);
  assert.match(out, /mask="url\(#mai-alpha\)"/);
  assert.match(out, /id="p1" fill="#123456" d="M1 1v2z"/);
});
