// Procedural signals (plan F2, ADR-003 §A.6): deterministic, seeded, loop-aware functions of time that drive a
// property, a bone, a param or a filter attribute on an animation layer — breathing drift, blinks, wiggles, handheld
// noise. They are data (inspectable, editable, bakeable), evaluated inside frameState so preview, critique and the
// SMIL export all see the same motion. (`packages/core/signals.ts` is unrelated: next-step hints for the agent.)
import type {Project,Signal,SignalSource,Layer,Pose,Bone} from './model.js';
import {DEFAULT_LAYERS,defaultPose} from './model.js';
import {valueAt,ease,frameState,frameParams,mixTracks,secondaryOffset,isEasing} from './animation.js';
import {evaluateRig} from './expression.js';
import {applyMotionPaths} from './motion-path.js';
import {parseExpr,evalExpr,checkExpr,ExpressionError,type ExprHost} from './expr.js';
import type {Easing} from './model.js';
import {rng} from './modifiers.js';

export const SIGNAL_KINDS=['noise','wiggle','oscillator','pulse','blink','drift','curve','speed','expr'] as const;
export const SIGNAL_POSE=['x','y','rotation','scaleX','scaleY'] as const;
export const SIGNAL_ATTRS=['stdDeviation','scale','dx','dy','baseFrequency','radius','k1','k2','k3','k4','surfaceScale','diffuseConstant','opacity'];
type Ctx={duration:number;loop:boolean;params:Record<string,number>;signals:Signal[];depth?:number;project?:Project;fp?:string};

