// F3 / ADR-003 §A.13: the creative envelope — per-channel free/bounded/preserve, time-aware budgets and transient
// deviations that must recover before rest. Constrain identity, not creativity.
import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {verifyEnvelope} from '../packages/core/identity-guard.js';

const blink=(amplitude=-.92)=>({type:'signal.add' as const,signal:{id:'blink-l',output:{target:'eye-left',property:'scaleY' as const,layer:'blink'},source:{kind:'blink' as const,interval:[1.4,2.2] as [number,number],close:.07,amplitude,seed:3}}});
const doc=(envelope?:object)=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:5,loop:true},{type:'pose',id:'eye-left',pose:{pivotX:292,pivotY:265}},
 {type:'semantic.label',node:{id:'eye-l',role:'eye-left',label:'L',targets:['eye-left']}},{type:'semantic.protect',id:'eye-l',protection:['protected']},...(envelope?[{type:'semantic.envelope' as const,id:'eye-l',envelope:envelope as never}]:[])]);return d;};
const code=(f:()=>void)=>{try{f();}catch(e){return {code:(e as {code?:string}).code,detail:(e as {detail?:Record<string,unknown>}).detail,message:(e as Error).message};}return undefined;};

test('a protected eye cannot blink; a bounded deform channel with a transient lets it blink and keeps rest exact',()=>{
 assert.equal(code(()=>doc().apply([blink()]))?.code,'IDENTITY_BLOCKED','protection alone forbids scale');
 const d=doc({deform:'bounded',bounds:{scale:.5},transientDeviation:{allowed:true,maxDuration:.4,maxPeak:2}});d.apply([blink()]);
 const [m]=verifyEnvelope(d,[blink()]);assert.ok(m.spans.length>=1&&m.spans.every(s=>s.accepted),'each blink is an accepted excursion');assert.ok(m.metrics.find(x=>x.metric==='scale')!.peak>.9);
 assert.deepEqual(new VectorDocument(d.toSVG()).project.semantic!.nodes[0].envelope,d.project.semantic!.nodes[0].envelope,'round-trip');
});

test('excursions fail with a reason: too big, too long, not recovered at rest, or transients not allowed',()=>{
 const big=code(()=>doc({deform:'bounded',bounds:{scale:.2},transientDeviation:{allowed:true}}).apply([blink()]));assert.equal(big?.code,'IDENTITY_BLOCKED');assert.match(String(big?.detail?.reason),/exceeds 2× the budget/);
 const none=code(()=>doc({deform:'bounded',bounds:{scale:.5}}).apply([blink()]));assert.match(String(none?.detail?.reason),/not allowed/);assert.equal(none?.detail?.kind,'envelope');
 const squash=[{type:'keyframe' as const,target:'eye-left',property:'scaleY' as const,time:0,value:1},{type:'keyframe' as const,target:'eye-left',property:'scaleY' as const,time:2,value:.7},{type:'keyframe' as const,target:'eye-left',property:'scaleY' as const,time:5,value:.7}];
 const stuck=code(()=>doc({deform:'bounded',bounds:{scale:.1},transientDeviation:{allowed:true,maxDuration:10,maxPeak:5}}).apply(squash));assert.match(String(stuck?.detail?.reason),/does not recover before a rest point/);
 const long=code(()=>doc({deform:'bounded',bounds:{scale:.1},transientDeviation:{allowed:true,maxDuration:.3,maxPeak:5,mustRecover:false}}).apply(squash));assert.match(String(long?.detail?.reason),/lasts .* s \(max 0.3 s\)/);
});

test('loosening and animating in one transaction is still measured; preserve denies a channel even on a free part; rigid bounds use the part size',()=>{
 const d=doc();const r=code(()=>d.apply([{type:'semantic.envelope',id:'eye-l',envelope:{deform:'bounded',bounds:{scale:.05}}},blink()]));assert.equal(r?.code,'IDENTITY_BLOCKED');assert.equal(d.project.semantic!.nodes[0].envelope,undefined,'rolled back');
 const f=new VectorDocument(starterSvg);f.apply([{type:'semantic.label',node:{id:'tail-p',role:'tail',label:'Tail',targets:['tail']}},{type:'semantic.envelope',id:'tail-p',envelope:{deform:'preserve'}}]);
 assert.equal(code(()=>f.apply([{type:'keyframe',target:'tail',property:'scaleX',time:1,value:1.3}]))?.code,'IDENTITY_BLOCKED','preserve on a free part');
 f.apply([{type:'keyframe',target:'tail',property:'rotation',time:1,value:20}]);
 const g=doc({rigidTransform:'bounded',bounds:{translate:.2}});g.apply([{type:'keyframe',target:'eye-left',property:'x',time:1,value:2},{type:'keyframe',target:'eye-left',property:'x',time:2,value:0}]);
 const far=code(()=>g.apply([{type:'keyframe',target:'eye-left',property:'x',time:1,value:300}]));assert.equal(far?.detail?.metric,'translate');
});
test('ancestor scale signals are judged by their amplitude, and preserve blocks name the envelope channel',()=>{
 const make=()=>{const m=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="torso"><rect id="trunk" x="20" y="20" width="60" height="70"/><circle id="mark" cx="50" cy="40" r="5"/></g></svg>');
  m.apply([{type:'semantic.label',node:{id:'mark',role:'eye',label:'Marca',targets:['mark'],status:'confirmed',source:'agent'}},{type:'semantic.envelope',id:'mark',envelope:{deform:'preserve',paint:'preserve'}}]);return m;};
 const breath=(amplitude:number)=>({type:'signal.add' as const,signal:{id:'breath',output:{target:'torso',property:'scaleY' as const,layer:'pose'},source:{kind:'oscillator' as const,wave:'sine' as const,period:2,amplitude}}});
 const ok=make();ok.apply([breath(.02)]);assert.equal(ok.project.signals?.length,1);
 const big=make();assert.throws(()=>big.apply([breath(.3)]),(e:Error)=>/Envelope of mark sets deform: preserve/.test(e.message)&&/bounded/.test(e.message));
 assert.throws(()=>make().apply([{type:'signal.add',signal:{id:'s',output:{target:'mark',property:'scaleY',layer:'pose'},source:{kind:'oscillator',wave:'sine',period:2,amplitude:.01}}}]),/deform: preserve/);
});
