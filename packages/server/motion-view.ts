import type {Sample} from '../core/space.js';
import {motionStats} from '../core/verify.js';
const esc=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[c]!);
/** Self-contained graph artifact. No artwork is copied or changed. */
export function motionView(series:Sample[],view:'trail'|'spacing'|'graph',label:string,channel?:{time:number;value:number;velocity:number}[],property?:string){
 const W=900,H=420,pad=50,stats=motionStats(series),first=series[0],last=series.at(-1)!;
 const time=(t:number)=>pad+(t-first.time)/(last.time-first.time)*(W-2*pad);
 let content='';const text=(x:number,y:number,s:string,color='#273449')=>`<text x="${x}" y="${y}" fill="${color}" font-family="sans-serif" font-size="14">${esc(s)}</text>`;
 if(view==='graph'&&channel){
  const plot=(field:'value'|'velocity',top:number,color:string)=>{const values=channel.map(s=>s[field]),lo=Math.min(...values),hi=Math.max(...values),span=Math.max(1e-9,hi-lo);return text(pad,top,`${property} ${field} · ${lo.toFixed(3)} … ${hi.toFixed(3)}`,color)+`<polyline points="${channel.map(s=>`${time(s.time)},${top+135-(s[field]-lo)/span*115}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;};
  content+=plot('value',55,'#226bbd')+plot('velocity',225,'#b24563');
 }else if(view==='trail'){
  const xs=series.map(s=>s.center.x),ys=series.map(s=>s.center.y),x0=Math.min(...xs),y0=Math.min(...ys),dx=Math.max(...xs)-x0,dy=Math.max(...ys)-y0;
  const k=Math.min((W-2*pad)/Math.max(dx,1),(H-2*pad)/Math.max(dy,1)),x=(v:number)=>(W-dx*k)/2+(v-x0)*k,y=(v:number)=>(H-dy*k)/2+(v-y0)*k;
  content+=`<polyline points="${series.map(s=>`${x(s.center.x)},${y(s.center.y)}`).join(' ')}" fill="none" stroke="#607eaa" stroke-width="2"/>`;
  for(const [i,s] of series.entries())content+=`<circle cx="${x(s.center.x)}" cy="${y(s.center.y)}" r="3" fill="hsl(${220-i/series.length*190},70%,45%)"/>`;
  content+=text(pad,H-15,`Start ${first.time.toFixed(2)} s → end ${last.time.toFixed(2)} s · SVG y increases downwards · travel ${stats.pathLength.toFixed(2)} units`);
 }else{
  const values=view==='spacing'?series.slice(1).map((s,i)=>Math.hypot(s.center.x-series[i].center.x,s.center.y-series[i].center.y)):stats.velocities.map(v=>Math.hypot(v.x,v.y));
  const max=Math.max(1e-9,...values);content+=`<path d="M${pad} ${pad}V${H-pad}H${W-pad}" fill="none" stroke="#9ba8ba"/>`;
  content+=`<polyline points="${values.map((v,i)=>`${time(series[i+1].time)},${H-pad-v/max*(H-2*pad)}`).join(' ')}" fill="none" stroke="#226bbd" stroke-width="2"/>`;
  content+=text(pad,H-15,`${view==='spacing'?'Distance per sample (SVG units)':'Center speed (SVG units/s)'} · max ${max.toFixed(3)} · ${first.time.toFixed(2)}–${last.time.toFixed(2)} s`);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f8fafc"/>${text(pad,25,`${label} · ${view} · ${channel&&view==='graph'?'local channel':'world-space center'}`)}${content}</svg>`;
}
