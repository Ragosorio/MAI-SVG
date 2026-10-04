import {mixPaths,pathData,segments,mix,type Point} from './geometry.js';
import {defaultPose,type Project,type Track,type Bone,type Mesh,type Pose} from './model.js';
export type Matrix=[number,number,number,number,number,number];
export const identity=():Matrix=>[1,0,0,1,0,0];
export function multiply(a:Matrix,b:Matrix):Matrix{return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function invert(m:Matrix):Matrix{const d=m[0]*m[3]-m[1]*m[2];if(Math.abs(d)<1e-10)throw Error('Singular transform');return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
export const applyMatrix=(m:Matrix,p:Point):Point=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const transform=(x:number,y:number,angle:number):Matrix=>{const r=angle*Math.PI/180;return [Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),x,y];};
export function valueAt(track:Track,time:number):number|string {
 const keys=track.keys;if(!keys.length)throw Error('Empty track');if(time<=keys[0].time)return keys[0].value;if(time>=keys.at(-1)!.time)return keys.at(-1)!.value;
 const j=keys.findIndex(k=>k.time>time),a=keys[j-1],b=keys[j];let t=(time-a.time)/(b.time-a.time);if(a.easing==='step')return a.value;if(a.easing==='ease-in-out')t=t*t*(3-2*t);
 if(typeof a.value==='number'&&typeof b.value==='number')return a.value+(b.value-a.value)*t;
 if(track.property==='d')return mixPaths(String(a.value),String(b.value),t);
 const hex=(v:string)=>/^#[0-9a-f]{6}$/i.test(v)?[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)):null;
 const x=hex(String(a.value)),y=hex(String(b.value));if(x&&y)return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');
 return a.value;
}
export function frameState(project:Project,time:number){
 const t=Math.max(0,Math.min(project.duration,time));const poses=structuredClone(project.poses),attrs:Record<string,Record<string,string>>={};const bones=structuredClone(project.bones),meshes=structuredClone(project.meshes);
 for(const track of project.tracks){const v=valueAt(track,t);
  if(['x','y','rotation','scaleX','scaleY'].includes(track.property)){poses[track.target]??=defaultPose();(poses[track.target] as unknown as Record<string,number>)[track.property]=Number(v);}
  else if(track.property.startsWith('bone')){const b=bones.find(b=>b.id===track.target);if(b)(b as unknown as Record<string,number>)[{boneRotation:'rotation',boneX:'x',boneY:'y'}[track.property as 'boneRotation'|'boneX'|'boneY']]=Number(v);}
  else if(track.property.startsWith('mesh')){const [id,index]=track.target.split('::'),m=meshes.find(m=>m.target===id);if(m?.controls[Number(index)])m.controls[Number(index)][track.property==='meshX'?'x':'y']=Number(v);}
  else{attrs[track.target]??={};attrs[track.target][track.property]=String(v);}
 }
 const matrices=boneMatrices(bones);
 for(const skin of project.skins){const data=attrs[skin.target]?.d?segments(attrs[skin.target].d):structuredClone(skin.rest);let i=0;
  for(const s of data)for(let j=0;j<s.points.length;j++){const restPoint=s.points[j],mesh=meshes.find(m=>m.target===skin.target),p=mesh?deformMesh(mesh,restPoint):restPoint,weights=skin.weights[i++]??{};let x=0,y=0,total=0;for(const [id,w]of Object.entries(weights)){const m=matrices.get(id);if(!m)continue;const q=applyMatrix(m.delta,p);x+=q.x*w;y+=q.y*w;total+=w;}s.points[j]=total?{x:x/total,y:y/total}:p;}
  attrs[skin.target]??={};attrs[skin.target].d=pathData(data);
 }
 return {poses,attrs,bones,meshes,matrices};
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
