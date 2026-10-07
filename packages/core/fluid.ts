import {smokeOperations,type SmokeEmitterConfig} from './smoke.js';
import type {Operation} from './model.js';
export type FluidConfig=Partial<Omit<SmokeEmitterConfig,'id'|'x'|'y'|'width'|'height'|'parent'|'color'|'quality'|'seed'>>&{mode?:'ribbon'|'emitter';id:string;kind:'smoke'|'water'|'wind'|'lava';x:number;y:number;width:number;height:number;parent?:string;quality?:'draft'|'balanced'|'high';cycles?:number;seed?:number;color?:string};
const round=(v:number)=>Number(v.toFixed(3));
// Periodic travelling waves, sampled into editable, stable-topology paths.
export function fluidOperations(c:FluidConfig,duration:number):Operation[]{
 if(!['smoke','water','wind','lava'].includes(c.kind)||!['draft','balanced','high'].includes(c.quality??'balanced')||!Number.isFinite(duration)||duration<.1||duration>300)throw Error('Invalid fluid preset');
 if(!/^[A-Za-z_][\w.-]{0,80}$/.test(c.id)||['__proto__','constructor','prototype','mai-project'].includes(c.id)||![c.x,c.y,c.width,c.height].every(Number.isFinite)||Math.abs(c.x)>1e5||Math.abs(c.y)>1e5||c.width<1||c.height<1||c.width>10000||c.height>10000||!Number.isInteger(c.cycles??3)||(c.cycles??3)<1||(c.cycles??3)>12||!Number.isInteger(c.seed??1))throw Error('Invalid fluid geometry');
 if(c.kind==='smoke'&&c.mode==='emitter')return smokeOperations(c,duration);
 const color=c.color??({smoke:'#f5a5de',water:'#63cfff',wind:'#c5eaff',lava:'#ff713f'}[c.kind]);if(!/^#[\da-f]{6}$/i.test(color))throw Error('Fluid color requires #RRGGBB');
 const quality=c.quality??'balanced',count=quality==='draft'?3:quality==='high'?9:6,samples=quality==='draft'?8:quality==='high'?32:16,cycles=c.cycles??3,seed=c.seed??1;
 const ops:Operation[]=[{type:'create',tag:'g',id:c.id,parent:c.parent,attrs:{'data-mai-name':`${c.kind} · ${quality}`}}];
 for(let i=0;i<count;i++){
  const id=`${c.id}-ribbon-${i}`,phase=i*2.399+seed*.47;
  const path=(t:number)=>{const a=2*Math.PI*cycles*t/duration,points:{x:number;y:number}[]=[];const smoke=c.kind==='smoke';
   for(let j=0;j<=12;j++){const u=j/12,wave=Math.sin(u*8-a+phase)+.35*Math.sin(u*16-a*2+phase*.7);let x:number,y:number;
    if(smoke){x=c.x+(i/(count-1)-.5)*c.width*.08+u*c.width*.28+wave*c.width*.22*u;y=c.y-u*c.height;}
    else if(c.kind==='wind'){x=c.x+u*c.width;y=c.y+i/count*c.height+wave*c.height*.1;}
    else{x=c.x+u*c.width;y=c.y+c.height*(.2+i/count*.6)+wave*c.height*(c.kind==='lava'?.035:.065);}
    points.push({x,y});
   }
   // Cubic Catmull-Rom conversion keeps ribbons smooth and topology constant.
   const curve=(p:typeof points)=>{let d=`M${round(p[0].x)} ${round(p[0].y)}`;for(let j=0;j<p.length-1;j++){const p0=p[Math.max(0,j-1)],p1=p[j],p2=p[j+1],p3=p[Math.min(p.length-1,j+2)];d+=`C${round(p1.x+(p2.x-p0.x)/6)} ${round(p1.y+(p2.y-p0.y)/6)} ${round(p2.x-(p3.x-p1.x)/6)} ${round(p2.y-(p3.y-p1.y)/6)} ${round(p2.x)} ${round(p2.y)}`;}return d;};
   if(smoke){const left=points.map((p,j)=>({x:p.x-c.width*(.008+.05*Math.sin(Math.PI*j/12)),y:p.y})),right=points.map((p,j)=>({x:p.x+c.width*(.008+.05*Math.sin(Math.PI*j/12)),y:p.y})).reverse();return curve(left)+`L${round(right[0].x)} ${round(right[0].y)}`+curve(right).replace(/^M[^C]+/,'')+'Z';}
   return curve(points);
  };
  const attrs:Record<string,string>=c.kind==='smoke'?{fill:color,opacity:String(.035+i/count*.055)}:{fill:'none',stroke:color,'stroke-width':String(c.kind==='lava'?Math.max(2,c.height/count*.9):Math.max(1,c.height/count*.35)),'stroke-linecap':'round',opacity:String(c.kind==='lava'?.6:.35)};
  ops.push({type:'create',tag:'path',id,parent:c.id,attrs:{...attrs,d:path(0)}});
  if(c.kind==='smoke')ops.push({type:'gradient',id,kind:'linear',start:color,end:color,axis:'vertical',startOpacity:0,endOpacity:1});const steps=samples*cycles;for(let k=0;k<=steps;k++){const time=duration*k/steps;ops.push({type:'keyframe',target:id,property:'d',time,value:path(k===steps?0:time),easing:'linear'});}
 }
 return ops;
}