// ── Noise: value noise on an integer lattice, quintic fade (C2). With a period the lattice wraps exactly. ──────────
const hash=(i:number,seed:number)=>{let h=Math.imul((i|0)^Math.imul(seed|0,0x9e3779b1),0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967295*2-1;};
const quintic=(f:number)=>f*f*f*(f*(f*6-15)+10);
function valueNoise(x:number,seed:number,period?:number){const i=Math.floor(x),f=x-i,w=(k:number)=>period?((k%period)+period)%period:k;const a=hash(w(i),seed),b=hash(w(i+1),seed);return a+(b-a)*quintic(f);}
/** Fractal noise in [-1,1]. When looping, each octave has an integer number of lattice cells per loop: seamless and C2. */
export function fractalNoise(t:number,frequency:number,octaves:number,persistence:number,seed:number,loopDuration?:number){
 let sum=0,amp=1,norm=0;for(let k=0;k<octaves;k++){let x:number,period:number|undefined;
  if(loopDuration){const cells=Math.max(1,Math.round(frequency*loopDuration))*2**k;x=t/loopDuration*cells;period=cells;}else x=t*frequency*2**k;
  sum+=amp*valueNoise(x,seed+k*1013,period);norm+=amp;amp*=persistence;}
 return norm?sum/norm:0;}

const smooth=(x:number)=>x<=0?0:x>=1?1:x*x*(3-2*x);
const fract=(x:number)=>x-Math.floor(x);
type Event={start:number;end:number;peak:number};
const scheduleCache=new Map<string,Event[]>();
/** Blink/pulse schedule: seeded intervals in [min,max]; every event lies fully inside the timeline (no seam straddle). */
export function schedule(src:Extract<SignalSource,{kind:'pulse'|'blink'}>,duration:number):Event[]{
 const key=JSON.stringify([src,duration]);const hit=scheduleCache.get(key);if(hit)return hit;
 const r=rng(src.seed),[lo,hi]=src.interval,length=src.kind==='blink'?src.close+(src.hold??.04)+(src.open??src.close*1.6):src.width;const out:Event[]=[];
 let t=lo*.5+r()*(hi-lo)*.5;
 while(t+length<=duration&&out.length<1000){out.push({start:t,end:t+length,peak:t+(src.kind==='blink'?src.close:length/2)});
  // A double blink: a second, complete blink right after the first (gap .12 s), still inside the timeline.
  if(src.kind==='blink'&&src.double&&r()<src.double&&t+2*length+.12<=duration){const s2=t+length+.12;out.push({start:s2,end:s2+length,peak:s2+src.close});t=s2;}
  t+=length+lo+r()*(hi-lo);}
 if(scheduleCache.size>256)scheduleCache.clear();scheduleCache.set(key,out);return out;}

/** Raw source value (before envelope). */
export function sourceAt(src:SignalSource,t:number,ctx:Ctx):number{
 const D=ctx.duration,loopD=ctx.loop?D:undefined;
 switch(src.kind){
  case 'noise':return src.amplitude*fractalNoise(t,src.frequency,src.octaves??1,src.persistence??.5,src.seed,loopD);
  case 'wiggle':return src.amplitude*fractalNoise(t,src.frequency,src.octaves??1,.5,src.seed,loopD);
  case 'oscillator':{const cycles=ctx.loop?Math.max(1,Math.round(D/src.period)):D/src.period;const u=fract(t/D*cycles+(src.phase??0)),s=Math.max(0,Math.min(1,src.softness??.15));
   switch(src.wave){case 'sine':return src.amplitude*Math.sin(2*Math.PI*u);case 'triangle':return src.amplitude*(1-4*Math.abs(u-.5));
    case 'square':{const k=1+ (1-s)*30;return src.amplitude*Math.tanh(k*Math.sin(2*Math.PI*u))/Math.tanh(k);}
    case 'saw':{const ramp=2*u-1;const w=Math.max(1e-3,s*.5);return src.amplitude*(u>1-w?ramp-(ramp+1)*smooth((u-(1-w))/w):ramp);}}return 0;}
  case 'pulse':case 'blink':{let v=0;for(const e of schedule(src,D)){if(t<e.start||t>e.end)continue;
    if(src.kind==='pulse'){const u=(t-e.start)/(e.end-e.start);v=Math.max(v,src.shape==='attack'?Math.min(1,u*8)*Math.exp(-4*u):Math.sin(Math.PI*u)**2);}
    else{const close=src.close,hold=src.hold??.04,open=src.open??close*1.6,x=t-e.start;v=Math.max(v,x<close?ease('ease-in',x/close):x<close+hold?1:ease('ease-out',1-(x-close-hold)/open));}}
   return src.amplitude*v;}
  case 'drift':{const r=rng(src.seed??7),p=src.period;let n=[1,1.618,2.414].map(k=>D/(p*k));if(ctx.loop){const n1=Math.max(1,Math.round(D/p));let n2=Math.max(n1+1,Math.round(n1*1.37)),n3=Math.max(n2+1,Math.round(n1*1.83));const g=(a:number,b:number):number=>b?g(b,a%b):a;while(g(n1,n2)!==1)n2++;while(g(n1,n3)!==1||g(n2,n3)!==1)n3++;n=[n1,n2,n3];}
   const w=[.5,.3,.2];return src.amplitude*n.reduce((s,c,i)=>s+w[i]*Math.sin(2*Math.PI*(t/D*c+r())),0);}
  case 'curve':return Number(valueAt({target:'signal',property:'param',keys:src.keys},t,ctx.loop));
  // Evaluated speed of a part (keyed motion + secondary, without signals to avoid recursion): drives motion smear.
  case 'speed':{if(!ctx.project)return 0;const h=1/240,a=frameState(ctx.project,Math.max(0,t-h),{signals:false,modifiers:false,camera:false}).poses[src.target],b=frameState(ctx.project,Math.min(D,t+h),{signals:false,modifiers:false,camera:false}).poses[src.target];if(!a||!b)return 0;
   const dt=Math.min(D,t+h)-Math.max(0,t-h)||h,ax=src.axis??'xy',v=ax==='rotation'?Math.abs(b.rotation-a.rotation)/dt:ax==='x'?Math.abs(b.x-a.x)/dt:ax==='y'?Math.abs(b.y-a.y)/dt:Math.hypot(b.x-a.x,b.y-a.y)/dt;return Math.min(src.max??1e4,v*src.gain);}
 }
 return 0;}

/** Envelope weight in [0,1]·gain over time (window, fades, decay, ramp). */
function envelopeAt(s:Signal,t:number,ctx:Ctx){const e=s.envelope;if(!e)return 1;const start=e.start??0,end=e.end??ctx.duration;if(t<start||t>end)return 0;
 let w=1;if(e.fadeIn)w*=smooth((t-start)/e.fadeIn);if(e.fadeOut)w*=smooth((end-t)/e.fadeOut);if(e.decay)w*=Math.exp(-e.decay*(t-start));if(e.ramp?.length)w*=Number(valueAt({target:'ramp',property:'param',keys:e.ramp},t,ctx.loop));return w;}
/** Final signal value: (source·gain·multiplier + bias), clamped. The envelope is applied by the layer blend. */
export function signalAt(s:Signal,t:number,ctx:Ctx):{value:number;weight:number}{
 if(s.enabled===false)return {value:0,weight:0};const e=s.envelope??{};let v=(s.source.kind==='expr'?evalExpr(parseExpr(s.source.expr),t,exprHost(s,ctx)):sourceAt(s.source,t,ctx))*(e.gain??1);
 if(e.multiplyBy){const [kind,name]=e.multiplyBy.split(':');if(kind==='param')v*=ctx.params[name]??0;else{const other=ctx.signals.find(x=>x.id===name);if(!other||(ctx.depth??0)>8)throw Error(`Signal ${s.id}: invalid multiplyBy ${e.multiplyBy}`);const o=signalAt(other,t,{...ctx,depth:(ctx.depth??0)+1});v*=o.value*o.weight;}}
 v+=e.bias??0;if(e.clamp)v=Math.max(e.clamp[0],Math.min(e.clamp[1],v));return {value:v,weight:envelopeAt(s,t,ctx)};}

// ── Expressions: what a reference reads, and the per-scene-version cache of temporal simulations ─────────────────
/** A channel as the motion before expressions leaves it: keys, motion paths, non-expression signals, rig, secondary.
 *  Expressions read this (never other expressions' channels), so a part can follow itself or a chain without cycles. */
export function channelAt(p:Project,id:string,prop:string,time:number):number{
 const t=Math.max(0,Math.min(p.duration,time)),tracks=p.tracks.filter(tr=>tr.target===id&&tr.property===prop);
 const params=Object.keys(p.params??{}).length||p.tracks.some(tr=>tr.property==='param')?frameParams(p,t,undefined,{expr:false}):{};
 const ctx:Ctx={duration:p.duration,loop:p.loop,params,signals:p.signals??[],project:p};
 const sigs=(p.signals??[]).filter(s=>s.source.kind!=='expr'&&s.output.target===id&&s.output.property===prop);
 const mixSignals=(v:number)=>{for(const s of sigs){const l=layerOf(p,s.output.layer);if(active(p,l))v=blend(v,signalAt(s,t,ctx),l!);}return v;};
 if(prop.startsWith('bone')){const b=p.bones.find(x=>x.id===id);if(!b)return 0;const k={boneRotation:'rotation',boneX:'x',boneY:'y'}[prop as 'boneRotation'] as 'rotation';return mixSignals(Number(mixTracks(p,tracks,t,b[k])));}
 if(prop==='opacity')return Math.max(0,Math.min(1,mixSignals(Number(mixTracks(p,tracks,t,Number(p.baseAttributes[id]?.opacity??1))))));
 const pose=structuredClone(p.poses[id]??defaultPose()) as Pose;const k=prop as keyof Pose;pose[k]=Number(mixTracks(p,tracks,t,pose[k]));
 const paths=(p.motionPaths??[]).filter(m=>m.target===id);if(paths.length)applyMotionPaths({...p,motionPaths:paths},t,{[id]:pose});
 let v=mixSignals(pose[k]);
 if(p.expression){const rp=evaluateRig(p.expression,params,p.preservation??'balanced').poses[id] as Record<string,number>|undefined;if(rp&&typeof rp[prop]==='number')v=rp[prop];}
 for(const s of p.secondary??[])if(s.target===id&&s.property===prop)v+=secondaryOffset(p,s,t,params);
 return v;}
const sims=new Map<string,Float64Array>();
/** Scene-version key: everything a channel read depends on. Temporal simulations are reused until it changes. */
function fingerprint(ctx:Ctx){if(ctx.fp)return ctx.fp;const p=ctx.project!;const json=JSON.stringify([p.duration,p.loop,p.tracks,p.poses,p.motionPaths,p.signals,p.secondary,p.params,p.layers,p.expression,p.bones,p.preservation]);
 let h1=0x811c9dc5,h2=0x9747b28c;for(let i=0;i<json.length;i++){const c=json.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,0x5bd1e995);}return ctx.fp=`${(h1>>>0).toString(36)}${(h2>>>0).toString(36)}${json.length}`;}
