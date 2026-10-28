// Lane A / ADR-003 §A.7–A.8: a safe expression DSL for relationships between channels, and overlap chains that truly
// propagate (motion.propagate compiles to expression signals).
import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState} from '../packages/core/animation.js';
import {parseExpr,evalExpr,type ExprHost} from '../packages/core/expr.js';
import {exportSvg} from '../packages/core/export.js';
import {renderSvg,closeRenderer} from '../packages/server/render.js';

const host:ExprHost={duration:2,loop:false,fps:60,part:()=>0,param:()=>0,signal:()=>0,value:()=>0,noise:()=>0,ease:(_n,u)=>u,sim:(_s,c)=>c()};
const val=(src:string,t=0)=>evalExpr(parseExpr(src),t,host);

test('parser: precedence, ternary and math; division by zero and non-finite results are 0',()=>{
 assert.equal(val('-2^2'),-4);assert.equal(val('2^3^2'),512);assert.equal(val('1+2*3-4/2'),5);assert.equal(val('t>1 ? 10 : 20',1.5),10);
 assert.equal(val('clamp(5,0,3)+mix(0,10,.25)+smoothstep(0,1,.5)'),3+2.5+.5);assert.equal(val('1/0'),0);assert.equal(val('log(-1)+sqrt(-4)'),0);
 assert.equal(val('mod(-1,3)'),2);assert.equal(val('linear(5,0,2,0,1)'),1);assert.equal(val('map(5,0,2,0,1)'),2.5);
});

test('parser: rejects anything outside the language with a coded error',()=>{
 const bad:[string,RegExp][]=[['constructor',/UNKNOWN_IDENTIFIER/],['__proto__',/UNKNOWN_IDENTIFIER/],['eval(1)',/UNKNOWN_FUNCTION/],['toString(1)',/UNKNOWN_FUNCTION/],
  ['1;2',/SYNTAX/],['x=1',/SYNTAX/],['a[0]',/SYNTAX/],['sin(1,2)',/ARITY/],['spring(t, t, 9)',/NONCONSTANT/],['noise(t)',/NONCONSTANT/],['body.color',/BAD_REFERENCE/],['camera.x',/BAD_REFERENCE/],
  ['('.repeat(30)+'1'+')'.repeat(30),/TOO_COMPLEX/],[Array.from({length:200},()=>'1').join('+'),/TOO_COMPLEX/],['x'.repeat(1001),/TOO_COMPLEX/],["'a'+1",/SYNTAX|string/],['body.x.y',/SYNTAX/]];
 for(const [src,re]of bad)assert.throws(()=>parseExpr(src),re,src);
});

const doc=(loop=false)=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:2,loop}]);return d;};
const sig=(id:string,target:string,property:'x'|'y'|'rotation',expr:string,layer='pose')=>({type:'signal.add' as const,signal:{id,output:{target,property,layer},source:{kind:'expr' as const,expr}}});
test('expressions read other channels (keys + signals), param and sig refs; a part may read its own channel without a cycle',()=>{
 const d=doc();d.apply([{type:'keyframe',target:'body',property:'rotation',time:0,value:0},{type:'keyframe',target:'body',property:'rotation',time:2,value:10,easing:'linear'},
  {type:'signal.add',signal:{id:'wob',output:{target:'body',property:'y',layer:'pose'},source:{kind:'oscillator',wave:'sine',period:1,amplitude:3}}},
  sig('follow','nose','y','body.rotation*2 + body.y'),sig('self','nose','rotation','value + 5'),sig('chain','tail','x',"sig('follow') - 1")]);
 for(const t of [.3,1.1,1.7]){const f=frameState(d.project,t);const bodyRot=t*5;assert.ok(Math.abs(f.poses.nose.y-(bodyRot*2+f.poses.body.y))<1e-9,`nose follows body at ${t}`);assert.ok(Math.abs(f.poses.nose.rotation-5)<1e-9);assert.ok(Math.abs(f.poses.tail.x-(f.poses.nose.y-1))<1e-9);}
 d.apply([sig('loopA','tail','y','1'),sig('loopB','tail','rotation',"sig('loopA')")]);
 assert.throws(()=>d.apply([{type:'signal.update',id:'loopA',signal:{source:{kind:'expr',expr:"sig('loopB')"}}}]),/MAI_EXPR_CYCLE: signal cycle loopA → loopB → loopA/);
 d.apply([{type:'signal.remove',id:'loopB'},{type:'signal.remove',id:'loopA'}]);
 assert.throws(()=>d.apply([sig('ghost','tail','y','nobody.x')]),/MAI_EXPR_MISSING_TARGET/);
 assert.throws(()=>d.apply([{type:'signal.remove',id:'follow'}]),/signal follow not found/,'a signal other expressions read cannot be removed first');
 assert.deepEqual(new VectorDocument(d.toSVG()).project.signals,d.project.signals,'round-trip');
});

