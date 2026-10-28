// Presets as transparent macros (plan lane A, ADR-003 §A.12): every preset expands into ordinary operations
// (pose pivots, keyframes / track.set with tangents, signal.add) that the agent can inspect, edit or rebuild.
// Classic kinds produce exactly the keys they always did (pinned by the golden tests).
import type {VectorDocument} from './document.js';
import {DEFAULT_LAYERS,defaultPose,type Operation,type Pose,type Property,type SemanticNode,type KeyInput} from './model.js';
import {frameState} from './animation.js';
import {worldBox,worldMatrix,applyMat,IDENTITY,type Mat} from './space.js';

export type PresetKind='float'|'spin'|'pulse'|'fade'|'breathe'|'bounce'|'sway'|'idle';
export type PresetOp={id:string;kind:PresetKind;amplitude?:number;layer?:string;style?:'classic'|'organic'};
export type Piece={name:string;why:string;ops:number[]};
export const PRESET_CATALOG:Record<PresetKind,{summary:string;teaches:string[];options:Record<string,string>}>={
 float:{summary:'y rises by amplitude and returns (ease-in-out).',teaches:['A single soft arc; add x drift with different timing for a curved path.'],options:{amplitude:'px (default 12)'}},
 bounce:{summary:'y up and down with ease-in going up and ease-out coming down.',teaches:['Gravity reads from spacing: slow at the top, fast at contact.'],options:{amplitude:'px (default 18)'}},
 sway:{summary:'rotation ±amplitude (ease-in-out).',teaches:['Pivot placement decides the read; set it with pose before swaying.'],options:{amplitude:'degrees (default 4)'}},
 spin:{summary:'rotation +amplitude, linear.',teaches:['Linear spin loops seamlessly at 360°.'],options:{amplitude:'degrees (default 360)'}},
 pulse:{summary:'scaleX and scaleY +amplitude and back.',teaches:['Uniform scale; for life, offset X and Y timing slightly.'],options:{amplitude:'scale delta (default .08)'}},
 fade:{summary:'opacity 0 → amplitude → 0.',teaches:['Fades read better combined with a small position change.'],options:{amplitude:'0–1 (default 1)'}},
 breathe:{summary:'classic: scaleY +amplitude and back. organic (style:"organic"): asymmetric inhale/exhale per cycle with handles, counter scaleX for volume, a pivot at the bottom-center and a slow incommensurate drift signal.',teaches:['Inhale slower than exhale; volume is kept by a counter scale on the other axis; nothing living is perfectly periodic.'],options:{amplitude:'scale delta (default .025)',style:'classic | organic'}},
 idle:{summary:'Organic breathing + seeded blinks on eyes + gaze drift (look-x/look-y params) + ears and tail drifting on their own timing. Every piece is skipped (with a note) if the part is protected against it or is not a separate element.',teaches:['Idle = several independent small motions with different periods (overlap), plus rare events (blinks).','Use semantic roles (eye-left, ear-right, tail) and landmarks (base) so pieces find their parts and pivots.'],options:{amplitude:'breathing scale delta (default .025)'}},
};

const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%100000;};
const r6=(n:number)=>Number(n.toFixed(6));

/** Classic presets: byte-for-byte the keys the core always generated. */
function classic(m:VectorDocument,op:PresetOp):Operation[]{
 const p=m.project.poses[op.id]??defaultPose(),duration=m.project.duration;const amplitude=op.amplitude??(op.kind==='spin'?360:op.kind==='pulse'?.08:op.kind==='fade'?1:12);
 if(!(amplitude>=0&&amplitude<=1000))throw Error('Invalid numeric value');
 const property=op.kind==='float'||op.kind==='bounce'?'y':op.kind==='spin'||op.kind==='sway'?'rotation':op.kind==='pulse'?'scaleX':op.kind==='breathe'?'scaleY':op.kind==='fade'?'opacity':null;if(!property)throw Error('Unknown motion preset');
 const properties=op.kind==='pulse'?['scaleX','scaleY']:[property];const additive=!!op.layer&&(m.project.layers??DEFAULT_LAYERS).find(l=>l.id===op.layer)?.blend==='additive';const ops:Operation[]=[];
 for(const prop of properties){if(m.track(op.id,prop as Property,op.layer))throw Error('Preset would overwrite a track; delete it explicitly');
  const base=additive?0:prop==='opacity'?Number(m.element(op.id).getAttribute('opacity')??1):p[prop as keyof Pose];
  const amp=op.kind==='breathe'?(op.amplitude??.025):op.kind==='sway'?(op.amplitude??4):op.kind==='bounce'?(op.amplitude??18):amplitude;
  const values=op.kind==='spin'?[base,base+amplitude]:op.kind==='fade'?[0,Math.min(1,amplitude),0]:op.kind==='sway'?[base-amp,base+amp,base-amp]:op.kind==='bounce'?[base,base-amp,base]:[base,base+(op.kind==='float'?-amplitude:op.kind==='breathe'?amp:amplitude),base];
  values.forEach((value,i)=>ops.push({type:'keyframe',target:op.id,property:prop as Property,time:duration*i/(values.length-1),value,easing:op.kind==='spin'?'linear':op.kind==='bounce'?(i===1?'ease-in':'ease-out'):'ease-in-out',layer:op.layer}));}
 return ops;}

