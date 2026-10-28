import {signalEvents} from './procedural.js';
import {center as centerOf,depthFactor,planeRelative} from './camera.js';
import {parseSvg,serialize,elements,assertSvg,SVG_NS} from '../converter/svg.js';
import {VectorDocument} from './document.js';
import {frameState,filterId} from './animation.js';
import {flowFilter} from './modifiers.js';
import {defaultPose,type Pose} from './model.js';
import {segments,mixPaths} from './geometry.js';
export type ExportOptions={profile:'editable'|'standalone';tolerance?:number;maxBytes?:number;maxSamples?:number};
const poseProps=['x','y','rotation','scaleX','scaleY'];
export function exportSvg(model:VectorDocument,options:ExportOptions){
 const tolerance=options.tolerance??.25,maxSamples=options.maxSamples??2000,maxBytes=options.maxBytes??32*1024*1024;
 if(!['editable','standalone'].includes(options.profile)||!Number.isInteger(maxSamples)||maxSamples<2||maxSamples>10000||!Number.isFinite(maxBytes)||maxBytes<1||maxBytes>32*1024*1024)throw Error('Invalid export profile or budget');
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>10)throw Error('Tolerance must be >0 and <=10');
 const project=model.project,doc=parseSvg(model.toSVG(options.profile==='editable')),index=new Map(elements(doc).map(e=>[e.getAttribute('id'),e]));
 const cache=new Map<number,ReturnType<typeof frameState>>();const frame=(t:number)=>{let f=cache.get(t);if(!f){if(cache.size>4000)cache.clear();f=frameState(project,t);cache.set(t,f);}return f;};
 const initial=frame(0);let generated=0,sampleCount=0,maxError=0,jumps=0;
 const group=()=>{const e=doc.createElementNS(SVG_NS,'g');let id;do{id=`mai-motion-${++generated}`;}while(index.has(id));e.setAttribute('id',id);e.setAttribute('data-mai-generated','pose');index.set(id,e);return e;};
 const animate=(e:Element,attribute:string,times:number[],values:string[],transformType?:string,discrete=false)=>{
  if(values.every(v=>v===values[0]))return;
  const a=doc.createElementNS(SVG_NS,transformType?'animateTransform':'animate');a.setAttribute('data-mai-generated','animation');a.setAttribute('attributeName',attribute);if(transformType)a.setAttribute('type',transformType);a.setAttribute('dur',`${project.duration}s`);a.setAttribute('repeatCount',project.loop?'indefinite':'1');a.setAttribute('fill','freeze');a.setAttribute('calcMode',discrete?'discrete':'linear');a.setAttribute('keyTimes',times.map(t=>Number((t/project.duration).toFixed(8))).join(';'));a.setAttribute('values',values.join(';'));e.appendChild(a);sampleCount+=times.length;
 };
 const paramTracks=project.tracks.some(t=>t.property==='param')||(project.signals??[]).some(s=>s.output.property==='param');
 // Procedural signals animate like tracks: their targets are dynamic and their events split sampling (short blinks).
 const signalOut=(id:string,props:readonly string[])=>(project.signals??[]).some(s=>s.output.target===id&&props.includes(s.output.property));
 const eventTimes=[...new Set([0,project.duration,...project.tracks.flatMap(t=>t.keys.map(k=>k.time)),...(project.markers??[]).filter(m=>m.kind==='event').map(m=>m.time),...signalEvents(project),...(project.motionPaths??[]).flatMap(x=>x.progress.map(k=>k.time))])].sort((a,b)=>a-b);
 const pathError=(a:string,b:string)=>{const x=segments(a).flatMap(s=>s.points),y=segments(b).flatMap(s=>s.points);if(x.length!==y.length)throw Error('Incompatible deformation topology');let m=0;for(let i=0;i<x.length;i++)m=Math.max(m,Math.hypot(x[i].x-y[i].x,x[i].y-y[i].y));return m;};
 function sampled<T>(value:(t:number)=>T,interpolate:(a:T,b:T,u:number)=>T,error:(a:T,b:T)=>number){
  const result:{time:number;value:T}[]=[];let retainedError=0;
  const add=(time:number,v:T)=>{if(result.length>=maxSamples)throw Error('Export sampling budget exceeded');if(!result.length||result.at(-1)!.time!==time)result.push({time,value:v});};
  const subdivide=(a:number,b:number,va:T,vb:T,depth:number)=>{let worst=0;for(const u of [.25,.5,.75])worst=Math.max(worst,error(value(a+(b-a)*u),interpolate(va,vb,u)));
   // After 16 halvings the interval is <1/65536 of a key gap: that is a held jump (step key inside a continuous track,
   // a cut). Emit it as an instant transition, like repeated keyTimes elsewhere; it is counted, not hidden.
   if(worst>tolerance){if(depth>=16){jumps++;add(b,vb);return;}const mid=(a+b)/2,vm=value(mid);subdivide(a,mid,va,vm,depth+1);subdivide(mid,b,vm,vb,depth+1);}else{retainedError=Math.max(retainedError,worst);add(b,vb);}};
  add(eventTimes[0],value(eventTimes[0]));for(let i=1;i<eventTimes.length;i++)subdivide(eventTimes[i-1],eventTimes[i],value(eventTimes[i-1]),value(eventTimes[i]),0);maxError=Math.max(maxError,retainedError);return result;
 }
 const uniform=(n:number)=>[...new Set([...Array.from({length:n+1},(_,i)=>Number((project.duration*i/n).toFixed(6))),...eventTimes])].sort((a,b)=>a-b);
 const driverPose=(project.expression?.drivers??[]).filter(d=>poseProps.includes(d.property));
 const poseIds=new Set([...Object.keys(project.poses),...project.tracks.filter(t=>poseProps.includes(t.property)&&t.target!=='@camera').map(t=>t.target),...(project.secondary??[]).map(s=>s.target),...driverPose.map(d=>d.target),...(project.signals??[]).filter(s=>poseProps.includes(s.output.property)).map(s=>s.output.target),...(project.motionPaths??[]).map(x=>x.target)]);
 for(const id of poseIds){const e=index.get(id);if(!e)throw Error(`Animation target missing: ${id}`);const base=project.baseTransforms[id]??'';if(base)e.setAttribute('transform',base);else e.removeAttribute('transform');
  const p0=initial.poses[id]??defaultPose();const translation=group(),rotation=group(),pivot=group(),scale=group(),inversePivot=group();e.parentNode!.insertBefore(translation,e);translation.appendChild(rotation);rotation.appendChild(pivot);pivot.appendChild(scale);scale.appendChild(inversePivot);inversePivot.appendChild(e);
  translation.setAttribute('transform',`translate(${p0.x} ${p0.y})`);rotation.setAttribute('transform',`rotate(${p0.rotation} ${p0.pivotX} ${p0.pivotY})`);pivot.setAttribute('transform',`translate(${p0.pivotX} ${p0.pivotY})`);scale.setAttribute('transform',`scale(${p0.scaleX} ${p0.scaleY})`);inversePivot.setAttribute('transform',`translate(${-p0.pivotX} ${-p0.pivotY})`);
  const tracks=project.tracks.filter(t=>t.target===id&&poseProps.includes(t.property)),dynamic=tracks.length||(project.secondary??[]).some(s=>s.target===id)||(paramTracks&&driverPose.some(d=>d.target===id))||signalOut(id,poseProps)||(project.motionPaths??[]).some(x=>x.target===id);if(!dynamic)continue;
  const discrete=tracks.length>0&&tracks.every(t=>t.keys.every(k=>k.easing==='step'))&&!(project.secondary??[]).some(s=>s.target===id)&&!driverPose.some(d=>d.target===id)&&!signalOut(id,poseProps)&&!(project.motionPaths??[]).some(x=>x.target===id);
  const value=(t:number)=>frame(t).poses[id]??defaultPose();const lerp=(a:Pose,b:Pose,u:number):Pose=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k as keyof Pose]+(b[k as keyof Pose]-a[k as keyof Pose])*u])) as Pose;
  const samples=discrete?eventTimes.map(time=>({time,value:value(time)})):sampled(value,lerp,(a,b)=>Math.max(...Object.keys(a).map(k=>Math.abs(a[k as keyof Pose]-b[k as keyof Pose]))));
  const times=samples.map(s=>s.time);animate(translation,'transform',times,samples.map(s=>`${s.value.x} ${s.value.y}`),'translate',discrete);animate(rotation,'transform',times,samples.map(s=>`${s.value.rotation} ${p0.pivotX} ${p0.pivotY}`),'rotate',discrete);animate(scale,'transform',times,samples.map(s=>`${s.value.scaleX} ${s.value.scaleY}`),'scale',discrete);
 }
 // Geometry: tracks, rigs, expression warps, drivers and geometry modifiers all resolve to `d`.
 // Editable files keep geometry modifiers live (MAI evaluates them); standalone bakes them within the byte budget.
 const liveModifiers=options.profile==='editable'?new Set((project.modifiers??[]).filter(m=>m.enabled&&m.technique!=='filter').flatMap(m=>m.targets)):new Set<string>();
 const modifierSamples=new Map<string,number>();if(options.profile==='standalone')for(const m of project.modifiers??[])if(m.enabled&&m.technique!=='filter')for(const id of m.targets)modifierSamples.set(id,Math.max(modifierSamples.get(id)??0,Math.round(m.params.samples??24)));
 const paths=new Set([...project.skins.map(s=>s.target),...project.meshes.map(m=>m.target),...project.tracks.filter(t=>t.property==='d').map(t=>t.target),...modifierSamples.keys(),...(paramTracks?(project.expression?.features??[]).flatMap(f=>f.paths):[]),...(paramTracks?(project.expression?.drivers??[]).filter(d=>d.property==='d').map(d=>d.target):[])]);
 for(const id of paths){if(liveModifiers.has(id)&&!project.tracks.some(t=>t.target===id&&t.property==='d'))continue;const e=index.get(id);if(!e)throw Error(`Deformation target missing: ${id}`);const fallback=e.getAttribute('d')!;const value=(t:number)=>frame(t).attrs[id]?.d??fallback;const influencing=project.tracks.filter(t=>t.target===id||t.property.startsWith('bone')||t.target.startsWith(id+'::'));const discrete=!modifierSamples.has(id)&&!paramTracks&&influencing.length>0&&influencing.every(t=>t.keys.every(k=>k.easing==='step'))&&!(project.signals??[]).some(s=>s.output.property.startsWith('bone'));
  const n=modifierSamples.get(id);const samples=n?uniform(n).map(time=>({time,value:value(time)})):discrete?eventTimes.map(time=>({time,value:value(time)})):sampled(value,mixPaths,pathError);e.setAttribute('d',samples[0].value);animate(e,'d',samples.map(s=>s.time),samples.map(s=>s.value),undefined,discrete);
 }
 // Scalar and color attributes from tracks and drivers, mixed across layers.
 const attrKeys=new Map<string,Set<string>>();const addKey=(id:string,a:string)=>{const s=attrKeys.get(id)??new Set<string>();s.add(a);attrKeys.set(id,s);};
 for(const t of project.tracks)if(['opacity','fill','stroke'].includes(t.property))addKey(t.target,t.property);
 for(const s of project.signals??[])if(s.output.property==='opacity'||s.output.property.startsWith('attr:'))addKey(s.output.target,s.output.property==='opacity'?'opacity':s.output.property.slice(5));
 if(paramTracks)for(const d of project.expression?.drivers??[])if(!poseProps.includes(d.property)&&d.property!=='d')addKey(d.target,d.property.startsWith('attr:')?d.property.slice(5):d.property);
 for(const [id,names]of attrKeys){const e=index.get(id);if(!e)throw Error('Missing attribute animation target');for(const name of names){
  const tracks=project.tracks.filter(t=>t.target===id&&t.property===name),discrete=tracks.length>0&&tracks.every(t=>t.keys.every(k=>k.easing==='step'))&&!(project.expression?.drivers??[]).some(d=>d.target===id)&&!(project.signals??[]).some(x=>x.output.target===id);
  const raw=(t:number)=>frame(t).attrs[id]?.[name]??e.getAttribute(name)??'';let samples:{time:number;value:number|string}[];const isColor=/^#[\da-f]{6}$/i.test(String(raw(0))),isList=/^\s*-?[\d.e+-]+(\s+-?[\d.e+-]+)+\s*$/i.test(String(raw(0)));
  if(discrete)samples=eventTimes.map(time=>({time,value:raw(time)}));
  // Numeric lists (stdDeviation "x y", baseFrequency) interpolate per component.
  else if(isList){const list=(t:number)=>String(raw(t)).trim().split(/\s+/).map(Number);samples=sampled(list,(a,b,u)=>a.map((v,i)=>v+((b[i]??v)-v)*u),(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-(b[i]??v))))).map(x=>({time:x.time,value:x.value.map(v=>Number(v.toFixed(5))).join(' ')}));}
  else if(!isColor)samples=sampled(t=>Number(raw(t)),(a,b,u)=>a+(b-a)*u,(a,b)=>Math.abs(a-b)*(name==='opacity'?255:1));
  else {const rgb=(v:string)=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));const lerp=(a:number[],b:number[],u:number)=>a.map((v,i)=>v+(b[i]-v)*u);// Hex colors are quantized to integer channels, so ±0.5 per channel is rounding, not interpolation error.
   const s=sampled(t=>rgb(String(raw(t))),lerp,(a,b)=>Math.max(0,Math.max(...a.map((v,i)=>Math.abs(v-b[i])))-.5));samples=s.map(s=>({time:s.time,value:'#'+s.value.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}));}
  e.setAttribute(name,String(samples[0].value));animate(e,name,samples.map(s=>s.time),samples.map(s=>String(s.value)),undefined,discrete);}}
 // Filter-technique flow: sawtooth scroll of a stitched noise tile; repeated keyTimes make the wrap instantaneous.
 for(const m of project.modifiers??[]){if(!m.enabled||m.technique!=='filter')continue;const scroll=index.get(`${filterId(m)}-scroll`);if(!scroll)throw Error(`Flow filter missing for ${m.id}`);const f=flowFilter(m,filterId(m),project.duration);
  for(const [axis,travel]of [['dx',f.travel.x],['dy',f.travel.y]] as const){if(!travel)continue;const wraps=Math.abs(travel)/f.tile,times:number[]=[0],values:number[]=[travel>0?0:f.tile-1e-6];
   for(let k=1;k<=wraps;k++){const t=project.duration*k/wraps;times.push(t,t);values.push(travel>0?f.tile:0,travel>0?0:f.tile);}
   if(times.at(-1)!==project.duration){times.push(project.duration);values.push(travel>0?(Math.abs(travel)%f.tile):(f.tile-Math.abs(travel)%f.tile));}
   scroll.setAttribute(axis,String(f.at(0)[axis]));const a=doc.createElementNS(SVG_NS,'animate');a.setAttribute('data-mai-generated','animation');a.setAttribute('attributeName',axis);a.setAttribute('dur',`${project.duration}s`);a.setAttribute('repeatCount',project.loop?'indefinite':'1');a.setAttribute('fill','freeze');a.setAttribute('calcMode','linear');a.setAttribute('keyTimes',times.map(t=>Number((t/project.duration).toFixed(8))).join(';'));a.setAttribute('values',values.map(v=>Number(v.toFixed(4))).join(';'));scroll.appendChild(a);sampleCount+=times.length;}}
 // Editable keeps rest geometry in the DOM for live-evaluated parts (expression features, geometry modifiers).
 const restKept=options.profile==='editable'?new Set([...liveModifiers,...(project.expression?.features??[]).flatMap(f=>f.paths)]):new Set<string>();
 for(const [id,attrs]of Object.entries(initial.attrs)){const e=index.get(id);if(e)for(const [name,value]of Object.entries(attrs))if(!(name==='d'&&restKept.has(id)&&!paths.has(id)))e.setAttribute(name,value);}
 // Echo/trail ghosts: <use href="#T"> inside its own pose-wrapper chain animated with the delayed pose, placed behind
 // T's outermost wrapper (same ancestors). Rigid motion is exact; deformation inside the ghost is the live one.
 for(const fx of project.effects??[]){if(!fx.echo)continue;let anchorEl=index.get(fx.target);if(!anchorEl)continue;while(anchorEl.parentNode&&(anchorEl.parentNode as Element).getAttribute?.('data-mai-generated')==='pose')anchorEl=anchorEl.parentNode as Element;
  for(let k=fx.echo.count;k>=1;k--){const delay=k*fx.echo.delay,wrap=(t:number)=>project.loop?(((t-delay)%project.duration)+project.duration)%project.duration:Math.max(0,t-delay);
   const value=(t:number)=>frame(wrap(t)).poses[fx.target]??initial.poses[fx.target]??defaultPose();const lerp=(a:Pose,b:Pose,u:number):Pose=>Object.fromEntries(Object.keys(a).map(q=>[q,a[q as keyof Pose]+(b[q as keyof Pose]-a[q as keyof Pose])*u])) as Pose;
   const samples=sampled(value,lerp,(a,b)=>Math.max(...Object.keys(a).map(q=>Math.abs(a[q as keyof Pose]-b[q as keyof Pose])))),times=samples.map(x=>x.time),p0=samples[0].value;
   const fade=group(),translation=group(),rotation=group(),pivot=group(),scale=group(),inversePivot=group();fade.setAttribute('data-mai-generated','effect');fade.setAttribute('opacity',String(Number(Math.pow(fx.echo.falloff,k).toFixed(4))));
   fade.appendChild(translation);translation.appendChild(rotation);rotation.appendChild(pivot);pivot.appendChild(scale);scale.appendChild(inversePivot);
   const use=doc.createElementNS(SVG_NS,'use');use.setAttribute('href',`#${fx.target}`);use.setAttribute('data-mai-generated','effect');inversePivot.appendChild(use);anchorEl.parentNode!.insertBefore(fade,anchorEl);
   translation.setAttribute('transform',`translate(${p0.x} ${p0.y})`);rotation.setAttribute('transform',`rotate(${p0.rotation} ${p0.pivotX} ${p0.pivotY})`);pivot.setAttribute('transform',`translate(${p0.pivotX} ${p0.pivotY})`);scale.setAttribute('transform',`scale(${p0.scaleX} ${p0.scaleY})`);inversePivot.setAttribute('transform',`translate(${-p0.pivotX} ${-p0.pivotY})`);
   animate(translation,'transform',times,samples.map(x=>`${x.value.x} ${x.value.y}`),'translate');animate(rotation,'transform',times,samples.map(x=>`${x.value.rotation} ${p0.pivotX} ${p0.pivotY}`),'rotate');animate(scale,'transform',times,samples.map(x=>`${x.value.scaleX} ${x.value.scaleY}`),'scale');}}
 // Camera: a view transform around the whole scene, decomposed into SMIL-animatable groups
 // translate(c) · rotate(−r) · scale(z) · translate(−P); depth planes wrap their outermost pose wrapper with
 // translate(P) · scale(z^(f−1)) · translate(−P_f). Paint order, ids and url(#) references are untouched.
 let cameraGroups=0;const cam=project.camera;
 if(cam&&initial.camera){const c=centerOf(cam),view=cam.view;type C=NonNullable<typeof initial.camera>;
  const value=(t:number)=>frame(t).camera as C;const lerpC=(a:C,b:C,u:number):C=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,zoom:a.zoom*Math.pow(b.zoom/a.zoom,u),rotation:a.rotation+(b.rotation-a.rotation)*u});
  const err=(a:C,b:C)=>Math.max(Math.abs(a.x-b.x)*a.zoom,Math.abs(a.y-b.y)*a.zoom,Math.abs(Math.log(a.zoom/b.zoom))*view.width/2,Math.abs(a.rotation-b.rotation)*Math.PI/180*view.width/2);
  const samples=sampled(value,lerpC,err),times=samples.map(x=>x.time),mk=(t:string)=>{const g=doc.createElementNS(SVG_NS,'g');g.setAttribute('data-mai-generated',t);return g;};
  const root=doc.documentElement,g1=mk('camera'),g2=mk('camera'),g3=mk('camera'),g4=mk('camera');g1.setAttribute('id','mai-camera');
  for(const n of Array.from(root.childNodes)){if(n.nodeType===1&&['defs','metadata','title','desc','style'].includes((n as Element).localName))continue;g4.appendChild(n);}
  g1.setAttribute('transform',`translate(${c.x} ${c.y})`);const s0=samples[0].value;g2.setAttribute('transform',`rotate(${-s0.rotation})`);g3.setAttribute('transform',`scale(${s0.zoom})`);g4.setAttribute('transform',`translate(${-s0.x} ${-s0.y})`);
  g1.appendChild(g2);g2.appendChild(g3);g3.appendChild(g4);root.appendChild(g1);cameraGroups=4;
  animate(g2,'transform',times,samples.map(x=>`${-x.value.rotation}`),'rotate');animate(g3,'transform',times,samples.map(x=>`${x.value.zoom}`),'scale');animate(g4,'transform',times,samples.map(x=>`${-x.value.x} ${-x.value.y}`),'translate');
  for(const d of cam.depth??[]){let e=index.get(d.target);const f=depthFactor(cam,d.target);if(!e||f===undefined||f===1)continue;while(e.parentNode&&(e.parentNode as Element).getAttribute?.('data-mai-generated')==='pose')e=e.parentNode as Element;
   const a=mk('parallax'),b=mk('parallax'),k=mk('parallax');e.parentNode!.insertBefore(a,e);a.appendChild(b);b.appendChild(k);k.appendChild(e);cameraGroups+=3;
   const rel=samples.map(x=>planeRelative(cam,x.value,f));const r0=rel[0];a.setAttribute('transform',`translate(${r0.translate.x} ${r0.translate.y})`);b.setAttribute('transform',`scale(${r0.scale})`);k.setAttribute('transform',`translate(${r0.back.x} ${r0.back.y})`);
   animate(a,'transform',times,rel.map(r=>`${r.translate.x} ${r.translate.y}`),'translate');animate(b,'transform',times,rel.map(r=>`${r.scale}`),'scale');animate(k,'transform',times,rel.map(r=>`${r.back.x} ${r.back.y}`),'translate');}}
 const svg=serialize(doc);const validation=assertSvg(svg);if(validation.bytes>maxBytes)throw Error(`Export exceeds size budget (${validation.bytes} > ${maxBytes} bytes). Options: A) switch heavy flow modifiers to technique "filter", B) lower modifier samples or expression keys, C) run mai optimize --profile game first, D) raise --max-bytes deliberately.`);
 return {svg,report:{profile:options.profile,bytes:validation.bytes,paths:validation.paths,samples:sampleCount,maxSampledInterpolationError:Number(maxError.toFixed(5)),jumps,cameraGroups,tolerance,errorUnits:'path units / degrees / scale units / color channel values as applicable',scriptRequired:false,rasterImages:0,rigStored:options.profile==='editable',modifiersBaked:options.profile==='standalone',modifiers:(project.modifiers??[]).filter(m=>m.enabled).map(m=>({id:m.id,technique:m.technique??'geometry',samples:m.technique==='filter'?'native':m.params.samples??24})),measurement:'adaptive checks at quarter, half and three-quarter positions; modifiers use uniform samples; not a mathematical continuous error bound'}};
}