function exprHost(s:Signal,ctx:Ctx):ExprHost{const p=ctx.project;if(!p)throw Error(`Signal ${s.id}: expressions need the project`);
 const params=(t:number)=>frameParams(p,t,undefined,{expr:false});
 return {duration:p.duration,loop:p.loop,fps:60,
  part:(id,prop,t)=>channelAt(p,id,prop,t),param:(name,t)=>params(t)[name]??0,
  signal:(id,t)=>{const o=(p.signals??[]).find(x=>x.id===id);if(!o||(ctx.depth??0)>16)return 0;const r=signalAt(o,t,{...ctx,depth:(ctx.depth??0)+1});return r.value*r.weight;},
  value:t=>{const o=s.output;if(o.target==='@camera')return 0;if(o.property==='param')return params(t)[o.target]??0;if(o.property.startsWith('attr:'))return Array.isArray(o.base)?o.base[o.component??0]:o.base??0;return channelAt(p,o.target,o.property,t);},
  noise:(t,f,seed,oct)=>fractalNoise(t,f,oct,.5,seed,p.loop?p.duration:undefined),ease:(name,u)=>ease(name as Easing,u),
  sim:(slot,compute)=>{const key=`${fingerprint(ctx)}:${s.id}:${slot}`;let hit=sims.get(key);if(!hit){hit=compute();if(sims.size>256)sims.clear();sims.set(key,hit);}return hit;}};}

