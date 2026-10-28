// Creative Envelope (plan F3, ADR-003 §A.13): "constrain identity, not creativity". A semantic part gets a policy per
// channel — free, bounded or preserve — instead of an all-or-nothing protection level. Bounded channels pass the
// identity guard and are then measured over time against a budget; a transient deviation (a squash, a blink, a smear)
// may exceed the budget briefly if it recovers before every rest point. Pure measurement; the guard wiring lives in
// identity-guard.ts.
import type {CreativeEnvelope,EnvelopeChannel,Project} from './model.js';
import {segments} from './geometry.js';
import {restPoints} from './timing.js';
import {frameState} from './animation.js';

export const ENVELOPE_CHANNELS:Record<EnvelopeChannel,string[]>={rigidTransform:['rigid'],deform:['scale','geometry'],paint:['style'],topology:['topology','structure'],effects:['effects'],visibility:['visibility']};
/** Budget per metric when a channel is bounded and no explicit bound is given (fractions are of the part's size). */
export const DEFAULT_BOUNDS={translate:.15,rotation:15,scale:.15,deform:.12,paint:.1,opacity:.5};
type Metric=keyof typeof DEFAULT_BOUNDS;
const METRICS:Record<EnvelopeChannel,Metric[]>={rigidTransform:['translate','rotation'],deform:['scale','deform'],paint:['paint'],visibility:['opacity'],topology:[],effects:[]};
export const TRANSIENT_DEFAULTS={mustRecover:true,maxDuration:.5,maxPeak:2};

/** Categories a part allows: its levels' categories, then each envelope channel set to free/bounded (allow) or preserve (deny). */
export function applyEnvelope(base:Set<string>,env?:CreativeEnvelope){if(!env)return base;const out=new Set(base);
 for(const [ch,cats] of Object.entries(ENVELOPE_CHANNELS) as [EnvelopeChannel,string[]][]){const pol=env[ch];if(!pol)continue;for(const c of cats)if(pol==='preserve')out.delete(c);else out.add(c);}return out;}

export function validateEnvelope(env:unknown):asserts env is CreativeEnvelope{if(!env||typeof env!=='object'||Array.isArray(env))throw Error('Envelope must be an object');const e=env as Record<string,unknown>;
 const allowed=new Set([...Object.keys(ENVELOPE_CHANNELS),'bounds','transientDeviation','invariants']);for(const k of Object.keys(e))if(!allowed.has(k))throw Error(`Unknown envelope field ${k} (channels: ${Object.keys(ENVELOPE_CHANNELS).join(', ')}; bounds; transientDeviation; invariants)`);
 for(const ch of Object.keys(ENVELOPE_CHANNELS))if(e[ch]!==undefined&&!['free','bounded','preserve'].includes(e[ch] as string))throw Error(`Envelope ${ch} must be free, bounded or preserve`);
 const num=(v:unknown,lo:number,hi:number,what:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error(`Envelope ${what} must be within ${lo}–${hi}`);};
 if(e.bounds!==undefined){if(!e.bounds||typeof e.bounds!=='object')throw Error('Envelope bounds must be an object');for(const [k,v] of Object.entries(e.bounds)){if(!(k in DEFAULT_BOUNDS))throw Error(`Unknown bound ${k} (${Object.keys(DEFAULT_BOUNDS).join(', ')})`);num(v,0,k==='rotation'?360:10,`bounds.${k}`);}}
 if(e.transientDeviation!==undefined){const t=e.transientDeviation as Record<string,unknown>;if(!t||typeof t!=='object'||typeof t.allowed!=='boolean')throw Error('transientDeviation needs allowed:boolean');if(t.mustRecover!==undefined&&typeof t.mustRecover!=='boolean')throw Error('transientDeviation.mustRecover must be boolean');if(t.maxDuration!==undefined)num(t.maxDuration,.01,10,'transientDeviation.maxDuration');if(t.maxPeak!==undefined)num(t.maxPeak,1,10,'transientDeviation.maxPeak');}
 if(e.invariants!==undefined&&(!Array.isArray(e.invariants)||e.invariants.length>32||e.invariants.some(x=>typeof x!=='string'||x.length>200)))throw Error('Envelope invariants: up to 32 short notes');}

export type EnvelopeSubject={id:string;envelope:CreativeEnvelope;targets:string[];paths:string[];size:number;rest:{d:Record<string,string>;paint:Record<string,Record<string,string>>;opacity:Record<string,number>}};
export type EnvelopeSpan={metric:Metric;channel:EnvelopeChannel;start:number;end:number;peak:number;budget:number;accepted:boolean;reason?:string};
export type EnvelopeMeasure={part:string;metrics:{metric:Metric;channel:EnvelopeChannel;peak:number;budget:number;ratio:number}[];spans:EnvelopeSpan[];times:number};

const hex=(v:string)=>{const m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());if(!m)return null;const h=m[1].length===3?m[1].replace(/./g,c=>c+c):m[1];return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
function pathShift(a:string,b:string){if(a===b)return 0;try{const A=segments(a).flatMap(s=>s.points),B=segments(b).flatMap(s=>s.points);if(A.length!==B.length)return Infinity;let m=0;for(let i=0;i<A.length;i++)m=Math.max(m,Math.hypot(A[i].x-B[i].x,A[i].y-B[i].y));return m;}catch{return Infinity;}}

