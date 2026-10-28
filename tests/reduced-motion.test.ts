// F5: the reduced-motion delivery variant — a still, or the frozen scene keeping only opacity/color transitions.
import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {exportReducedMotion} from '../packages/core/export.js';
import {renderSvg,closeRenderer} from '../packages/server/render.js';

const px=async(svg:string,t=0)=>sharp((await renderSvg(svg,t)).png).ensureAlpha().raw().toBuffer();
const mean=(a:Buffer,b:Buffer)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;

test('reduced motion: still is one frozen frame; fade keeps opacity and color but no movement, camera or trails',async()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:2,loop:false},{type:'pose',id:'tail',pose:{pivotX:450,pivotY:460}},
  {type:'keyframe',target:'tail',property:'rotation',time:0,value:0},{type:'keyframe',target:'tail',property:'rotation',time:2,value:25},
  {type:'keyframe',target:'nose',property:'opacity',time:0,value:.2},{type:'keyframe',target:'nose',property:'opacity',time:2,value:1},
  {type:'signal.add',signal:{id:'w',output:{target:'body',property:'y',layer:'pose'},source:{kind:'wiggle',frequency:2,amplitude:6,seed:1}}},
  {type:'effect.stack',id:'trail',target:'tail',effects:[{kind:'echo',params:{count:2,delay:.1,falloff:.5}}]},
  {type:'camera.shot',shot:{intent:'push-in',subject:'nose',start:0,duration:2}}]);
 const still=exportReducedMotion(d,{mode:'still'});assert.equal(still.report.at,2,'one-shots freeze where the motion arrives');assert.equal(still.report.animations,0);assert.doesNotMatch(still.svg,/<animate|data-mai-generated="effect"/);
 const fade=exportReducedMotion(d,{mode:'fade'});assert.doesNotMatch(fade.svg,/animateTransform|data-mai-generated="effect"/,'no transforms, camera moves or echo');assert.match(fade.svg,/<animate[^>]*attributeName="opacity"/,'opacity transition kept');
 assert.equal(fade.report.dropped.signals,1);assert.ok(fade.report.dropped.tracks>=4,'tail rotation and camera tracks dropped');assert.match(fade.report.usage,/prefers-reduced-motion/);
 assert.ok(new VectorDocument(d.toSVG()).project.tracks.length===d.project.tracks.length,'the source scene is untouched');
 try{const ref=await px(d.frame(2));assert.ok(mean(await px(still.svg,0),ref)<.25,'still = the scene at the chosen time');assert.ok(mean(await px(fade.svg,2),ref)<.25,'fade arrives at the same frame');
  const a=await px(still.svg,0),b=await px(still.svg,1.3);assert.equal(mean(a,b),0,'nothing moves');}finally{await closeRenderer();}
 assert.throws(()=>exportReducedMotion(d,{mode:'still',at:9}),/inside the timeline/);
});
