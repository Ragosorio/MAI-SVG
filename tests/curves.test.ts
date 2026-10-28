// Plan F2 / ADR-003 §A.4: keyframe v2 (tangent handles, auto/continuous, roving, custom ease, inertia).
import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {valueAt} from '../packages/core/animation.js';
import {legacyHandles} from '../packages/core/curves.js';
import {exportSvg} from '../packages/core/export.js';
import type {Easing,Track,KeyInput} from '../packages/core/model.js';

const doc=(keys:KeyInput[],extra:{duration?:number;loop?:boolean}={})=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:extra.duration??4,loop:extra.loop??false},{type:'pose',id:'tail',pose:{pivotX:450,pivotY:440}},{type:'track.set',target:'tail',property:'rotation',keys}]);return d;};
const track=(d:VectorDocument)=>d.project.tracks.find(t=>t.target==='tail'&&t.property==='rotation')!;
const at=(d:VectorDocument,t:number)=>Number(valueAt(track(d),t,d.project.loop));
const slope=(d:VectorDocument,t:number,h=1e-4)=>(at(d,t+h)-at(d,t-h))/(2*h);

test('every legacy easing equals its exact handle form',()=>{
 for(const e of ['linear','ease-in-out','ease-in','ease-out','overshoot','anticipate','cubic-bezier(.2,.8,.3,1.2)'] as Easing[]){
  const h=legacyHandles(e,20,2);const legacy:Track={target:'x',property:'rotation',keys:[{time:0,value:0,easing:e},{time:2,value:20,easing:'linear'}]};
  const handled:Track={target:'x',property:'rotation',keys:[{time:0,value:0,easing:'linear',out:h.out},{time:2,value:20,easing:'linear',in:h.in}]};
  for(let i=0;i<=40;i++){const t=i/20;assert.ok(Math.abs(Number(valueAt(legacy,t))-Number(valueAt(handled,t)))<1e-6,`${e} at ${t}`);}
 }
});

test('tangent handles set endpoint speed; large speeds overshoot; hold and custom curves work',()=>{
 const soft=doc([{time:0,value:0,out:{speed:0,influence:.5}},{time:2,value:20,in:{speed:0,influence:.5}}]);assert.ok(Math.abs(slope(soft,.001))<.2,'eases out of rest');assert.ok(Math.abs(at(soft,1)-10)<1e-6,'symmetric midpoint');
 const fast=doc([{time:0,value:0,out:{speed:60,influence:.6}},{time:2,value:20,in:{speed:0,influence:.3}}]);assert.ok(Math.max(...Array.from({length:41},(_,i)=>at(fast,i/20)))>20,'overshoots the target');
 const hold=doc([{time:0,value:0,hold:true},{time:2,value:20}]);assert.equal(at(hold,1.99),0);assert.equal(track(hold).keys[0].easing,'step');
 const d=doc([{time:0,value:0},{time:2,value:20}]);d.apply([{type:'curve.custom',target:'tail',property:'rotation',time:0,curve:'M0 0 C0.3 0 0.6 1.4 1 1'}]);assert.ok(Math.max(...Array.from({length:41},(_,i)=>at(d,i/20)))>20);
 const before=d.toSVG();assert.throws(()=>d.apply([{type:'curve.custom',target:'tail',property:'rotation',time:0,curve:'M0 0 L0.6 0.5 L0.4 0.8 L1 1'}]));assert.equal(d.toSVG(),before,'invalid curve rolls back');
});

test('auto tangents keep velocity continuous through keys and across a loop seam',()=>{
 const d=doc([{time:0,value:0,auto:'auto'},{time:1,value:15,auto:'auto'},{time:2.5,value:-5,auto:'auto'},{time:4,value:0,auto:'auto'}],{loop:true});
 const left=(at(d,1)-at(d,1-1e-4))/1e-4,right=(at(d,1+1e-4)-at(d,1))/1e-4;assert.ok(Math.abs(left-right)<.05,`interior ${left} vs ${right}`);
 const start=(at(d,1e-4)-at(d,0))/1e-4,end=(at(d,4)-at(d,4-1e-4))/1e-4;assert.ok(Math.abs(start-end)<.05,`seam ${start} vs ${end}`);
});

