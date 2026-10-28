// Motion paths (plan lane A, ADR-003 §A.5): a part travels along an SVG path (or through points with a smooth
// centripetal Catmull-Rom curve) by arc length, optionally oriented to the tangent. Progress is an ordinary keyed
// curve (any easing / tangents), contributed as x/y/rotation on a layer — so it exports like any motion.
import type {MotionPath,Project,Pose} from './model.js';
import {DEFAULT_LAYERS,defaultPose} from './model.js';
import {segments,pathData} from './geometry.js';
import {valueAt} from './animation.js';
type Pt={x:number;y:number};

/** Centripetal Catmull-Rom through points as cubic beziers (no cusps or self-intersections between points). */
export function catmullRomPath(points:Pt[],closed=false){if(points.length<2)throw Error('A motion path needs at least 2 points');
 const P=closed?[points.at(-1)!,...points,points[0],points[1]]:[points[0],...points,points.at(-1)!];const out=[{kind:'M' as const,points:[points[0]]}] as ReturnType<typeof segments>;
 const n=closed?points.length:points.length-1;for(let i=1;i<=n;i++){const p0=P[i-1],p1=P[i],p2=P[i+1],p3=P[i+2];const d=(a:Pt,b:Pt)=>Math.pow(Math.hypot(b.x-a.x,b.y-a.y)||1e-6,.5);
  const t0=0,t1=t0+d(p0,p1),t2=t1+d(p1,p2),t3=t2+d(p2,p3);const tangent=(a:Pt,b:Pt,c:Pt,ta:number,tb:number,tc:number)=>({x:(b.x-a.x)/(tb-ta)-(c.x-a.x)/(tc-ta)+(c.x-b.x)/(tc-tb),y:(b.y-a.y)/(tb-ta)-(c.y-a.y)/(tc-ta)+(c.y-b.y)/(tc-tb)});
  const m1=tangent(p0,p1,p2,t0,t1,t2),m2=tangent(p1,p2,p3,t1,t2,t3),k=(t2-t1)/3;out.push({kind:'C',points:[{x:p1.x+m1.x*k,y:p1.y+m1.y*k},{x:p2.x-m2.x*k,y:p2.y-m2.y*k},{x:p2.x,y:p2.y}]});}
 if(closed)out.push({kind:'Z',points:[]});return pathData(out);}

type Table={len:number[];pts:Pt[];ang:number[];total:number;closed:boolean};
const tables=new Map<string,Table>();
/** Flattened arc-length table with unwrapped tangent angles (cached by d). */
export function pathTable(d:string):Table{const hit=tables.get(d);if(hit)return hit;const pts:Pt[]=[];let start:Pt|undefined,cur:Pt|undefined,closed=false;
 for(const s of segments(d)){if(s.kind==='M'){cur=s.points[0];start=cur;pts.push(cur);}else if(s.kind==='L'){cur=s.points[0];pts.push(cur);}
  else if(s.kind==='C'&&cur){const [a,b,c]=s.points,p0=cur;const n=Math.max(8,Math.min(64,Math.ceil((Math.hypot(a.x-p0.x,a.y-p0.y)+Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(c.x-b.x,c.y-b.y))/4)));
   for(let i=1;i<=n;i++){const t=i/n,u=1-t;pts.push({x:u*u*u*p0.x+3*u*u*t*a.x+3*u*t*t*b.x+t*t*t*c.x,y:u*u*u*p0.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*c.y});}cur=c;}
  else if(s.kind==='Z'&&start){pts.push(start);closed=true;}}
 if(pts.length<2)throw Error('Motion path has no length');const len=[0],ang:number[]=[];let prev:number|undefined;
 for(let i=1;i<pts.length;i++){len.push(len[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));let a=Math.atan2(pts[i].y-pts[i-1].y,pts[i].x-pts[i-1].x)*180/Math.PI;if(prev!==undefined){while(a-prev>180)a-=360;while(a-prev<-180)a+=360;}ang.push(a);prev=a;}
 ang.push(ang.at(-1)!);const t={len,pts,ang,total:len.at(-1)!,closed};if(!(t.total>0))throw Error('Motion path has no length');if(tables.size>256)tables.clear();tables.set(d,t);return t;}

