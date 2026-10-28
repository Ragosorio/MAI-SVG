// Lane B / ADR-003 §A.9: a 2.5D camera that is a view transform — never a change to the artwork.
import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState} from '../packages/core/animation.js';
import {vanWijk,cameraMatrix,planeRelative,fitView,cameraFindings} from '../packages/core/camera.js';
import {mul,worldBox} from '../packages/core/space.js';
import {exportSvg} from '../packages/core/export.js';
import {critique} from '../packages/core/critique.js';
import {renderSvg,closeRenderer} from '../packages/server/render.js';

const view={x:0,y:0,width:700,height:700};const cfg={view};
const close=(a:number[],b:number[],eps=1e-9)=>a.every((v,i)=>Math.abs(v-b[i])<eps);
const pixels=async(svg:string,t=0)=>sharp((await renderSvg(svg,t)).png).ensureAlpha().raw().toBuffer();
const mean=(a:Buffer,b:Buffer)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;

test('camera math: rest is the identity, plane-relative = M⁻¹·M_f, fit keeps the box inside the view',()=>{
 assert.ok(close(cameraMatrix(cfg,{x:350,y:350,zoom:1,rotation:0}),[1,0,0,1,0,0]));
 const s={x:300,y:260,zoom:1.8,rotation:7};for(const f of [.2,.55,1.35]){const r=planeRelative(cfg,s,f);const rel:[number,number,number,number,number,number]=[r.scale,0,0,r.scale,r.translate.x+r.scale*r.back.x,r.translate.y+r.scale*r.back.y];
  assert.ok(close(mul(cameraMatrix(cfg,s),rel),cameraMatrix(cfg,s,f),1e-6),`plane ${f}`);}
 const st=fitView(cfg,{x0:200,y0:100,x1:300,y1:400},.1),m=cameraMatrix(cfg,st);for(const [x,y] of [[200,100],[300,400]]){const sx=m[0]*x+m[2]*y+m[4],sy=m[1]*x+m[3]*y+m[5];assert.ok(sx>=-1e-6&&sx<=700+1e-6&&sy>=-1e-6&&sy<=700+1e-6);}
});

test('van Wijk: exact endpoints, pure zoom limit, and a long pan zooms out mid-way',()=>{
 const v=vanWijk([100,100,200],[600,600,200]);assert.ok(close(v.at(0),[100,100,200],1e-6)&&close(v.at(1),[600,600,200],1e-6));assert.ok(v.at(.5)[2]>200,'zooms out to travel');
 const z=vanWijk([300,300,700],[300,300,100]);assert.ok(close(z.at(1),[300,300,100],1e-6));assert.ok(z.at(.5)[2]<700&&z.at(.5)[2]>100);
});

test('a camera without motion renders exactly like no camera; without a camera frame() is unchanged',async()=>{
 const plain=new VectorDocument(starterSvg),cam=new VectorDocument(starterSvg);cam.apply([{type:'camera.set',camera:{}}]);
 assert.ok(!plain.frame(0).includes('mai-camera'));assert.ok(cam.frame(0).includes('id="mai-camera"'));
 try{assert.equal(mean(await pixels(plain.frame(0)),await pixels(cam.frame(0))),0);}finally{await closeRenderer();}
});

test('shots compile to keys inside their window; ops on a fully protected scene succeed; identity state ignores the camera',()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:5,loop:false},{type:'semantic.label',node:{id:'cat',role:'character',label:'Cat',targets:['character'],protection:['locked']}}]);
 d.apply([{type:'camera.shot',shot:{intent:'push-in',subject:'eye-left',start:1,duration:2}}]);
 const zoom=d.project.tracks.find(t=>t.target==='@camera'&&t.property==='zoom')!;assert.ok(zoom.keys.every(k=>k.time>=1-1e-9&&k.time<=3+1e-9));assert.ok(Number(zoom.keys.at(-1)!.value)>2,'pushes in');
 assert.deepEqual(frameState(d.project,2.5,{camera:false}).poses,frameState(new VectorDocument(starterSvg).project,2.5).poses,'artwork poses untouched');
 d.apply([{type:'camera.shot',shot:{intent:'handheld',start:0,duration:5,intensity:.8,id:'hh'}}]);assert.equal(d.project.signals?.filter(s=>s.output.target==='@camera').length,3);
 d.apply([{type:'camera.fit',targets:['character'],time:4.5,padding:.1}]);const c=frameState(d.project,4.5).camera!;const b=worldBox(d,['character'],frameState(d.project,4.5))!;const m=cameraMatrix(d.project.camera!,c);
 for(const [x,y] of [[b.x0,b.y0],[b.x1,b.y1]]){const sx=m[0]*x+m[2]*y+m[4];assert.ok(sx>-1&&sx<701,'fitted');}
 assert.deepEqual(new VectorDocument(d.toSVG()).project.camera,d.project.camera,'camera survives reopening');
 assert.throws(()=>new VectorDocument(starterSvg).apply([{type:'keyframe',target:'body',property:'zoom',time:0,value:2}]),/camera property/);
});

