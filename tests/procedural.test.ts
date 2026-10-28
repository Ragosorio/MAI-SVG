// Plan F2 / ADR-003 §A.6: procedural signals are deterministic, seeded, loop-aware and behave like tracks on a layer.
import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState,frameParams} from '../packages/core/animation.js';
import {signalAt,schedule,fractalNoise} from '../packages/core/procedural.js';
import {exportSvg} from '../packages/core/export.js';
import type {Signal,SignalSource} from '../packages/core/model.js';

const ctx=(duration=4,loop=true)=>({duration,loop,params:{},signals:[] as Signal[]});
const sig=(source:SignalSource,extra:Partial<Signal>={}):Signal=>({id:'s',output:{target:'tail',property:'rotation',layer:'pose'},source,...extra});
const series=(s:Signal,c=ctx(),n=200)=>Array.from({length:n+1},(_,i)=>signalAt(s,c.duration*i/n,c).value);
const SOURCES:SignalSource[]=[{kind:'noise',frequency:1.3,amplitude:4,octaves:3,seed:7},{kind:'wiggle',frequency:2,amplitude:3,seed:3},{kind:'oscillator',wave:'sine',period:1.7,amplitude:5},{kind:'oscillator',wave:'triangle',period:1,amplitude:2,phase:.25},{kind:'drift',amplitude:2,period:1.4,seed:9},{kind:'blink',interval:[.8,1.4],close:.07,amplitude:-1,seed:5}];

test('signals are deterministic per seed and differ across seeds',()=>{
 for(const src of SOURCES){assert.deepEqual(series(sig(src)),series(sig(structuredClone(src))),src.kind);}
 assert.notDeepEqual(series(sig({kind:'noise',frequency:1,amplitude:1,seed:1})),series(sig({kind:'noise',frequency:1,amplitude:1,seed:2})));
 for(let i=0;i<=100;i++){const v=fractalNoise(i/37,2,4,.5,11);assert.ok(v>=-1&&v<=1);}
});

test('looping signals close their seam in value and velocity',()=>{
 for(const src of SOURCES){const s=sig(src),c=ctx(4,true),h=1e-4,v=(t:number)=>signalAt(s,t,c).value;
  assert.ok(Math.abs(v(0)-v(4))<1e-9,`${src.kind} value seam ${v(0)} vs ${v(4)}`);
  const start=(v(h)-v(0))/h,end=(v(4)-v(4-h))/h;assert.ok(Math.abs(start-end)<1e-2*Math.max(1,Math.abs(start)),`${src.kind} velocity seam ${start} vs ${end}`);}
});

test('blink schedule: intervals in range, events inside the timeline, full closure at the peak',()=>{
 const src={kind:'blink' as const,interval:[2,3] as [number,number],close:.07,double:.3,amplitude:-.9,seed:42};const ev=schedule(src,12);assert.ok(ev.length>=3);
 for(const e of ev){assert.ok(e.start>=0&&e.end<=12);}const s=sig(src);for(const e of ev)assert.ok(Math.abs(signalAt(s,e.peak,ctx(12)).value+.9)<1e-9,'closed at peak');
 assert.equal(signalAt(s,ev[0].start-.01,ctx(12)).value,0,'open between blinks');
});

test('envelope windows, fades and multiplyBy shape the contribution',()=>{
 const s=sig({kind:'oscillator',wave:'sine',period:1,amplitude:1},{envelope:{start:1,end:3,fadeIn:.5,fadeOut:.5,multiplyBy:'param:energy'}});const c={...ctx(4,false),params:{energy:2}};
 assert.equal(signalAt(s,.5,c).weight,0);assert.equal(signalAt(s,3.5,c).weight,0);assert.equal(signalAt(s,2,c).weight,1);assert.ok(signalAt(s,1.1,c).weight<.2);
 assert.ok(Math.abs(signalAt(s,2.25,c).value-2)<1e-9,'multiplied by the param');
});

const doc=(ops:Parameters<VectorDocument['apply']>[0]=[])=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:4,loop:true},{type:'pose',id:'tail',pose:{pivotX:450,pivotY:440}},...ops]);return d;};
test('signals mix like tracks: additive adds layer weight × value, override crossfades, params feed the rig',()=>{
 const d=doc([{type:'keyframe',target:'tail',property:'rotation',time:0,value:10},{type:'keyframe',target:'tail',property:'rotation',time:4,value:10},{type:'layer.set',layer:{id:'pose',name:'Pose',blend:'additive',weight:.5}},
  {type:'signal.add',signal:{id:'w',output:{target:'tail',property:'rotation',layer:'pose'},source:{kind:'oscillator',wave:'sine',period:4,amplitude:8}}}]);
 assert.ok(Math.abs(frameState(d.project,1).poses.tail.rotation-(10+.5*8))<1e-9);
 d.apply([{type:'signal.add',signal:{id:'o',output:{target:'tail',property:'x',layer:'expression'},source:{kind:'curve',keys:[{time:0,value:50,easing:'linear'},{time:4,value:50,easing:'linear'}]},envelope:{start:1,end:3,fadeIn:1}}}]);
 assert.equal(frameState(d.project,.5).poses.tail.x,0);assert.ok(Math.abs(frameState(d.project,1.5).poses.tail.x-25)<1e-9,'half-way crossfade');
 d.apply([{type:'param.define',name:'mood',def:{min:0,max:1,default:0}},{type:'signal.add',signal:{id:'p',output:{target:'mood',property:'param',layer:'expression'},source:{kind:'curve',keys:[{time:0,value:2,easing:'linear'},{time:4,value:2,easing:'linear'}]}}}]);
 assert.equal(frameParams(d.project,2).mood,1,'clamped to the param range');
});