// ── Reduced motion (plan F5) ─────────────────────────────────────────────────────────────────────────────────────
// SMIL cannot read prefers-reduced-motion and a second copy of the artwork inside one file would duplicate ids, so the
// accessible variant is a separate file, chosen by the page with <picture><source media="(prefers-reduced-motion: reduce)">.
//  still: the scene frozen at a meaningful instant (loops: 0; one-shots: the end, where the motion arrives).
//  fade:  the same frozen pose, camera and geometry, keeping only opacity and color changes (no transforms, paths,
//         camera moves, motion signals, secondary motion, warps or echo trails) — non-motion transitions stay.
export type ReducedMotionMode='still'|'fade';
export function exportReducedMotion(model:VectorDocument,options:{mode:ReducedMotionMode;at?:number;tolerance?:number}){
 const src=model.project,at=options.at??(src.loop?0:src.duration);if(!['still','fade'].includes(options.mode))throw Error('Reduced motion mode is still or fade');if(!(at>=0&&at<=src.duration))throw Error('Reduced motion time must lie inside the timeline');
 const copy=new VectorDocument(model.toSVG());const p=copy.project;const f=frameState(src,at);const dropped={tracks:0,signals:0,motionPaths:(p.motionPaths??[]).length,secondary:(p.secondary??[]).length,modifiers:(p.modifiers??[]).length,echo:(p.effects??[]).filter(x=>x.echo).length};
 if(p.effects)p.effects=p.effects.map(x=>{const {echo:_echo,...rest}=x;void _echo;return {...rest,kinds:x.kinds.filter(k=>k!=='echo')};});
 const usage=`<picture><source media="(prefers-reduced-motion: reduce)" srcset="reduced.svg"><img src="animated.svg" alt="…"></picture>`;
 if(options.mode==='still'){const svg=copy.frame(at);const v=assertSvg(svg);return {svg,report:{mode:'still' as const,at,bytes:v.bytes,paths:v.paths,animations:0,dropped,usage,scriptRequired:false,rasterImages:0}};}
 // Freeze everything that moves at `at`: poses, bones, params (so rigs stay put), geometry and the camera.
 for(const [id,pose] of Object.entries(f.poses))p.poses[id]=structuredClone(pose);p.bones=structuredClone(f.bones);p.meshes=structuredClone(f.meshes);
 for(const [name,def] of Object.entries(p.params??{}))if(name in f.params)def.default=f.params[name];
 for(const [id,a] of Object.entries(f.attrs))if(a.d)copy.index.get(id)?.setAttribute('d',a.d);
 const kept=new Set(['opacity','fill','stroke']);const before=p.tracks.length;p.tracks=p.tracks.filter(t=>t.target!=='@camera'&&kept.has(t.property));dropped.tracks=before-p.tracks.length;
 if(f.camera)for(const k of ['x','y','zoom','rotation'] as const)p.tracks.push({target:'@camera',property:k,layer:'camera',keys:[{time:0,value:f.camera[k],easing:'linear'}]});
 const nSig=(p.signals??[]).length;p.signals=(p.signals??[]).filter(s=>s.output.target!=='@camera'&&(s.output.property==='opacity'||s.output.property==='attr:opacity')&&s.source.kind!=='speed');dropped.signals=nSig-p.signals.length;
 p.motionPaths=[];p.secondary=[];p.modifiers=[];
 const r=exportSvg(copy,{profile:'standalone',tolerance:options.tolerance});
 return {svg:r.svg,report:{...r.report,mode:'fade' as const,at,animations:(r.svg.match(/<animate/g)??[]).length,dropped,usage}};}
