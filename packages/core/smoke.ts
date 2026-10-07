import type {Operation} from './model.js';
import {rng} from './modifiers.js';
export type SmokeEmitterConfig={id:string;x:number;y:number;width:number;height:number;parent?:string;color?:string;palette?:string[];seed?:number;density?:number;lifetime?:number;diffusion?:number;turbulence?:number;wind?:number;opacity?:number;quality?:'draft'|'balanced'|'high'};
const round=(n:number)=>Number(n.toFixed(5));
// Deterministic gas parcels: birth at the emitter, buoyant travel, entrainment, expansion and dissipation.
// Soft vector lobes overlap; opacity is zero at every recycled birth, so there is no visible return journey.
export function smokeOperations(c:SmokeEmitterConfig,duration:number):Operation[]{
 const density=c.density??24,lifetime=c.lifetime??4,diffusion=c.diffusion??.75,turbulence=c.turbulence??.5,wind=c.wind??0,opacity=c.opacity??.28,seed=c.seed??17,color=c.color??'#ddd8e4';
 if(!Number.isFinite(duration)||duration<.1||!Number.isInteger(density)||density<4||density>48||!Number.isFinite(lifetime)||lifetime<.2||lifetime>60||![diffusion,turbulence,wind,opacity].every(Number.isFinite)||diffusion<.1||diffusion>2||turbulence<0||turbulence>2||Math.abs(wind)>2||opacity<0||opacity>1||!Number.isInteger(seed)||!/^#[\da-f]{6}$/i.test(color))throw Error('Invalid smoke emitter controls');
 const palette=c.palette??[color];if(!palette.length||palette.length>8||palette.some(v=>!/^#[\da-f]{6}$/i.test(v)))throw Error('Invalid smoke palette');
 const cycles=Math.min(12,Math.max(1,Math.round(duration/lifetime))),period=duration/cycles,count=density,rand=rng(seed);
 const config={...c,density,lifetime:period,diffusion,turbulence,wind,opacity,seed,color};
 const ops:Operation[]=[{type:'create',tag:'g',id:c.id,parent:c.parent,attrs:{'data-mai-name':'Emisor de humo','data-mai-smoke':JSON.stringify(config)}}];
 for(let i=0;i<count;i++){
  const id=`${c.id}-puff-${i}`,phase=i/count,noise=rand()*Math.PI*2,jitter=(rand()-.5)*c.width*.07,turn=1.2+rand()*1.8;
  ops.push({type:'create',tag:'g',id,parent:c.id,attrs:{opacity:'0'}});
  for(let j=0;j<3;j++){
   const puff=`${id}-lobe-${j}`,a=rand()*Math.PI*2;
   ops.push({type:'create',tag:'ellipse',id:puff,parent:id,attrs:{cx:String(Math.cos(a)*.35),cy:String(Math.sin(a)*.25),rx:String(.75+rand()*.3),ry:String(.7+rand()*.35),fill:color}});
   const tint=palette[Math.floor(i*palette.length/count)%palette.length];ops.push({type:'gradient',id:puff,kind:'radial',start:tint,end:tint,startOpacity:.8,endOpacity:0});
  }
  const times=new Set<number>(Array.from({length:64*cycles+1},(_,k)=>duration*k/(64*cycles)));times.add(duration);
  for(let n=0;n<cycles;n++){const reset=(n+1-phase)*period;if(reset>0&&reset<duration){times.add(reset);times.add(Math.max(0,reset-Math.max(1e-5,duration*1e-5)));}}
  for(const t of [...times].sort((a,b)=>a-b)){
   let age=(t/period+phase)%1;if(age>1-1e-9||age<1e-9)age=0;
   const up=c.height*Math.pow(age,.85),curl=(Math.sin(noise+age*turn*Math.PI*2)-Math.sin(noise))*turbulence*c.width*.16*Math.pow(age,1.2);
   const x=c.x+jitter+wind*c.width*age+curl,y=c.y-up;
   const radius=Math.max(1,c.width*.018+c.width*.28*diffusion*Math.pow(age,.7));
   const alpha=opacity*Math.min(1,age/.08)*Math.pow(1-age,1.5);
   for(const [property,value]of [['x',x],['y',y],['scaleX',radius],['scaleY',radius*(.8+.3*age)],['opacity',alpha]] as const)ops.push({type:'keyframe',target:id,property,time:round(t),value:round(value),easing:'linear'});
  }
 }
 return ops;
}
