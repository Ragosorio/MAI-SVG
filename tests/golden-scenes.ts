// Golden characterization scenes for the motion engine (plan F0, ADR-003). They pin today's evaluator and exporter
// output so the v2 refactor (keyframe handles, channel graph, camera…) can prove legacy projects stay identical.
// Regenerate deliberately with `npx tsx scripts/golden.ts --update` and review the diff; never to silence a failure.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {frameState} from '../packages/core/animation.js';
import {exportSvg} from '../packages/core/export.js';
import type {Operation} from '../packages/core/model.js';

const ear=(id:string,x:number)=>({type:'create',tag:'path',id,parent:'character',attrs:{d:`M${x} 190 L${x+20} 120 L${x+40} 190 Z`,fill:'#c38253'}}) as Operation;
// One scene that touches every legacy evaluation path: all easings, override/additive layers with weights, colors,
// same-topology `d`, every motion preset kind, spring/follow/look-at secondary, geometry modifiers, param drivers,
// clips, track edits and event markers (export split points).
export const STARTER_OPS:Operation[]=[
 {type:'timeline',duration:4,fps:24,loop:true},
 ear('ear-l',260),ear('ear-r',400),
 {type:'create',tag:'path',id:'whisker',parent:'character',attrs:{d:'M300 310 C270 300 250 305 230 300 C250 312 270 312 300 316 Z',fill:'#5a3a2a'}},
 {type:'create',tag:'path',id:'hat',parent:'character',attrs:{d:'M300 120 L385 120 L343 60 Z',fill:'#3a6ea5'}},
 {type:'create',tag:'path',id:'ribbon',parent:'character',attrs:{d:'M300 200 C330 190 360 210 390 200 L390 210 C360 220 330 200 300 210 Z',fill:'#e05a6a'}},
 {type:'create',tag:'path',id:'fur',parent:'character',attrs:{d:'M260 450 C300 430 390 430 430 450 C390 470 300 470 260 450 Z',fill:'#efc797'}},
 {type:'create',tag:'path',id:'strand',parent:'character',attrs:{d:'M343 160 C340 140 350 120 343 100 C352 120 348 140 347 160 Z',fill:'#5a3a2a'}},
 {type:'pose',id:'tail',pose:{pivotX:450,pivotY:440}},{type:'pose',id:'character',pose:{pivotX:345,pivotY:540}},
 {type:'keyframe',target:'character',property:'y',time:0,value:0,easing:'linear'},{type:'keyframe',target:'character',property:'y',time:1,value:-20,easing:'ease-in-out'},
 {type:'keyframe',target:'character',property:'y',time:2,value:0,easing:'ease-in'},{type:'keyframe',target:'character',property:'y',time:3,value:-8,easing:'ease-out'},{type:'keyframe',target:'character',property:'y',time:4,value:0},
 {type:'keyframe',target:'tail',property:'rotation',time:0,value:0,easing:'overshoot'},{type:'keyframe',target:'tail',property:'rotation',time:1.5,value:25,easing:'anticipate'},
 {type:'keyframe',target:'tail',property:'rotation',time:3,value:-10,easing:'cubic-bezier(.2,.8,.3,1.2)'},{type:'keyframe',target:'tail',property:'rotation',time:4,value:0},
 {type:'keyframe',target:'nose',property:'scaleX',time:0,value:1,easing:'step'},{type:'keyframe',target:'nose',property:'scaleX',time:2,value:1.2,easing:'step'},{type:'keyframe',target:'nose',property:'scaleX',time:3,value:1},
 {type:'keyframe',target:'eye-left',property:'opacity',time:0,value:1},{type:'keyframe',target:'eye-left',property:'opacity',time:.5,value:.2},{type:'keyframe',target:'eye-left',property:'opacity',time:1,value:1},
 {type:'keyframe',target:'body',property:'fill',time:0,value:'#dfad78',easing:'ease-in-out'},{type:'keyframe',target:'body',property:'fill',time:2,value:'#e0b090'},{type:'keyframe',target:'body',property:'fill',time:4,value:'#dfad78'},
 {type:'keyframe',target:'whisker',property:'d',time:0,value:'M300 310 C270 300 250 305 230 300 C250 312 270 312 300 316 Z'},
 {type:'keyframe',target:'whisker',property:'d',time:2,value:'M300 310 C270 296 250 296 230 290 C250 306 270 308 300 316 Z',easing:'ease-in-out'},
 {type:'keyframe',target:'whisker',property:'d',time:4,value:'M300 310 C270 300 250 305 230 300 C250 312 270 312 300 316 Z'},
 // Additive pose layer on top of base motion, and a half-weight override layer.
 {type:'keyframe',target:'character',property:'rotation',time:0,value:0,layer:'pose'},{type:'keyframe',target:'character',property:'rotation',time:2,value:3,layer:'pose',easing:'ease-in-out'},{type:'keyframe',target:'character',property:'rotation',time:4,value:0,layer:'pose'},
 {type:'keyframe',target:'hat',property:'x',time:0,value:0},{type:'keyframe',target:'hat',property:'x',time:4,value:30},
 {type:'keyframe',target:'hat',property:'x',time:0,value:-30,layer:'expression'},{type:'keyframe',target:'hat',property:'x',time:4,value:-10,layer:'expression'},
 {type:'layer.set',layer:{id:'expression',name:'Expresión',blend:'override',weight:.5}},
 {type:'layer.set',layer:{id:'pose',name:'Pose',blend:'additive',weight:.8}},
 // Every motion preset kind (macros that expand to keys).
 {type:'motion.preset',id:'eye-right',kind:'pulse'},{type:'motion.preset',id:'ear-l',kind:'sway',layer:'pose'},{type:'motion.preset',id:'ear-r',kind:'bounce'},
 {type:'motion.preset',id:'hat',kind:'float'},{type:'motion.preset',id:'whisker',kind:'spin',layer:'pose'},{type:'motion.preset',id:'ear-r',kind:'fade'},{type:'motion.preset',id:'body',kind:'breathe',layer:'pose'},
 // Secondary motion: spring on velocity, follow with delay, look-at driven by a param.
 {type:'param.define',name:'gaze',def:{min:-1,max:1,default:0}},
 {type:'param.set',params:{gaze:-1},time:0},{type:'param.set',params:{gaze:1},time:2,easing:'ease-in-out'},{type:'param.set',params:{gaze:-1},time:4},
 {type:'secondary.add',secondary:{id:'ear-spring',kind:'spring',target:'ear-l',driver:'character',property:'rotation',driverProperty:'y',stiffness:120,damping:10,gain:-.2,delay:.04,limit:12}},
 {type:'secondary.add',secondary:{id:'hat-follow',kind:'follow',target:'hat',driver:'character',property:'y',driverProperty:'y',stiffness:0,damping:0,gain:.5,delay:.15,limit:40}},
 {type:'secondary.add',secondary:{id:'eye-look',kind:'look-at',target:'eye-left',driver:'gaze',property:'x',stiffness:0,damping:0,gain:1,delay:0,limit:6}},
 // Geometry modifiers on paths with and without their own `d` track.
 {type:'modifier.add',modifier:{id:'ribbon-wave',kind:'wave',targets:['ribbon'],params:{amplitude:4,waveLength:50,cycles:2}}},
 {type:'modifier.add',modifier:{id:'fur-noise',kind:'noise',targets:['fur'],params:{amplitude:1.5,scale:60,cycles:1}}},
 {type:'modifier.add',modifier:{id:'strand-bend',kind:'bend',targets:['strand'],params:{angle:8,oscillate:1,cycles:1},anchor:{x:345,y:160},direction:{x:0,y:-1}}},
 // Param driver (absolute, overrides tracks on that property).
 {type:'param.define',name:'hatTilt',def:{min:0,max:1,default:0}},
 {type:'expression.driver',driver:{id:'hat-tilt',param:'hatTilt',target:'hat',property:'rotation',points:[[0,0],[1,-12]]}},
 {type:'param.set',params:{hatTilt:0},time:1},{type:'param.set',params:{hatTilt:1},time:3,easing:'ease-out'},
 // Clips and track edits.
 {type:'keyframe',target:'eye-right',property:'y',time:0,value:0},{type:'keyframe',target:'eye-right',property:'y',time:.5,value:-4,easing:'ease-out'},{type:'keyframe',target:'eye-right',property:'y',time:1,value:0},
 {type:'clip.define',clip:{id:'peek',name:'Peek',start:0,end:1,targets:['eye-right']}},
 {type:'clip.place',clip:'peek',at:2.5,speed:2,targets:{'eye-right':'hat'},layer:'pose'},
 {type:'track.copy',target:'eye-left',to:'eye-right',property:'opacity',offset:.25},
 {type:'track.edit',target:'eye-right',property:'opacity',action:'reverse'},
 {type:'track.edit',target:'eye-right',property:'y',action:'pingpong'},
 {type:'track.edit',target:'hat',property:'x',action:'stretch',amount:.5},
 {type:'marker.set',marker:{id:'blink-event',time:1.25,label:'blink',kind:'event'}},
];