test('invalid signals roll back atomically; deleting a target removes its signals; bake reproduces the motion',()=>{
 const d=doc();const before=d.toSVG();
 assert.throws(()=>d.apply([{type:'signal.add',signal:{id:'x',output:{target:'tail',property:'rotation',layer:'nope'},source:{kind:'wiggle',frequency:1,amplitude:2,seed:1}}}]),/layer/);
 assert.throws(()=>d.apply([{type:'signal.add',signal:{id:'x',output:{target:'ghost',property:'rotation',layer:'pose'},source:{kind:'wiggle',frequency:1,amplitude:2,seed:1}}}]),/not found/);
 assert.throws(()=>d.apply([{type:'signal.add',signal:{id:'x',output:{target:'tail',property:'rotation',layer:'pose'},source:{kind:'wiggle',frequency:99,amplitude:2,seed:1}}}]),/frequency/);
 assert.equal(d.toSVG(),before);
 d.apply([{type:'signal.add',signal:{id:'w',output:{target:'tail',property:'rotation',layer:'pose'},source:{kind:'wiggle',frequency:1.5,amplitude:6,octaves:2,seed:4}}}]);
 const live=Array.from({length:41},(_,i)=>frameState(d.project,i/10).poses.tail.rotation);d.apply([{type:'signal.bake',id:'w',tolerance:.02}]);
 assert.equal((d.project.signals??[]).length,0);const baked=Array.from({length:41},(_,i)=>frameState(d.project,i/10).poses.tail.rotation);for(let i=0;i<=40;i++)assert.ok(Math.abs(live[i]-baked[i])<.05,`bake at ${i/10}`);
 const e=doc([{type:'signal.add',signal:{id:'n',output:{target:'nose',property:'y',layer:'pose'},source:{kind:'noise',frequency:1,amplitude:2,seed:1}}}]);e.apply([{type:'delete',ids:['nose']}]);assert.equal((e.project.signals??[]).length,0);
 assert.deepEqual(new VectorDocument(doc([{type:'signal.add',signal:{id:'k',output:{target:'tail',property:'rotation',layer:'pose'},source:{kind:'drift',amplitude:1,period:2}}}]).toSVG()).project.signals?.map(s=>s.id),['k'],'signals survive reopening');
});

test('identity: a scale signal on a protected eye is blocked; a rigid one is allowed',()=>{
 const d=doc([{type:'semantic.label',node:{id:'eye-l',role:'eye-left',label:'L',targets:['eye-left'],protection:['protected']}},{type:'pose',id:'eye-left',pose:{pivotX:292,pivotY:265}}]);
 assert.throws(()=>d.apply([{type:'signal.add',signal:{id:'b',output:{target:'eye-left',property:'scaleY',layer:'blink'},source:{kind:'blink',interval:[2,3],close:.07,amplitude:-.9,seed:1}}}]),(e:{code?:string})=>e.code==='IDENTITY_BLOCKED');
 assert.doesNotThrow(()=>d.apply([{type:'signal.add',signal:{id:'g',output:{target:'eye-left',property:'x',layer:'eyes'},source:{kind:'drift',amplitude:1.5,period:2}}}]));
});

test('standalone SMIL of wiggle, blink and a two-component filter attribute matches the engine in Chromium',async()=>{
 const {renderSvg,closeRenderer}=await import('../packages/server/render.js');const sharp=(await import('sharp')).default;
 const d=doc([{type:'pose',id:'eye-left',pose:{pivotX:292,pivotY:265}},{type:'filter.set',id:'soft',target:'body',primitives:[{kind:'blur',attrs:{stdDeviation:'1 1'},result:'b'}]},
  {type:'signal.add',signal:{id:'w',output:{target:'tail',property:'rotation',layer:'pose'},source:{kind:'wiggle',frequency:1.5,amplitude:8,seed:4}}},
  {type:'signal.add',signal:{id:'b',output:{target:'eye-left',property:'scaleY',layer:'blink'},source:{kind:'blink',interval:[1,1.6],close:.07,amplitude:-.92,seed:3}}}]);
 const prim=[...d.index.values()].find(e=>e.localName==='feGaussianBlur')!;const pid=prim.getAttribute('id')!;
 d.apply([{type:'signal.add',signal:{id:'s',output:{target:pid,property:'attr:stdDeviation',layer:'effects',component:0,base:[1,1]},source:{kind:'oscillator',wave:'sine',period:2,amplitude:3}}}]);
 const r=exportSvg(d,{profile:'standalone',tolerance:.02});const peak=schedule({kind:'blink',interval:[1,1.6],close:.07,amplitude:-.92,seed:3},4)[0].peak;
 try{for(const t of [.37,peak,1.9,3.1]){const a=await sharp((await renderSvg(r.svg,t)).png).ensureAlpha().raw().toBuffer(),b=await sharp((await renderSvg(d.frame(t),0)).png).ensureAlpha().raw().toBuffer();const mean=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;assert.ok(mean<.3,`t=${t} mean=${mean}`);}}finally{await closeRenderer();}
});
