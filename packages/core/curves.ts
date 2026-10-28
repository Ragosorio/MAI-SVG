import type {Keyframe,Easing,EaseHandle} from './model.js';
import {segments,pathData} from './geometry.js';
const bezier=(a:number,b:number,c:number,d:number,t:number)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;};
const solve=(x:number,a:number,b:number,c:number,d:number)=>{let lo=0,hi=1;for(let i=0;i<40;i++){const t=(lo+hi)/2;if(bezier(a,b,c,d,t)<x)lo=t;else hi=t;}return (lo+hi)/2;};
export const LEGACY_BEZIER:Record<string,[number,number,number,number]>={linear:[1/3,1/3,2/3,2/3],'ease-in-out':[1/3,0,2/3,1],'ease-in':[1/3,0,2/3,1/3],'ease-out':[1/3,2/3,2/3,1],overshoot:[1/3,(1.70158+3)/3,2/3,1],anticipate:[1/3,0,2/3,-1.70158/3]};
export function legacyHandles(e:Easing,delta:number,duration:number):{out:EaseHandle;in:EaseHandle}{
 const raw=e.startsWith('cubic-bezier(')?e.slice(13,-1).split(',').map(Number):undefined;
 const [x1,y1,x2,y2]=raw??LEGACY_BEZIER[e]??LEGACY_BEZIER.linear;
 // A zero-width CSS tangent has no finite speed; use a tiny handle to retain the limit.
 const out=Math.max(.001,x1),input=Math.max(.001,1-x2);
 return {out:{influence:out,speed:y1*delta/(out*duration)},in:{influence:input,speed:(1-y2)*delta/(input*duration)}};
}
const customCache=new Map<string,ReturnType<typeof segments>>();
export function validateCustomCurve(path:string){
 if(path.length>10000)throw Error('Custom curve exceeds budget');const s=segments(path);if(s.length<2||s.length>128||s[0].kind!=='M'||s[0].points[0].x!==0||s[0].points[0].y!==0)throw Error('Custom curve starts at M0 0');
 let x=0;for(const seg of s.slice(1)){if(!['L','C'].includes(seg.kind))throw Error('Custom curve supports connected L/C segments');for(const p of seg.points){if(p.x<x||p.x>1||Math.abs(p.y)>100)throw Error('Custom curve x must increase within [0,1]; y must be within [-100,100]');x=p.x;}}
 const end=s.at(-1)!.points.at(-1)!;if(end.x!==1||end.y!==1)throw Error('Custom curve ends at 1 1');if(customCache.size>256)customCache.clear();customCache.set(path,s);return s;
}
export function customEase(path:string,t:number){if(t<=0)return 0;if(t>=1)return 1;const s=customCache.get(path)??validateCustomCurve(path);let a=s[0].points[0];for(const seg of s.slice(1)){const b=seg.points.at(-1)!;if(t<=b.x){if(seg.kind==='L')return a.y+(b.y-a.y)*(t-a.x)/Math.max(1e-12,b.x-a.x);const u=solve(t,a.x,seg.points[0].x,seg.points[1].x,b.x);return bezier(a.y,seg.points[0].y,seg.points[1].y,b.y,u);}a=b;}return 1;}
export function autoSpeed(keys:Keyframe[],i:number,loop=false){
 const a=keys[i];let before=keys[Math.max(0,i-1)],after=keys[Math.min(keys.length-1,i+1)];
 if(loop&&keys.length>2&&keys[0].value===keys.at(-1)!.value&&(i===0||i===keys.length-1)){
  const duration=keys.at(-1)!.time-keys[0].time;before={...keys.at(-2)!,time:keys.at(-2)!.time-duration};after=keys[1];if(i===keys.length-1){before={...before,time:before.time+duration};after={...after,time:after.time+duration};}}
 return after.time>before.time?(Number(after.value)-Number(before.value))/(after.time-before.time):0;
}
export function numericCurve(keys:Keyframe[],i:number,t:number,loop=false){
 const a=keys[i],b=keys[i+1],duration=b.time-a.time,va=Number(a.value),vb=Number(b.value),legacy=legacyHandles(a.easing,vb-va,duration);
 const tangent=(k:Keyframe,index:number,side:'in'|'out',fallback:EaseHandle)=>{
  if(k.auto==='auto')return {influence:1/3,speed:autoSpeed(keys,index,loop)};
  if(k.auto==='continuous')return {influence:k[side]?.influence??1/3,speed:k.out?.speed??k.in?.speed??autoSpeed(keys,index,loop)};
  return k[side]??fallback;
 };
 const out=tangent(a,i,'out',legacy.out),input=tangent(b,i+1,'in',legacy.in),u=solve(t,0,out.influence,1-input.influence,1);
 return bezier(va,va+out.speed*out.influence*duration,vb-input.speed*input.influence*duration,vb,u);
}
export function validateKeyExtensions(k:Keyframe){
 for(const side of ['in','out'] as const){const h=k[side];if(h&&(!Number.isFinite(h.speed)||Math.abs(h.speed)>1e6||!Number.isFinite(h.influence)||h.influence<.001||h.influence>1))throw Error('Tangent needs finite speed within ±1e6 and influence in [.001,1]');}
 if((k.in||k.out||k.auto||k.roving)&&typeof k.value!=='number')throw Error('Tangents, auto and roving require numeric keys');
 if(k.auto&&!['auto','continuous'].includes(k.auto))throw Error('Unknown tangent mode');if(k.roving!==undefined&&typeof k.roving!=='boolean')throw Error('Invalid roving flag');
 if(k.curve!==undefined)validateCustomCurve(k.curve);
}
export function roveKeys(keys:Keyframe[]){
 for(let i=1;i<keys.length-1;i++){if(!keys[i].roving)continue;let end=i;while(end<keys.length-1&&keys[end].roving)end++;const start=i-1,distances=[];let total=0;for(let j=start+1;j<=end;j++){total+=Math.abs(Number(keys[j].value)-Number(keys[j-1].value));distances.push(total);}if(total<1e-12)throw Error('Roving needs a nonzero value distance');const span=keys[end].time-keys[start].time;for(let j=i;j<end;j++)keys[j].time=keys[start].time+span*distances[j-start-1]/total;i=end;}
 if(keys[0]?.roving||keys.at(-1)?.roving)throw Error('Endpoints cannot rove');
 for(let i=1;i<keys.length;i++)if(keys[i].time<=keys[i-1].time)throw Error('Roving produced coincident times; remove stationary keys');
}
export function scaleHandles(k:Keyframe,factor:number){if(k.in)k.in.speed*=factor;if(k.out)k.out.speed*=factor;}
export function reverseCustom(path:string){
 const s=validateCustomCurve(path),flip=(p:{x:number;y:number})=>({x:1-p.x,y:1-p.y});
 const out:ReturnType<typeof segments>=[{kind:'M',points:[{x:0,y:0}]}];for(let i=s.length-1;i>0;i--){const end=flip(s[i-1].points.at(-1)!);out.push(s[i].kind==='L'?{kind:'L',points:[end]}:{kind:'C',points:[flip(s[i].points[1]),flip(s[i].points[0]),end]});}return pathData(out);
}
export function reverseKeys(keys:Keyframe[],start=keys[0].time,end=keys.at(-1)!.time){
 if(keys.some(k=>k.easing==='step'))throw Error('Reverse held tracks explicitly with new keys');
 const old=structuredClone(keys);return old.map((k,i)=>{const previous=old[i-1],incoming=k.in,outgoing=k.out;return {...k,time:start+end-k.time,in:outgoing?{...outgoing,speed:-outgoing.speed}:undefined,out:incoming?{...incoming,speed:-incoming.speed}:undefined,easing:previous?reverseEasing(previous.easing):k.easing,curve:previous?.curve?reverseCustom(previous.curve):undefined};}).reverse();
}
// Time-reversal of a segment's easing: named curves map exactly to named curves (1−f(1−t)), so legacy projects keep
// readable, bit-identical values; only arbitrary cubic-beziers are mirrored numerically.
const REVERSED:Partial<Record<Easing,Easing>>={linear:'linear','ease-in-out':'ease-in-out','ease-in':'ease-out','ease-out':'ease-in',overshoot:'anticipate',anticipate:'overshoot'};
export function reverseEasing(e:Easing):Easing{if(e==='step')return e;if(REVERSED[e])return REVERSED[e]!;const raw=e.startsWith('cubic-bezier(')?e.slice(13,-1).split(',').map(Number):LEGACY_BEZIER[e];if(!raw)return e;return `cubic-bezier(${1-raw[2]},${1-raw[3]},${1-raw[0]},${1-raw[1]})`;}
