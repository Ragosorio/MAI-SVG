// Lane A / ADR-003 §A.12: presets are transparent macros that expand into editable primitives.
import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState} from '../packages/core/animation.js';
import {expandPreset} from '../packages/core/presets.js';
import {exportSvg} from '../packages/core/export.js';

const labels=(protect:Record<string,string[]>={})=>[
 {type:'semantic.label' as const,node:{id:'eye-l',role:'eye-left',label:'L',targets:['eye-left'],...(protect['eye-l']?{protection:protect['eye-l'] as never}:{})}},
 {type:'semantic.label' as const,node:{id:'eye-r',role:'eye-right',label:'R',targets:['eye-right']}},
 {type:'semantic.label' as const,node:{id:'tail-part',role:'tail',label:'Tail',targets:['tail'],landmarks:{base:{x:450,y:445}},...(protect['tail-part']?{protection:protect['tail-part'] as never}:{})}}];
const doc=(ops:Parameters<VectorDocument['apply']>[0]=[])=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:7,fps:30,loop:true},...ops]);return d;};

test('classic presets expand to the same keyframes the core always wrote',()=>{
 const d=doc();const r=expandPreset(d,{id:'tail',kind:'sway'},()=>true);assert.equal(r.ops.length,3);assert.ok(r.ops.every(o=>o.type==='keyframe'));
 assert.deepEqual(r.ops.map(o=>o.type==='keyframe'?o.value:0),[-4,4,-4]);
});

test('organic breathing: pivot at the base, asymmetric cycles with zero velocity at the seam, counter scale for volume',()=>{
 const d=doc([{type:'motion.preset',id:'character',kind:'breathe',style:'organic'}]);const p=d.project;
 assert.ok(p.poses.character.pivotY>500,'pivot near the feet');const sy=p.tracks.find(t=>t.target==='character'&&t.property==='scaleY'&&t.layer==='pose')!,sx=p.tracks.find(t=>t.target==='character'&&t.property==='scaleX'&&t.layer==='pose')!;
 assert.equal(sy.keys.length,5,'two 3.5 s cycles');assert.ok(Number(sx.keys[1].value)<0,'counter scale');assert.ok(sy.keys[1].time<sy.keys[2].time/2+.01,'inhale shorter than half the cycle');
 const at=(t:number)=>frameState(p,t).poses.character.scaleY,h=1e-3;assert.ok(Math.abs(at(0)-at(7))<1e-9);assert.ok(Math.abs((at(h)-at(0))-(at(7)-at(7-h)))<1e-4,'velocity seam');
 assert.ok(p.signals?.some(s=>s.id==='character-drift'),'drift signal');
});

test('idle composes breathing, synchronized seeded blinks and a tail sway from its base, and explains what it skipped',()=>{
 const d=doc(labels());const r=expandPreset(d,{id:'character',kind:'idle'},()=>true);
 assert.ok(r.pieces.some(p=>p.name==='breathe')&&r.pieces.some(p=>p.name==='blink:eye-l')&&r.pieces.some(p=>p.name==='blink:eye-r')&&r.pieces.some(p=>p.name==='tail:tail-part'));
 assert.ok(r.notes.some(n=>/gaze skipped/.test(n)),'no gaze params → note');
 d.apply([{type:'motion.preset',id:'character',kind:'idle'}]);const s=d.project.signals!;const blinks=s.filter(x=>x.source.kind==='blink');assert.equal(blinks.length,2);
 assert.equal((blinks[0].source as {seed:number}).seed,(blinks[1].source as {seed:number}).seed,'both eyes blink together');assert.deepEqual([d.project.poses.tail.pivotX,d.project.poses.tail.pivotY],[450,445]);
 const closed=Math.min(...Array.from({length:700},(_,i)=>frameState(d.project,i/100).poses['eye-left']?.scaleY??1));assert.ok(closed<.2,'the eye actually closes');
 assert.ok(exportSvg(d,{profile:'standalone'}).report.samples>0);
});

test('protection shapes the idle instead of failing it; presets never overwrite tracks',()=>{
 const d=doc(labels({'eye-l':['protected'],'tail-part':['locked']}));const r=expandPreset(d,{id:'character',kind:'idle'},(t,c)=>!(t==='eye-left'&&c==='scale')&&!(t==='tail'));void r;
 d.apply([{type:'motion.preset',id:'character',kind:'idle'}]);const ids=(d.project.signals??[]).map(s=>s.id);assert.ok(!ids.includes('eye-left-blink'),'protected eye not scaled');assert.ok(ids.includes('eye-right-blink'));assert.ok(!ids.includes('tail-idle'),'locked tail untouched');
 const e=doc([{type:'keyframe',target:'character',property:'scaleY',time:0,value:0,layer:'pose'}]);assert.throws(()=>e.apply([{type:'motion.preset',id:'character',kind:'breathe',style:'organic'}]),/overwrite/);
 const region=doc([{type:'semantic.label',node:{id:'eye-x',role:'eye-left',label:'X',targets:[],region:{kind:'ellipse',cx:292,cy:265,rx:20,ry:20}}}]);const rr=expandPreset(region,{id:'character',kind:'idle'},()=>true);assert.ok(rr.notes.some(n=>/extract it/.test(n)));
});
