import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { vectorizeRaster, vectorizeSvg, PRESETS, decodeRaster } from '../packages/converter/index.js';
import { assertSvg, parseSvg, serialize, elements } from '../packages/converter/svg.js';
const fixture=async()=>{const rgba=Buffer.alloc(40*40*4);for(let y=5;y<35;y++)for(let x=5;x<35;x++){const i=(y*40+x)*4;rgba[i]=210;rgba[i+1]=45;rgba[i+2]=60;rgba[i+3]=x<15?85:x<25?170:255;}return sharp(rgba,{raw:{width:40,height:40,channels:4}}).png().toBuffer();};
const tinyPreset={...PRESETS.find(p=>p.id==='high-spline-stacked')!,options:{...PRESETS.find(p=>p.id==='high-spline-stacked')!.options,simplify:0,filterSpeckle:0},alphaSimplify:0};
test('partial alpha remains partial and empty background remains transparent',async()=>{
 const input=await fixture();const result=await vectorizeRaster(input,tinyPreset);assert.equal(result.report.rasterImages,0);assert.equal(result.report.alpha.strategy,'vector-luminance-mask');
 const {data}=await sharp(Buffer.from(result.svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(data[3],0);assert.ok(Math.abs(data[(20*40+10)*4+3]-85)<12);assert.ok(Math.abs(data[(20*40+20)*4+3]-170)<12);assert.ok(data[(20*40+30)*4+3]>245);assert.ok(result.report.silhouetteIoU>0.97);
 const doc=parseSvg(result.svg);const path=elements(doc).find(e=>e.getAttribute('id')?.startsWith('mai-shape-'))!;path.setAttribute('fill','#00ff00');assertSvg(serialize(doc));assert.equal(elements(parseSvg(serialize(doc))).find(e=>e.getAttribute('id')===path.getAttribute('id'))?.getAttribute('fill'),'#00ff00');
});
test('PNG, WebP and JPEG are decoded, unsupported data is rejected',async()=>{
 const input=await fixture();for(const format of ['png','webp','jpeg'] as const){const encoded=await sharp(input).toFormat(format).toBuffer();const decoded=await decodeRaster(encoded);assert.equal(decoded.width,40);assert.equal(decoded.height,40);const converted=await vectorizeRaster(encoded,tinyPreset);assert.equal(converted.report.rasterImages,0);assert.ok(converted.report.paths>0);}
 await assert.rejects(()=>decodeRaster(Buffer.from('invalid')));const gif=await sharp(input).gif().toBuffer();await assert.rejects(()=>decodeRaster(gif),/Only PNG/);
});
test('multiple embedded images preserve effects, transform, placement and unique IDs',async()=>{
 const data=(await fixture()).toString('base64');const source=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1400 1400"><defs><filter id="glow"><feGaussianBlur stdDeviation="3"/></filter><style>.sprite{animation:bob 4s infinite}@keyframes bob{to{transform:translateY(-18px)}}</style></defs><g class="sprite" filter="url(#glow)"><image id="original" x="73" y="73" width="1254" height="1254" transform="rotate(2)" href="data:image/png;base64,${data}"/><image x="4" y="5" width="80" height="100" preserveAspectRatio="xMinYMax slice" xlink:href="data:image/png;base64,${data}"/></g></svg>`;
 const result=await vectorizeSvg(source,tinyPreset);assert.equal(result.reports.length,2);const report=assertSvg(result.svg);assert.equal(report.rasterImages,0);const doc=parseSvg(result.svg);const all=elements(doc);const replacement=all.find(e=>e.getAttribute('id')==='original')!;
 assert.equal(replacement.localName,'svg');assert.equal(replacement.getAttribute('x'),'73');assert.equal(replacement.getAttribute('width'),'1254');assert.equal(replacement.getAttribute('transform'),'rotate(2)');assert.equal(replacement.getAttribute('viewBox'),'0 0 40 40');assert.equal(all.find(e=>e.getAttribute('id')==='mai-embedded-1')?.getAttribute('preserveAspectRatio'),'xMinYMax slice');assert.equal(all.find(e=>e.localName==='style')?.textContent,'.sprite{animation:bob 4s infinite}@keyframes bob{to{transform:translateY(-18px)}}');assert.equal(all.find(e=>e.getAttribute('class')==='sprite')?.getAttribute('filter'),'url(#glow)');
});
test('untrusted SVG rejects script, external resources, entity expansion and raster camouflage',()=>{
 const wrap=(inside:string)=>`<svg xmlns="http://www.w3.org/2000/svg">${inside}</svg>`;
 for(const inside of ['<script>alert(1)</script>','<path onclick="alert(1)"/>','<image href="https://example.com/a.png"/>','<foreignObject/>','<feImage href="#something"/>','<style>@import "https://example.com/style.css"</style>','<path fill="url(https://example.com/x)"/>','<g id="x"/><g id="x"/>','<animate attributeName="href" to="https://example.com/x"/>','<path fill="url(#missing)"/>'])assert.throws(()=>assertSvg(wrap(inside),true));
 assert.throws(()=>parseSvg('<!DOCTYPE svg [<!ENTITY a "x">]>'+wrap('<title>&a;</title>')));
 assert.throws(()=>parseSvg(wrap('<g></svg>')));
});
test('fully transparent input is rejected instead of falsely claiming a successful conversion',async()=>{
 const input=await sharp({create:{width:8,height:8,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();await assert.rejects(()=>vectorizeRaster(input,tinyPreset),/entirely transparent/);
});

test('CLI batch isolates invalid files and disambiguates equal PNG/WebP names',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const tmp=await mkdtemp(join(tmpdir(),'mai-batch-'));try{
   const input=join(tmp,'input'),output=join(tmp,'output');await mkdir(input);const png=await fixture();await writeFile(join(input,'cat.png'),png);await writeFile(join(input,'cat.webp'),await sharp(png).webp().toBuffer());await writeFile(join(input,'broken.jpg'),'invalid');
   const run=spawnSync(process.execPath,['--import','tsx','packages/cli/main.ts','vectorize',input,'--output',output],{encoding:'utf8',timeout:30000});assert.equal(run.status,1,run.stderr);const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));assert.equal(report.failures.length,1);assert.equal(report.reports.length,2);assertSvg(await readFile(join(output,'cat-png','high-color-preserved.svg'),'utf8'));assertSvg(await readFile(join(output,'cat-webp','high-color-preserved.svg'),'utf8'));
 }finally{await rm(tmp,{recursive:true,force:true});}
});
