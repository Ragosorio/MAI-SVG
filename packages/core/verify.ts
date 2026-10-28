import {frameState} from './animation.js';
import {SpatialSession,type Target,type Sample} from './space.js';
import type {VectorDocument} from './document.js';

import {type Assertion,type Event} from './assertions.js';
export {assertionSchema,type Assertion} from './assertions.js';
export function sampleTimes(duration:number,count=61,during:[number,number]=[0,duration]){
 const [start,end]=during;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration||end<=start)throw Error('during must satisfy 0 <= start < end <= duration');
 if(!Number.isInteger(count)||count<3||count>241)throw Error('count must be an integer from 3 to 241');
 return Array.from({length:count},(_,i)=>start+(end-start)*i/(count-1));
}
const distance=(a:Sample,b:Sample)=>Math.hypot(b.center.x-a.center.x,b.center.y-a.center.y);
const velocity=(a:Sample,b:Sample)=>({x:(b.center.x-a.center.x)/(b.time-a.time),y:(b.center.y-a.center.y)/(b.time-a.time)});
export function motionStats(series:Sample[]){
 const velocities=series.slice(1).map((s,i)=>velocity(series[i],s)),speeds=velocities.map(v=>Math.hypot(v.x,v.y));
 const pathLength=series.slice(1).reduce((sum,s,i)=>sum+distance(series[i],s),0);
 const duration=series.at(-1)!.time-series[0].time;
 const energy=series.slice(1).reduce((sum,s,i)=>sum+speeds[i]**2*(s.time-series[i].time),0)/duration;
 // Total unsigned heading change, radians; stationary intervals contribute nothing.
 let curvature=0;let previous:typeof velocities[number]|undefined;
 for(const v of velocities){if(Math.hypot(v.x,v.y)<1e-8)continue;if(previous)curvature+=Math.abs(Math.atan2(previous.x*v.y-previous.y*v.x,previous.x*v.x+previous.y*v.y));previous=v;}
 return {pathLength,displacement:distance(series[0],series.at(-1)!),maxSpeed:Math.max(...speeds),rmsSpeed:Math.sqrt(energy),curvature,velocities};
}
/** Cross correlation over all eligible nonnegative lags, not just the requested acceptance interval. */
export function correlateLag(driver:number[],follower:number[],dt:number){
 if(driver.length!==follower.length||driver.length<8)throw Error('Lag requires at least 8 samples');
 const correlation=(a:number[],b:number[])=>{const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;let cov=0,va=0,vb=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;cov+=x*y;va+=x*x;vb+=y*y;}return va*vb>1e-12?cov/Math.sqrt(va*vb):NaN;};
 const candidates=[];for(let lag=0;lag<=Math.floor(driver.length/3);lag++){const score=correlation(driver.slice(0,driver.length-lag),follower.slice(lag));if(Number.isFinite(score))candidates.push({delay:lag*dt,correlation:score});}
 if(!candidates.length)throw Error('Lag is undefined for a stationary or constant channel');
 candidates.sort((a,b)=>b.correlation-a.correlation||a.delay-b.delay);return candidates[0];
}
function eventTime(series:Sample[],event:Event){
 const speeds=motionStats(series).velocities.map(v=>Math.hypot(v.x,v.y)),threshold=event.threshold??.1;
 const active=speeds.map((v,i)=>v>threshold?i:-1).filter(i=>i>=0);if(!active.length)throw Error(`No ${event.event} event observed for ${event.part}`);
 if(event.event==='starts')return series[active[0]].time;
 if(event.event==='stops'){const i=active.at(-1)!+1;if(i===series.length-1)throw Error(`No stop observed for ${event.part}`);return series[i].time;}
 const i=speeds.indexOf(Math.max(...speeds));return (series[i].time+series[i+1].time)/2;
}
/** Which sprite variant is showing: every element of the expected variant visible, every other variant hidden. */
function spriteState(m:VectorDocument,a:Assertion&{type:'state'},count:number):VerificationResult{
 const sprite=(m.project.sprites??[]).find(s=>s.id===a.part.replace(/^#/,''));if(!sprite)throw Error(`Sprite ${a.part} not found (state assertions take a sprite id as part)`);
 if(!Object.hasOwn(sprite.variants,a.state))throw Error(`Sprite ${sprite.id} has no variant ${a.state} (${Object.keys(sprite.variants).join(', ')})`);
 const times=a.at!==undefined?[a.at]:sampleTimes(m.project.duration,count,a.during);let wrong=0,first:number|undefined;
 for(const t of times){const f=frameState(m.project,t);const op=(id:string)=>Number(f.attrs[id]?.opacity??m.index.get(id)?.getAttribute('opacity')??1);
  const ok=Object.entries(sprite.variants).every(([name,ids])=>ids.every(id=>name===a.state?op(id)>.5:op(id)<=.5||sprite.variants[a.state].includes(id)));if(!ok){wrong++;first??=t;}}
 return {assertion:a,status:wrong?'failed':'passed',measured:{samples:times.length,wrongSamples:wrong,...(first!==undefined?{firstWrongTime:first}:{})},times,...(wrong?{hint:`Key ${sprite.id} to ${a.state} with sprite.keyframe so it shows at those times.`}:{})};}
export type VerificationResult={assertion:Assertion;status:'passed'|'failed'|'not_evaluated';measured:Record<string,number>;times:number[];hint?:string};
export function verifyMotion(m:VectorDocument,assertions:Assertion[],resolve:(part:string)=>Target,count=61){
 const session=new SpatialSession(m);const results:VerificationResult[]=[];
 for(const assertion of assertions){try{
  if(assertion.type==='state'){results.push(spriteState(m,assertion,count));continue;}
  if(assertion.type==='matchesBaseline')throw Error('matchesBaseline requires the rendered motion.verify service');
  const resolved=resolve(assertion.part),times=sampleTimes(m.project.duration,count,assertion.during);
  let target=resolved;if(assertion.relativeTo){const r=resolve(assertion.relativeTo);if(r.ids.length!==1)throw Error('relativeTo must resolve to one SVG element');target={...resolved,relativeTo:r.ids[0]};}
  const samples=times.map(t=>session.sample(target,t)),stats=motionStats(samples);let pass=false,measured:Record<string,number>={},hint='';
  switch(assertion.type){
   case 'visible':throw Error('visible requires the rendered motion.verify service');
   case 'insideFrame':{const vb=(m.doc.documentElement.getAttribute('viewBox')??'0 0 700 700').split(/[\s,]+/).map(Number),r=assertion.safeArea??{x:vb[0],y:vb[1],width:vb[2],height:vb[3]};
    const outside=Math.max(0,...samples.flatMap(s=>[r.x-s.box.x0,r.y-s.box.y0,s.box.x1-r.x-r.width,s.box.y1-r.y-r.height]));measured={outside};pass=outside<=1e-7;hint='Fit geometry inside the safe area. Stroke, filter extent and occlusion require a rendered check.';break;}
   case 'overshoots':{const sign=assertion.direction==='positive'?1:-1,excess=Math.max(...samples.map(s=>sign*(s.center[assertion.axis]-assertion.goal)));measured={excess};pass=excess>=assertion.minDistance;hint='Add an extreme beyond the goal before settling.';break;}
   case 'settles':{if(assertion.by<times[0]||assertion.by>=times.at(-1)!)throw Error('settles.by must lie before the end and within during');
    const tail=[session.sample(target,assertion.by),...samples.filter(s=>s.time>assertion.by)],error=Math.max(...tail.map(s=>Math.abs(s.center[assertion.axis]-assertion.goal))),speed=motionStats(tail).maxSpeed;
    measured={error,maxSpeed:speed};pass=error<=assertion.tolerance&&speed<=assertion.maxSpeed;hint='Reduce late oscillations and keep the center within tolerance for the rest of the interval.';break;}
   case 'lags':{const d=resolve(assertion.driver),other=times.map(t=>session.sample(d,t)),value=(s:Sample)=>assertion.axis==='rotation'?s.rotation:s.center[assertion.axis];
    if(assertion.delay[0]>assertion.delay[1])throw Error('Lag delay range must be ordered');
    const lag=correlateLag(other.map(value),samples.map(value),times[1]-times[0]);measured=lag;pass=lag.delay>=assertion.delay[0]-1e-9&&lag.delay<=assertion.delay[1]+1e-9&&lag.correlation>=(assertion.minCorrelation??.8);hint='Adjust follower delay. Cross correlation is sampled, limited to a third of the interval and can be ambiguous on periodic signals.';break;}
   case 'before':{const frameOf=(e:Event)=>{const r=resolve(e.part);if(!e.relativeTo)return r;const f=resolve(e.relativeTo);if(f.ids.length!==1)throw Error('relativeTo must resolve to one SVG element');return {...r,relativeTo:f.ids[0]};};const sample=(e:Event)=>times.map(t=>session.sample(frameOf(e),t)),a=eventTime(sample(assertion.a),assertion.a),b=eventTime(sample(assertion.b),assertion.b);measured={a,b,gap:b-a};pass=b-a>=assertion.gap;hint='Shift the event timing; starts/stops are defined by center speed above the chosen threshold.';break;}
   case 'moves':{const a=samples[0].center,b=samples.at(-1)!.center,d=assertion.direction;
    const projectedDistance=d==='right'?b.x-a.x:d==='left'?a.x-b.x:d==='down'?b.y-a.y:a.y-b.y;
    measured={projectedDistance};pass=projectedDistance>=assertion.minDistance;hint='Adjust translation or timing over this interval; moves measures net displacement, not total travel.';break;}
   case 'still':measured={maxSpeed:stats.maxSpeed};pass=stats.maxSpeed<=assertion.maxSpeed;hint='Inspect the center trajectory and add a hold or reduce translation.';break;
   case 'energy':if(assertion.min===undefined&&assertion.max===undefined)throw Error('energy needs min or max');if((assertion.min??0)>(assertion.max??Infinity))throw Error('energy min exceeds max');
    measured={rmsSpeed:stats.rmsSpeed};pass=stats.rmsSpeed>=(assertion.min??0)&&stats.rmsSpeed<=(assertion.max??Infinity);hint='Adjust amplitude or timing. Energy here is RMS center speed in SVG units/second; rotation in place is excluded.';break;
   case 'arc':measured={curvature:stats.curvature,pathLength:stats.pathLength};pass=stats.pathLength>1e-8&&stats.curvature>=assertion.minCurvature;hint='Inspect trail and add intermediate x/y keys. Curvature is total heading change in radians; a reversal also changes heading.';break;
   case 'returnsToRest':{const a=session.sample(target,assertion.restTime??0),b=session.sample(target,assertion.at);
    const error=Math.max(...(['x0','y0','x1','y1'] as const).map(k=>Math.abs(a.box[k]-b.box[k])));measured={boundsError:error};pass=error<=assertion.tolerance;hint='Match geometric bounds to restTime. This does not test paint or identity.';break;}
   case 'loopSeamless':{if(!m.project.loop)throw Error('Scene is not configured as a loop');if(assertion.during)throw Error('loopSeamless uses the entire timeline; omit during');
    const a=samples[0],b=samples.at(-1)!,v0=stats.velocities[0],v1=stats.velocities.at(-1)!;
    const positionError=Math.max(...(['x0','y0','x1','y1'] as const).map(k=>Math.abs(a.box[k]-b.box[k]))),velocityError=Math.hypot(v1.x-v0.x,v1.y-v0.y);
    measured={positionError,velocityError};pass=positionError<=assertion.positionTolerance&&velocityError<=assertion.velocityTolerance;hint='Match start/end bounds and incoming/outgoing center velocity. Paint, path topology and in-place rotation require visual/identity checks.';break;}
  }
  results.push({assertion,status:pass?'passed':'failed',measured,times,...(!pass?{hint}:{})});
 }catch(e){results.push({assertion,status:'not_evaluated',measured:{},times:[],hint:String((e as Error).message)});}}
 return {passed:results.length>0&&results.every(r=>r.status==='passed'),results,failed:results.filter(r=>r.status!=='passed'),sampling:{count,method:'uniform including endpoints'},space:'world',measurement:'geometric bounds and center; not painted pixels or aesthetic approval'};
}