/** Box of an element in its parent's space (where pose pivots live). */
export function parentBox(m:VectorDocument,id:string){const e=m.index.get(id);if(!e)return undefined;const f=frameState(m.project,0,{secondary:false,modifiers:false,signals:false});const b=worldBox(m,[id],f);if(!b)return undefined;
 const parent=e.parentNode as Element|null;const pm:Mat=parent&&parent.nodeType===1?worldMatrix(m,parent,f):IDENTITY;const det=pm[0]*pm[3]-pm[1]*pm[2]||1;
 const inv:Mat=[pm[3]/det,-pm[1]/det,-pm[2]/det,pm[0]/det,(pm[2]*pm[5]-pm[3]*pm[4])/det,(pm[1]*pm[4]-pm[0]*pm[5])/det];const pts=[{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x0,y:b.y1},{x:b.x1,y:b.y1}].map(q=>applyMat(inv,q));
 return {x0:Math.min(...pts.map(q=>q.x)),y0:Math.min(...pts.map(q=>q.y)),x1:Math.max(...pts.map(q=>q.x)),y1:Math.max(...pts.map(q=>q.y))};}
const hasPivot=(m:VectorDocument,id:string)=>{const q=m.project.poses[id];return !!q&&(q.pivotX!==0||q.pivotY!==0);};

