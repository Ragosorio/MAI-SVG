// Architecture diagnostics, not passing regression tests or the required external-agent benchmark.
// Run from the repository root: node --import tsx experiments/architecture-20261004/probe.mjs
// Uses fresh in-memory documents. Does not load or mutate the user's live session or any cat asset.
import {spawnSync} from 'node:child_process';
import {VectorDocument} from '../../packages/core/document.ts';
import {resolve} from '../../packages/agent/address.ts';
import {AgentService, validate} from '../../packages/agent/service.ts';
import {fileWorkspace} from '../../packages/cli/agent.ts';
import {TOOLS} from '../../packages/agent/registry.ts';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="mouth" fill="#ff0000" d="M10 10L30 10L30 30L10 30Z"/><path id="other" fill="#00ff00" d="M50 50L60 50L60 60Z"/></svg>';
const results = {description: 'Observed behavior before the S0 fixes; defects are reported, not endorsed.'};
const m = new VectorDocument(svg);
m.apply([{type: 'identity.protect', ids: ['mouth']}]);
try {
  m.apply([{type: 'attributes', id: 'mouth', attrs: {fill: '#0000ff'}}]);
  results.directRecolor = 'allowed';
} catch {
  results.directRecolor = 'blocked';
}
try {
  m.apply([
    {type: 'expression.driver', driver: {id: 'recolor', param: 'color', target: 'mouth', property: 'fill', points: [[0, '#ff0000'], [1, '#0000ff']]}},
    {type: 'param.set', params: {color: 1}},
  ]);
  results.driverRecolor = {allowed: true, renderedBlue: m.frame(0).includes('fill="#0000ff"')};
} catch (e) {
  results.driverRecolor = {allowed: false, error: e.message};
}

const eyesSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  ['catA-left', 'catA-right', 'catB-left', 'catB-right'].map((id, i) =>
    `<path id="shape-${id}" fill="#00ff00" d="M${i * 20} 10h10v10h-10Z"/>`).join('') + '</svg>';
const s = new VectorDocument(eyesSvg);
for (const c of ['catA', 'catB']) {
  s.apply([{type: 'semantic.label', node: {id: c, role: 'character', label: c, targets: [], status: 'confirmed', source: 'agent'}}]);
  for (const side of ['left', 'right']) {
    s.apply([{type: 'semantic.label', node: {id: `${c}-${side}`, parent: c, role: `eye-${side}`, label: side, targets: [`shape-${c}-${side}`], status: 'confirmed', source: 'agent'}}]);
  }
}
try {
  results.eyesAcrossCharacters = {resolved: resolve(s, 'eyes').addresses};
} catch (e) {
  results.eyesAcrossCharacters = {error: e.code};
}
try {
  results.emptyIdentityCheck = await new AgentService(fileWorkspace(svg, 'unlabeled')).call('identity.check', {times: [], parts: []});
} catch (e) {
  results.emptyIdentityCheck = {error: e.message};
}
try {
  validate(TOOLS.find(t => t.name === 'part.candidates').input, {region: {kind: 'rect'}});
  results.incompleteRegion = 'accepted by registry validator';
} catch (e) {
  results.incompleteRegion = e.message;
}

results.cli = [];
// All commands below are discovery operations; no mutation or choice acceptance is requested.
for (const args of [['export', 'capabilities', '--json'], ['capabilities', '--json'], ['call', 'capabilities', '--json']]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'packages/cli/main.ts', ...args], {encoding: 'utf8', timeout: 5000});
  let body;
  try {
    const j = JSON.parse(r.stdout);
    body = {ok: j.ok, tool: j.tool, tools: j.tools?.length, error: j.error};
  } catch {
    body = {stdout: r.stdout.slice(0, 100), stderr: r.stderr.slice(0, 200)};
  }
  results.cli.push({args, status: r.status, ...body});
}
console.log(JSON.stringify(results, null, 2));
