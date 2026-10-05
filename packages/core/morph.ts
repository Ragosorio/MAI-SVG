import {segments,pathData,mix,type Point,type Segment} from './geometry.js';
// Morph between arbitrary paths (concept inspired by GSAP MorphSVG: cubic conversion, subdivision, start-point
// search, subpath matching). Original anchors are kept, so corners survive; only extra anchors are inserted.
type Cubic=[Point,Point,Point,Point];type Sub={closed:boolean;curves:Cubic[]};
export function toSubpaths(d:string):Sub[]{const subs:Sub[]=[];let cur:Sub|undefined,last:Point={x:0,y:0},start:Point={x:0,y:0};
 for(const s of segments(d)){if(s.kind==='M'){cur={closed:false,curves:[]};subs.push(cur);last=start=s.points[0];continue;}if(!cur){cur={closed:false,curves:[]};subs.push(cur);}
  if(s.kind==='L'){const e=s.points[0];cur.curves.push([last,mix(last,e,1/3),mix(last,e,2/3),e]);last=e;}else if(s.kind==='C'){cur.curves.push([last,s.points[0],s.points[1],s.points[2]]);last=s.points[2];}
  else if(s.kind==='Z'){if(Math.hypot(last.x-start.x,last.y-start.y)>1e-6)cur.curves.push([last,mix(last,start,1/3),mix(last,start,2/3),start]);cur.closed=true;last=start;}}
 return subs.filter(s=>s.curves.length);}
const len=(c:Cubic)=>Math.hypot(c[1].x-c[0].x,c[1].y-c[0].y)+Math.hypot(c[2].x-c[1].x,c[2].y-c[1].y)+Math.hypot(c[3].x-c[2].x,c[3].y-c[2].y);
function split(c:Cubic,t=.5):[Cubic,Cubic]{const [a,b,cc,d]=c,ab=mix(a,b,t),bc=mix(b,cc,t),cd=mix(cc,d,t),abc=mix(ab,bc,t),bcd=mix(bc,cd,t),m=mix(abc,bcd,t);return [[a,ab,abc,m],[m,bcd,cd,d]];}
function subdivideTo(curves:Cubic[],n:number){const out=[...curves];while(out.length<n){let i=0,best=-1;for(let k=0;k<out.length;k++){const l=len(out[k]);if(l>best){best=l;i=k;}}out.splice(i,1,...split(out[i]));}return out;}
const area=(s:Sub)=>{let a=0;for(const c of s.curves)a+=c[0].x*c[3].y-c[3].x*c[0].y;return a/2;};
const centroid=(s:Sub)=>{const pts=s.curves.map(c=>c[0]);return {x:pts.reduce((a,p)=>a+p.x,0)/pts.length,y:pts.reduce((a,p)=>a+p.y,0)/pts.length};};
const reverse=(curves:Cubic[]):Cubic[]=>curves.slice().reverse().map(c=>[c[3],c[2],c[1],c[0]]);
const rotate=(curves:Cubic[],k:number)=>[...curves.slice(k),...curves.slice(0,k)];
const cost=(a:Cubic[],b:Cubic[])=>a.reduce((s,c,i)=>s+(c[0].x-b[i][0].x)**2+(c[0].y-b[i][0].y)**2,0);
function align(a:Sub,b:Sub){const n=Math.max(a.curves.length,b.curves.length);let A=subdivideTo(a.curves,n),B=subdivideTo(b.curves,n);let shapeIndex=0,reversed=false;
 if(a.closed&&b.closed){let best=Infinity;for(const rev of [false,true]){const cand=rev?reverse(B):B;for(let k=0;k<n;k++){const c=cost(A,rotate(cand,k));if(c<best){best=c;shapeIndex=k;reversed=rev;}}}B=rotate(reversed?reverse(B):B,shapeIndex);}
 return {A,B,shapeIndex,reversed,closed:a.closed||b.closed};}