/** Times worth measuring: a uniform grid, rest points, beat edges and key times of the part (≤ 240). */
export function envelopeTimes(p:Project,targets:string[]){const D=p.duration,set=new Set<number>();for(let i=0;i<=96;i++)set.add(Number((D*i/96).toFixed(6)));
 for(const t of restPoints(p,targets))set.add(t);for(const b of p.beats??[])set.add(b.start),set.add(b.end);for(const tr of p.tracks)if(targets.includes(tr.target)||tr.property==='param')for(const k of tr.keys)set.add(k.time);
 const all=[...set].filter(t=>t>=0&&t<=D).sort((a,b)=>a-b);if(all.length<=240)return all;const keep=new Set(restPoints(p,targets));return all.filter((t,i)=>keep.has(t)||i%Math.ceil(all.length/200)===0);}

/** Measure a part's bounded channels over time and judge excursions as transient deviations. */
export function measureEnvelope(p:Project,s:EnvelopeSubject):EnvelopeMeasure{
 const e=s.envelope,bounded=(Object.keys(METRICS) as EnvelopeChannel[]).filter(ch=>e[ch]==='bounded');const metrics=bounded.flatMap(ch=>METRICS[ch].map(m=>({metric:m,channel:ch})));
 const out:EnvelopeMeasure={part:s.id,metrics:[],spans:[],times:0};if(!metrics.length)return out;
 const budget=(m:Metric)=>{const b=e.bounds?.[m]??DEFAULT_BOUNDS[m];return m==='translate'||m==='deform'?b*s.size:b;};
 const times=envelopeTimes(p,s.targets);out.times=times.length;const rest=new Set(restPoints(p,s.targets));
 const values:Record<string,number[]>={};for(const {metric} of metrics)values[metric]=[];
 for(const t of times){const f=frameState(p,t,{camera:false});
  for(const {metric} of metrics){let v=0;
   if(metric==='translate'||metric==='rotation'||metric==='scale')for(const id of s.targets){const r=p.poses[id],q=f.poses[id];if(!q)continue;const rx=r?.x??0,ry=r?.y??0;
    v=Math.max(v,metric==='translate'?Math.hypot(q.x-rx,q.y-ry):metric==='rotation'?Math.abs(q.rotation-(r?.rotation??0)):Math.max(Math.abs(q.scaleX/(r?.scaleX||1)-1),Math.abs(q.scaleY/(r?.scaleY||1)-1)));}
   else if(metric==='deform'){for(const id of s.paths){const d=f.attrs[id]?.d;if(d&&s.rest.d[id])v=Math.max(v,pathShift(s.rest.d[id],d));}}
   else if(metric==='paint'){for(const [id,base] of Object.entries(s.rest.paint))for(const k of ['fill','stroke']){const now=f.attrs[id]?.[k];if(now===undefined||!base[k])continue;const a=hex(base[k]),b=hex(now);v=Math.max(v,a&&b?Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])/441.673:now===base[k]?0:1);}}
   else if(metric==='opacity'){for(const [id,o] of Object.entries(s.rest.opacity)){const now=f.attrs[id]?.opacity;if(now!==undefined)v=Math.max(v,Math.abs(Number(now)-o));}}
   values[metric].push(v);}}
 const td=e.transientDeviation,maxPeak=td?.maxPeak??TRANSIENT_DEFAULTS.maxPeak,maxDur=td?.maxDuration??TRANSIENT_DEFAULTS.maxDuration,recover=td?.mustRecover??TRANSIENT_DEFAULTS.mustRecover;
 for(const {metric,channel} of metrics){const xs=values[metric],b=budget(metric),peak=Math.max(0,...xs);out.metrics.push({metric,channel,peak:Number(peak.toFixed(4)),budget:Number(b.toFixed(4)),ratio:b?Number((peak/b).toFixed(3)):peak>0?Infinity:0});
  // Spans of consecutive samples over budget; loops join the last span to the first.
  const over=xs.map(v=>v>b+1e-9);let spans:[number,number][]=[];for(let i=0;i<over.length;i++)if(over[i]){const start=i;while(i+1<over.length&&over[i+1])i++;spans.push([start,i]);}
  if(p.loop&&spans.length>1&&spans[0][0]===0&&spans.at(-1)![1]===xs.length-1){const last=spans.pop()!;spans[0]=[last[0],spans[0][1]];}
  for(const [i0,i1] of spans){const wrap=i1<i0;const idx=wrap?[...Array.from({length:xs.length-i0},(_,k)=>i0+k),...Array.from({length:i1+1},(_,k)=>k)]:Array.from({length:i1-i0+1},(_,k)=>i0+k);
   const start=times[i0],end=times[i1],dur=wrap?p.duration-start+end:end-start,pk=Math.max(...idx.map(i=>xs[i]));const atRest=idx.some(i=>rest.has(times[i]));
   const reason=!td?.allowed?'transient deviations are not allowed (transientDeviation.allowed)':pk>b*maxPeak+1e-9?`peak ${pk.toFixed(3)} exceeds ${maxPeak}× the budget`:dur>maxDur+1e-9?`lasts ${dur.toFixed(2)} s (max ${maxDur} s)`:recover&&atRest?'does not recover before a rest point (start, end, settle or hold)':undefined;
   out.spans.push({metric,channel,start,end,peak:Number(pk.toFixed(4)),budget:Number(b.toFixed(4)),accepted:!reason,...(reason?{reason}:{})});}}
 return out;}
