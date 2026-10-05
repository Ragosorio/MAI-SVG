import type {Operation} from './model.js';
import {combineParams,scaleParams} from './expression.js';
// Structured variant algebra used by choice boards: the agent decides *what* to combine; this compiles it.
export type OptionSpec={params?:Record<string,number>;time?:number;layer?:string;base?:Operation[];slots?:Record<string,Operation[]>;modifiers?:Record<string,{id:string;params?:Record<string,number>;direction?:{x:number;y:number}}>};
export const FACE_SLOTS=['mouth','eyes','brows','ears'];
export const slotKey=(slot:string)=>slot==='face'?FACE_SLOTS:[slot];
export function compileSpec(spec:OptionSpec):Operation[]{const ops:Operation[]=[...(spec.base??[])];
 if(spec.params&&Object.keys(spec.params).length)ops.push(spec.time===undefined?{type:'param.set',params:spec.params}:{type:'expression.set',params:spec.params,time:spec.time,layer:spec.layer??'expression',easing:'ease-in-out'});
 for(const list of Object.values(spec.slots??{}))ops.push(...list);
 for(const m of Object.values(spec.modifiers??{}))ops.push({type:'modifier.update',id:m.id,...(m.params?{params:m.params}:{}),...(m.direction?{direction:m.direction}:{})});
 return ops;}
// take: slot → option id; preserve: slots that keep the original (neutral) geometry; scale: slot|'*' → intensity factor.
export function combineSpecs(base:OptionSpec,options:Record<string,OptionSpec>,args:{take?:Record<string,string>;preserve?:string[];scale?:Record<string,number>}){
 const spec:OptionSpec=structuredClone(base);const notes:string[]=[];
 for(const [slot,from]of Object.entries(args.take??{})){const source=options[from];if(!source)throw Error(`Option ${from} does not exist`);
  for(const s of slotKey(slot)){const has=Object.keys(source.params??{}).some(k=>k.endsWith('@'+s))||source.slots?.[s]||source.modifiers?.[s];if(!has)notes.push(`La opción ${from} no define ${s}; se conserva el de la base.`);
   if(spec.params||source.params)spec.params=combineParams(spec.params??{},[{slot:s,from:source.params??{}}]);if(source.slots?.[s])(spec.slots??={})[s]=structuredClone(source.slots[s]);if(source.modifiers?.[s])(spec.modifiers??={})[s]=structuredClone(source.modifiers[s]);}}
 for(const slot of args.preserve??[])for(const s of slotKey(slot)){if(spec.params)for(const k of Object.keys(spec.params))if(k.endsWith('@'+s))delete spec.params[k];if(spec.slots)delete spec.slots[s];if(spec.modifiers)delete spec.modifiers[s];}
 for(const [slot,factor]of Object.entries(args.scale??{})){if(!Number.isFinite(factor)||factor<0||factor>4)throw Error('Scale factor must be 0–4');if(spec.params)for(const s of slot==='*'?[undefined]:slotKey(slot))spec.params=scaleParams(spec.params,factor,s);}
 return {spec,notes};
}
