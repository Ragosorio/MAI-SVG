import {segments,pathData,type Point} from './geometry.js';
import type {Modifier,ModifierKind,FluidPreset} from './model.js';
// Procedural, loop-exact modifiers over real geometry. Time terms always use integer cycles over the duration,
// so frame 0 and frame `duration` are identical and exports never seam.
export const rng=(seed:number)=>{let a=seed>>>0||1;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};};
type Bounds={x:number;y:number;width:number;height:number};
export function pathsBounds(ds:string[]):Bounds{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const d of ds)for(const s of segments(d))for(const p of s.points){if(p.x<x0)x0=p.x;if(p.y<y0)y0=p.y;if(p.x>x1)x1=p.x;if(p.y>y1)y1=p.y;}if(!Number.isFinite(x0))return {x:0,y:0,width:0,height:0};return {x:x0,y:y0,width:x1-x0,height:y1-y0};}
// What a preset means for an EXISTING asset: it parameterizes the flow field, it never adds template geometry.
export const FLUID_PRESETS:Record<FluidPreset,{direction:Point;params:Record<string,number>;describe:string}>={
 smoke:{direction:{x:0,y:-1},params:{amplitude:.05,scale:.35,speed:.22,swirl:1,wave:.5,waveLength:.5,anchorRadius:.18,growth:1,cycles:1,flicker:0},describe:'Asciende y se enrosca; casi inmóvil en el emisor, más libre arriba.'},
 steam:{direction:{x:0,y:-1},params:{amplitude:.035,scale:.25,speed:.4,swirl:.8,wave:.6,waveLength:.4,anchorRadius:.12,growth:1.2,cycles:2,flicker:0},describe:'Vapor rápido y fino.'},
 fog:{direction:{x:1,y:0},params:{amplitude:.03,scale:.6,speed:.08,swirl:.6,wave:.2,waveLength:.8,anchorRadius:0,growth:0,cycles:1,flicker:0},describe:'Deriva lenta y amplia, sin emisor.'},
 cloud:{direction:{x:1,y:0},params:{amplitude:.02,scale:.7,speed:.05,swirl:.7,wave:.1,waveLength:.9,anchorRadius:0,growth:0,cycles:1,flicker:0},describe:'Ondulación muy lenta del contorno.'},
 water:{direction:{x:1,y:0},params:{amplitude:.025,scale:.3,speed:.18,swirl:.3,wave:1,waveLength:.35,anchorRadius:0,growth:0,cycles:2,flicker:0},describe:'Ondas que viajan conservando la forma.'},
 wave:{direction:{x:1,y:0},params:{amplitude:.05,scale:.4,speed:.25,swirl:.1,wave:1.4,waveLength:.5,anchorRadius:0,growth:0,cycles:2,flicker:0},describe:'Ola marcada y regular.'},
 river:{direction:{x:1,y:0},params:{amplitude:.02,scale:.25,speed:.35,swirl:.5,wave:.8,waveLength:.25,anchorRadius:0,growth:0,cycles:3,flicker:0},describe:'Corriente rápida con remolinos pequeños.'},
 rain:{direction:{x:0,y:1},params:{amplitude:.02,scale:.15,speed:.8,swirl:.1,wave:.3,waveLength:.2,anchorRadius:0,growth:0,cycles:4,flicker:.3},describe:'Vibración descendente.'},
 wind:{direction:{x:1,y:0},params:{amplitude:.06,scale:.5,speed:.3,swirl:.2,wave:1.2,waveLength:.6,anchorRadius:.15,growth:1.5,cycles:2,flicker:0},describe:'Ráfagas que empujan lejos del anclaje.'},
 fire:{direction:{x:0,y:-1},params:{amplitude:.07,scale:.2,speed:.6,swirl:1.2,wave:.8,waveLength:.3,anchorRadius:.12,growth:1.4,cycles:4,flicker:.4},describe:'Lenguas rápidas con parpadeo; base anclada.'},
 lava:{direction:{x:1,y:0},params:{amplitude:.03,scale:.5,speed:.06,swirl:.8,wave:.4,waveLength:.7,anchorRadius:0,growth:0,cycles:1,flicker:0},describe:'Viscosa: grande, lenta y densa.'},
 magic:{direction:{x:0,y:-1},params:{amplitude:.05,scale:.3,speed:.3,swirl:1.6,wave:.3,waveLength:.4,anchorRadius:.1,growth:.8,cycles:2,flicker:.2},describe:'Espiral alrededor del emisor.'},
 electricity:{direction:{x:1,y:0},params:{amplitude:.04,scale:.08,speed:1,swirl:.2,wave:.2,waveLength:.1,anchorRadius:0,growth:0,cycles:12,flicker:1},describe:'Temblor de alta frecuencia por pasos.'},
 dust:{direction:{x:1,y:-.3},params:{amplitude:.03,scale:.2,speed:.2,swirl:.9,wave:.1,waveLength:.3,anchorRadius:0,growth:0,cycles:2,flicker:.1},describe:'Deriva con remolinos suaves.'},
 snow:{direction:{x:.2,y:1},params:{amplitude:.03,scale:.25,speed:.15,swirl:.6,wave:.2,waveLength:.3,anchorRadius:0,growth:0,cycles:2,flicker:0},describe:'Caída lenta con vaivén.'},
 cloth:{direction:{x:1,y:0},params:{amplitude:.04,scale:.5,speed:.15,swirl:.1,wave:1,waveLength:.8,anchorRadius:.2,growth:1.2,cycles:1,flicker:0},describe:'Ondas grandes desde el borde sujeto.'},
 hair:{direction:{x:0,y:1},params:{amplitude:.04,scale:.4,speed:.12,swirl:.2,wave:.9,waveLength:.7,anchorRadius:.15,growth:2,cycles:1,flicker:0},describe:'Mechones que se mueven más en las puntas.'},
 grass:{direction:{x:0,y:-1},params:{amplitude:.05,scale:.4,speed:.15,swirl:.1,wave:1,waveLength:1,anchorRadius:.1,growth:2,cycles:1,flicker:0},describe:'Balanceo desde la raíz.'},
};
type Field={fn:(p:Point,t:number)=>Point;fractional?:boolean;blend?:number};
// Divergence-free (curl) noise from a periodic scalar potential plus a traveling transverse wave.
export function flowField(m:Modifier,duration:number,loop=true):Field{
 const b=m.bounds??{x:0,y:0,width:100,height:100},extent=Math.max(b.width,b.height,1),P=m.params,rand=rng(P.seed??7);
 const dirRaw=m.direction??{x:0,y:-1},dl=Math.hypot(dirRaw.x,dirRaw.y)||1,dir={x:dirRaw.x/dl,y:dirRaw.y/dl},nor={x:-dir.y,y:dir.x};
 // speedFactor scales time exactly (no rounding); integer base frequencies keep speedFactor=1 seamless.
 const amplitude=(P.amplitude??.05)*extent,scale=Math.max(1,(P.scale??.35)*extent),speed=(P.speed??.2)*extent,sf=P.speedFactor??1,cycles=Math.max(1,Math.round(P.cycles??1));
 const anchor=m.anchor??{x:b.x+b.width/2,y:b.y+b.height},anchorR=(P.anchorRadius??0)*extent,growth=P.growth??0,swirl=P.swirl??1,waveAmt=P.wave??0,waveLength=Math.max(1,(P.waveLength??.5)*extent),flicker=P.flicker??0;
 const comps=Array.from({length:6},(_,i)=>{const a=rand()*Math.PI*2,k=(2*Math.PI/scale)*(.6+rand()*1.1),kx=k*Math.cos(a),ky=k*Math.sin(a),along=kx*dir.x+ky*dir.y;
  // Integer temporal cycles keep the field periodic: the pattern travels approx. `speed` along `dir`.
  const c=Math.max(cycles,Math.round(Math.abs(along)*speed*duration/(2*Math.PI)))*Math.sign(along||1);return {kx,ky,c,phase:rand()*Math.PI*2,amp:1/(1+i*.35)};});
 const norm=comps.reduce((s,c)=>s+c.amp*Math.hypot(c.kx,c.ky),0)||1;const waveC=Math.max(cycles,Math.round(speed*duration/waveLength));
 const raw=(p:Point,t:number):Point=>{const T=duration>0?t*sf/duration:0;let vx=0,vy=0;
  for(const c of comps){const arg=c.kx*p.x+c.ky*p.y-2*Math.PI*c.c*T+c.phase,g=Math.cos(arg)*c.amp;vx+=g*c.ky;vy+=-g*c.kx;}
  vx/=norm;vy/=norm;const s=(p.x-anchor.x)*dir.x+(p.y-anchor.y)*dir.y,dist=Math.hypot(p.x-anchor.x,p.y-anchor.y);
  const fall=anchorR>0?smooth(Math.min(1,dist/anchorR)):1,grow=growth>0?Math.pow(Math.max(0,Math.min(1,s/extent)),.5)*growth+(1-Math.min(1,growth)):1;
  const wave=Math.sin(2*Math.PI*(s/waveLength-waveC*T))*waveAmt;let k=amplitude*fall*grow;
  if(flicker>0){const steps=Math.max(2,cycles*8),q=Math.floor(T*steps)%steps;k*=1+flicker*.5*Math.sin(q*2.39996+(P.seed??7));}
  return {x:k*(swirl*vx+wave*nor.x),y:k*(swirl*vy+wave*nor.y)};};
 // Loop policy "crossfade": when speedFactor makes cycles fractional, blend F(t) toward F(t−D) over the last
 // `loopBlend` of the timeline (smoothstep weights): position and velocity match at the seam.
 const blend=Math.max(.02,Math.min(.5,P.loopBlend??.2)),fractional=loop&&Math.abs(sf-Math.round(sf))>1e-9;
 const fn=(p:Point,t:number):Point=>{const a=raw(p,t);if(!fractional||duration<=0)return a;const u=(t/duration-(1-blend))/blend;if(u<=0)return a;const w=smooth(Math.min(1,u)),b=raw(p,t-duration);return {x:a.x+w*(b.x-a.x),y:a.y+w*(b.y-a.y)};};
 return {fn,fractional,blend};
}
const smooth=(x:number)=>x*x*(3-2*x);
function mapPath(d:string,f:(p:Point)=>Point){const data=segments(d);for(const s of data)s.points=s.points.map(f);return pathData(data);}
export function applyModifier(m:Modifier,d:string,time:number,duration:number,field?:Field):string{
 const P=m.params,b=m.bounds??{x:0,y:0,width:100,height:100},center={x:b.x+b.width/2,y:b.y+b.height/2},T=duration>0?time/duration:0,cycles=Math.max(1,Math.round(P.cycles??1));
 const dir=m.direction??{x:1,y:0},dl=Math.hypot(dir.x,dir.y)||1,u={x:dir.x/dl,y:dir.y/dl},n={x:-u.y,y:u.x},anchor=m.anchor??center,len=Math.max(1,Math.max(b.width,b.height));
 const along=(p:Point)=>(p.x-anchor.x)*u.x+(p.y-anchor.y)*u.y;
 switch(m.kind){
  case 'flow':{const F=field??flowField(m,duration);return mapPath(d,p=>{const v=F.fn(p,time);return {x:p.x+v.x,y:p.y+v.y};});}
  case 'wave':{const A=P.amplitude??6,L=Math.max(1,P.waveLength??60);return mapPath(d,p=>{const s=along(p),w=A*Math.sin(2*Math.PI*(s/L-cycles*T))*Math.min(1,Math.max(0,s)/(P.ramp??1e-9)||1);return {x:p.x+n.x*w,y:p.y+n.y*w};});}
  case 'bend':{const angle=(P.angle??20)*Math.PI/180*(P.oscillate?Math.sin(2*Math.PI*cycles*T):1);return mapPath(d,p=>{const s=Math.max(0,along(p)),a=angle*Math.pow(s/len,P.falloff??1),c=Math.cos(a),si=Math.sin(a),x=p.x-anchor.x,y=p.y-anchor.y;return {x:anchor.x+x*c-y*si,y:anchor.y+x*si+y*c};});}
  case 'twist':{const angle=(P.angle??30)*Math.PI/180*(P.oscillate?Math.sin(2*Math.PI*cycles*T):1);return mapPath(d,p=>{const r=Math.hypot(p.x-center.x,p.y-center.y),a=angle*Math.max(0,1-r/(len/2)),c=Math.cos(a),s=Math.sin(a),x=p.x-center.x,y=p.y-center.y;return {x:center.x+x*c-y*s,y:center.y+x*s+y*c};});}
  case 'inflate':{const k=(P.amount??.1)*(P.oscillate?(.5+.5*Math.sin(2*Math.PI*cycles*T)):1);return mapPath(d,p=>{const x=p.x-center.x,y=p.y-center.y,r=Math.hypot(x,y)/(len/2),f=1+k*Math.max(0,1-r*r);return {x:center.x+x*f,y:center.y+y*f};});}
  case 'taper':{const k=P.amount??.5;return mapPath(d,p=>{const s=Math.max(0,Math.min(1,along(p)/len)),f=1-k*s,o=(p.x-anchor.x)*n.x+(p.y-anchor.y)*n.y;return {x:p.x-n.x*o*(1-f),y:p.y-n.y*o*(1-f)};});}
  case 'noise':case 'jitter':{const A=P.amplitude??2,steps=m.kind==='jitter'?Math.max(1,Math.round(P.steps??12)):0,q=steps?Math.floor(T*steps)%steps:0,phase=steps?q*1.618:2*Math.PI*cycles*T,f=2*Math.PI/Math.max(1,P.scale??40),seed=P.seed??3;
   return mapPath(d,p=>({x:p.x+A*Math.sin(p.y*f+phase+seed)*Math.cos(p.x*f*.7+seed),y:p.y+A*Math.cos(p.x*f+phase*1.3+seed*2)*Math.sin(p.y*f*.8)}));}
  case 'smooth':{const k=Math.max(0,Math.min(1,P.amount??.5)),data=segments(d);const anchors=data.map(s=>s.points.at(-1));for(let i=1;i<data.length-1;i++){const a=anchors[i-1],b=anchors[i+1],c=anchors[i];if(!a||!b||!c||data[i].kind==='Z')continue;const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},dx=(mid.x-c.x)*k*.5,dy=(mid.y-c.y)*k*.5;const last=data[i].points.length-1;data[i].points[last]={x:c.x+dx,y:c.y+dy};if(data[i].kind==='C'){data[i].points[1].x+=dx;data[i].points[1].y+=dy;}if(data[i+1]?.kind==='C'){data[i+1].points[0].x+=dx;data[i+1].points[0].y+=dy;}}return pathData(data);}
 }
 return d;
}
export const MODIFIER_KINDS:ModifierKind[]=['flow','wave','bend','noise','jitter','twist','inflate','taper','smooth'];
// Filter technique for `flow`: stitched turbulence tile scrolled along the flow, faded near the anchor with a
// point-light gradient, displacing the original rendering. No raster, no script, no feImage.
export function flowFilter(m:Modifier,id:string,duration:number){
 const b=m.bounds??{x:0,y:0,width:100,height:100},extent=Math.max(b.width,b.height,1),P=m.params,tile=Math.max(16,Math.round((P.scale??.35)*extent)),margin=tile+Math.round((P.amplitude??.05)*extent*2);
 const dir=m.direction??{x:0,y:-1},anchor=m.anchor??{x:b.x+b.width/2,y:b.y+b.height},h=Math.max(1,(P.anchorRadius??.15)*extent),scale=Number(((P.amplitude??.05)*extent*2.5).toFixed(2)),freq=Number((1/tile*2).toFixed(5));
 const fx=Math.round(b.x-margin),fy=Math.round(b.y-margin),fw=Math.round(b.width+margin*2),fh=Math.round(b.height+margin*2);
 const xml=`<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${fx}" y="${fy}" width="${fw}" height="${fh}" color-interpolation-filters="sRGB" data-mai-modifier="${m.id}"><feTurbulence id="${id}-noise" type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${Math.round(P.seed??7)}" stitchTiles="stitch" x="${fx}" y="${fy}" width="${tile}" height="${tile}" result="noise"/><feComponentTransfer in="noise" x="${fx}" y="${fy}" width="${tile}" height="${tile}" result="tile"><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer><feTile in="tile" result="tiled"/><feOffset id="${id}-scroll" in="tiled" dx="0" dy="0" result="flowTiled"/><feFlood flood-color="#000" flood-opacity="1" result="flat"/><feDiffuseLighting in="flat" lighting-color="#fff" diffuseConstant="1" surfaceScale="0" result="light"><fePointLight x="${anchor.x}" y="${anchor.y}" z="${h}"/></feDiffuseLighting><feComponentTransfer in="light" result="weight"><feFuncR type="linear" slope="-1" intercept="1"/><feFuncG type="linear" slope="-1" intercept="1"/><feFuncB type="linear" slope="-1" intercept="1"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer><feComposite in="weight" in2="flowTiled" operator="arithmetic" k1="1" k2="-0.5" k3="0" k4="0.5" result="map"/><feDisplacementMap id="${id}-map" in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
 const travel={x:Math.round((dir.x||0)*Math.max(1,Math.round(P.cycles??1)))*tile,y:Math.round((dir.y||0)*Math.max(1,Math.round(P.cycles??1)))*tile};
 // Sawtooth scroll: wrapping by one tile is invisible because the stitched tile is periodic.
 const at=(t:number)=>{const T=duration>0?t/duration:0,mod=(v:number)=>((v%tile)+tile)%tile;return {dx:Number(mod(travel.x*T).toFixed(3)),dy:Number(mod(travel.y*T).toFixed(3))};};
 return {xml,tile,travel,at,scale};
}
