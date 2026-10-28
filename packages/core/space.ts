// Geometry in root SVG user space, evaluated by the same frameState as the editor.
// Bounds describe geometry, not painted pixels: strokes, filters and clipping are excluded.
import svgpath from 'svgpath';
import type {VectorDocument} from './document.js';
import {frameState,poseTransform,invert} from './animation.js';
import {segments,type Point} from './geometry.js';
import {elements} from '../converter/svg.js';

export type Mat=[number,number,number,number,number,number];
export type Box={x0:number;y0:number;x1:number;y1:number};
export type Frame=ReturnType<typeof frameState>;
export const IDENTITY:Mat=[1,0,0,1,0,0];
export const mul=(m:Mat,n:Mat):Mat=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
export const applyMat=(m:Mat,p:Point):Point=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const parsed=new Map<string,Mat>();
export function transformMatrix(t:string):Mat{
 const k=t.trim();if(!k)return [...IDENTITY];const hit=parsed.get(k);if(hit)return [...hit];
 const pts=segments(svgpath('M0 0 L1 0 L0 1').transform(k).toString()).flatMap(s=>s.points);
 if(pts.length!==3)throw Error(`Invalid transform ${k}`);
 const m:Mat=[pts[1].x-pts[0].x,pts[1].y-pts[0].y,pts[2].x-pts[0].x,pts[2].y-pts[0].y,pts[0].x,pts[0].y];
 if(parsed.size>=5000)parsed.clear();parsed.set(k,m);return [...m];
}
export function worldMatrix(m:VectorDocument,el:Element,frame:Frame,memo=new Map<Element,Mat>()):Mat{
 const hit=memo.get(el);if(hit)return hit;
 // Nested SVG establishes another viewport, not just a transform. Never silently mismeasure it.
 if(el!==m.doc.documentElement&&el.localName==='svg')throw Error('Nested SVG viewport measurement is not supported');
 const id=el.getAttribute('id')??'',pose=frame.poses[id];
 const own=transformMatrix(frame.attrs[id]?.transform??(pose?`${poseTransform(pose)} ${m.project.baseTransforms[id]??''}`:el.getAttribute('transform')??''));
 const parent=el.parentNode as Element|null;
 const out=parent?.nodeType===1?mul(worldMatrix(m,parent,frame,memo),own):own;memo.set(el,out);return out;
}
const bounds=(ps:Point[]):Box|undefined=>{
 if(!ps.length)return undefined;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of ps){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
 return {x0,y0,x1,y1};
};
const corners=(b:Box):Point[]=>[{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x0,y:b.y1},{x:b.x1,y:b.y1}];
// Evaluate cubic extrema, rather than using control points as if the curve passed through them.
function curvePoints(a:Point,b:Point,c:Point,d:Point):Point[]{
 const ts=new Set([0,1]);
 for(const k of ['x','y'] as const){const A=-a[k]+3*b[k]-3*c[k]+d[k],B=2*(a[k]-2*b[k]+c[k]),C=b[k]-a[k];
  if(Math.abs(A)<1e-12){if(Math.abs(B)>1e-12)ts.add(-C/B);}else{const disc=B*B-4*A*C;if(disc>=0){ts.add((-B+Math.sqrt(disc))/(2*A));ts.add((-B-Math.sqrt(disc))/(2*A));}}}
 return [...ts].filter(t=>t>=0&&t<=1).map(t=>{const u=1-t;return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};});
}
function shapeBox(e:Element,frame:Frame,w:Mat):Box|undefined{
 const id=e.getAttribute('id')??'',attrs=frame.attrs[id]??{};
 const attr=(a:string)=>attrs[a]??e.getAttribute(a)??'';
 const num=(a:string)=>{const raw=attr(a);if(raw&&!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()))throw Error(`Non-numeric geometry attribute ${a}`);return Number(raw||0);};
 switch(e.localName){
  case 'path':{let current:Point={x:0,y:0},start=current;const ps:Point[]=[];
   for(const s of segments(attr('d'))){const pts=s.points.map(p=>applyMat(w,p));
    if(s.kind==='C')ps.push(...curvePoints(current,pts[0],pts[1],pts[2]));else ps.push(...pts);
    if(s.kind==='Z')current=start;else current=pts.at(-1)!;if(s.kind==='M')start=current;}
   return bounds(ps);}
  case 'rect':{const x=num('x'),y=num('y');return bounds(corners({x0:x,y0:y,x1:x+num('width'),y1:y+num('height')}).map(p=>applyMat(w,p)));}
  case 'circle':case 'ellipse':{const c=applyMat(w,{x:num('cx'),y:num('cy')}),rx=num(e.localName==='circle'?'r':'rx'),ry=num(e.localName==='circle'?'r':'ry');
   const dx=Math.hypot(w[0]*rx,w[2]*ry),dy=Math.hypot(w[1]*rx,w[3]*ry);return {x0:c.x-dx,y0:c.y-dy,x1:c.x+dx,y1:c.y+dy};}
  case 'line':return bounds([{x:num('x1'),y:num('y1')},{x:num('x2'),y:num('y2')}].map(p=>applyMat(w,p)));
  case 'polygon':case 'polyline':{const raw=attr('points').trim();if(!raw)return undefined;const v=raw.split(/[\s,]+/).map(Number);
   if(v.length%2||v.some(n=>!Number.isFinite(n)))throw Error('Invalid polygon points');
   return bounds(v.filter((_,i)=>i%2===0).map((x,i)=>applyMat(w,{x,y:v[i*2+1]})));}
  case 'use':case 'text':case 'image':case 'foreignObject':throw Error(`Geometry measurement does not support ${e.localName}`);
 }
 return undefined;
}
/** Union of geometric bounds, including hidden geometry, excluding definition subtrees. */
/** `pre` re-expresses world geometry in another frame (e.g. relative to a parent part held at rest). */
export function worldBox(m:VectorDocument,ids:string[],frame:Frame,memo=new Map<Element,Mat>(),pre?:Mat):Box|undefined{
 const ps:Point[]=[],seen=new Set<Element>();
 for(const id of ids){const root=m.index.get(id);if(!root)throw Error(`Unknown geometry target ${id}`);
  for(const e of [root,...elements(root)]){if(seen.has(e)||m.inDefs(e))continue;seen.add(e);const w=worldMatrix(m,e,frame,memo),b=shapeBox(e,frame,pre?mul(pre,w):w);if(b)ps.push(...corners(b));}}
 return bounds(ps);
}
export type Sample={time:number;box:Box;center:Point;rotation:number;scale:number};
export type Target={ids:string[];region?:Box;relativeTo?:string};
export class SpatialSession{
 private frames=new Map<number,{frame:Frame;matrices:Map<Element,Mat>}>();
 constructor(readonly model:VectorDocument){}
 sample(target:Target,time:number):Sample{
  if(!Number.isFinite(time)||time<0||time>this.model.project.duration)throw Error('Sample time outside timeline');
  let f=this.frames.get(time);if(!f){f={frame:frameState(this.model.project,time),matrices:new Map()};if(this.frames.size>=8)this.frames.delete(this.frames.keys().next().value!);this.frames.set(time,f);}
  const first=this.model.index.get(target.ids[0]);if(!first)throw Error('Target has no measurable geometry');let w=worldMatrix(this.model,first,f.frame,f.matrices);
  // relativeTo: measure as if that part (usually an ancestor) stayed at rest, i.e. the target's own motion within it.
  let pre:Mat|undefined;if(target.relativeTo){const ref=this.model.index.get(target.relativeTo);if(!ref)throw Error(`Unknown relativeTo part ${target.relativeTo}`);const rest={...f.frame,poses:this.model.project.poses,attrs:{}};pre=mul(worldMatrix(this.model,ref,rest),invert(worldMatrix(this.model,ref,f.frame,f.matrices)));w=mul(pre,w);}
  let box:Box|undefined;if(target.region){if(target.ids.length!==1)throw Error('A moving region needs one explicit owner');const rest={...f.frame,poses:this.model.project.poses,attrs:{}};const delta=mul(w,invert(worldMatrix(this.model,first,rest)));box=bounds(corners(target.region).map(p=>applyMat(delta,p)));}else box=worldBox(this.model,target.ids,f.frame,f.matrices,pre);if(!box)throw Error('Target has no measurable geometry');
  return {time,box,center:{x:(box.x0+box.x1)/2,y:(box.y0+box.y1)/2},rotation:Math.atan2(w[1],w[0])*180/Math.PI,scale:Math.sqrt(Math.abs(w[0]*w[3]-w[1]*w[2]))};
 }
}
export function partSeries(m:VectorDocument,target:Target,times:number[]):Sample[]{const session=new SpatialSession(m);return times.map(t=>session.sample(target,t));}