export type GoldenScene={name:string;doc:()=>VectorDocument;times:number[]};
const file=(path:string)=>()=>new VectorDocument(readFileSync(new URL(path,import.meta.url),'utf8'));
export const SCENES:GoldenScene[]=[
 {name:'starter-rich',doc:()=>{const d=new VectorDocument(starterSvg);d.apply(STARTER_OPS);return d;},times:[0,.13,.5,1,1.37,2,2.5,2.75,3,3.6,3.99,4]},
 {name:'milo',doc:file('../examples/emotions/milo-editable.svg'),times:[0,.4,1.3,2.5,3.7,5,6.2,8.8,9.99,10]},
 {name:'rig-demo',doc:file('../examples/rig-demo-editable.svg'),times:[0,.7,1.25,2.5,3.3,4.9,5]},
];

// Long strings (paths) are stored by hash so fixtures stay reviewable; short ones verbatim.
const digest=(s:string)=>s.length>160?`sha256:${createHash('sha256').update(s).digest('hex').slice(0,24)}:${s.length}`:s;
// Objects created without an id get a random `mai-object-xxxxxxxx`; renumber them in order of appearance.
const canonicalIds=(s:string)=>{const seen=new Map<string,string>();return s.replace(/mai-object-[\da-f]{8}/g,id=>{if(!seen.has(id))seen.set(id,`mai-object-#${seen.size}`);return seen.get(id)!;});};
function normalize(v:unknown):unknown{
 if(typeof v==='string')return digest(v);
 if(v instanceof Map)return normalize(Object.fromEntries(v));
 if(ArrayBuffer.isView(v))return Array.from(v as unknown as ArrayLike<number>);
 if(Array.isArray(v))return v.map(normalize);
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v as object).sort().filter(k=>(v as Record<string,unknown>)[k]!==undefined).map(k=>[k,normalize((v as Record<string,unknown>)[k])]));
 return v;
}
export function snapshot(scene:GoldenScene){
 const d=scene.doc(),p=d.project;
 const frames=scene.times.map(t=>({t,state:normalize(frameState(p,t))}));
 const out=(profile:'editable'|'standalone')=>{const svg=canonicalIds(exportSvg(d,{profile}).svg);return {bytes:svg.length,sha256:createHash('sha256').update(svg).digest('hex')};};
 return {scene:scene.name,project:normalize({duration:p.duration,fps:p.fps,loop:p.loop,tracks:p.tracks,layers:p.layers,secondary:p.secondary,modifiers:p.modifiers?.map(m=>({id:m.id,kind:m.kind,params:m.params,targets:m.targets})),params:p.params,clips:p.clips,markers:p.markers}),frames,export:{editable:out('editable'),standalone:out('standalone')}};
}

// Numeric comparison with a tight tolerance; everything else exact. Returns the first differences found.
export function diff(a:unknown,b:unknown,path='',out:string[]=[],tol=1e-9):string[]{
 if(out.length>=12)return out;
 if(typeof a==='number'&&typeof b==='number'){if(!(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)))&&!(Number.isNaN(a)&&Number.isNaN(b)))out.push(`${path}: ${b} → ${a}`);return out;}
 if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)out.push(`${path}: length ${b.length} → ${a.length}`);for(let i=0;i<Math.min(a.length,b.length);i++)diff(a[i],b[i],`${path}[${i}]`,out,tol);return out;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){const ka=Object.keys(a),kb=Object.keys(b);for(const k of new Set([...ka,...kb])){if(!(k in (a as object)))out.push(`${path}.${k}: removed`);else if(!(k in (b as object)))out.push(`${path}.${k}: added`);else diff((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k],`${path}.${k}`,out,tol);}return out;}
 if(a!==b)out.push(`${path}: ${JSON.stringify(b)?.slice(0,80)} → ${JSON.stringify(a)?.slice(0,80)}`);
 return out;
}
