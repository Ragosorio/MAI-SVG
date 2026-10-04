import {parseSvg,serialize,elements,assertSvg,SVG_NS} from '../converter/svg.js';
import {VectorDocument} from './document.js';
import {frameState,poseTransform,valueAt} from './animation.js';
import {defaultPose,type Pose} from './model.js';
import {segments,mixPaths} from './geometry.js';
export type ExportOptions={profile:'editable'|'standalone';tolerance?:number;maxBytes?:number;maxSamples?:number};
export function exportSvg(model:VectorDocument,options:ExportOptions){
 const tolerance=options.tolerance??.25,maxSamples=options.maxSamples??2000,maxBytes=options.maxBytes??32*1024*1024;
 if(!['editable','standalone'].includes(options.profile)||!Number.isInteger(maxSamples)||maxSamples<2||maxSamples>10000||!Number.isFinite(maxBytes)||maxBytes<1||maxBytes>32*1024*1024)throw Error('Invalid export profile or budget');
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>10)throw Error('Tolerance must be >0 and <=10');
 const project=model.project,doc=parseSvg(model.toSVG(options.profile==='editable')),index=new Map(elements(doc).map(e=>[e.getAttribute('id'),e]));
 const cache=new Map<number,ReturnType<typeof frameState>>();const frame=(t:number)=>{let f=cache.get(t);if(!f){f=frameState(project,t);cache.set(t,f);}return f;};
 const initial=frame(0);let generated=0,sampleCount=0,maxError=0;
 const group=()=>{const e=doc.createElementNS(SVG_NS,'g');let id;do{id=`mai-motion-${++generated}`;}while(index.has(id));e.setAttribute('id',id);e.setAttribute('data-mai-generated','pose');index.set(id,e);return e;};
 const animate=(e:Element,attribute:string,times:number[],values:string[],transformType?:string,discrete=false)=>{
  if(values.every(v=>v===values[0]))return;
  const a=doc.createElementNS(SVG_NS,transformType?'animateTransform':'animate');a.setAttribute('data-mai-generated','animation');a.setAttribute('attributeName',attribute);if(transformType)a.setAttribute('type',transformType);a.setAttribute('dur',`${project.duration}s`);a.setAttribute('repeatCount',project.loop?'indefinite':'1');a.setAttribute('fill','freeze');a.setAttribute('calcMode',discrete?'discrete':'linear');a.setAttribute('keyTimes',times.map(t=>Number((t/project.duration).toFixed(8))).join(';'));a.setAttribute('values',values.join(';'));e.appendChild(a);sampleCount+=times.length;
 };
 const eventTimes=[...new Set([0,project.duration,...project.tracks.flatMap(t=>t.keys.map(k=>k.time))])].sort((a,b)=>a-b);
 const pathError=(a:string,b:string)=>{const x=segments(a).flatMap(s=>s.points),y=segments(b).flatMap(s=>s.points);if(x.length!==y.length)throw Error('Incompatible deformation topology');return Math.max(0,...x.map((p,i)=>Math.hypot(p.x-y[i].x,p.y-y[i].y)));};
 function sampled<T>(value:(t:number)=>T,interpolate:(a:T,b:T,u:number)=>T,error:(a:T,b:T)=>number){
  const result:{time:number;value:T}[]=[];let retainedError=0;
  const add=(time:number,v:T)=>{if(result.length>=maxSamples)throw Error('Export sampling budget exceeded');if(!result.length||result.at(-1)!.time!==time)result.push({time,value:v});};
  const subdivide=(a:number,b:number,va:T,vb:T,depth:number)=>{let worst=0;for(const u of [.25,.5,.75])worst=Math.max(worst,error(value(a+(b-a)*u),interpolate(va,vb,u)));
   if(worst>tolerance){if(depth>=16)throw Error('Cannot meet export tolerance at a discontinuity; use discrete tracks or continuous easing');const mid=(a+b)/2,vm=value(mid);subdivide(a,mid,va,vm,depth+1);subdivide(mid,b,vm,vb,depth+1);}else{retainedError=Math.max(retainedError,worst);add(b,vb);}};
  add(eventTimes[0],value(eventTimes[0]));for(let i=1;i<eventTimes.length;i++)subdivide(eventTimes[i-1],eventTimes[i],value(eventTimes[i-1]),value(eventTimes[i]),0);maxError=Math.max(maxError,retainedError);return result;
 }
 const poseIds=new Set([...Object.keys(project.poses),...project.tracks.filter(t=>['x','y','rotation','scaleX','scaleY'].includes(t.property)).map(t=>t.target)]);
 for(const id of poseIds){const e=index.get(id);if(!e)throw Error(`Animation target missing: ${id}`);const base=project.baseTransforms[id]??'';if(base)e.setAttribute('transform',base);else e.removeAttribute('transform');
  const p0=initial.poses[id]??defaultPose();const translation=group(),rotation=group(),pivot=group(),scale=group(),inversePivot=group();e.parentNode!.insertBefore(translation,e);translation.appendChild(rotation);rotation.appendChild(pivot);pivot.appendChild(scale);scale.appendChild(inversePivot);inversePivot.appendChild(e);
  translation.setAttribute('transform',`translate(${p0.x} ${p0.y})`);rotation.setAttribute('transform',`rotate(${p0.rotation} ${p0.pivotX} ${p0.pivotY})`);pivot.setAttribute('transform',`translate(${p0.pivotX} ${p0.pivotY})`);scale.setAttribute('transform',`scale(${p0.scaleX} ${p0.scaleY})`);inversePivot.setAttribute('transform',`translate(${-p0.pivotX} ${-p0.pivotY})`);
  const tracks=project.tracks.filter(t=>t.target===id&&['x','y','rotation','scaleX','scaleY'].includes(t.property));if(!tracks.length)continue;
  const discrete=tracks.every(t=>t.keys.every(k=>k.easing==='step'));
  const value=(t:number)=>frame(t).poses[id]??defaultPose();const lerp=(a:Pose,b:Pose,u:number):Pose=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k as keyof Pose]+(b[k as keyof Pose]-a[k as keyof Pose])*u])) as Pose;
  const samples=discrete?eventTimes.map(time=>({time,value:value(time)})):sampled(value,lerp,(a,b)=>Math.max(...Object.keys(a).map(k=>Math.abs(a[k as keyof Pose]-b[k as keyof Pose]))));
  const times=samples.map(s=>s.time);animate(translation,'transform',times,samples.map(s=>`${s.value.x} ${s.value.y}`),'translate',discrete);animate(rotation,'transform',times,samples.map(s=>`${s.value.rotation} ${p0.pivotX} ${p0.pivotY}`),'rotate',discrete);animate(scale,'transform',times,samples.map(s=>`${s.value.scaleX} ${s.value.scaleY}`),'scale',discrete);
 }
 const paths=new Set([...project.skins.map(s=>s.target),...project.meshes.map(m=>m.target),...project.tracks.filter(t=>t.property==='d').map(t=>t.target)]);
 for(const id of paths){const e=index.get(id);if(!e)throw Error(`Deformation target missing: ${id}`);const fallback=e.getAttribute('d')!;const value=(t:number)=>frame(t).attrs[id]?.d??fallback;const influencing=project.tracks.filter(t=>t.target===id||t.property.startsWith('bone')||t.target.startsWith(id+'::'));const discrete=influencing.length>0&&influencing.every(t=>t.keys.every(k=>k.easing==='step'));
  const samples=discrete?eventTimes.map(time=>({time,value:value(time)})):sampled(value,mixPaths,pathError);e.setAttribute('d',samples[0].value);animate(e,'d',samples.map(s=>s.time),samples.map(s=>s.value),undefined,discrete);
 }
 for(const track of project.tracks.filter(t=>['opacity','fill','stroke'].includes(t.property))){const e=index.get(track.target);if(!e)throw Error('Missing attribute animation target');const discrete=track.keys.every(k=>k.easing==='step'),value=(t:number)=>valueAt(track,t);let samples:{time:number;value:number|string}[];
  if(discrete)samples=eventTimes.map(time=>({time,value:value(time)}));
  else if(track.property==='opacity')samples=sampled(t=>Number(value(t)),(a,b,u)=>a+(b-a)*u,(a,b)=>Math.abs(a-b)*255);
  else {const rgb=(v:string)=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));const lerp=(a:number[],b:number[],u:number)=>a.map((v,i)=>v+(b[i]-v)*u);const s=sampled(t=>rgb(String(value(t))),lerp,(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i]))));samples=s.map(s=>({time:s.time,value:'#'+s.value.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}));}
  e.setAttribute(track.property,String(samples[0].value));animate(e,track.property,samples.map(s=>s.time),samples.map(s=>String(s.value)),undefined,discrete);
 }
 for(const [id,attrs]of Object.entries(initial.attrs)){const e=index.get(id);if(e)for(const [name,value]of Object.entries(attrs))e.setAttribute(name,value);}
 const svg=serialize(doc);const validation=assertSvg(svg);if(validation.bytes>maxBytes)throw Error(`Export exceeds size budget (${validation.bytes} > ${maxBytes} bytes). Reduce detail, duration or precision.`);
 return {svg,report:{profile:options.profile,bytes:validation.bytes,paths:validation.paths,samples:sampleCount,maxSampledInterpolationError:Number(maxError.toFixed(5)),tolerance,errorUnits:'path units / degrees / scale units / color channel values as applicable',scriptRequired:false,rasterImages:0,rigStored:options.profile==='editable',measurement:'adaptive checks at quarter, half and three-quarter positions; not a mathematical continuous error bound'}};
}
