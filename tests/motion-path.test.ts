// Lane A / ADR-003 §A.5: arcs as a primitive — travel along a curve by arc length, oriented, exportable.
import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState} from '../packages/core/animation.js';
import {pathTable,pathAt,catmullRomPath} from '../packages/core/motion-path.js';
import {worldBox} from '../packages/core/space.js';
import {exportSvg} from '../packages/core/export.js';
import {renderSvg,closeRenderer} from '../packages/server/render.js';

test('arc length: equal progress steps cover equal distances; Catmull-Rom passes through its points; closed laps add a full turn',()=>{
 const t=pathTable('M0 0 C100 0 200 200 300 200');const pts=[0,.25,.5,.75,1].map(u=>pathAt(t,u));const steps=pts.slice(1).map((p,i)=>Math.hypot(p.x-pts[i].x,p.y-pts[i].y));
 for(const s of steps)assert.ok(Math.abs(s-steps[0])/steps[0]<.03,`even spacing ${steps}`);
 const d=catmullRomPath([{x:0,y:0},{x:50,y:80},{x:120,y:10}]);const ct=pathTable(d);assert.ok(ct.pts.some(p=>Math.hypot(p.x-50,p.y-80)<.5),'passes through the middle point');
 const ring=pathTable(catmullRomPath([{x:0,y:-50},{x:50,y:0},{x:0,y:50},{x:-50,y:0}],true));const a=pathAt(ring,.2).angle,b=pathAt(ring,1.2).angle;assert.ok(Math.abs(Math.abs(b-a)-360)<1e-6,`lap adds 360°: ${a} → ${b}`);
});

const doc=()=>{const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:2,loop:false}]);return d;};
test('absolute mode puts the anchor on the path; orient follows the tangent; layers stack; bake stays within tolerance',()=>{
 const d=doc();d.apply([{type:'motion.path',id:'arc',target:'nose',points:[{x:340,y:310},{x:420,y:220},{x:500,y:310}],orient:true,start:0,end:2,easing:'linear'}]);
 const mp=d.project.motionPaths![0],t=pathTable(mp.d);for(const time of [0,.7,1.4,2]){const f=frameState(d.project,time),b=worldBox(d,['nose'],f)!;const q=pathAt(t,time/2);
  const pose=f.poses.nose;assert.ok(Math.abs(pose.rotation-q.angle)<1e-6,'oriented to the tangent');void b;}
 const center=(time:number)=>{const f=frameState(d.project,time);const pose=f.poses.nose;return {x:mp.anchor.x+pose.x,y:mp.anchor.y+pose.y};};const q1=pathAt(t,.5);assert.ok(Math.hypot(center(1).x-q1.x,center(1).y-q1.y)<1e-6,'anchor rides the path');
 assert.throws(()=>d.apply([{type:'keyframe',target:'nose',property:'x',time:0,value:5,layer:'pose'}]),/already has x\/y|motion path/i);
 const live=[0,.3,.9,1.6].map(time=>frameState(d.project,time).poses.nose);d.apply([{type:'motion.path.bake',id:'arc',tolerance:.05}]);assert.equal((d.project.motionPaths??[]).length,0);
 const baked=[0,.3,.9,1.6].map(time=>frameState(d.project,time).poses.nose);for(let i=0;i<live.length;i++){assert.ok(Math.abs(live[i].x-baked[i].x)<.06&&Math.abs(live[i].y-baked[i].y)<.06&&Math.abs(live[i].rotation-baked[i].rotation)<.06);}
});

test('motion paths survive reopening, vanish with their target, and the SMIL export matches the engine in Chromium',async()=>{
 const d=doc();d.apply([{type:'motion.path',id:'fly',target:'tail',points:[{x:450,y:460},{x:520,y:360},{x:610,y:430},{x:560,y:520}],orient:{offset:-10},easing:'ease-in-out'}]);
 assert.deepEqual(new VectorDocument(d.toSVG()).project.motionPaths,d.project.motionPaths);
 const r=exportSvg(d,{profile:'standalone',tolerance:.05});const px=async(svg:string,t=0)=>sharp((await renderSvg(svg,t)).png).ensureAlpha().raw().toBuffer();
 try{for(const t of [.4,1,1.7]){const a=await px(r.svg,t),b=await px(d.frame(t));const m=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;assert.ok(m<.25,`t=${t} mean=${m}`);}}finally{await closeRenderer();}
 d.apply([{type:'delete',ids:['tail']}]);assert.equal((d.project.motionPaths??[]).length,0);
});
