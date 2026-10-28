import type {VectorDocument} from './document.js';
import type {Operation,Keyframe,Signal,Property,Project} from './model.js';
import {DEFAULT_LAYERS} from './model.js';
import {frameParams,frameState} from './animation.js';
import {actingBeat,validateBeats} from './timing.js';
import {CAMERA_TARGET,cameraState,compileShot,fitView,validateCamera} from './camera.js';
import {worldBox} from './space.js';
import type {CameraConfig,EffectRecord} from './model.js';
import {compileEffects} from './effects.js';
import {validateContext} from './context.js';
import {validateDirection} from './direction.js';
import {catmullRomPath,pathTable,validateMotionPaths,applyMotionPaths} from './motion-path.js';
import {parentBox} from './presets.js';
import {authoringOperation} from './authoring.js';
import {SECONDARY_PRESETS} from './secondary.js';
const contains=(m:VectorDocument,outer:string,inner:string)=>{let e:Node|null=m.index.get(inner)??null;const o=m.index.get(outer);if(!o)return false;e=e?.parentNode??null;while(e){if(e===o)return true;e=e.parentNode;}return false;};
import {validateSignals,signalAt,signalEvents} from './procedural.js';
import {valueAt,isEasing} from './animation.js';
import {validateCustomCurve,validateKeyExtensions,roveKeys} from './curves.js';
export const MOTION_OPS=new Set(['direction.set','motion.propagate','motion.path','motion.path.remove','motion.path.bake','context.set','effect.stack','effect.remove','camera.set','camera.depth','camera.shot','camera.fit','beat.set','beat.delete','acting.beat','track.set','key.tangent','curve.custom','curve.inertia','signal.add','signal.update','signal.remove','signal.bake']);
export function motionOperation(m:VectorDocument,op:Operation,touched:Set<string>){
 const p=m.project;
 if(op.type==='motion.path'){m.editable(op.target);if(!op.d&&!op.points)throw Error('motion.path needs d or points');
  const d=op.d??catmullRomPath(op.points!,!!op.closed);const t=pathTable(d);const layer=op.layer??'pose',mode=op.mode??'absolute';
  const start=op.start??0,end=op.end??p.duration;if(!(start>=0&&end>start&&end<=p.duration+1e-9))throw Error('motion.path needs 0 ≤ start < end ≤ duration');
  const progress=(op.progress?.length?op.progress:[{time:start,value:0,easing:op.easing??'ease-in-out'},{time:end,value:1}]).map(k=>{const {hold,...r}=k as typeof k&{hold?:boolean};return {...r,easing:hold?'step':k.easing??'linear'} as Keyframe;});
  let anchor:{x:number;y:number};if(op.anchor&&typeof op.anchor==='object')anchor=op.anchor;else{const b=parentBox(m,op.target);if(!b)throw Error('motion.path target has no geometry');const pose=p.poses[op.target];
   anchor=op.anchor==='pivot'&&pose&&(pose.pivotX||pose.pivotY)?{x:pose.pivotX,y:pose.pivotY}:op.anchor==='bottom-center'?{x:(b.x0+b.x1)/2,y:b.y1}:{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2};}
  const orient=op.orient===true?{offset:0}:op.orient&&typeof op.orient==='object'?op.orient:undefined;
  // Orienting rotates around the pivot: put the pivot on the anchor so the point on the path is the hinge.
  if(orient&&mode==='absolute'){const pose=p.poses[op.target];if(!pose||pose.pivotX!==anchor.x||pose.pivotY!==anchor.y)m.operation({type:'pose',id:op.target,pose:{pivotX:anchor.x,pivotY:anchor.y}},touched);}
  void t;p.motionPaths=[...(p.motionPaths??[]).filter(x=>x.id!==op.id),{id:op.id,target:op.target,d,...(op.points?{points:op.points,closed:!!op.closed}:{}),progress,...(orient?{orient}:{}),anchor,...(op.offset?{offset:op.offset}:{}),mode,layer}];
  validateMotionPaths(p,id=>m.index.has(id));touched.add(op.target);return;}
 if(op.type==='motion.propagate'){
  // Overlap that truly propagates: link i springs from link i−1's final channel (its keys + its own spring), so a tail,
  // a chain of ears or a hanging accessory whips in sequence. drag (default, like secondary springs): the offset is the
  // spring response to the previous link's velocity, softly limited; follow: the link copies the previous one late. Compiled into expression signals
  // ${id}-0…n on an additive layer — inspectable formulas, editable with signal.update, bakeable with signal.bake.
  if(!/^[A-Za-z_][\w-]{0,60}$/.test(op.id))throw Error('motion.propagate id must be a plain identifier');if(!Array.isArray(op.links)||op.links.length<1||op.links.length>12)throw Error('motion.propagate needs 1–12 links');
  const preset=SECONDARY_PRESETS[(op.preset??'tail') as keyof typeof SECONDARY_PRESETS];if(!preset)throw Error(`Unknown preset ${op.preset} (${Object.keys(SECONDARY_PRESETS).join(', ')})`);
  const layer=op.layer??'secondary',prefix=`${op.id}-`;const mine=(s:Signal)=>s.id.startsWith(prefix)&&/^\d+$/.test(s.id.slice(prefix.length));
  if((p.signals??[]).some(mine)){if(!op.replace)throw Error(`Chain ${op.id} exists; pass replace:true to rebuild it`);p.signals=(p.signals??[]).filter(s=>!mine(s));}
  const q=(x:string)=>{if(!/^[\w.@:-]{1,120}$/.test(x))throw Error(`Invalid id ${x}`);return `'${x}'`;};const num=(v:number|undefined,d:number,lo:number,hi:number,what:string)=>{const x=v??d;if(!(Number.isFinite(x)&&x>=lo&&x<=hi))throw Error(`motion.propagate ${what} must be within ${lo}–${hi}`);return Number(x.toFixed(6));};
  let src='signal' in op.driver?`sig(${q(op.driver.signal)})`:`ref(${q(op.driver.target)},${q(op.driver.property??'rotation')})`;
  op.links.forEach((l,i)=>{const prop=l.property??'rotation';if(prop==='boneRotation'){if(!p.bones.some(b=>b.id===l.target))throw Error(`Bone ${l.target} not found`);}else m.editable(l.target);
   const follow=op.mode==='follow';if(op.mode!==undefined&&!['drag','follow'].includes(op.mode))throw Error('motion.propagate mode is drag or follow');
   const k=num(l.stiffness,preset.stiffness,.1,5000,'stiffness'),c=num(l.damping,preset.damping,0,500,'damping'),g=num(l.gain,follow?1:preset.gain,-20,20,'gain'),d=num(l.delay,preset.delay,0,2,'delay'),lim=num(l.limit,follow?360:preset.limit,.01,360,'limit');
   const inner=follow?`${g}*spring(delay(${src}, ${d}), ${k}, ${c})`:`spring(${g}*velocity(delay(${src}, ${d})), ${k}, ${c})`;
   motionOperation(m,{type:'signal.add',signal:{id:`${op.id}-${i}`,label:`${op.id}: link ${i+1} of ${op.links.length} (${follow?'follow':'drag'})`,output:{target:l.target,property:prop,layer},source:{kind:'expr',expr:`${lim}*tanh(${inner}/${lim})`}}},touched);
   src=`ref(${q(l.target)},${q(prop)}) + sig(${q(`${op.id}-${i}`)})`;});
  return;}
 if(op.type==='motion.path.remove'){const n=(p.motionPaths??[]).length;p.motionPaths=(p.motionPaths??[]).filter(x=>x.id!==op.id);if(p.motionPaths.length===n)throw Error(`Motion path ${op.id} not found`);return;}
 if(op.type==='motion.path.bake'){const mp=(p.motionPaths??[]).find(x=>x.id===op.id);if(!mp)throw Error(`Motion path ${op.id} not found`);const tol=op.tolerance??.1;if(!(tol>0&&tol<=10))throw Error('Bake tolerance must be within (0,10]');
  const props:('x'|'y'|'rotation')[]=mp.orient?['x','y','rotation']:['x','y'];for(const k of props)if(m.track(mp.target,k,mp.layer))throw Error(`${mp.target} already has ${k} keys on ${mp.layer}`);
  const solo:Project={...p,motionPaths:[{...mp,layer:'__bake'}],layers:[{id:'__bake',name:'bake',blend:'additive',weight:1}],tracks:[],signals:[],secondary:[],expression:undefined,modifiers:[],poses:{}};
  const val=(time:number)=>{const poses:Record<string,import('./model.js').Pose>={};applyMotionPaths(solo,time,poses);const q=poses[mp.target];return {x:q?.x??0,y:q?.y??0,rotation:q?.rotation??0};};
  const keys:Record<string,{time:number;value:number;easing:'linear'}[]>={x:[],y:[],rotation:[]};const push=(time:number)=>{const v=val(time);for(const k of props)keys[k].push({time:Number(time.toFixed(6)),value:Number(v[k].toFixed(4)),easing:'linear'});};
  const err=(a:number,b:number)=>{const va=val(a),vb=val(b);let e=0;for(const f of [.25,.5,.75]){const vm=val(a+(b-a)*f);for(const k of props)e=Math.max(e,Math.abs(vm[k]-(va[k]+(vb[k]-va[k])*f)));}return e;};
  const times=[...new Set([0,p.duration,...mp.progress.map(k=>k.time)])].sort((a,b)=>a-b);push(times[0]);const rec=(a:number,b:number,depth:number)=>{if(err(a,b)>tol&&depth<14){const mid=(a+b)/2;rec(a,mid,depth+1);rec(mid,b,depth+1);}else push(b);};for(let i=1;i<times.length;i++)rec(times[i-1],times[i],0);
  if(keys.x.length>2000)throw Error('Bake exceeds 2000 keys; raise tolerance');p.motionPaths=(p.motionPaths??[]).filter(x=>x!==mp);for(const k of props)motionOperation(m,{type:'track.set',target:mp.target,property:k,layer:mp.layer,keys:keys[k]},touched);return;}
 if(op.type==='direction.set'){if(op.direction===null)delete p.direction;else{validateDirection(op.direction);p.direction=structuredClone(op.direction);}return;}
 if(op.type==='context.set'){if(op.context===null)delete p.context;else{validateContext(op.context);p.context=structuredClone(op.context);}return;}
 if(op.type==='effect.stack'||op.type==='effect.remove'){
  const list=p.effects??=[];const existing=list.find(x=>x.id===(op.type==='effect.stack'?op.id:op.id));
  const drop=(rec:EffectRecord)=>{if(rec.filter&&m.index.get(rec.filter))authoringOperation(m,{type:'filter.remove',id:rec.filter},touched);p.signals=(p.signals??[]).filter(x=>!rec.signals.includes(x.id));p.effects=(p.effects??[]).filter(x=>x!==rec);};
  if(op.type==='effect.remove'){if(!existing)throw Error(`Effect ${op.id} not found`);drop(existing);return;}
  if(!/^[A-Za-z_][\w-]{0,60}$/.test(op.id))throw Error('Invalid effect id');const el=m.editable(op.target);
  if(existing){if(!op.replace)throw Error(`Effect ${op.id} exists; pass replace:true`);drop(existing);}
  const other=(p.effects??[]).find(x=>x.target===op.target);if(other)throw Error(`${op.target} already has effect stack ${other.id}; extend or remove it`);
  const f=el.getAttribute('filter');if(f&&!/url\(#fx-/.test(f)&&!op.replace)throw Error(`${op.target} already has a filter (${f}); pass replace:true to put the effect stack instead`);
  const c=compileEffects(op.id,op.target,op.effects);
  // The filter goes through the same validated filter.set path, but the stack is classified (and guarded) as effects.
  if(c.filter){authoringOperation(m,{type:'filter.set',id:c.filter,target:op.target,primitives:c.primitives},touched);m.reindex();}
  if(c.signals.length&&!(p.layers??DEFAULT_LAYERS).some(l=>l.id==='effects'))throw Error('The effects layer is missing (layer.set it)');
  for(const sig of c.signals)motionOperation(m,{type:'signal.add',signal:sig},touched);
  (p.effects??=[]).push({id:op.id,target:op.target,kinds:op.effects.map(e=>e.kind),...(c.filter?{filter:c.filter}:{}),signals:c.signals.map(x=>x.id),...(c.echo?{echo:c.echo}:{})});touched.add(op.target);return;}
 if(op.type==='camera.set'){if(op.camera===null){if(p.tracks.some(t=>t.target===CAMERA_TARGET)||(p.signals??[]).some(x=>x.output.target===CAMERA_TARGET))throw Error('Remove @camera tracks and signals before removing the camera');delete p.camera;return;}
  p.camera={...(p.camera??m.defaultCamera()),...structuredClone(op.camera)} as CameraConfig;validateCamera(p,id=>m.index.has(id),(a,b)=>contains(m,a,b));return;}
 if(op.type==='camera.depth'){const c=p.camera??=m.defaultCamera();c.depth=(c.depth??[]).filter(d=>d.target!==op.target);if(op.factor!==null&&(op.factor!==undefined||op.plane))c.depth.push({target:op.target,...(op.plane?{plane:op.plane}:{}),...(typeof op.factor==='number'?{factor:op.factor}:{})});validateCamera(p,id=>m.index.has(id),(a,b)=>contains(m,a,b));return;}
 if(op.type==='camera.shot'||op.type==='camera.fit'){
  const c=p.camera??=m.defaultCamera();const at=op.type==='camera.shot'?op.shot.start:op.time??0;if(!(at>=0&&at<=p.duration))throw Error('Camera time must lie inside the timeline');
  const f=frameState(p,at,{camera:false}),cur=cameraState(p,at,f.params)!;const box=(ids:string[])=>{const b=worldBox(m,ids,f);if(!b)throw Error(`No measurable geometry for ${ids.join(', ')}`);return b;};
  const resolveIds=(ref:string)=>{const node=(p.semantic?.nodes??[]).find(n=>n.id===ref);if(node?.targets.length)return node.targets;if(m.index.has(ref.replace(/^#/,'')))return [ref.replace(/^#/,'')];throw Error(`Camera subject ${ref} not found (use an element id or a semantic part id)`);};
  const scene=box(Array.from(m.doc.documentElement.children).filter(e=>!['defs','metadata','title','desc','style'].includes(e.localName)&&e.getAttribute('id')).map(e=>e.getAttribute('id')!));
  const merge=(prop:'x'|'y'|'zoom'|'rotation',keys:{time:number;value:number}[],start:number,end:number)=>{const track=m.track(CAMERA_TARGET,prop,'camera');const keep=(track?.keys??[]).filter(k=>k.time<start-1e-6||k.time>end+1e-6);motionOperation(m,{type:'track.set',target:CAMERA_TARGET,property:prop,layer:'camera',keys:[...keep,...keys].sort((a,b)=>a.time-b.time) as never},touched);};
  if(op.type==='camera.fit'){const pad=op.padding??.1;if(!(pad>=0&&pad<.45))throw Error('camera.fit padding must be within 0–0.45');const s=fitView(c,box(op.targets.flatMap(resolveIds)),pad);for(const k of ['x','y','zoom'] as const)merge(k,[{time:at,value:Number(s[k].toFixed(4)),...(op.hold?{easing:'step'}:op.easing?{easing:op.easing}:{})} as never],at,at);return;}
  const shot=op.shot;if(shot.duration!==undefined&&!(shot.duration>0&&shot.duration<=300))throw Error('Shot duration must be within (0,300]');
  const ids=shot.subject?resolveIds(shot.subject):[];const follow=shot.intent==='follow'&&ids.length?{ids,offset:{x:ids.reduce((s,id)=>s+(f.poses[id]?.x??0),0)/ids.length,y:ids.reduce((s,id)=>s+(f.poses[id]?.y??0),0)/ids.length}}:undefined;
  const r=compileShot(c,shot,{from:cur,subject:ids.length?box(ids):undefined,scene,duration:p.duration,follow});const end=Math.min(p.duration,shot.start+(shot.duration??1.5));
  for(const [k,keys] of Object.entries(r.tracks))if(keys?.length)merge(k as 'x',keys,Math.min(...keys.map(x=>x.time)),Math.max(...keys.map(x=>x.time)));
  if(r.signals.some(s=>s.output.layer==='camera-shake')&&!(p.layers??DEFAULT_LAYERS).some(l=>l.id==='camera-shake'))m.operation({type:'layer.set',layer:{id:'camera-shake',name:'Cámara · temblor',blend:'additive',weight:1}},touched);
  for(const sig of r.signals){p.signals=(p.signals??[]).filter(x=>x.id!==sig.id);motionOperation(m,{type:'signal.add',signal:sig},touched);}
  // Follow: after the window the camera rests where the subject took it (the end key = the followed value at the end).
  if(shot.intent==='follow')for(const sig of r.signals.filter(s=>s.output.layer==='camera')){const k=sig.output.property as 'x'|'y',v=signalAt(sig,end,{duration:p.duration,loop:p.loop,params:frameParams(p,end),signals:p.signals??[],project:p}).value;merge(k,[{time:Number(end.toFixed(4)),value:Number(v.toFixed(4))}],end,end);}
  return;}
 if(op.type==='beat.set'){p.beats=[...(p.beats??[]).filter(b=>b.id!==op.beat.id),structuredClone(op.beat)].sort((a,b)=>a.start-b.start);validateBeats(p);return;}
 if(op.type==='beat.delete'){const n=(p.beats??[]).length;p.beats=(p.beats??[]).filter(b=>b.id!==op.id);if(p.beats.length===n)throw Error(`Beat ${op.id} not found`);return;}
 if(op.type==='acting.beat'){
  if(!(op.start>=0&&op.start+op.duration<=p.duration+1e-9))throw Error('acting.beat window must lie inside the timeline');
  const layer=op.layer&&op.layer!=='base'?op.layer:undefined,existing=m.track(op.target,op.property,layer);
  const additive=!!layer&&(p.layers??DEFAULT_LAYERS).find(l=>l.id===layer)?.blend==='additive';
  const fs=frameState(p,op.start),poseValue=(fs.poses[op.target] as unknown as Record<string,number>|undefined)?.[op.property];
  const rest=op.rest??(existing?Number(valueAt(existing,op.start,p.loop)):additive?0:op.property==='param'?frameParams(p,op.start)[op.target]??0:op.property.startsWith('bone')?(p.bones.find(b=>b.id===op.target)?.[({boneRotation:'rotation',boneX:'x',boneY:'y'} as const)[op.property as 'boneRotation']]??0):op.property==='opacity'?Number(p.baseAttributes[op.target]?.opacity??1):poseValue??(op.property.startsWith('scale')?1:0));
  const c=actingBeat({start:op.start,duration:op.duration,action:op.action,rest,anticipation:op.anticipation,overshoot:op.overshoot,timing:op.timing,bounces:op.bounces});
  const end=op.start+op.duration,keep=(existing?.keys??[]).filter(k=>k.time<op.start-1e-9||k.time>end+1e-9);
  motionOperation(m,{type:'track.set',target:op.target,property:op.property,...(layer?{layer}:{}),keys:[...keep,...c.keys].sort((a,b)=>a.time-b.time)},touched);
  if(op.beats!==false){const base=(op.id??`${op.target}-${op.property}`).replace(/[^\w.-]/g,'_').slice(0,80);p.beats=[...(p.beats??[]).filter(b=>!b.id.startsWith(base+'-')),...c.beats.map((b,i)=>({...b,id:`${base}-${i}-${b.kind}`,...(op.property!=='param'?{targets:[op.target]}:{})}))].sort((a,b)=>a.start-b.start);validateBeats(p);}
  return;}
 if(op.type==='signal.add'||op.type==='signal.update'){
  const list=p.signals??=[];const i=list.findIndex(s=>s.id===(op.type==='signal.add'?op.signal.id:op.id));
  if(op.type==='signal.add'){if(i>=0)throw Error(`Signal ${op.signal.id} exists; use signal.update`);list.push(structuredClone(op.signal));}
  else{if(i<0)throw Error(`Signal ${op.id} not found`);const next={...list[i],...structuredClone(op.signal),id:list[i].id};list[i]=next as Signal;}
  validateSignals(p,id=>m.index.has(id));const s=list.find(x=>x.id===(op.type==='signal.add'?op.signal.id:op.id))!;if(s.output.property!=='param'&&!s.output.property.startsWith('bone'))touched.add(s.output.target);return;}
 if(op.type==='signal.remove'){const before=(p.signals??[]).length;p.signals=(p.signals??[]).filter(s=>s.id!==op.id);if(p.signals.length===before)throw Error(`Signal ${op.id} not found`);validateSignals(p,id=>m.index.has(id));return;}
 if(op.type==='signal.bake'){
  // Bake = the signal's exact contribution as linear keys on its own layer (then the signal is removed).
  const s=(p.signals??[]).find(x=>x.id===op.id);if(!s)throw Error(`Signal ${op.id} not found`);const o=s.output;
  if(o.property.startsWith('attr:'))throw Error('Attribute signals have no track property; keep them live');
  const layer=(p.layers??DEFAULT_LAYERS).find(l=>l.id===o.layer)!;if(layer.blend==='override'&&s.envelope)throw Error('An override signal with an envelope crossfades; it cannot be baked into one track');
  if(m.track(o.target,o.property as Property,o.layer))throw Error(`A ${o.property} track already exists on layer ${o.layer}; bake would overwrite it`);
  const tol=op.tolerance??.05;if(!(tol>0&&tol<=10))throw Error('Bake tolerance must be within (0,10]');const params=frameParams(p,0);
  const val=(t:number)=>{const r=signalAt(s,t,{duration:p.duration,loop:p.loop,params:frameParams(p,t),signals:p.signals??[],project:p});return layer.blend==='additive'?r.value*r.weight:r.value;};void params;
  const keys:{time:number;value:number}[]=[{time:0,value:val(0)}];const events=[...new Set([0,p.duration,...signalEvents({...p,signals:[s]})])].sort((a,b)=>a-b);
  const sample=(a:number,b:number,va:number,vb:number,depth:number)=>{let err=0;for(const f of [.25,.5,.75])err=Math.max(err,Math.abs(val(a+(b-a)*f)-(va+(vb-va)*f)));if(err>tol&&depth<14){const mid=(a+b)/2,vm=val(mid);sample(a,mid,va,vm,depth+1);sample(mid,b,vm,vb,depth+1);}else{if(keys.length>1990)throw Error('Bake exceeds 2000 keys; raise tolerance');keys.push({time:Number(b.toFixed(6)),value:Number(vb.toFixed(6))});}};
  for(let i=1;i<events.length;i++)sample(events[i-1],events[i],val(events[i-1]),val(events[i]),0);
  p.signals=(p.signals??[]).filter(x=>x!==s);motionOperation(m,{type:'track.set',target:o.target,property:o.property as Property,layer:o.layer,keys:keys.map(k=>({...k,easing:'linear'}))},touched);return;}
 if(!('target' in op)||!('property' in op))throw Error('Invalid motion operation');
 if(op.type==='track.set'){
  if(!Array.isArray(op.keys)||op.keys.length>2000)throw Error('Track accepts at most 2000 keys');
  const keys:Keyframe[]=op.keys.map(k=>{const {hold,...rest}=k;return {...rest,easing:hold?'step':k.easing??'linear'};}).sort((a,b)=>a.time-b.time);
  for(const k of keys){validateKeyExtensions(k);if(!isEasing(k.easing))throw Error('Invalid easing');}
  roveKeys(keys);
  const old=m.track(op.target,op.property,op.layer);if(old)p.tracks=p.tracks.filter(t=>t!==old);
  for(const k of keys)m.operation({type:'keyframe',target:op.target,property:op.property,layer:op.layer,time:k.time,value:k.value,easing:k.easing},touched);
  const track=m.track(op.target,op.property,op.layer);if(track)track.keys=structuredClone(keys);return;
 }
 const track=m.track(op.target,op.property,op.layer);if(!track)throw Error('Track not found');
 if(op.type==='curve.inertia'){
  if(track.keys.some(k=>typeof k.value!=='number'))throw Error('Inertia requires a numeric track');
  const t=op.time,k=op.resistance??8,tolerance=op.tolerance??.1;if(!Number.isFinite(t)||t<0||t>=p.duration||!Number.isFinite(k)||k<.01||k>100||!Number.isFinite(tolerance)||tolerance<=0||tolerance>10)throw Error('Invalid inertia interval, resistance or tolerance');
  const start=Number(valueAt(track,t,p.loop)),epsilon=Math.min(.001,t||.001),incoming=t? (start-Number(valueAt(track,t-epsilon,p.loop)))/epsilon:0;
  const velocity=op.velocity??(op.to!==undefined?(op.to-start)*k:incoming);if(!Number.isFinite(velocity)||Math.abs(velocity)>1e6||op.to!==undefined&&!Number.isFinite(op.to))throw Error('Invalid inertia velocity/target');
  if(op.velocity!==undefined&&op.to!==undefined)throw Error('Choose velocity or asymptotic to, not both');
  const at=(x:number)=>start+velocity/k*(1-Math.exp(-k*(x-t)));const keys:Keyframe[]=[{time:t,value:start,easing:'linear'}];
  const sample=(a:number,b:number,depth:number)=>{const va=at(a),vb=at(b);let error=0;for(const f of [.25,.5,.75])error=Math.max(error,Math.abs(at(a+(b-a)*f)-(va+(vb-va)*f)));if(error>tolerance){if(depth>=20||keys.length>1900)throw Error('Inertia sampling budget exceeded');const mid=(a+b)/2;sample(a,mid,depth+1);sample(mid,b,depth+1);}else keys.push({time:b,value:vb,easing:'linear'});};sample(t,p.duration,0);
  motionOperation(m,{type:'track.set',target:op.target,property:op.property,layer:op.layer,keys:[...track.keys.filter(key=>key.time<t),...keys]},touched);return;
 }
 if(op.type!=='key.tangent'&&op.type!=='curve.custom')throw Error('Unknown motion operation');
 const key=track.keys.find(k=>Math.abs(k.time-op.time)<1e-9);if(!key)throw Error('Keyframe not found at time');
 if(op.type==='curve.custom'){if(op.curve===null)delete key.curve;else{validateCustomCurve(op.curve);key.curve=op.curve;}}
 else{if(op.in)key.in={...op.in};if(op.out)key.out={...op.out};if(op.auto)key.auto=op.auto;if(op.roving!==undefined)key.roving=op.roving;if(op.easing){if(!isEasing(op.easing))throw Error('Invalid easing');key.easing=op.easing;}if(op.hold!==undefined)key.easing=op.hold?'step':op.easing??'linear';validateKeyExtensions(key);roveKeys(track.keys);}
}
