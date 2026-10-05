import {mixPaths,pathData,segments,mix,type Point} from './geometry.js';
import {defaultPose,DEFAULT_LAYERS,type Project,type Track,type Bone,type Mesh,type Pose,type Easing,type Layer,type Modifier} from './model.js';
import {evaluateRig} from './expression.js';
import {applyModifier,flowField,flowFilter} from './modifiers.js';
import {simulateSecondary,secondaryAt} from './secondary.js';
export type Matrix=[number,number,number,number,number,number];
export const identity=():Matrix=>[1,0,0,1,0,0];
export function multiply(a:Matrix,b:Matrix):Matrix{return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function invert(m:Matrix):Matrix{const d=m[0]*m[3]-m[1]*m[2];if(Math.abs(d)<1e-10)throw Error('Singular transform');return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
export const applyMatrix=(m:Matrix,p:Point):Point=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const transform=(x:number,y:number,angle:number):Matrix=>{const r=angle*Math.PI/180;return [Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),x,y];};
const bezier=/^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;
export const isEasing=(e:unknown):e is Easing=>typeof e==='string'&&(['linear','ease-in-out','step','ease-in','ease-out','overshoot','anticipate'].includes(e)||(bezier.test(e)&&(()=>{const [,a,,c]=e.match(bezier)!.map(Number);return a>=0&&a<=1&&c>=0&&c<=1;})()));
export function ease(e:Easing,t:number):number{
 switch(e){case 'linear':return t;case 'step':return 0;case 'ease-in-out':return t*t*(3-2*t);case 'ease-in':return t*t;case 'ease-out':return 1-(1-t)*(1-t);
  case 'overshoot':{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);}case 'anticipate':{const c1=1.70158,c3=c1+1;return c3*t*t*t-c1*t*t;}}
 const m=e.match(bezier);if(!m)return t;const [x1,y1,x2,y2]=m.slice(1).map(Number);const f=(a:number,b:number,s:number)=>3*a*s*(1-s)*(1-s)+3*b*s*s*(1-s)+s*s*s;
 let lo=0,hi=1,s=t;for(let i=0;i<30;i++){s=(lo+hi)/2;if(f(x1,x2,s)<t)lo=s;else hi=s;}return f(y1,y2,s);
}
export function valueAt(track:Track,time:number):number|string {
 const keys=track.keys;if(!keys.length)throw Error('Empty track');if(time<=keys[0].time)return keys[0].value;if(time>=keys.at(-1)!.time)return keys.at(-1)!.value;
 const j=keys.findIndex(k=>k.time>time),a=keys[j-1],b=keys[j];if(a.easing==='step')return a.value;const t=ease(a.easing,(time-a.time)/(b.time-a.time));
 if(typeof a.value==='number'&&typeof b.value==='number')return a.value+(b.value-a.value)*t;
 if(track.property==='d')return mixPaths(String(a.value),String(b.value),Math.max(0,Math.min(1,t)));
 const hex=(v:string)=>/^#[0-9a-f]{6}$/i.test(v)?[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)):null;
 const x=hex(String(a.value)),y=hex(String(b.value));if(x&&y)return '#'+x.map((v,i)=>Math.round(Math.max(0,Math.min(255,v+(y[i]-v)*t))).toString(16).padStart(2,'0')).join('');
 return a.value;
}
export const layersOf=(p:Project):Layer[]=>{const list=p.layers?.length?p.layers:DEFAULT_LAYERS;return list.some(l=>l.id==='base')?list:[{id:'base',name:'Base',blend:'override',weight:1},...list];};
// Layer mixing: override layers replace (weighted), additive layers add on top. Mute/solo like a DAW; base stays unless muted.
export function mixTracks(p:Project,tracks:Track[],time:number,base:number|string|undefined){
 const layers=layersOf(p),order=new Map(layers.map((l,i)=>[l.id,i])),solo=layers.some(l=>l.solo);
 const active=tracks.map(t=>({t,l:layers.find(l=>l.id===(t.layer??'base'))??{id:t.layer!,name:t.layer!,blend:'override' as const,weight:1}})).filter(({l})=>!l.mute&&(!solo||l.solo||l.id==='base')).sort((a,b)=>(order.get(a.l.id)??99)-(order.get(b.l.id)??99));
 let value=base;for(const {t,l}of active){const v=valueAt(t,time);if(l.blend==='additive'&&typeof v==='number'){value=(typeof value==='number'?value:0)+l.weight*v;}
  else if(typeof v==='number'&&typeof value==='number'&&l.weight<1)value=value+(v-value)*l.weight;else if(l.weight>=.5||value===undefined)value=v;}
 return value;
}
const poseProps=['x','y','rotation','scaleX','scaleY'];
export type FrameOptions={params?:Record<string,number>;modifiers?:boolean;secondary?:boolean};
export function frameParams(project:Project,time:number,overrides?:Record<string,number>){
 const t=Math.max(0,Math.min(project.duration,time)),params:Record<string,number>={};for(const [name,def]of Object.entries(project.params??{}))params[name]=def.default;
 const groups=new Map<string,Track[]>();for(const track of project.tracks)if(track.property==='param'){const g=groups.get(track.target)??[];g.push(track);groups.set(track.target,g);}
 for(const [name,tracks]of groups){const v=mixTracks(project,tracks,t,params[name]??0);if(typeof v==='number')params[name]=v;}
 Object.assign(params,overrides??{});for(const [name,def]of Object.entries(project.params??{}))if(name in params)params[name]=Math.max(def.min,Math.min(def.max,params[name]));
 return params;
}
const fields=new Map<string,ReturnType<typeof flowField>>();
function field(m:Modifier,duration:number,loop:boolean){const key=JSON.stringify([m.id,m.params,m.bounds,m.anchor,m.direction,duration,loop]);let f=fields.get(key);if(!f){if(fields.size>64)fields.clear();f=flowField(m,duration,loop);fields.set(key,f);}return f;}
export const filterId=(m:Modifier)=>m.filter??`${m.id}-flow`;
export function frameState(project:Project,time:number,options:FrameOptions={}){
 const t=Math.max(0,Math.min(project.duration,time));const poses=structuredClone(project.poses),attrs:Record<string,Record<string,string>>={};const bones=structuredClone(project.bones),meshes=structuredClone(project.meshes);
 const groups=new Map<string,Track[]>();for(const track of project.tracks){if(track.property==='param')continue;const key=track.target+'\u0000'+track.property,g=groups.get(key)??[];g.push(track);groups.set(key,g);}
 for(const tracks of groups.values()){const {target,property}=tracks[0];
  if(poseProps.includes(property)){poses[target]??=defaultPose();const pose=poses[target] as unknown as Record<string,number>;pose[property]=Number(mixTracks(project,tracks,t,pose[property]));}
  else if(property.startsWith('bone')){const b=bones.find(b=>b.id===target);if(b){const k={boneRotation:'rotation',boneX:'x',boneY:'y'}[property as 'boneRotation'|'boneX'|'boneY'] as 'rotation';b[k]=Number(mixTracks(project,tracks,t,b[k]));}}
  else if(property.startsWith('mesh')){const [id,index]=target.split('::'),m=meshes.find(m=>m.target===id);const c=m?.controls[Number(index)];if(c){const k=property==='meshX'?'x':'y';c[k]=Number(mixTracks(project,tracks,t,c[k]));}}
  else{attrs[target]??={};attrs[target][property]=String(mixTracks(project,tracks,t,undefined));}
 }
 const params=frameParams(project,t,options.params);
 const rig=evaluateRig(project.expression,params,project.preservation??'balanced');
 for(const [id,a]of Object.entries(rig.attrs))Object.assign(attrs[id]??={},a);
 for(const [id,p]of Object.entries(rig.poses)){poses[id]??=defaultPose();Object.assign(poses[id],p);}
 if(options.secondary!==false)for(const s of project.secondary??[]){
  let offset:number;if(s.kind==='look-at')offset=Math.max(-s.limit,Math.min(s.limit,s.gain*s.limit*(params[s.driver]??0)));
  else{const prop=s.driverProperty??s.property,tracks=project.tracks.filter(tr=>tr.target===s.driver&&tr.property===prop);const rest=(project.poses[s.driver] as unknown as Record<string,number>|undefined)?.[prop]??(prop.startsWith('scale')?1:0);
   const driver=(time:number)=>tracks.length?Number(mixTracks(project,tracks,time,rest)):rest;offset=secondaryAt(simulateSecondary(s,driver,project.duration,project.loop),project.duration,t);}
  poses[s.target]??=defaultPose();(poses[s.target] as unknown as Record<string,number>)[s.property]+=offset;
 }
 if(options.modifiers!==false)for(const m of project.modifiers??[]){if(!m.enabled)continue;const live={...m,params:{...m.params}};for(const k of Object.keys(m.params))if(`${m.id}.${k}` in params)live.params[k]=params[`${m.id}.${k}`];
  if(m.technique==='filter'&&m.kind==='flow'){const f=flowFilter(live,filterId(m),project.duration).at(t);attrs[`${filterId(m)}-scroll`]={dx:String(f.dx),dy:String(f.dy)};continue;}
  const F=m.kind==='flow'?field(live,project.duration,project.loop):undefined;for(const id of m.targets){const d=attrs[id]?.d??m.rest[id];if(!d)continue;(attrs[id]??={}).d=applyModifier(live,d,t,project.duration,F);}
 }
 const matrices=boneMatrices(bones);
 for(const skin of project.skins){const data=attrs[skin.target]?.d?segments(attrs[skin.target].d):structuredClone(skin.rest);let i=0;
  for(const s of data)for(let j=0;j<s.points.length;j++){const restPoint=s.points[j],mesh=meshes.find(m=>m.target===skin.target),p=mesh?deformMesh(mesh,restPoint):restPoint,weights=skin.weights[i++]??{};let x=0,y=0,total=0;for(const [id,w]of Object.entries(weights)){const m=matrices.get(id);if(!m)continue;const q=applyMatrix(m.delta,p);x+=q.x*w;y+=q.y*w;total+=w;}s.points[j]=total?{x:x/total,y:y/total}:p;}
  attrs[skin.target]??={};attrs[skin.target].d=pathData(data);
 }
 return {poses,attrs,bones,meshes,matrices,params};
}
export function poseTransform(p:Pose){return `translate(${p.x} ${p.y}) translate(${p.pivotX} ${p.pivotY}) rotate(${p.rotation}) scale(${p.scaleX} ${p.scaleY}) translate(${-p.pivotX} ${-p.pivotY})`;}
export function boneMatrices(bones:Bone[]){const map=new Map<string,{rest:Matrix;world:Matrix;delta:Matrix}>(),visiting=new Set<string>();
 const visit=(b:Bone):void=>{if(map.has(b.id))return;if(visiting.has(b.id))throw Error('Bone hierarchy cycle');visiting.add(b.id);const rest=transform(b.rest.x,b.rest.y,b.rest.angle);let world=rest;
  if(b.parentId){const p=bones.find(p=>p.id===b.parentId);if(!p)throw Error('Missing parent bone');visit(p);world=multiply(map.get(p.id)!.delta,rest);}
  const rotation=Math.min(b.maxRotation,Math.max(b.minRotation,b.rotation));world=multiply(world,transform(b.x,b.y,rotation));map.set(b.id,{rest,world,delta:multiply(world,invert(rest))});visiting.delete(b.id);};
 for(const b of bones)visit(b);return map;
}
export function solveIK(bones:Bone[],tip:string,target:Point,flip=false){const child=bones.find(b=>b.id===tip),root=bones.find(b=>b.id===child?.parentId);if(!child||!root)throw Error('IK requires a child and parent bone');const matrices=boneMatrices(bones),origin=applyMatrix(matrices.get(root.id)!.world,{x:0,y:0});const endpoint=applyMatrix(matrices.get(root.id)!.rest,{x:root.rest.length,y:0});if(Math.hypot(endpoint.x-child.rest.x,endpoint.y-child.rest.y)>1)throw Error('IK bones must connect end-to-start in the rest pose');
 const dx=target.x-origin.x,dy=target.y-origin.y,l1=root.rest.length,l2=child.rest.length,d=Math.max(1e-5,Math.min(l1+l2-1e-5,Math.max(Math.abs(l1-l2)+1e-5,Math.hypot(dx,dy))));
 const angle=Math.atan2(dy,dx),a=Math.acos(Math.max(-1,Math.min(1,(l1*l1+d*d-l2*l2)/(2*l1*d)))),theta1=angle+(flip?a:-a),elbow={x:origin.x+l1*Math.cos(theta1),y:origin.y+l1*Math.sin(theta1)},theta2=Math.atan2(target.y-elbow.y,target.x-elbow.x);
 const world=matrices.get(root.id)!.world,ancestor=Math.atan2(world[1],world[0])*180/Math.PI-root.rest.angle-root.rotation;
 root.rotation=normalize(theta1*180/Math.PI-root.rest.angle-ancestor);root.rotation=Math.max(root.minRotation,Math.min(root.maxRotation,root.rotation));child.rotation=normalize(theta2*180/Math.PI-child.rest.angle-ancestor-root.rotation);child.rotation=Math.max(child.minRotation,Math.min(child.maxRotation,child.rotation));
 return {reachable:Math.hypot(dx,dy)<=l1+l2,clamped:Math.abs(root.rotation-normalize(theta1*180/Math.PI-root.rest.angle-ancestor))>.01};
}
const normalize=(n:number)=>((n+180)%360+360)%360-180;
export function deformMesh(m:Mesh,p:Point):Point{const u=Math.max(0,Math.min(m.cols-1,(p.x-m.bounds.x)/Math.max(1,m.bounds.width)*(m.cols-1))),v=Math.max(0,Math.min(m.rows-1,(p.y-m.bounds.y)/Math.max(1,m.bounds.height)*(m.rows-1))),x=Math.min(m.cols-2,Math.floor(u)),y=Math.min(m.rows-2,Math.floor(v)),a=u-x,b=v-y;let dx=0,dy=0;
 for(const [ox,oy,w]of [[0,0,(1-a)*(1-b)],[1,0,a*(1-b)],[0,1,(1-a)*b],[1,1,a*b]]){const i=(y+oy)*m.cols+x+ox;dx+=(m.controls[i].x-m.rest[i].x)*w;dy+=(m.controls[i].y-m.rest[i].y)*w;}return {x:p.x+dx,y:p.y+dy};}
export function autoWeights(p:Point,bones:Bone[]){const weights=bones.map(b=>{const r=b.rest.angle*Math.PI/180,q={x:b.rest.x+b.rest.length*Math.cos(r),y:b.rest.y+b.rest.length*Math.sin(r)},dx=q.x-b.rest.x,dy=q.y-b.rest.y,t=Math.max(0,Math.min(1,((p.x-b.rest.x)*dx+(p.y-b.rest.y)*dy)/(dx*dx+dy*dy))),distance=Math.hypot(p.x-b.rest.x-t*dx,p.y-b.rest.y-t*dy);return {id:b.id,weight:1/(distance*distance+1)};}).sort((a,b)=>b.weight-a.weight).slice(0,2);const total=weights.reduce((s,w)=>s+w.weight,0);return Object.fromEntries(weights.map(w=>[w.id,w.weight/total]));}
export {mix};
