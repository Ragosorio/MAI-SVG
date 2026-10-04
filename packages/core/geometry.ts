import svgpath from 'svgpath';
export type Point={x:number;y:number};
export type Segment={kind:'M'|'L'|'C'|'Z';points:Point[]};
const finite=(n:number)=>{if(!Number.isFinite(n)||Math.abs(n)>1e7)throw Error('Invalid coordinate');return n;};
export function segments(d:string):Segment[]{
 let current:Point={x:0,y:0},start=current;
 const path=svgpath(d).abs().unshort().unarc() as ReturnType<typeof svgpath> & {err?:string;segments:(string|number)[][]};if(path.err)throw Error(path.err);
 const result:Segment[]=[];
 for(const raw of path.segments){const a=raw as (string|number)[];const k=String(a[0]).toUpperCase(),n=a.slice(1).map(v=>finite(Number(v)));let segment:Segment;
  if(k==='M'||k==='L'){segment={kind:k,points:[{x:n[0],y:n[1]}]};if(k==='M')start=segment.points[0];}
  else if(k==='H')segment={kind:'L',points:[{x:n[0],y:current.y}]};
  else if(k==='V')segment={kind:'L',points:[{x:current.x,y:n[0]}]};
  else if(k==='C')segment={kind:'C',points:[{x:n[0],y:n[1]},{x:n[2],y:n[3]},{x:n[4],y:n[5]}]};
  else if(k==='Q'){const q={x:n[0],y:n[1]},end={x:n[2],y:n[3]};segment={kind:'C',points:[{x:current.x+(q.x-current.x)*2/3,y:current.y+(q.y-current.y)*2/3},{x:end.x+(q.x-end.x)*2/3,y:end.y+(q.y-end.y)*2/3},end]};}
  else if(k==='Z'){segment={kind:'Z',points:[]};current=start;result.push(segment);continue;}else throw Error(`Unsupported path command ${k}`);
  current=segment.points.at(-1)!;result.push(segment);
 }
 return result;
}
export const pathData=(data:Segment[])=>data.map(s=>s.kind+s.points.flatMap(p=>[number(p.x),number(p.y)]).join(' ')).join(' ');
const number=(n:number)=>String(Number(finite(n).toFixed(4)));
export const topology=(d:string)=>segments(d).map(s=>`${s.kind}:${s.points.length}`).join('|');
export function mixPaths(a:string,b:string,t:number){const x=segments(a),y=segments(b);if(topology(a)!==topology(b))throw Error('Path keyframes have incompatible topology');return pathData(x.map((s,i)=>({...s,points:s.points.map((p,j)=>mix(p,y[i].points[j],t))})));}
export const mix=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function movePoint(d:string,segment:number,point:number,x:number,y:number){const data=segments(d),s=data[segment];if(!s?.points[point])throw Error('Point does not exist');const old=s.points[point],dx=x-old.x,dy=y-old.y;s.points[point]={x:finite(x),y:finite(y)};
 if(point===s.points.length-1){if(s.kind==='C'){s.points[1].x+=dx;s.points[1].y+=dy;}const next=data[segment+1];if(next?.kind==='C'){next.points[0].x+=dx;next.points[0].y+=dy;}}
 return pathData(data);
}
export function addPoint(d:string,index:number){const data=segments(d),s=data[index];if(!s||index===0||s.kind==='M'||s.kind==='Z')throw Error('Select a line or curve segment');const a=data[index-1].points.at(-1);if(!a)throw Error('Cannot split this segment');
 if(s.kind==='L'){const mid=mix(a,s.points[0],.5);data.splice(index,1,{kind:'L',points:[mid]},s);}
 else {const [b,c,end]=s.points,ab=mix(a,b,.5),bc=mix(b,c,.5),ce=mix(c,end,.5),abc=mix(ab,bc,.5),bce=mix(bc,ce,.5),mid=mix(abc,bce,.5);data.splice(index,1,{kind:'C',points:[ab,abc,mid]},{kind:'C',points:[bce,ce,end]});}
 return pathData(data);
}
export function removePoint(d:string,index:number){const data=segments(d);if(index===0||!data[index]?.points.length||data.length<3)throw Error('Cannot remove this anchor');data.splice(index,1);return pathData(data);}
export function splitPath(d:string,index:number){const data=segments(d);if(index<1||index>=data.length-1||!data[index].points.length)throw Error('Choose an interior anchor');const end=data[index].points.at(-1)!;return [pathData(data.slice(0,index+1).filter(s=>s.kind!=='Z')),pathData([{kind:'M',points:[end]},...data.slice(index+1).filter(s=>s.kind!=='Z')])];}
export function joinPaths(a:string,b:string){const x=segments(a),y=segments(b);if(x.some(s=>s.kind==='Z')||y.some(s=>s.kind==='Z'))throw Error('Join requires two open paths');return pathData([...x,{kind:'L',points:y[0].points},...y.slice(1)]);}
export function transformPath(d:string,transform:string){const p=svgpath(d).transform(transform) as ReturnType<typeof svgpath> & {err?:string};if(p.err)throw Error(p.err);return pathData(segments(p.toString()));}