test('camera critique names a subject that leaves the safe area and an over-fast pan',()=>{
 const states=[0,1,2,3,4].map(t=>({time:t*.1,state:{x:350+t*400,y:350,zoom:1,rotation:0},subject:{x0:300,y0:300,x1:400,y1:400}}));const codes=cameraFindings(cfg,states).map(f=>f.code);
 assert.ok(codes.includes('MAI_CAMERA_SUBJECT_OUTSIDE')&&codes.includes('MAI_CAMERA_FAST'));
 const d=new VectorDocument(starterSvg);d.apply([{type:'camera.set',camera:{subject:'character'}},{type:'keyframe',target:'@camera',property:'x',time:0,value:350},{type:'keyframe',target:'@camera',property:'x',time:.5,value:1500}]);
 assert.ok(critique(d).deterministic.findings.some(f=>f.code==='MAI_CAMERA_SUBJECT_OUTSIDE'));
});

test('standalone SMIL camera (push-in, roll, parallax planes and a cut) matches the engine in Chromium; editable reopens clean',async()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:4,loop:false},{type:'camera.depth',target:'tail',plane:'background'},{type:'camera.depth',target:'nose',factor:1.35},
  {type:'camera.shot',shot:{intent:'push-in',subject:'eye-left',start:.2,duration:1.6}},{type:'camera.shot',shot:{intent:'orbit-2d',start:2,duration:1,intensity:.6}},{type:'camera.shot',shot:{intent:'cut',start:3.4,to:{framing:'wide'}}}]);
 const r=exportSvg(d,{profile:'standalone',tolerance:.05});assert.ok(r.report.cameraGroups>=10);
 const editable=exportSvg(d,{profile:'editable'}).svg,reopened=new VectorDocument(editable);assert.ok(!reopened.toSVG().includes('mai-camera'),'generated camera groups unwrap on reopen');assert.deepEqual(reopened.project.camera,d.project.camera);
 try{for(const t of [0,.9,1.8,2.5,3.39,3.41,3.9]){const m=mean(await pixels(r.svg,t),await pixels(d.frame(t)));assert.ok(m<.35,`t=${t} mean=${m}`);}}finally{await closeRenderer();}
});

test('critique warns when parallax reveals the border of a full-bleed plane (needs bleed), and wide framing never zooms out of a full-bleed scene',async()=>{
 const {readFileSync}=await import('node:fs');const d=new VectorDocument(readFileSync(new URL('../benchmarks/motion/cases/hero-reveal/original.svg',import.meta.url),'utf8'));
 d.apply([{type:'timeline',duration:4,loop:false},{type:'camera.depth',target:'grass',plane:'foreground'},{type:'camera.shot',shot:{intent:'establish',start:0,duration:1}},{type:'camera.shot',shot:{intent:'push-in',subject:'cat',start:1,duration:3,to:{framing:'medium'}}}]);
 assert.ok(frameState(d.project,0).camera!.zoom>=1,'establish starts from the full view');
 assert.ok(critique(d).deterministic.findings.some(f=>f.code==='MAI_CAMERA_PLANE_EDGE'&&f.target==='grass'));
});

test('follow: the camera eases into a framing, then tracks a moving subject with lag and keeps it in frame',()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:3,loop:false},{type:'keyframe',target:'nose',property:'x',time:0,value:0},{type:'keyframe',target:'nose',property:'x',time:.8,value:0},{type:'keyframe',target:'nose',property:'x',time:2.6,value:160},
  {type:'camera.shot',shot:{id:'chase',intent:'follow',subject:'nose',start:0,duration:2.8,motion:'smooth',to:{zoom:1.6}}}]);
 assert.deepEqual(d.project.signals!.map(s=>s.id),['chase-follow-x','chase-follow-y']);assert.match((d.project.signals![0].source as {expr:string}).expr,/smooth\(\(ref\('nose','x'\)\)\/1, 0\.25\)/);
 const cam=(t:number)=>frameState(d.project,t).camera!;const nose=(t:number)=>{const f=frameState(d.project,t,{camera:false});const b=worldBox(d,['nose'],f)!;return (b.x0+b.x1)/2;};
 const gap=(t:number)=>nose(t)-cam(t).x;assert.ok(Math.abs(gap(.8))<1&&Math.abs(cam(.8).zoom-1.6)<1e-6,'framed on the subject when the move starts');assert.ok(cam(2).x>cam(1.2).x&&cam(2.4).x>cam(2).x,'the camera travels with the subject');
 assert.ok(gap(2)>gap(1)+1,'it lags behind a moving subject');const c=cam(2.2),w=700/c.zoom;assert.ok(Math.abs(nose(2.2)-c.x)<w*.4,'subject stays inside the frame');
 assert.ok(Math.abs(cam(2.95).x-cam(2.8).x)<.01&&cam(2.8).x>cam(2.2).x,'after the shot it rests where the subject took it (no reverse pan)');
});