test('spring and smooth follow with lag; the spring overshoots and settles; loops stay seamless and results are deterministic',()=>{
 const build=()=>{const d=doc();d.apply([{type:'keyframe',target:'body',property:'rotation',time:0,value:0,easing:'step'},{type:'keyframe',target:'body',property:'rotation',time:.5,value:10,easing:'step'},{type:'keyframe',target:'body',property:'rotation',time:2,value:10},
  sig('s','tail','rotation','spring(body.rotation, 80, 6)'),sig('l','nose','rotation','smooth(body.rotation, .15)')]);return d;};
 const d=build(),rot=(id:string,t:number)=>frameState(d.project,t).poses[id].rotation;
 assert.ok(rot('tail',.55)<5,'spring lags the step');const peak=Math.max(...Array.from({length:150},(_,i)=>rot('tail',.5+i/100)));assert.ok(peak>10.5,`overshoots: ${peak}`);assert.ok(Math.abs(rot('tail',2)-10)<.3,'settles');
 const lag=Array.from({length:150},(_,i)=>rot('nose',.5+i/100));assert.ok(Math.max(...lag)<=10+1e-6,'smooth never overshoots');assert.ok(lag[10]<10&&lag[10]>3);
 const again=build();for(const t of [.6,.9,1.3])assert.equal(frameState(again.project,t).poses.tail.rotation,rot('tail',t));
 const L=doc(true);L.apply([{type:'keyframe',target:'body',property:'rotation',time:0,value:0},{type:'keyframe',target:'body',property:'rotation',time:1,value:12},{type:'keyframe',target:'body',property:'rotation',time:2,value:0},sig('s','tail','rotation','spring(body.rotation, 40, 4)')]);
 const r=(t:number)=>frameState(L.project,t).poses.tail.rotation;assert.ok(Math.abs(r(0)-r(2))<1e-6,'loop seam value');
});

test('motion.propagate: overlap travels down the chain (later, bigger peaks), deleting a link removes what depended on it, SMIL matches the engine',async()=>{
 const d=doc();d.apply([{type:'keyframe',target:'body',property:'rotation',time:0,value:0},{type:'keyframe',target:'body',property:'rotation',time:.5,value:12,easing:'ease-in-out'},{type:'keyframe',target:'body',property:'rotation',time:1,value:0},
  {type:'motion.propagate',id:'whip',driver:{target:'body',property:'rotation'},links:[{target:'tail'},{target:'nose'}],preset:'tail'}]);
 assert.deepEqual(d.project.signals!.map(s=>s.id),['whip-0','whip-1']);assert.match((d.project.signals![1].source as {expr:string}).expr,/sig\('whip-0'\)/);
 const series=(id:string)=>Array.from({length:201},(_,i)=>frameState(d.project,i/100).poses[id].rotation);const peakAt=(xs:number[])=>xs.reduce((b,v,i)=>Math.abs(v)>Math.abs(xs[b])?i:b,0);
 const tail=series('tail'),nose=series('nose'),onset=(xs:number[])=>xs.findIndex(v=>Math.abs(v)>.2*Math.abs(xs[peakAt(xs)]));
 assert.ok(Math.abs(tail[peakAt(tail)])>1,'the tail moves');assert.ok(onset(nose)>onset(tail),`the nose starts after the tail (${onset(tail)} → ${onset(nose)})`);
 assert.ok(Math.abs(nose[peakAt(nose)])>Math.abs(tail[peakAt(tail)]),'the whip grows toward the tip');assert.ok(nose.every(v=>Math.abs(v)<25),'soft limit never reaches the hard limit');
 const F=doc();F.apply([{type:'keyframe',target:'tail',property:'rotation',time:0,value:0},{type:'keyframe',target:'tail',property:'rotation',time:.4,value:10},{type:'keyframe',target:'tail',property:'rotation',time:2,value:10},{type:'motion.propagate',id:'copy',mode:'follow',driver:{target:'tail'},links:[{target:'nose',delay:.1}]}]);
 const copy=Array.from({length:201},(_,i)=>frameState(F.project,i/100).poses.nose.rotation);assert.ok(copy[20]<5&&Math.abs(copy[200]-10)<.5,`follow copies late and settles (${copy[20]}, ${copy[200]})`);
 assert.throws(()=>d.apply([{type:'motion.propagate',id:'whip',driver:{target:'body'},links:[{target:'tail'}]}]),/exists; pass replace/);
 const r=exportSvg(d,{profile:'standalone',tolerance:.05});const px=async(svg:string,t=0)=>sharp((await renderSvg(svg,t)).png).ensureAlpha().raw().toBuffer();
 try{for(const t of [.35,.8,1.4]){const a=await px(r.svg,t),b=await px(d.frame(t));const m=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;assert.ok(m<.25,`t=${t} mean=${m}`);}}finally{await closeRenderer();}
 d.apply([{type:'delete',ids:['tail']}]);assert.deepEqual(d.project.signals??[],[],'the tail link and the nose link that read it are gone');
});
