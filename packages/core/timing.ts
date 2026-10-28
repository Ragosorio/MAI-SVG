import type {Project,Beat,BeatKind,KeyInput} from './model.js';
import {schedule} from './procedural.js';
/** Sample interesting authored instants, then fill the widest gaps. Always includes the endpoints. */
export function significantTimes(p:Project,count=12){
 if(!Number.isInteger(count)||count<2||count>241)throw Error('Invalid significant sample count');
 // Signal peaks (blinks, pulses) are the rare events a uniform strip misses; beats and markers are authored intent.
 const peaks=(p.signals??[]).flatMap(s=>s.source.kind==='blink'||s.source.kind==='pulse'?schedule(s.source,p.duration).map(e=>e.peak):[]);
 const event=[...(p.markers??[]).map(m=>m.time),...(p.regions??[]).flatMap(r=>[r.start,r.end]),...(p.beats??[]).flatMap(b=>[b.start,b.end]),...peaks];
 const keys=p.tracks.flatMap(t=>t.keys.map(k=>k.time));const all=[...new Set([0,p.duration,...event,...keys].filter(t=>t>=0&&t<=p.duration))].sort((a,b)=>a-b);
 const chosen=new Set([0,p.duration]);
 const addFarthest=(candidates:number[])=>{while(chosen.size<count&&candidates.some(t=>!chosen.has(t))){const rest=candidates.filter(t=>!chosen.has(t));rest.sort((a,b)=>Math.min(...[...chosen].map(t=>Math.abs(b-t)))-Math.min(...[...chosen].map(t=>Math.abs(a-t)))||a-b);chosen.add(rest[0]);}};
 addFarthest(event);addFarthest(all);
 while(chosen.size<count){const times=[...chosen].sort((a,b)=>a-b);let i=0;for(let j=1;j<times.length-1;j++)if(times[j+1]-times[j]>times[i+1]-times[i])i=j;chosen.add((times[i]+times[i+1])/2);}
 return [...chosen].sort((a,b)=>a-b);
}

export const BEAT_KINDS:BeatKind[]=['anticipation','action','overshoot','settle','hold','reaction','accent'];
export function validateBeats(p:Project){const list=p.beats??[];if(!Array.isArray(list)||list.length>500)throw Error('At most 500 beats');const ids=new Set<string>();
 for(const b of list){if(!/^[A-Za-z_][\w.-]{0,100}$/.test(b.id)||ids.has(b.id))throw Error(`Invalid or duplicate beat id ${b.id}`);ids.add(b.id);if(!BEAT_KINDS.includes(b.kind))throw Error(`Beat ${b.id}: kind must be ${BEAT_KINDS.join(', ')}`);
  if(!(Number.isFinite(b.start)&&Number.isFinite(b.end)&&b.start>=0&&b.end>b.start&&b.end<=p.duration+1e-9))throw Error(`Beat ${b.id}: needs 0 ≤ start < end ≤ duration`);if(b.intensity!==undefined&&!(b.intensity>=0&&b.intensity<=1))throw Error(`Beat ${b.id}: intensity 0–1`);}}

/** Rest points of a performance: timeline ends, ends of settle beats and hold beats (identity must be exact there). */
export function restPoints(p:Project,targets?:string[]){const hit=(b:Beat)=>!targets||!b.targets||b.targets.some(t=>targets.includes(t));
 return [...new Set([0,p.duration,...(p.beats??[]).filter(b=>hit(b)&&(b.kind==='settle'||b.kind==='hold')).flatMap(b=>b.kind==='hold'?[b.start,b.end]:[b.end])])].sort((a,b)=>a-b);}

export type ActingSketch={start:number;duration:number;action:number;rest:number;anticipation?:number;overshoot?:number;timing?:{anticipation:number;action:number;overshoot:number;settle:number};bounces?:0|1|2};
/** Teaching macro: rest → anticipation (opposite wind-up, slow in/out) → fast action → overshoot → long settle.
 * Returns plain keys with tangent handles (editable) and the beats it implies. Defaults follow classic proportions. */
export function actingBeat(s:ActingSketch){
 const span=s.action-s.rest,ant=s.anticipation??s.rest-.2*span,over=s.overshoot??s.action+.1*span,tm=s.timing??{anticipation:.3,action:.15,overshoot:.2,settle:.35};
 const total=tm.anticipation+tm.action+tm.overshoot+tm.settle;if(!(total>0&&total<=1+1e-9)||Object.values(tm).some(v=>!(v>=0)))throw Error('acting.beat timing fractions must be ≥0 and sum to ≤1');
 if(!(s.duration>0))throw Error('acting.beat needs a positive duration');
 const t1=s.start+tm.anticipation*s.duration,t2=t1+tm.action*s.duration,t3=t2+tm.overshoot*s.duration,t4=t3+tm.settle*s.duration,r=(n:number)=>Number(n.toFixed(6));
 const keys:KeyInput[]=[{time:r(s.start),value:s.rest,out:{speed:0,influence:.4}},{time:r(t1),value:ant,in:{speed:0,influence:.5},out:{speed:0,influence:.55}},{time:r(t2),value:s.action,auto:'auto'},{time:r(t3),value:over,in:{speed:0,influence:.35},out:{speed:0,influence:.35}}];
 let last=t3,amp=over-s.action;for(let i=0;i<(s.bounces??0);i++){amp*=-.35;const t=last+(t4-last)*.45;keys.push({time:r(t),value:s.action+amp,in:{speed:0,influence:.4},out:{speed:0,influence:.4}});last=t;}
 keys.push({time:r(t4),value:s.action,in:{speed:0,influence:.65}});
 const beats:Omit<Beat,'id'>[]=[{kind:'anticipation',start:r(s.start),end:r(t1)},{kind:'action',start:r(t1),end:r(t2)},{kind:'overshoot',start:r(t2),end:r(t3)},{kind:'settle',start:r(t3),end:r(t4)}];
 if(t4<s.start+s.duration-1e-6)beats.push({kind:'hold',start:r(t4),end:r(s.start+s.duration)});
 return {keys,beats,notes:[`anticipation ${ant.toFixed(2)} (opposite of the action), overshoot ${over.toFixed(2)}, settle ${(tm.settle*s.duration).toFixed(2)} s`]};}