test('roving keys produce constant speed; reverse mirrors the curve; stretch rescales handle speeds',()=>{
 const r=doc([{time:0,value:0},{time:.5,value:30,roving:true},{time:4,value:40}]);assert.ok(Math.abs(track(r).keys[1].time-3)<1e-9,'roving key moved to constant-speed time');
 const d=doc([{time:0,value:0,out:{speed:40,influence:.5}},{time:2,value:20,in:{speed:0,influence:.3}}]);const before=Array.from({length:21},(_,i)=>at(d,i/10));
 d.apply([{type:'track.edit',target:'tail',property:'rotation',action:'reverse'}]);for(let i=0;i<=20;i++)assert.ok(Math.abs(at(d,i/10)-before[20-i])<1e-6,`reverse at ${i/10}`);
 const s=doc([{time:0,value:0,out:{speed:30,influence:.4}},{time:1,value:20,in:{speed:0,influence:.4}}]);const v=slope(s,.0005,.0005);
 s.apply([{type:'track.edit',target:'tail',property:'rotation',action:'stretch',amount:2}]);assert.ok(Math.abs(slope(s,.001,.001)-v/2)<.5,'velocity halves when time doubles');
});

test('inertia compiles editable keys that keep the incoming velocity and settle monotonically',()=>{
 const d=doc([{time:0,value:0},{time:1,value:30}]);const incoming=slope(d,.99,.005);d.apply([{type:'curve.inertia',target:'tail',property:'rotation',time:1,resistance:4}]);
 const after=(at(d,1.01)-at(d,1))/.01;assert.ok(Math.abs(after-incoming)/incoming<.1,`velocity preserved ${incoming}→${after}`);
 const vals=Array.from({length:31},(_,i)=>at(d,1+i/10));for(let i=1;i<vals.length;i++)assert.ok(vals[i]>=vals[i-1]-1e-9,'monotonic');assert.ok(vals.at(-1)!-vals.at(-2)!<.2,'settling');
});

test('handles survive editable round trip, track.copy offsets and standalone export',()=>{
 const d=doc([{time:0,value:0,out:{speed:0,influence:.45}},{time:2,value:20,auto:'auto'},{time:4,value:0,in:{speed:0,influence:.45}}],{duration:5});
 const reopened=new VectorDocument(d.toSVG());assert.deepEqual(track(reopened).keys,track(d).keys);
 d.apply([{type:'track.copy',target:'tail',to:'body',property:'rotation',offset:.25},{type:'pose',id:'body',pose:{pivotX:345,pivotY:480}}]);
 const copy=d.project.tracks.find(t=>t.target==='body'&&t.property==='rotation')!;assert.deepEqual(copy.keys.map(k=>k.time),[.25,2.25,4.25]);assert.deepEqual(copy.keys[0].out,{speed:0,influence:.45});
 const r=exportSvg(d,{profile:'standalone'});assert.match(r.svg,/animateTransform/);
});

test('a held jump inside a continuous track exports as an instant cut that matches the engine in Chromium',async()=>{
 const {renderSvg,closeRenderer}=await import('../packages/server/render.js');const sharp=(await import('sharp')).default;
 const d=new VectorDocument(starterSvg);d.apply([{type:'keyframe',target:'nose',property:'y',time:0,value:0,easing:'ease-in-out'},{type:'keyframe',target:'nose',property:'y',time:1,value:-60,easing:'step'},{type:'keyframe',target:'nose',property:'y',time:2,value:40,easing:'ease-out'},{type:'keyframe',target:'nose',property:'y',time:4,value:0}]);
 const r=exportSvg(d,{profile:'standalone',tolerance:.01});assert.ok(r.report.jumps>=1,'jump counted');
 try{for(const t of [.5,1.5,1.999,2.001,3]){const a=await sharp((await renderSvg(r.svg,t)).png).ensureAlpha().raw().toBuffer(),b=await sharp((await renderSvg(d.frame(t),0)).png).ensureAlpha().raw().toBuffer();const mean=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;assert.ok(mean<.2,`t=${t} mean=${mean}`);}}finally{await closeRenderer();}
});
