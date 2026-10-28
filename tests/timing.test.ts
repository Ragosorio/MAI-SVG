// Plan F2/lane A, ADR-003 §A.10: acting beats as data, the acting.beat teaching macro and beat-aware critique.
import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {valueAt} from '../packages/core/animation.js';
import {actingBeat,significantTimes,restPoints} from '../packages/core/timing.js';
import {critique} from '../packages/core/critique.js';

const doc=(ops:Parameters<VectorDocument['apply']>[0]=[])=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:4,fps:30,loop:false},{type:'pose',id:'tail',pose:{pivotX:450,pivotY:440}},...ops]);return d;};
const tail=(d:VectorDocument)=>d.project.tracks.find(t=>t.target==='tail'&&t.property==='rotation')!;
const v=(d:VectorDocument,t:number)=>Number(valueAt(tail(d),t,false));

test('actingBeat: wind-up opposite to the action, overshoot past it, long settle onto it, continuous velocity at contact',()=>{
 const c=actingBeat({start:0,duration:2,rest:0,action:30});const vals=c.keys.map(k=>Number(k.value));
 assert.ok(vals[1]<0,'anticipation goes the other way');assert.equal(vals[2],30);assert.ok(vals[3]>30,'overshoot');assert.equal(vals.at(-1),30,'settles on the action');
 assert.deepEqual(c.beats.map(b=>b.kind),['anticipation','action','overshoot','settle']);
 const b=actingBeat({start:0,duration:2,rest:0,action:30,bounces:2});assert.equal(b.keys.length,7);assert.ok(Number(b.keys[4].value)<30&&Number(b.keys[5].value)>30,'decaying alternating bounces');
 assert.throws(()=>actingBeat({start:0,duration:1,rest:0,action:1,timing:{anticipation:.6,action:.3,overshoot:.2,settle:.2}}),/sum/);
});

test('acting.beat op: keeps keys outside its window, starts from the current value, records beats, and its velocity is continuous',()=>{
 const d=doc([{type:'keyframe',target:'tail',property:'rotation',time:0,value:5},{type:'keyframe',target:'tail',property:'rotation',time:3.6,value:-4},{type:'keyframe',target:'tail',property:'rotation',time:4,value:0}]);
 d.apply([{type:'acting.beat',target:'tail',property:'rotation',start:1,duration:2,action:25,id:'flick'}]);
 const times=tail(d).keys.map(k=>k.time);assert.ok(times.includes(0)&&times.includes(3.6)&&times.includes(4),'outside keys kept');
 assert.ok(Math.abs(v(d,1)-Number(valueAt({target:'x',property:'rotation',keys:[{time:0,value:5,easing:'linear'},{time:3.6,value:-4,easing:'linear'}]},1)))<1e-9,'rest = value before the beat');
 assert.deepEqual(d.project.beats?.map(b=>b.kind),['anticipation','action','overshoot','settle'],'default timing fills the window (no hold)');assert.deepEqual(d.project.beats?.[0].targets,['tail']);
 const contact=tail(d).keys.find(k=>k.value===25&&k.auto==='auto')!.time,h=1e-4;assert.ok(Math.abs((v(d,contact)-v(d,contact-h))/h-(v(d,contact+h)-v(d,contact))/h)<.5,'no kink at contact');
 assert.deepEqual(new VectorDocument(d.toSVG()).project.beats,d.project.beats,'beats survive reopening');
 d.apply([{type:'acting.beat',target:'tail',property:'rotation',start:1,duration:2,action:10,id:'flick'}]);assert.equal(d.project.beats?.filter(b=>b.id.startsWith('flick-')).length,4,'re-running replaces its own beats');
});

test('acting.beat respects identity: rigid on a protected part is fine, scale is blocked',()=>{
 const d=doc([{type:'semantic.label',node:{id:'tail-part',role:'tail',label:'Tail',targets:['tail'],protection:['protected']}}]);
 assert.doesNotThrow(()=>d.apply([{type:'acting.beat',target:'tail',property:'rotation',start:0,duration:1,action:20}]));
 assert.throws(()=>d.apply([{type:'acting.beat',target:'tail',property:'scaleY',start:1,duration:1,action:1.3}]),(e:{code?:string})=>e.code==='IDENTITY_BLOCKED');
});

test('critique reads beats: moving holds, actions without wind-up and overshoots without settle are named; a compiled beat is clean',()=>{
 const codes=(d:VectorDocument)=>critique(d).deterministic.findings.map(f=>f.code);
 const clean=doc([{type:'acting.beat',target:'tail',property:'rotation',start:0,duration:3,action:30}]);const c=codes(clean);
 assert.ok(!c.includes('MAI_BEAT_NO_ANTICIPATION')&&!c.includes('MAI_BEAT_OVERSHOOT_NO_SETTLE'),`clean: ${c}`);
 const bad=doc([{type:'keyframe',target:'tail',property:'rotation',time:0,value:0},{type:'keyframe',target:'tail',property:'rotation',time:2,value:40},{type:'keyframe',target:'tail',property:'rotation',time:4,value:0},
  {type:'beat.set',beat:{id:'jump',kind:'action',start:1,end:2,targets:['tail']}},{type:'beat.set',beat:{id:'still',kind:'hold',start:2.5,end:3.5,targets:['tail']}},{type:'beat.set',beat:{id:'over',kind:'overshoot',start:2,end:2.2,targets:['tail']}}]);
 const b=codes(bad);for(const code of ['MAI_BEAT_NO_ANTICIPATION','MAI_BEAT_HOLD_MOTION','MAI_BEAT_OVERSHOOT_NO_SETTLE'])assert.ok(b.includes(code),`${code} in ${b}`);
});

test('beat boundaries are significant filmstrip times and settle/hold ends are rest points',()=>{
 const d=doc([{type:'acting.beat',target:'tail',property:'rotation',start:.37,duration:2,action:20,id:'a'}]);const times=significantTimes(d.project,12);
 for(const b of d.project.beats!)assert.ok(times.includes(b.start)||times.includes(b.end),`beat ${b.id} sampled`);
 const rest=restPoints(d.project,['tail']);assert.ok(rest.includes(0)&&rest.includes(4));assert.ok(rest.some(t=>Math.abs(t-d.project.beats!.find(b=>b.kind==='settle')!.end)<1e-9));
 assert.throws(()=>d.apply([{type:'beat.set',beat:{id:'x',kind:'hold',start:3,end:9}}]),/duration/);
});
