// Plan F0/F1: the agent can SEE motion. A filmstrip is one contact sheet across the timeline, from one page load.
import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import sharp from 'sharp';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {AgentService} from '../packages/agent/service.js';
import {fileWorkspace} from '../packages/cli/agent.js';
import {closeRenderer} from '../packages/server/render.js';
import {filmstripTimes} from '../packages/server/observe.js';
import {STARTER_OPS} from './golden-scenes.js';

type Sheet={path:string;width:number;height:number;columns:number;rows:number;cell:{width:number;height:number}};
type Film={sheet:Sheet;frames:{time:number;caption:string;cell:{x:number;y:number;width:number;height:number}}[];source:string;sourceNote?:string;ghost?:{count:number};region?:unknown};
const cellPixels=async(sheet:Sheet,c:{x:number;y:number;width:number;height:number})=>sharp(sheet.path).extract({left:c.x,top:c.y,width:c.width,height:c.height}).raw().toBuffer();
const differs=(a:Buffer,b:Buffer)=>{let d=0;for(let i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);return d/a.length;};

test('filmstrip times: uniform, loop end not repeated',()=>{
 assert.deepEqual(filmstripTimes(4,true,4),[0,1,2,3]);assert.deepEqual(filmstripTimes(4,false,5),[0,1,2,3,4]);
});

test('render.filmstrip: one labelled contact sheet of the motion, with onion skin and part framing',async()=>{
 const d=new VectorDocument(starterSvg);d.apply(STARTER_OPS);const svc=new AgentService(fileWorkspace(d.toSVG(),'golden.svg'));
 try{
  const f=await svc.call('render.filmstrip',{count:6}) as unknown as Film;
  assert.ok(existsSync(f.sheet.path));assert.equal(f.source,'export');assert.equal(f.frames.length,6);assert.equal(f.sheet.columns,3);assert.equal(f.sheet.rows,2);
  const meta=await sharp(f.sheet.path).metadata();assert.equal(meta.width,f.sheet.width);assert.equal(meta.height,f.sheet.height);
  assert.deepEqual(f.frames.map(x=>x.time),[0,.6667,1.3333,2,2.6667,3.3333]);assert.match(f.frames[2].caption,/blink/,'event marker named in its caption');
  assert.ok(differs(await cellPixels(f.sheet,f.frames[0].cell),await cellPixels(f.sheet,f.frames[3].cell))>1,'frames show different moments');
  const g=await svc.call('render.filmstrip',{count:4,ghost:2}) as unknown as Film;assert.equal(g.ghost?.count,2);
  const tail=await svc.call('render.filmstrip',{part:'#tail',count:4}) as unknown as Film;assert.ok(tail.region,'framed on the part');assert.ok(tail.sheet.cell.width<=420);
 }finally{await closeRenderer();}
});

test('render.filmstrip falls back to engine frames when the standalone export cannot represent the scene, and says why',async()=>{
 // A track whose target no longer exists (e.g. a hand-edited file) cannot be exported, but the engine can still play it.
 const d=new VectorDocument(starterSvg);d.apply([{type:'keyframe',target:'nose',property:'y',time:0,value:0},{type:'keyframe',target:'nose',property:'y',time:2,value:-10}]);d.project.tracks.push({target:'ghost-part',property:'x',keys:[{time:0,value:0,easing:'linear'},{time:1,value:5,easing:'linear'}]});
 const svc=new AgentService(fileWorkspace(d.toSVG(),'mixed.svg'));
 try{const f=await svc.call('render.filmstrip',{count:4}) as unknown as Film;assert.equal(f.source,'engine');assert.match(String(f.sourceNote),/export/);assert.equal(f.frames.length,4);}finally{await closeRenderer();}
});

test('a dry-run can return a filmstrip of the draft without committing',async()=>{
 const svc=new AgentService(fileWorkspace(starterSvg,'starter.svg'));
 try{const r=await svc.call('ops.apply',{ops:[{type:'pose',id:'tail',pose:{pivotX:450,pivotY:440}},{type:'keyframe',target:'tail',property:'rotation',time:0,value:0,easing:'ease-in-out'},{type:'keyframe',target:'tail',property:'rotation',time:2.5,value:20,easing:'ease-in-out'},{type:'keyframe',target:'tail',property:'rotation',time:5,value:0}],expectedRevision:0,dryRun:true,preview:{filmstrip:{count:4}}}) as {preview:{filmstrip:Film;frames:unknown[]}};
  assert.ok(existsSync(r.preview.filmstrip.sheet.path));assert.equal(r.preview.filmstrip.frames.length,4);assert.equal(r.preview.frames.length,0,'no single frames unless times are asked');
 }finally{await closeRenderer();}
});
