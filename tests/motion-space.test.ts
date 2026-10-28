import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {VectorDocument} from '../packages/core/document.js';
import {partSeries} from '../packages/core/space.js';
import {verifyMotion,motionStats,sampleTimes} from '../packages/core/verify.js';
import {AgentService} from '../packages/agent/service.js';
import {fileWorkspace} from '../packages/cli/agent.js';
import {mcpTools} from '../packages/mcp/server.js';
const scene=(body:string)=>new VectorDocument(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">${body}</svg>`);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const key=(m:VectorDocument,target:string,property:'x'|'y'|'rotation',time:number,value:number)=>m.apply([{type:'keyframe',target,property,time,value}]);

test('world geometry composes parent motion and base transforms exactly once',()=>{
 const m=scene('<g id="parent" transform="translate(40 20)"><rect id="child" width="10" height="20" transform="scale(2)"/></g>');
 key(m,'parent','x',0,0);key(m,'parent','x',2,20);key(m,'child','y',0,0);key(m,'child','y',2,10);
 const [a,b]=partSeries(m,{ids:['child']},[0,2]);
 assert.deepEqual(a.box,{x0:40,y0:20,x1:60,y1:60});assert.deepEqual(b.box,{x0:60,y0:30,x1:80,y1:70});
});
test('cubic bounds use curve extrema and include transformed animated path data',()=>{
 const m=scene('<path id="curve" d="M0 0 C0 100 100 100 100 0"/>');
 near(partSeries(m,{ids:['curve']},[0])[0].box.y1,75);
 m.apply([{type:'keyframe',target:'curve',property:'d',time:0,value:'M0 0 C0 100 100 100 100 0'},{type:'keyframe',target:'curve',property:'d',time:1,value:'M0 0 C0 200 100 200 100 0'}]);
 near(partSeries(m,{ids:['curve']},[1])[0].box.y1,150);
});
test('defs are excluded without browser closest and transformed circles have tight bounds',()=>{
 const m=scene('<g id="all"><defs><path id="definition" d="M0 0 L999 999"/></defs><circle id="ball" cx="10" cy="20" r="5" transform="rotate(45)"/></g>');
 const s=partSeries(m,{ids:['all']},[0])[0];near(s.box.x1-s.box.x0,10);near(s.box.y1-s.box.y0,10);
});
test('unknown, empty, use and nested SVG measurements fail instead of vanishing',()=>{
 const m=scene('<defs><path id="p" d="M0 0L10 10"/></defs><g id="empty"/><use id="copy" href="#p"/><svg id="nested" width="20"><rect id="inner" width="1" height="1"/></svg>');
 for(const id of ['missing','empty','copy','inner'])assert.throws(()=>partSeries(m,{ids:[id]},[0]));
});
test('assertions distinguish static from measurable movement and report missing targets as not_evaluated',()=>{
 const m=scene('<rect id="box" width="10" height="10"/>');key(m,'box','x',0,0);key(m,'box','x',2,40);
 const r=verifyMotion(m,[{type:'moves',part:'box',during:[0,2],direction:'right',minDistance:35},{type:'still',part:'box',during:[0,2],maxSpeed:1},{type:'energy',part:'box',during:[0,2],min:19,max:21},{type:'moves',part:'absent',direction:'up',minDistance:1}],part=>({ids:[part]}));
 assert.equal(r.passed,false);assert.deepEqual(r.results.map(x=>x.status),['passed','failed','passed','not_evaluated']);near(r.results[2].measured.rmsSpeed,20);
});
test('closed bounds alone cannot pass loop velocity continuity',()=>{
 const m=scene('<rect id="box" width="10" height="10"/>');m.project.duration=2;m.project.loop=true;
 key(m,'box','x',0,0);key(m,'box','x',1,40);key(m,'box','x',2,0);
 const r=verifyMotion(m,[{type:'loopSeamless',part:'box',positionTolerance:.01,velocityTolerance:1},{type:'returnsToRest',part:'box',at:2,tolerance:.01}],part=>({ids:[part]}));
 assert.equal(r.results[0].status,'failed');near(r.results[0].measured.positionError,0);near(r.results[0].measured.velocityError,80);assert.equal(r.results[1].status,'passed');
});
test('arc, still and interval validation have explicit sampled semantics',()=>{
 const m=scene('<rect id="box" x="50" width="10" height="10"/>');key(m,'box','rotation',0,0);key(m,'box','rotation',2,90);
 const stats=motionStats(partSeries(m,{ids:['box']},sampleTimes(2)));assert.ok(stats.curvature>1.4);
 assert.throws(()=>sampleTimes(2,61,[1,1]));assert.throws(()=>sampleTimes(2,242));
 const r=verifyMotion(m,[{type:'arc',part:'box',during:[0,2],minCurvature:1},{type:'energy',part:'box'}],part=>({ids:[part]}));assert.deepEqual(r.results.map(x=>x.status),['passed','not_evaluated']);
});
test('public tools validate inputs, emit readable artifacts and leave the document unchanged',async()=>{
 const m=scene('<rect id="box" width="10" height="10"/>');key(m,'box','x',0,0);key(m,'box','x',2,40);
 const cache=await mkdtemp(join(tmpdir(),'mai-motion-test-'));const ws=fileWorkspace(m.toSVG(),'motion.svg');ws.cache=cache;const svc=new AgentService(ws);const before=ws.model().toSVG(),revision=ws.revision();
 try{
  const result=await svc.call('motion.verify',{assertions:[{type:'moves',part:'#box',direction:'right',minDistance:35,during:[0,2]}]});assert.equal(result.passed,true);
  await assert.rejects(svc.call('motion.verify',{assertions:[]}));await assert.rejects(svc.call('motion.verify',{assertions:[{type:'moves',part:'#box',direction:'right',minDistance:1,typo:1}]}));
  const view=await svc.call('render.motion',{part:'#box',count:21,during:[0,2]});const views=view.views as {path:string;svgPath:string}[];assert.equal(views.length,3);
  for(const v of views){const meta=await sharp(v.path).metadata();assert.equal(meta.width,900);assert.equal(meta.height,420);assert.match(await readFile(v.svgPath,'utf8'),/world-space center/);}
  const registered=mcpTools().filter(t=>['verify_motion','render_motion'].includes(t.name));assert.equal(registered.length,2);assert.ok(registered.every(t=>t.annotations.readOnlyHint));
  assert.equal(ws.model().toSVG(),before);assert.equal(ws.revision(),revision);
 }finally{await rm(cache,{recursive:true,force:true});}
});