const degenerate=(at:Point,n:number,closed:boolean):Sub=>({closed,curves:Array.from({length:n},()=>[at,at,at,at] as Cubic)});
function emit(subs:{curves:Cubic[];closed:boolean}[]){const data:Segment[]=[];for(const s of subs){data.push({kind:'M',points:[s.curves[0][0]]});for(const c of s.curves)data.push({kind:'C',points:[c[1],c[2],c[3]]});if(s.closed)data.push({kind:'Z',points:[]});}return pathData(data);}
export function normalizePair(from:string,to:string,map:'size'|'position'='size'){
 let a=toSubpaths(from),b=toSubpaths(to);if(!a.length||!b.length)throw Error('Morph needs non-empty paths');if(a.length>64||b.length>64)throw Error('Morph supports up to 64 subpaths');
 const key=(s:Sub)=>map==='size'?-Math.abs(area(s)):centroid(s).x+centroid(s).y*1e-3;a=[...a].sort((x,y)=>key(x)-key(y));b=[...b].sort((x,y)=>key(x)-key(y));
 // Missing subpaths grow from (or collapse into) the centroid of their counterpart.
 while(a.length<b.length){const t=b[a.length];a.push(degenerate(centroid(t),t.curves.length,t.closed));}while(b.length<a.length){const s=a[b.length];b.push(degenerate(centroid(s),s.curves.length,s.closed));}
 const pairs=a.map((s,i)=>align(s,b[i]));
 return {from:emit(pairs.map(p=>({curves:p.A,closed:p.closed}))),to:emit(pairs.map(p=>({curves:p.B,closed:p.closed}))),subpaths:pairs.length,segments:pairs.reduce((n,p)=>n+p.A.length,0),shapeIndex:pairs.map(p=>p.shapeIndex),reversed:pairs.map(p=>p.reversed)};
}
function flatten(d:string,per=6){const polys:Point[][]=[];for(const s of toSubpaths(d)){const pts:Point[]=[s.curves[0][0]];for(const c of s.curves)for(let i=1;i<=per;i++){const t=i/per,u=1-t;pts.push({x:u*u*u*c[0].x+3*u*u*t*c[1].x+3*u*t*t*c[2].x+t*t*t*c[3].x,y:u*u*u*c[0].y+3*u*u*t*c[1].y+3*u*t*t*c[2].y+t*t*t*c[3].y});}polys.push(pts);}return polys;}
export function selfIntersections(d:string,limit=600){let count=0;for(const poly of flatten(d)){const n=Math.min(poly.length-1,limit);for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;const a=poly[i],b=poly[i+1],c=poly[j],e=poly[j+1];const d1=(e.x-c.x)*(a.y-c.y)-(e.y-c.y)*(a.x-c.x),d2=(e.x-c.x)*(b.y-c.y)-(e.y-c.y)*(b.x-c.x),d3=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),d4=(b.x-a.x)*(e.y-a.y)-(b.y-a.y)*(e.x-a.x);if(d1*d2<0&&d3*d4<0)count++;}}return count;}
export function morphAt(norm:{from:string;to:string},t:number){const a=segments(norm.from),b=segments(norm.to);return pathData(a.map((s,i)=>({...s,points:s.points.map((p,j)=>mix(p,b[i].points[j],t))})));}
// Analysis flags visually destructive morphs before they reach the timeline.
export function analyzeMorph(from:string,to:string,map:'size'|'position'='size'){const n=normalizePair(from,to,map),mids=[.25,.5,.75].map(t=>({t,intersections:selfIntersections(morphAt(n,t))}));const ends=selfIntersections(n.from)+selfIntersections(n.to);
 const sa=toSubpaths(from).reduce((s,x)=>s+Math.abs(area(x)),0),sb=toSubpaths(to).reduce((s,x)=>s+Math.abs(area(x)),0);const introduced=Math.max(...mids.map(m=>m.intersections))-ends;
 return {subpaths:n.subpaths,segments:n.segments,shapeIndex:n.shapeIndex,reversed:n.reversed,areaRatio:Number((sb/Math.max(1e-9,sa)).toFixed(3)),selfIntersections:{endpoints:ends,midpoints:mids},destructive:introduced>0,advice:introduced>0?'El morph cruza la forma sobre sí misma a mitad de camino: prueba map position, otra forma destino con orientación similar o un keyframe intermedio.':'Sin intersecciones nuevas en 25/50/75%.'};}
