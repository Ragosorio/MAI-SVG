import {frameState} from './animation.js';
import type {VectorDocument} from './document.js';
export type NumericChannel='x'|'y'|'rotation'|'scaleX'|'scaleY'|'opacity'|'param';
export function channelSeries(m:VectorDocument,target:string,property:NumericChannel,times:number[]){
 const values=times.map(time=>{const f=frameState(m.project,time);let value:number;
  if(property==='param'){if(!(target in f.params))throw Error(`Unknown parameter ${target}`);value=f.params[target];}
  else{const e=m.index.get(target);if(!e)throw Error(`Unknown channel target ${target}`);
   value=property==='opacity'?Number(f.attrs[target]?.opacity??e.getAttribute('opacity')??1):f.poses[target]?.[property]??(property.startsWith('scale')?1:0);}
  if(!Number.isFinite(value))throw Error('Channel is not numeric');return {time,value};});
 return values.map((s,i)=>{const a=values[Math.max(0,i-1)],b=values[Math.min(values.length-1,i+1)];return {...s,velocity:b.time>a.time?(b.value-a.value)/(b.time-a.time):0};});
}