// ── Mixing into an evaluated frame (same layer rules as tracks: additive adds weight·v; override lerps) ────────────
const layerOf=(p:Project,id:string):Layer|undefined=>(p.layers??DEFAULT_LAYERS).find(l=>l.id===id);
function active(p:Project,l:Layer|undefined){if(!l||l.mute)return false;const solo=(p.layers??DEFAULT_LAYERS).some(x=>x.solo);return !solo||!!l.solo;}
const blend=(base:number,s:{value:number;weight:number},l:Layer)=>l.blend==='additive'?base+l.weight*s.weight*s.value:base+(s.value-base)*l.weight*s.weight;

/** Param outputs (called from frameParams before clamping). */
export function applyParamSignals(p:Project,t:number,params:Record<string,number>,noExpr=false){
 const list=(p.signals??[]).filter(s=>s.output.property==='param'&&!(noExpr&&s.source.kind==='expr'));if(!list.length)return;const ctx:Ctx={duration:p.duration,loop:p.loop,params,signals:p.signals??[],project:p};
 for(const s of list){const l=layerOf(p,s.output.layer);if(!active(p,l))continue;const name=s.output.target;params[name]=blend(params[name]??p.params?.[name]?.default??0,signalAt(s,t,ctx),l!);}}

/** Pose, bone, opacity and attribute outputs (called from frameState after track mixing, before the rig). */
export function applySignals(p:Project,t:number,frame:{poses:Record<string,Pose>;bones:Bone[];attrs:Record<string,Record<string,string>>;params:Record<string,number>}){
 const list=(p.signals??[]).filter(s=>s.output.property!=='param'&&s.output.target!=='@camera');if(!list.length)return;const ctx:Ctx={duration:p.duration,loop:p.loop,params:frame.params,signals:p.signals??[],project:p};
 const pending=new Map<string,number[]>();
 for(const s of list){const l=layerOf(p,s.output.layer);if(!active(p,l))continue;const o=s.output,v=signalAt(s,t,ctx);
  if((SIGNAL_POSE as readonly string[]).includes(o.property)){const pose=frame.poses[o.target]??=structuredClone(p.poses[o.target]??defaultPose()) as Pose;const k=o.property as keyof Pose;pose[k]=blend(pose[k],v,l!);}
  else if(o.property.startsWith('bone')){const b=frame.bones.find(x=>x.id===o.target);if(b){const k={boneRotation:'rotation',boneX:'x',boneY:'y'}[o.property as 'boneRotation'] as 'rotation';b[k]=blend(b[k],v,l!);}}
  else if(o.property==='opacity'){const a=frame.attrs[o.target]??={};const base=Number(a.opacity??p.baseAttributes[o.target]?.opacity??1);a.opacity=String(Math.max(0,Math.min(1,blend(base,v,l!))));}
  else if(o.property.startsWith('attr:')){const key=`${o.target}\u0000${o.property.slice(5)}`;const base=Array.isArray(o.base)?[...o.base]:[o.base??0];const cur=pending.get(key)??base;const c=o.component??0;cur[c]=blend(cur[c]??0,v,l!);pending.set(key,cur);}}
 for(const [key,vals]of pending){const [target,name]=key.split('\u0000');(frame.attrs[target]??={})[name]=vals.map(x=>Number(x.toFixed(5))).join(' ');}}

