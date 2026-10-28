import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {SCENES,snapshot,diff} from './golden-scenes.js';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {ease,isEasing} from '../packages/core/animation.js';
import {simulateSecondary,secondaryAt} from '../packages/core/secondary.js';
import {critique} from '../packages/core/critique.js';
import {exportSvg} from '../packages/core/export.js';
import type {Easing,Secondary} from '../packages/core/model.js';

// Characterization: the v2 engine refactor must keep legacy projects byte- and value-identical (ADR-003).
for(const scene of SCENES)test(`golden: ${scene.name} frames, project and exports are unchanged`,()=>{
 const expected=JSON.parse(readFileSync(new URL(`./fixtures/golden-${scene.name}.json`,import.meta.url),'utf8'));
 const d=diff(snapshot(scene),expected);assert.deepEqual(d,[],`Golden drift in ${scene.name} (regenerate only for an intended change: npx tsx scripts/golden.ts --update):\n${d.join('\n')}`);
});

test('golden scene still exercises every legacy evaluation path',()=>{
 const p=SCENES[0].doc().project;const props=new Set(p.tracks.map(t=>t.property));
 for(const prop of ['x','y','rotation','scaleX','scaleY','opacity','fill','d','param'])assert.ok(props.has(prop as never),`missing ${prop} track`);
 const easings=new Set<string>(p.tracks.flatMap(t=>t.keys.map(k=>k.easing.startsWith('cubic')?'cubic':k.easing)));for(const e of ['linear','ease-in-out','ease-in','ease-out','overshoot','anticipate','step','cubic'])assert.ok(easings.has(e),`missing ${e}`);
 assert.deepEqual((p.secondary??[]).map(s=>s.kind).sort(),['follow','look-at','spring']);assert.equal((p.modifiers??[]).length,3);assert.ok(p.layers?.some(l=>l.blend==='override'&&l.weight<1));assert.ok(p.expression?.drivers.length);
});

test('standalone export samples animated hex colors (rounding is not interpolation error)',()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'keyframe',target:'body',property:'fill',time:0,value:'#dfad78',easing:'ease-in-out'},{type:'keyframe',target:'body',property:'fill',time:2,value:'#204080'},{type:'keyframe',target:'body',property:'fill',time:5,value:'#dfad78'}]);
 const r=exportSvg(d,{profile:'standalone'});const anim=/<animate[^>]*attributeName="fill"[^>]*values="([^"]+)"/.exec(r.svg);assert.ok(anim,'fill animation exported');
 const values=anim![1].split(';');assert.ok(values.length>=3&&values.every(v=>/^#[\da-f]{6}$/i.test(v)));assert.ok(values.includes('#204080'));
});

test('easing curves: endpoints, monotony, overshoot/anticipation and CSS cubic-bezier',()=>{
 const named:Easing[]=['linear','ease-in-out','ease-in','ease-out','overshoot','anticipate'];
 for(const e of named){assert.ok(isEasing(e));assert.ok(Math.abs(ease(e,0))<1e-12,`${e}(0)`);assert.ok(Math.abs(ease(e,1)-1)<1e-12,`${e}(1)`);}
 for(const e of ['linear','ease-in-out','ease-in','ease-out'] as Easing[])for(let i=1;i<=100;i++)assert.ok(ease(e,i/100)>=ease(e,(i-1)/100)-1e-12,`${e} monotonic`);
 assert.ok(Math.max(...Array.from({length:101},(_,i)=>ease('overshoot',i/100)))>1.05,'overshoot passes the target');
 assert.ok(Math.min(...Array.from({length:101},(_,i)=>ease('anticipate',i/100)))<-.05,'anticipate winds up');
 assert.equal(ease('step',.99),0);assert.ok(Math.abs(ease('ease-in-out',.5)-.5)<1e-12);
 // CSS `ease` = cubic-bezier(.25,.1,.25,1): y(x=.5) ≈ 0.8024.
 assert.ok(Math.abs(ease('cubic-bezier(.25,.1,.25,1)',.5)-.8024)<2e-3);assert.ok(!isEasing('cubic-bezier(1.2,0,.5,1)'));assert.ok(isEasing('cubic-bezier(.2,-.5,.3,1.6)'));
});

const spring=(o:Partial<Secondary>={}):Secondary=>({id:'s',kind:'spring',target:'t',driver:'d',property:'rotation',stiffness:120,damping:10,gain:-.2,delay:.04,limit:12,...o});
test('springs are deterministic, clamp to their limit, close loop seams and follow with delay',()=>{
 const driver=(t:number)=>-20*Math.sin(2*Math.PI*t/2);
 const a=simulateSecondary(spring(),driver,4,true),b=simulateSecondary({...spring()},t=>-20*Math.sin(2*Math.PI*t/2),4,true);assert.deepEqual(Array.from(a),Array.from(b));
 assert.ok(Math.abs(a[0]-a[a.length-1])<1e-9,'loop seam closed');assert.ok(Array.from(a).some(v=>Math.abs(v)>.5),'spring reacts to the driver');
 const tight=simulateSecondary(spring({gain:-50,limit:3}),driver,4,false);assert.ok(Array.from(tight).every(v=>Math.abs(v)<=3+1e-12),'limit clamps');
 const follow=simulateSecondary(spring({kind:'follow',gain:.5,delay:.25,limit:100}),t=>t*10,4,false);assert.ok(Math.abs(secondaryAt(follow,4,2)-.5*(2-.25)*10)<.05,'follow = gain·driver(t−delay)');
});