/** Expand a preset into operations. `allows(target, category)` reflects identity protection (rigid/scale/…). */
export function expandPreset(m:VectorDocument,op:PresetOp,allows:(target:string,category:string)=>boolean):{ops:Operation[];notes:string[];pieces:Piece[]}{
 if(op.kind!=='idle'&&!(op.kind==='breathe'&&op.style==='organic'))return {ops:classic(m,op),notes:[],pieces:[{name:op.kind,why:PRESET_CATALOG[op.kind].summary,ops:[]}]};
 const ops:Operation[]=[],notes:string[]=[],pieces:Piece[]=[];const D=m.project.duration;
 const piece=(name:string,why:string,list:Operation[])=>{pieces.push({name,why,ops:list.map((_,i)=>ops.length+i)});ops.push(...list);};
 const pivot=(id:string,at:'bottom'|'center'|{x:number;y:number}):Operation[]=>{if(hasPivot(m,id))return [];const b=parentBox(m,id);if(!b)return [];const pt=typeof at==='object'?at:at==='bottom'?{x:(b.x0+b.x1)/2,y:b.y1}:{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2};return [{type:'pose',id,pose:{pivotX:r6(pt.x),pivotY:r6(pt.y)}}];};
 const layer=op.layer??'pose';
 // Organic breathing: asymmetric inhale (42 %) / exhale with zero velocity at the ends (seamless loop), counter scaleX.
 if(allows(op.id,'scale')){const a=op.amplitude??.025,cycles=Math.max(1,Math.round(D/3.5)),per=D/cycles;
  for(const prop of ['scaleY','scaleX'] as const)if(m.track(op.id,prop,layer))throw Error(`Preset would overwrite ${op.id} ${prop} on layer ${layer}; delete it explicitly`);
  const keys=(amp:number):KeyInput[]=>[...Array.from({length:cycles},(_,c):KeyInput[]=>[{time:r6(c*per),value:0,...(c?{in:{speed:0,influence:.55}}:{}),out:{speed:0,influence:.45}},{time:r6(c*per+.42*per),value:amp,in:{speed:0,influence:.5},out:{speed:0,influence:.4}}]).flat(),{time:r6(D),value:0,in:{speed:0,influence:.55}}];
  piece('breathe','Asymmetric inhale/exhale on an additive layer, pivot at the base so the body grows upward; counter scaleX keeps volume.',[...pivot(op.id,'bottom'),{type:'track.set',target:op.id,property:'scaleY',layer,keys:keys(a)},{type:'track.set',target:op.id,property:'scaleX',layer,keys:keys(-.4*a)}]);}
 else notes.push(`breathe skipped: ${op.id} is protected against scale (use rotation-only motion, or agree a creative envelope with the human: deform bounded with a small scale budget).`);
 if(allows(op.id,'rigid'))piece('drift','A slow drift with coprime partials so no two loops of the body look identical.',[{type:'signal.add',signal:{id:`${op.id}-drift`,output:{target:op.id,property:'rotation',layer},source:{kind:'drift',amplitude:.35,period:7.3,seed:hash(op.id)}}}]);
 if(op.kind==='breathe')return {ops,notes,pieces};
 // Idle extras find their parts through semantic roles; region-only parts must be extracted before they can move.
 const nodes=(m.project.semantic?.nodes??[]).filter(n=>n.status!=='rejected');const byRole=(re:RegExp)=>nodes.filter(n=>re.test(n.role));
 const movable=(n:SemanticNode)=>n.targets.length===1&&m.index.has(n.targets[0])?n.targets[0]:undefined;
 const seed=hash(op.id+'-blink');
 for(const eye of byRole(/^(eye-left|eye-right|eye|eyelid)/)){const id=movable(eye);if(!id){notes.push(`blink skipped for ${eye.id}: it is not one separate element (extract it as a part first).`);continue;}
  if(!allows(id,'scale')){notes.push(`blink skipped: ${eye.id} is protected against scale; a blink needs scale: with the human's agreement give the part a creative envelope (semantic.envelope {deform:"bounded", bounds:{scale:.95}, transientDeviation:{allowed:true, maxDuration:.4}}) — its shape at rest stays exact — or use eyelid artwork.`);continue;}
  piece(`blink:${eye.id}`,'Seeded blinks (shared seed so both eyes blink together), closing fast and opening slower, with occasional doubles.',[...pivot(id,eye.landmarks?.center??eye.landmarks?.iris??'center'),{type:'signal.add',signal:{id:`${id}-blink`,output:{target:id,property:'scaleY',layer:'blink'},source:{kind:'blink',interval:[2.8,5.2],close:.07,double:.15,amplitude:-.92,seed}}}]);}
 const params=m.project.params??{};
 if('look-x' in params||'look-y' in params)piece('gaze','Gaze drifts on its own slow rhythm (eyes are alive even when the body is still).',[...(['look-x','look-y'] as const).filter(k=>k in params).map((k,i)=>({type:'signal.add' as const,signal:{id:`${op.id}-${k}`,output:{target:k,property:'param' as const,layer:'eyes'},source:{kind:'drift' as const,amplitude:i?.15:.25,period:4.7+i*1.3,seed:hash(op.id+k)}}}))]);
 else if(byRole(/^eye/).length)notes.push('gaze skipped: no look-x/look-y params (rig the eyes with expression.rig to enable gaze).');
 for(const [re,amp,period,why] of [[/^ear/,2,3.1,'Ears react on their own timing (overlap): small, slightly delayed drift from their base.'],[/^tail$/,4,2.8,'The tail keeps a lazy sway from its root, out of phase with the breathing.']] as [RegExp,number,number,string][])
  for(const part of byRole(re)){const id=movable(part);if(!id){notes.push(`${part.role} skipped for ${part.id}: not one separate element (extract it first).`);continue;}if(!allows(id,'rigid')){notes.push(`${part.role} skipped: ${part.id} is locked.`);continue;}
   const base=part.landmarks?.base??part.landmarks?.root;piece(`${part.role}:${part.id}`,why,[...pivot(id,base??'bottom'),{type:'signal.add',signal:{id:`${id}-idle`,output:{target:id,property:'rotation',layer:'secondary'},source:{kind:'drift',amplitude:amp,period,seed:hash(part.id)}}}]);if(!base)notes.push(`${part.id}: no base landmark; pivot at the bottom-center of its box (set landmark "base" for a better hinge).`);}
 return {ops,notes,pieces};}
