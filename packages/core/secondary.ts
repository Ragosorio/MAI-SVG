import type {Secondary} from './model.js';
// Physically inspired secondary motion: a damped spring driven by the driver's velocity (follow-through,
// drag, overshoot). Simulated deterministically; looping timelines use the steady state and close the seam.
const cache=new Map<string,Float64Array>();
export const SECONDARY_PRESETS={
 tail:{stiffness:60,damping:7,gain:-.35,delay:.08,limit:25,describe:'Cola: sigue el salto con retraso suave y rebote leve.'},
 ears:{stiffness:120,damping:10,gain:-.2,delay:.04,limit:12,describe:'Orejas: reacción rápida, poco rebote.'},
 hair:{stiffness:45,damping:6,gain:-.3,delay:.1,limit:20,describe:'Pelo: inercia y vaivén.'},
 cloth:{stiffness:30,damping:5,gain:-.25,delay:.12,limit:18,describe:'Ropa: pesada y lenta.'},
 antenna:{stiffness:90,damping:4,gain:-.4,delay:.03,limit:30,describe:'Antenas: elásticas con overshoot.'},
 accessory:{stiffness:70,damping:9,gain:-.2,delay:.05,limit:15,describe:'Accesorio colgante.'},
 plant:{stiffness:40,damping:5,gain:-.3,delay:.1,limit:20,describe:'Planta: balanceo amortiguado.'},
} as const;
export function simulateSecondary(s:Secondary,driver:(t:number)=>number,duration:number,loop:boolean,fps=120):Float64Array{
 const n=Math.max(2,Math.ceil(duration*fps))+1,dt=duration/(n-1),key=JSON.stringify([s,duration,loop,n,Array.from({length:24},(_,i)=>Number(driver(duration*i/23).toFixed(5)))]);
 const hit=cache.get(key);if(hit)return hit;
 const sample=(t:number)=>{const T=loop?((t%duration)+duration)%duration:Math.max(0,Math.min(duration,t));return driver(T);};
 const velocity=(t:number)=>(sample(t+dt)-sample(t-dt))/(2*dt);
 const out=new Float64Array(n);let theta=0,omega=0;const passes=loop?3:1;
 for(let pass=0;pass<passes;pass++)for(let i=0;i<n;i++){const t=i*dt,eq=s.kind==='follow'?s.gain*sample(t-s.delay):s.gain*velocity(t-s.delay);
  if(s.kind==='follow'){theta=eq;}else{const acc=s.stiffness*(eq-theta)-s.damping*omega;omega+=acc*dt;theta+=omega*dt;}
  if(pass===passes-1)out[i]=Math.max(-s.limit,Math.min(s.limit,theta));}
 if(loop){const seam=out[n-1]-out[0];for(let i=0;i<n;i++)out[i]-=seam*i/(n-1);}
 if(cache.size>200)cache.clear();cache.set(key,out);return out;
}
export function secondaryAt(samples:Float64Array,duration:number,t:number){const n=samples.length,x=Math.max(0,Math.min(1,duration?t/duration:0))*(n-1),i=Math.min(n-2,Math.floor(x)),u=x-i;return samples[i]*(1-u)+samples[i+1]*u;}