/** Times where a signal changes character (windows, blink/pulse events): split points for export sampling. */
export function signalEvents(p:Project){const out:number[]=[];for(const s of p.signals??[]){const e=s.envelope;if(e){for(const x of [e.start,e.end,e.start!==undefined&&e.fadeIn?e.start+e.fadeIn:undefined,e.end!==undefined&&e.fadeOut?e.end-e.fadeOut:undefined])if(x!==undefined)out.push(x);}
 if(s.source.kind==='blink'||s.source.kind==='pulse')for(const ev of schedule(s.source,p.duration))out.push(ev.start,ev.peak,ev.end);}
 return out.filter(t=>t>=0&&t<=p.duration);}

/** Validation of untrusted metadata and ops (ranges keep evaluation and export bounded). */
export function validateSignals(p:Project,exists:(id:string)=>boolean){
 const list=p.signals??[];if(!Array.isArray(list)||list.length>256)throw Error('At most 256 signals');const ids=new Set<string>();
 const n=(v:unknown,lo:number,hi:number,what:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error(`Signal ${what} must be within ${lo}–${hi}`);return v;};
 for(const s of list){if(!/^[A-Za-z_][\w.-]{0,100}$/.test(s.id)||ids.has(s.id))throw Error(`Invalid or duplicate signal id ${s.id}`);ids.add(s.id);
  const o=s.output;if(!o||typeof o.target!=='string'||typeof o.layer!=='string')throw Error(`Signal ${s.id}: output needs target and layer`);
  if(!layerOf(p,o.layer))throw Error(`Signal ${s.id}: unknown layer ${o.layer} (define it with layer.set)`);
  const prop=o.property;if(o.target==='@camera'){if(!['x','y','rotation','zoom'].includes(prop))throw Error(`Signal ${s.id}: the camera takes x, y, rotation or zoom`);if(!p.camera)throw Error(`Signal ${s.id}: no camera (camera.set first)`);}
  else if(!((SIGNAL_POSE as readonly string[]).includes(prop)||['opacity','boneRotation','boneX','boneY','param'].includes(prop)||(prop.startsWith('attr:')&&SIGNAL_ATTRS.includes(prop.slice(5)))))throw Error(`Signal ${s.id}: unsupported output ${prop}`);
  if(prop==='param'){if(!/^[A-Za-z][\w.-]{0,60}(@[A-Za-z][\w-]{0,40})?$/.test(o.target))throw Error(`Signal ${s.id}: invalid param name`);}
  else if(prop.startsWith('bone')){if(!p.bones.some(b=>b.id===o.target))throw Error(`Signal ${s.id}: bone ${o.target} not found`);}
  else if(o.target!=='@camera'&&!exists(o.target))throw Error(`Signal ${s.id}: target ${o.target} not found`);
  if(o.component!==undefined&&o.component!==0&&o.component!==1)throw Error(`Signal ${s.id}: component must be 0 or 1`);
  const src=s.source;if(!src||!(SIGNAL_KINDS as readonly string[]).includes(src.kind))throw Error(`Signal ${s.id}: kind must be ${SIGNAL_KINDS.join(', ')}`);
  if('amplitude' in src)n(src.amplitude,-1e4,1e4,'amplitude');
  switch(src.kind){case 'noise':case 'wiggle':n(src.frequency,.01,30,'frequency');if(src.octaves!==undefined)n(src.octaves,1,6,'octaves');n(src.seed,-1e9,1e9,'seed');break;
   case 'oscillator':n(src.period,.05,300,'period');if(!['sine','triangle','square','saw'].includes(src.wave))throw Error(`Signal ${s.id}: unknown wave`);break;
   case 'pulse':case 'blink':{if(!Array.isArray(src.interval)||src.interval.length!==2)throw Error(`Signal ${s.id}: interval [min,max]`);n(src.interval[0],.1,60,'interval');n(src.interval[1],src.interval[0],60,'interval max');n(src.seed,-1e9,1e9,'seed');if(src.kind==='blink'){n(src.close,.02,.6,'close');if(src.double!==undefined)n(src.double,0,1,'double');}else n(src.width,.01,10,'width');break;}
   case 'drift':n(src.period,.05,300,'period');break;
   case 'curve':if(!Array.isArray(src.keys)||src.keys.length<2||src.keys.length>2000)throw Error(`Signal ${s.id}: curve needs 2–2000 keys`);break;
   case 'expr':{if(list.filter(x=>x.source.kind==='expr').length>64)throw Error('At most 64 expression signals');const paramNames=new Set([...Object.keys(p.params??{}),...p.tracks.filter(t=>t.property==='param').map(t=>t.target),...list.filter(x=>x.output.property==='param').map(x=>x.output.target)]);
    try{checkExpr(src.expr,{part:(id,prop)=>prop.startsWith('bone')?p.bones.some(b=>b.id===id):exists(id),param:n=>paramNames.has(n),signal:id=>id!==s.id&&list.some(x=>x.id===id),easing:n=>isEasing(n)});}catch(err){if(err instanceof ExpressionError)throw Error(`Signal ${s.id}: ${err.message}`);throw err;}break;}
   case 'speed':if(!exists(src.target))throw Error(`Signal ${s.id}: speed target ${src.target} not found`);n(src.gain,-1e3,1e3,'gain');if(src.max!==undefined)n(src.max,0,1e4,'max');break;}
  const e=s.envelope;if(e){for(const k of ['start','end'] as const)if(e[k]!==undefined)n(e[k],0,p.duration,k);for(const k of ['fadeIn','fadeOut'] as const)if(e[k]!==undefined)n(e[k],0,p.duration,k);if(e.decay!==undefined)n(e.decay,0,100,'decay');if(e.gain!==undefined)n(e.gain,-1e4,1e4,'gain');if(e.bias!==undefined)n(e.bias,-1e4,1e4,'bias');
   if(e.multiplyBy!==undefined&&!/^(param|signal):[A-Za-z][\w.@-]{0,100}$/.test(e.multiplyBy))throw Error(`Signal ${s.id}: multiplyBy is param:NAME or signal:ID`);if(e.multiplyBy?.startsWith('signal:')&&!list.some(x=>x.id===e.multiplyBy!.slice(7)))throw Error(`Signal ${s.id}: multiplyBy references a missing signal`);}}
 // Signals that read other signals (multiplyBy, sig.ID in expressions) must not loop.
 const deps=(s:Signal)=>[...(s.envelope?.multiplyBy?.startsWith('signal:')?[s.envelope.multiplyBy.slice(7)]:[]),...(s.source.kind==='expr'?parseExpr(s.source.expr).refs.signals:[])];
 const state=new Map<string,1|2>();const visit=(id:string,path:string[])=>{const st=state.get(id);if(st===2)return;if(st===1){const from=path.indexOf(id);throw Error(`MAI_EXPR_CYCLE: signal cycle ${[...path.slice(from),id].join(' → ')}`);}
  state.set(id,1);const s=list.find(x=>x.id===id);for(const d of s?deps(s):[])visit(d,[...path,id]);state.set(id,2);};
 for(const s of list)visit(s.id,[]);}
