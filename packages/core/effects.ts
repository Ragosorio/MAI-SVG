// Effects stack (plan lane B, ADR-003 §A.11): a transparent macro that compiles named effects into one SVG filter
// (`fx-<id>`, primitives `fx-<id>-<i>`) plus signals for animated parameters, and echo/trail ghosts drawn with <use>
// (no duplicated ids). Categories keep identity truthful: overlays are `effects`, recolors `style`, warps `geometry`.
import type {EffectKind,EffectSpec,FilterPrimitive,Signal,Project,Pose} from './model.js';
import {defaultPose} from './model.js';
import {frameState,poseTransform} from './animation.js';

export const EFFECT_KINDS:EffectKind[]=['blur','glow','shadow','saturate','hue','displace','motionSmear','echo'];
export const EFFECT_CATEGORY:Record<EffectKind,'effects'|'style'|'geometry'>={blur:'effects',glow:'effects',shadow:'effects',motionSmear:'effects',echo:'effects',saturate:'style',hue:'style',displace:'geometry'};
export const EFFECT_COST:Record<EffectKind,'cheap'|'moderate'|'heavy'>={shadow:'cheap',saturate:'cheap',hue:'cheap',echo:'cheap',blur:'moderate',glow:'moderate',motionSmear:'moderate',displace:'heavy'};

const num=(v:unknown,d:number,lo:number,hi:number,what:string)=>{const x=v===undefined?d:Number(v);if(!Number.isFinite(x)||x<lo||x>hi)throw Error(`Effect ${what} must be within ${lo}–${hi}`);return x;};
const color=(v:unknown,d:string)=>{const c=v===undefined?d:String(v);if(!/^#[0-9a-fA-F]{6}$/.test(c))throw Error('Effect color must be #RRGGBB');return c;};

/** Compile effects into filter primitives (chained by result names), animated-parameter signals and an echo spec. */
export function compileEffects(id:string,target:string,effects:EffectSpec[]){
 if(!Array.isArray(effects)||!effects.length||effects.length>8)throw Error('An effect stack has 1–8 effects');
 const fid=`fx-${id}`,primitives:FilterPrimitive[]=[],signals:Signal[]=[];let echo:{count:number;delay:number;falloff:number}|undefined;let input='SourceGraphic',n=0;
 const res=()=>`r${n++}`;const at=()=>`${fid}-${primitives.length}`;
 for(const e of effects){const P=e.params??{};
  switch(e.kind){
   case 'blur':{const r=res();primitives.push({kind:'blur',attrs:{stdDeviation:num(P.radius,2,0,60,'radius')},in:input,result:r});input=r;break;}
   case 'shadow':{const r=res();primitives.push({kind:'shadow',attrs:{dx:num(P.dx,0,-200,200,'dx'),dy:num(P.dy,6,-200,200,'dy'),stdDeviation:num(P.blur,6,0,60,'blur'),'flood-color':color(P.color,'#000000'),'flood-opacity':num(P.opacity,.35,0,1,'opacity')},in:input,result:r});input=r;break;}
   case 'glow':{const a=res(),b=res(),c=res(),d=res();const radius=num(P.radius,8,0,60,'radius');
    primitives.push({kind:'blur',attrs:{stdDeviation:radius},in:'SourceAlpha',result:a},{kind:'flood',attrs:{'flood-color':color(P.color,'#fff2a8'),'flood-opacity':num(P.opacity,.8,0,1,'opacity')},result:b},{kind:'composite',attrs:{operator:'in'},in:b,in2:a,result:c},{kind:'merge',attrs:{inputs:`${c} ${input}`},result:d});
    if(P.pulse!==undefined){const amp=num(P.pulse,0,0,60,'pulse');signals.push({id:`${fid}-glow-pulse`,output:{target:`${fid}-${primitives.length-4}`,property:'attr:stdDeviation',layer:'effects',base:radius},source:{kind:'oscillator',wave:'sine',period:num(P.period,2,.1,60,'period'),amplitude:amp}});}
    input=d;break;}
   case 'saturate':{const r=res();primitives.push({kind:'color-matrix',attrs:{type:'saturate',values:num(P.amount,1.3,0,4,'amount')},in:input,result:r});input=r;break;}
   case 'hue':{const r=res();primitives.push({kind:'color-matrix',attrs:{type:'hueRotate',values:num(P.degrees,20,-360,360,'degrees')},in:input,result:r});input=r;break;}
   case 'displace':{const a=res(),b=res();const scale=num(P.scale,8,0,200,'scale');primitives.push({kind:'turbulence',attrs:{type:'fractalNoise',baseFrequency:num(P.frequency,.02,.0005,1,'frequency'),numOctaves:num(P.octaves,2,1,6,'octaves'),seed:num(P.seed,3,0,1e6,'seed')},result:a},{kind:'displacement',attrs:{scale,xChannelSelector:'R',yChannelSelector:'G'},in:input,in2:a,result:b});input=b;break;}
   case 'motionSmear':{const r=res(),idx=primitives.length;primitives.push({kind:'blur',attrs:{stdDeviation:'0 0'},in:input,result:r});input=r;const k=num(P.gain,.02,0,1,'gain'),max=num(P.max,12,0,60,'max');
    // Directional blur: horizontal and vertical radius follow the part's evaluated speed on each axis.
    for(const [axis,component] of [['x',0],['y',1]] as const)signals.push({id:`${fid}-smear-${axis}`,output:{target:`${fid}-${idx}`,property:'attr:stdDeviation',layer:'effects',component,base:[0,0]},source:{kind:'speed',target,axis,gain:k,max}});break;}
   case 'echo':{echo={count:Math.round(num(P.count,3,1,8,'count')),delay:num(P.delay,.06,1/120,1,'delay'),falloff:num(P.falloff,.5,.05,.95,'falloff')};break;}
   default:throw Error(`Unknown effect ${(e as EffectSpec).kind} (${EFFECT_KINDS.join(', ')})`);}}
 return {filter:primitives.length?fid:undefined,primitives,signals,echo};}

/** Echo ghosts of posed targets at time t: delayed poses with geometric opacity falloff (rigid motion is exact). */
export function echoGhosts(p:Project,t:number){const out:{target:string;k:number;opacity:number;pose:Pose}[]=[];
 for(const fx of p.effects??[]){if(!fx.echo)continue;for(let k=1;k<=fx.echo.count;k++){const raw=t-k*fx.echo.delay,time=p.loop?((raw%p.duration)+p.duration)%p.duration:Math.max(0,raw);
  out.push({target:fx.target,k,opacity:Math.pow(fx.echo.falloff,k),pose:frameState(p,time,{camera:false}).poses[fx.target]??p.poses[fx.target]??defaultPose()});}}
 return out;}
export const ghostTransform=(p:Project,id:string,pose:Pose)=>`${poseTransform(pose)} ${p.baseTransforms[id]??''}`.trim();
