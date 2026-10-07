import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument} from '../packages/core/document.js';import {frameState} from '../packages/core/animation.js';
import {renderSvg,closeRenderer} from '../packages/server/render.js';import {exportSvg} from '../packages/core/export.js';
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><path id="face" d="M10 10L20 10L20 20Z" fill="#ff8888"/></svg>';
test('smoke emission rises, expands and dissipates with invisible recycling, editable roundtrip and standalone playback',async()=>{
 const m=new VectorDocument(svg);m.apply([{type:'timeline',duration:8},{type:'fluid.add',config:{id:'gas',kind:'smoke',mode:'emitter',x:100,y:210,width:60,height:140,density:8,lifetime:4,palette:['#ef98d7','#c9a5f5','#9de1dc']}}]);
 const a=frameState(m.project,.5),b=frameState(m.project,2),end=frameState(m.project,4);
 assert.ok(b.poses['gas-puff-0'].y<a.poses['gas-puff-0'].y);assert.ok(b.poses['gas-puff-0'].scaleX>a.poses['gas-puff-0'].scaleX);
 assert.equal(end.attrs['gas-puff-0'].opacity,'0');
 const first=frameState(m.project,0),last=frameState(m.project,8);assert.deepEqual(first.poses,last.poses);assert.deepEqual(first.attrs,last.attrs);
 assert.equal(m.index.get('face')!.getAttribute('d'),'M10 10L20 10L20 20Z');
 const reopened=new VectorDocument(m.toSVG());assert.equal(reopened.project.smokeEmitters?.[0].density,8);assert.deepEqual(reopened.project.smokeEmitters?.[0].palette,['#ef98d7','#c9a5f5','#9de1dc']);assert.equal(new Set(Array.from(m.doc.getElementsByTagName('stop')).map(e=>e.getAttribute('stop-color'))).size,3);assert.deepEqual(reopened.project.tracks,m.project.tracks);
 const standalone=exportSvg(m,{profile:'standalone'}).svg;assert.ok(!standalone.includes('<image'));assert.ok(!standalone.includes('<script'));
 try{const p=await renderSvg(m.frame(2));const q=await renderSvg(standalone,2);assert.ok(p.png.length>1000);assert.ok(q.png.length>1000);const pr=await sharp(p.png).ensureAlpha().raw().toBuffer(),qr=await sharp(q.png).ensureAlpha().raw().toBuffer();const mae=pr.reduce((sum,v,i)=>sum+Math.abs(v-qr[i]),0)/pr.length;assert.ok(mae<1,`standalone frame differs from editor: ${mae}`);}finally{await closeRenderer();}
 assert.throws(()=>m.apply([{type:'fluid.add',config:{id:'bad',kind:'smoke',mode:'emitter',x:10,y:10,width:50,height:80,density:10000}}]));assert.ok(!m.index.has('bad'));
 const shared=m.element('gas-puff-0-lobe-0').getAttribute('fill')!;m.apply([{type:'create',tag:'circle',id:'shared',attrs:{r:'2',fill:shared}}]);m.apply([{type:'delete',ids:['gas']}]);assert.equal(m.doc.getElementsByTagName('radialGradient').length,1,'keep a gradient still used by unrelated artwork');assert.equal(m.project.smokeEmitters?.length,0);assert.ok(!m.project.tracks.some(t=>t.target.startsWith('gas-')));
});
import {studio,port} from '../scripts/fixtures/mini-character.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import sharp from 'sharp';
test('smoke tool previews without mutation, preserves source, replaces owned resources and undoes atomically',async()=>{
 const m=new VectorDocument(svg.replace('</svg>','<g id="drawn"><path id="old" d="M100 200L95 100L105 100Z" fill="#aaaaaa"/></g></svg>'));
 m.apply([{type:'semantic.label',node:{id:'drawn',role:'smoke',label:'Humo',targets:['drawn'],status:'confirmed',source:'agent'}},{type:'fluid.animate',id:'flow',targets:['drawn'],preset:'smoke'}]);
 const root=await mkdtemp(join(tmpdir(),'mai-smoke-api-')),s=await studio(root,await port());
 try{const imported=await s.post('/api/import',{name:'smoke.svg',base64:Buffer.from(m.toSVG()).toString('base64'),expectedRevision:0});assert.equal(imported.status,200);
 const state=async()=>({...await (await fetch(s.url+'/api/state')).json(),svg:await (await fetch(s.url+'/api/svg')).text()});
 let v=await state();const rev=v.revision,config={id:'emitter',x:100,y:210,width:60,height:140,density:8,lifetime:4};
 const preview=await s.call('smoke.emit',{config,source:'drawn',dryRun:true,expectedRevision:rev});assert.equal(preview.ok,true,JSON.stringify(preview.error));assert.equal((await state()).revision,rev);
 const done=await s.call('smoke.emit',{config,source:'drawn',expectedRevision:rev});assert.equal(done.ok,true,JSON.stringify(done.error));
 v=await state();let doc=new VectorDocument(v.svg);assert.equal(doc.element('drawn').getAttribute('opacity'),'0');assert.equal(doc.element('old').getAttribute('d'),'M100 200L95 100L105 100Z');assert.equal(v.project.modifiers[0].enabled,false);
 const count=doc.doc.getElementsByTagName('radialGradient').length;
 const updated=await s.call('smoke.emit',{config:{...config,turbulence:1},expectedRevision:v.revision});assert.equal(updated.ok,true,JSON.stringify(updated.error));v=await state();doc=new VectorDocument(v.svg);assert.equal(doc.doc.getElementsByTagName('radialGradient').length,count,'updating the emitter does not leak gradients');
 await s.call('history.undo',{expectedRevision:v.revision});v=await state();assert.equal(v.project.smokeEmitters[0].turbulence,.5);
 await s.call('history.undo',{expectedRevision:v.revision});v=await state();doc=new VectorDocument(v.svg);assert.equal(doc.element('drawn').getAttribute('opacity'),null);assert.equal(v.project.modifiers[0].enabled,true);assert.equal(v.project.smokeEmitters?.length??0,0);
 }finally{await s.app.close();await rm(root,{recursive:true,force:true});}
});