test('critique detects pops, loop seams, squash, sub-frame keys and stiff secondary; smooth motion stays clean',()=>{
 const make=(ops:Parameters<VectorDocument['apply']>[0])=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:2,fps:30,loop:true},...ops]);return critique(d).deterministic.findings.map(f=>f.code);};
 const clean=make([{type:'keyframe',target:'tail',property:'y',time:0,value:0,easing:'ease-in-out'},{type:'keyframe',target:'tail',property:'y',time:1,value:-20,easing:'ease-in-out'},{type:'keyframe',target:'tail',property:'y',time:2,value:0}]);
 assert.ok(!clean.includes('MAI_POP')&&!clean.includes('MAI_LOOP_POP'),`clean motion: ${clean}`);
 const pop=make([{type:'keyframe',target:'tail',property:'x',time:0,value:0},{type:'keyframe',target:'tail',property:'x',time:1,value:0},{type:'keyframe',target:'tail',property:'x',time:1.02,value:200},{type:'keyframe',target:'tail',property:'x',time:2,value:200}]);
 assert.ok(pop.includes('MAI_POP'),`pop: ${pop}`);assert.ok(pop.includes('MAI_LOOP_POP'),'loop end ≠ start');assert.ok(pop.includes('MAI_SUBFRAME_KEYS'),'keys 0.02 s apart at 30 fps');
 const squash=make([{type:'keyframe',target:'tail',property:'scaleX',time:0,value:1},{type:'keyframe',target:'tail',property:'scaleX',time:1,value:1.9},{type:'keyframe',target:'tail',property:'scaleX',time:2,value:1}]);assert.ok(squash.includes('MAI_SQUASH'));
 const stiff=make([{type:'secondary.add',secondary:{id:'s',kind:'spring',target:'tail',driver:'body',property:'rotation',stiffness:60,damping:7,gain:-.35,delay:.08,limit:25}}]);assert.ok(stiff.includes('MAI_STIFF_SECONDARY'),'driver never moves');
});
test('critique: a spinner turning whole revolutions closes its loop without a pop',()=>{
 const m=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="arc" d="M20 50 A30 30 0 0 1 80 50" stroke="#000" fill="none"/></svg>');m.project.duration=2;m.project.loop=true;
 m.apply([{type:'pose',id:'arc',pose:{pivotX:50,pivotY:50}},{type:'keyframe',target:'arc',property:'rotation',time:0,value:0},{type:'keyframe',target:'arc',property:'rotation',time:2,value:720}]);
 assert.ok(!critique(m).deterministic.findings.some(f=>f.code==='MAI_LOOP_POP'));
 m.apply([{type:'keyframe',target:'arc',property:'rotation',time:2,value:700}]);assert.ok(critique(m).deterministic.findings.some(f=>f.code==='MAI_LOOP_POP'));});
test('critique: uniform pop-in from zero is not squash, and offsets across channels are not sub-frame keys',()=>{
 const m=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="badge" cx="50" cy="50" r="10"/></svg>');m.project.duration=1;m.project.loop=false;
 for(const prop of ['scaleX','scaleY'] as const)m.apply([{type:'keyframe',target:'badge',property:prop,time:0,value:0},{type:'keyframe',target:'badge',property:prop,time:.4,value:1.2},{type:'keyframe',target:'badge',property:prop,time:1,value:1}]);
 m.apply([{type:'keyframe',target:'badge',property:'rotation',time:0,value:-20},{type:'keyframe',target:'badge',property:'rotation',time:.42,value:5},{type:'keyframe',target:'badge',property:'rotation',time:1,value:0}]);
 let codes=critique(m).deterministic.findings.map(f=>f.code);assert.ok(!codes.includes('MAI_SQUASH'));assert.ok(!codes.includes('MAI_SUBFRAME_KEYS'));
 m.apply([{type:'keyframe',target:'badge',property:'scaleY',time:.41,value:2.4},{type:'keyframe',target:'badge',property:'rotation',time:.43,value:6}]);codes=critique(m).deterministic.findings.map(f=>f.code);assert.ok(codes.includes('MAI_SQUASH'));assert.ok(codes.includes('MAI_SUBFRAME_KEYS'));});
test('critique: squash is not reported while the part is hidden by its sprite',()=>{
 const make=(sprite:boolean)=>{const m=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="open" cx="50" cy="50" r="5"/><path id="wink" d="M45 50L55 50"/></svg>');m.project.duration=4;m.project.loop=false;
  if(sprite)m.apply([{type:'sprite.define',sprite:{id:'eyes',name:'Ojos',variants:{open:['open'],wink:['wink']},initial:'open'}},{type:'sprite.keyframe',id:'eyes',state:'open',time:0},{type:'sprite.keyframe',id:'eyes',state:'wink',time:1}]);
  m.apply([{type:'keyframe',target:'open',property:'scaleY',time:0,value:1},{type:'keyframe',target:'open',property:'scaleY',time:1.2,value:1},{type:'keyframe',target:'open',property:'scaleY',time:2,value:.1},{type:'keyframe',target:'open',property:'scaleY',time:4,value:.1}]);return m;};
 const squash=(m:VectorDocument)=>critique(m).deterministic.findings.some(f=>f.code==='MAI_SQUASH');
 assert.equal(squash(make(false)),true);assert.equal(squash(make(true)),false);});