/** Point and tangent angle at progress s (0..1; closed paths wrap, open paths clamp; laps add 360° per lap). */
export function pathAt(t:Table,s:number){let laps=0;let u=s;if(t.closed){laps=Math.floor(u);u=u-laps;}else u=Math.max(0,Math.min(1,u));const target=u*t.total;
 let lo=0,hi=t.len.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(t.len[mid]<target)lo=mid;else hi=mid;}const span=t.len[hi]-t.len[lo]||1,f=(target-t.len[lo])/span;
 const turn=t.closed?Math.round((t.ang.at(-1)!-t.ang[0])/360)*360:0;
 return {x:t.pts[lo].x+(t.pts[hi].x-t.pts[lo].x)*f,y:t.pts[lo].y+(t.pts[hi].y-t.pts[lo].y)*f,angle:t.ang[lo]+(t.ang[Math.min(hi,t.ang.length-1)]-t.ang[lo])*f+laps*turn};}

/** Contribute every enabled motion path to the evaluated poses (layer rules like tracks). */
export function applyMotionPaths(p:Project,time:number,poses:Record<string,Pose>){const list=(p.motionPaths??[]).filter(m=>m.enabled!==false);if(!list.length)return;const layers=p.layers??DEFAULT_LAYERS,solo=layers.some(l=>l.solo);
 for(const mp of list){const l=layers.find(x=>x.id===mp.layer);if(!l||l.mute||(solo&&!l.solo))continue;const t=pathTable(mp.d),s=Number(valueAt({target:mp.id,property:'param',keys:mp.progress},time,p.loop)),pt=pathAt(t,s);
  const start=mp.mode==='relative'?pathAt(t,Number(mp.progress[0]?.value??0)):undefined;const dx=(mp.mode==='relative'?pt.x-start!.x:pt.x-mp.anchor.x)+(mp.offset?.x??0),dy=(mp.mode==='relative'?pt.y-start!.y:pt.y-mp.anchor.y)+(mp.offset?.y??0);
  const rot=mp.orient?pt.angle+mp.orient.offset-(mp.mode==='relative'?start!.angle:0):undefined;const pose=poses[mp.target]??=structuredClone(p.poses[mp.target]??defaultPose());
  if(l.blend==='additive'){pose.x+=l.weight*dx;pose.y+=l.weight*dy;if(rot!==undefined)pose.rotation+=l.weight*rot;}else{pose.x+=(dx-pose.x)*l.weight;pose.y+=(dy-pose.y)*l.weight;if(rot!==undefined)pose.rotation+=(rot-pose.rotation)*l.weight;}}}

export function validateMotionPaths(p:Project,exists:(id:string)=>boolean){const list=p.motionPaths??[];if(list.length>128)throw Error('At most 128 motion paths');const ids=new Set<string>();
 for(const mp of list){if(!/^[A-Za-z_][\w.-]{0,100}$/.test(mp.id)||ids.has(mp.id))throw Error(`Invalid or duplicate motion path id ${mp.id}`);ids.add(mp.id);if(!exists(mp.target))throw Error(`Motion path ${mp.id}: target ${mp.target} not found`);
  if(typeof mp.d!=='string'||mp.d.length>200000)throw Error(`Motion path ${mp.id}: invalid d`);pathTable(mp.d);if(!(p.layers??DEFAULT_LAYERS).some(l=>l.id===mp.layer))throw Error(`Motion path ${mp.id}: unknown layer ${mp.layer}`);
  if(!Array.isArray(mp.progress)||mp.progress.length<2||mp.progress.some(k=>typeof k.value!=='number'||k.value<-10||k.value>10||k.time<0||k.time>p.duration))throw Error(`Motion path ${mp.id}: progress needs ≥2 numeric keys within the timeline (values −10…10)`);
  for(const k of ['x','y'] as const)if(!Number.isFinite(mp.anchor?.[k]))throw Error(`Motion path ${mp.id}: invalid anchor`);
  if(p.tracks.some(t=>t.target===mp.target&&(t.property==='x'||t.property==='y')&&(t.layer??'base')===mp.layer))throw Error(`Motion path ${mp.id}: ${mp.target} already has x/y keys on layer ${mp.layer}; use another layer`);}}
