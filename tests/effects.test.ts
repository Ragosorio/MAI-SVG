// Lane B / ADR-003 §A.11: the effects stack is a transparent macro; overlays respect identity; echo uses <use> ghosts.
import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState} from '../packages/core/animation.js';
import {exportSvg} from '../packages/core/export.js';
import {renderSvg,closeRenderer} from '../packages/server/render.js';

const doc=(ops:Parameters<VectorDocument['apply']>[0]=[])=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:2,loop:true},...ops]);return d;};
const label=(id:string,targets:string[],protection:string[])=>({type:'semantic.label' as const,node:{id,role:id,label:id,targets,protection:protection as never}});

test('a glow compiles into one fx- filter on the target with readable primitive ids, and can be removed cleanly',()=>{
 const d=doc([{type:'effect.stack',id:'g',target:'eye-left',effects:[{kind:'glow',params:{radius:6,pulse:2,period:1}}]}]);
 assert.equal(d.element('eye-left').getAttribute('filter'),'url(#fx-g)');assert.ok(d.index.get('fx-g-0')&&d.index.get('fx-g-3'));assert.deepEqual(d.project.effects?.[0].kinds,['glow']);
 assert.ok(d.project.signals?.some(s=>s.id==='fx-g-glow-pulse'),'animated parameter is a signal');
 d.apply([{type:'effect.remove',id:'g'}]);assert.ok(!d.index.get('fx-g'));assert.equal(d.element('eye-left').getAttribute('filter'),null);assert.equal((d.project.signals??[]).length,0);
});

test('identity: overlays are allowed on protected parts; recolor on color-preserved, warps on protected and anything on locked are blocked',()=>{
 const blocked=(d:VectorDocument,ops:Parameters<VectorDocument['apply']>[0])=>assert.throws(()=>d.apply(ops),(e:{code?:string})=>e.code==='IDENTITY_BLOCKED');
 const d=doc([label('eye',['eye-left'],['protected']),label('nose',['nose'],['color-preserved']),label('tail',['tail'],['locked'])]);
 assert.doesNotThrow(()=>d.apply([{type:'effect.stack',id:'g',target:'eye-left',effects:[{kind:'glow'},{kind:'shadow'}]}]));
 blocked(d,[{type:'effect.stack',id:'s',target:'nose',effects:[{kind:'saturate',params:{amount:2}}]}]);
 d.apply([label('eye2',['eye-right'],['protected'])]);blocked(d,[{type:'effect.stack',id:'w',target:'eye-right',effects:[{kind:'displace'}]}]);
 blocked(d,[{type:'effect.stack',id:'t',target:'tail',effects:[{kind:'glow'}]}]);
 assert.throws(()=>doc([{type:'filter.set',id:'mine',target:'body',primitives:[{kind:'blur',attrs:{stdDeviation:1}}]}]).apply([{type:'effect.stack',id:'b',target:'body',effects:[{kind:'blur'}]}]),/already has a filter/);
});

test('motion smear blurs only while the part moves, along its direction',()=>{
 const d=doc([{type:'keyframe',target:'tail',property:'x',time:0,value:0,easing:'linear'},{type:'keyframe',target:'tail',property:'x',time:1,value:200,easing:'linear'},{type:'keyframe',target:'tail',property:'x',time:2,value:200},
  {type:'effect.stack',id:'m',target:'tail',effects:[{kind:'motionSmear',params:{gain:.02,max:8}}]}]);
 const sd=(t:number)=>String(frameState(d.project,t).attrs['fx-m-0']?.stdDeviation??'0 0').split(' ').map(Number);
 assert.ok(sd(.5)[0]>3&&sd(.5)[1]<.01,`moving horizontally: ${sd(.5)}`);assert.ok(sd(1.6)[0]<.01,`at rest: ${sd(1.6)}`);
 d.apply([{type:'delete',ids:['tail']}]);assert.equal((d.project.effects??[]).length,0);assert.equal((d.project.signals??[]).length,0,'deleting the target removes its effect and signals');
});

test('echo ghosts trail the motion with <use> (no duplicate ids), unwrap on reopen and match the engine in Chromium',async()=>{
 const d=doc([{type:'pose',id:'tail',pose:{pivotX:450,pivotY:440}},{type:'keyframe',target:'tail',property:'rotation',time:0,value:-20,easing:'ease-in-out'},{type:'keyframe',target:'tail',property:'rotation',time:1,value:25,easing:'ease-in-out'},{type:'keyframe',target:'tail',property:'rotation',time:2,value:-20},
  {type:'effect.stack',id:'e',target:'tail',effects:[{kind:'echo',params:{count:3,delay:.08,falloff:.5}}]}]);
 const f=d.frame(.5);assert.equal((f.match(/<use [^>]*href="#tail"/g)??[]).length,3);const ids=[...f.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'ids stay unique');
 const r=exportSvg(d,{profile:'standalone',tolerance:.05});assert.equal((r.svg.match(/<use [^>]*href="#tail"/g)??[]).length,3);
 assert.ok(!new VectorDocument(exportSvg(d,{profile:'editable'}).svg).toSVG().includes('<use'),'ghosts are generated, not authored');
 const px=async(svg:string,t=0)=>sharp((await renderSvg(svg,t)).png).ensureAlpha().raw().toBuffer();
 try{for(const t of [.3,.9,1.5]){const a=await px(r.svg,t),b=await px(d.frame(t));const m=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;assert.ok(m<.3,`t=${t} mean=${m}`);}}finally{await closeRenderer();}
});
