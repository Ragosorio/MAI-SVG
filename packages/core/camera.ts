// 2.5D camera (plan lane B, ADR-003 §A.9). The camera is the reserved target `@camera` (SVG ids cannot contain `@`)
// with tracks/signals on x, y (world point looked at), zoom and rotation. Rest = looking at the view center, zoom 1:
// the identity. Depth planes get parallax by a factor f (background 0.2 … foreground 1.35). The artwork never changes:
// the camera is a view transform applied around the scene in frame() and in the SMIL export.
import type {Project,Track,CameraConfig,CameraShot} from './model.js';
import {DEFAULT_LAYERS} from './model.js';
import {mixTracks} from './animation.js';
import {signalAt} from './procedural.js';
import type {Mat,Box} from './space.js';
import {mul} from './space.js';

export const CAMERA_TARGET='@camera';
export const CAMERA_PROPS=['x','y','zoom','rotation'] as const;
export type CameraState={x:number;y:number;zoom:number;rotation:number};
export const DEFAULT_PLANES:Record<string,number>={background:.2,midground:.55,subject:1,foreground:1.35};

export const center=(c:CameraConfig)=>({x:c.view.x+c.view.width/2,y:c.view.y+c.view.height/2});
export const cameraRest=(c:CameraConfig):CameraState=>({...center(c),zoom:1,rotation:0});

/** Evaluated camera state: `@camera` tracks mixed by layer over the rest state, then camera signals. */
export function cameraState(p:Project,t:number,params:Record<string,number>):CameraState|undefined{
 const c=p.camera;if(!c)return undefined;const rest=cameraRest(c),out={...rest};
 for(const prop of CAMERA_PROPS){const tracks=p.tracks.filter((tr:Track)=>tr.target===CAMERA_TARGET&&tr.property===prop);if(tracks.length)out[prop]=Number(mixTracks(p,tracks,t,rest[prop]));}
 const layers=p.layers??DEFAULT_LAYERS,solo=layers.some(l=>l.solo);
 for(const s of (p.signals??[]).filter(s=>s.output.target===CAMERA_TARGET)){const l=layers.find(x=>x.id===s.output.layer);if(!l||l.mute||(solo&&!l.solo))continue;const k=s.output.property as keyof CameraState;const v=signalAt(s,t,{duration:p.duration,loop:p.loop,params,signals:p.signals??[],project:p});
  out[k]=l.blend==='additive'?out[k]+l.weight*v.weight*v.value:out[k]+(v.value-out[k])*l.weight*v.weight;}
 out.zoom=Math.max(c.minZoom??.05,Math.min(c.maxZoom??50,out.zoom));return out;}

const T=(x:number,y:number):Mat=>[1,0,0,1,x,y],S=(k:number):Mat=>[k,0,0,k,0,0],R=(deg:number):Mat=>{const a=deg*Math.PI/180;return [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];};
/** World → screen for a plane with parallax factor f (f=1 is the subject plane). */
export function cameraMatrix(c:CameraConfig,s:CameraState,f=1):Mat{const o=center(c),z=Math.pow(s.zoom,f),px=o.x+f*(s.x-o.x),py=o.y+f*(s.y-o.y);return mul(mul(mul(T(o.x,o.y),R(-s.rotation)),S(z)),T(-px,-py));}
/** Relative transform for a depth plane nested in the main camera group: M⁻¹·M_f = T(P)·S(z^(f−1))·T(−P_f). */
export function planeRelative(c:CameraConfig,s:CameraState,f:number){const o=center(c);return {translate:{x:s.x,y:s.y},scale:Math.pow(s.zoom,f-1),back:{x:-(o.x+f*(s.x-o.x)),y:-(o.y+f*(s.y-o.y))}};}
export const matrixString=(m:Mat)=>`matrix(${m.map(v=>Number(v.toFixed(6))).join(' ')})`;
export function depthFactor(c:CameraConfig,id:string){const d=(c.depth??[]).find(x=>x.target===id);if(!d)return undefined;if(typeof d.factor==='number')return d.factor;const planes={...DEFAULT_PLANES,...Object.fromEntries((c.planes??[]).map(p=>[p.id,p.factor]))};return d.plane?planes[d.plane]:undefined;}

/** Wrap the scene (all but defs/metadata/title/desc/style) in the camera group, and depth targets in plane groups. */
export function applyCameraDom(doc:Document,c:CameraConfig,s:CameraState,byId:Map<string|null,Element>,NS='http://www.w3.org/2000/svg'){
 const root=doc.documentElement;const g=doc.createElementNS(NS,'g');g.setAttribute('id','mai-camera');g.setAttribute('data-mai-generated','camera');g.setAttribute('transform',matrixString(cameraMatrix(c,s)));
 for(const n of Array.from(root.childNodes)){if(n.nodeType===1&&['defs','metadata','title','desc','style'].includes((n as Element).localName))continue;g.appendChild(n);}root.appendChild(g);
 for(const d of c.depth??[]){const e=byId.get(d.target);const f=depthFactor(c,d.target);if(!e||f===undefined||f===1)continue;const r=planeRelative(c,s,f);const w=doc.createElementNS(NS,'g');w.setAttribute('data-mai-generated','parallax');
  w.setAttribute('transform',`translate(${r.translate.x} ${r.translate.y}) scale(${r.scale}) translate(${r.back.x} ${r.back.y})`);e.parentNode!.insertBefore(w,e);w.appendChild(e);}}

// ── Van Wijk & Nuij (2003): optimal simultaneous pan+zoom. Views are (cx, cy, w = visible width). ─────────────────
export function vanWijk(a:[number,number,number],b:[number,number,number],rho=Math.SQRT2){
 const [ux0,uy0,w0]=a,[ux1,uy1,w1]=b,dx=ux1-ux0,dy=uy1-uy0,d2=dx*dx+dy*dy,d1=Math.sqrt(d2),r2=rho*rho;
 if(d2<1e-12){const S=Math.log(w1/w0)/rho;return {S,at:(u:number):[number,number,number]=>[ux0+u*dx,uy0+u*dy,w0*Math.exp(rho*u*S)]};}
 const b0=(w1*w1-w0*w0+r2*r2*d2)/(2*w0*r2*d1),b1=(w1*w1-w0*w0-r2*r2*d2)/(2*w1*r2*d1),r0=Math.log(Math.sqrt(b0*b0+1)-b0),r1=Math.log(Math.sqrt(b1*b1+1)-b1),S=(r1-r0)/rho;
 return {S,at:(u:number):[number,number,number]=>{const s=u*S,coshr0=Math.cosh(r0),k=w0/(r2*d1)*(coshr0*Math.tanh(rho*s+r0)-Math.sinh(r0));return [ux0+k*dx,uy0+k*dy,w0*coshr0/Math.cosh(rho*s+r0)];}};}

/** Camera that frames a world box with padding (fraction of the view) — the box fits inside the view. */
export function fitView(c:CameraConfig,box:Box,padding=.1):CameraState{const bw=Math.max(1e-6,box.x1-box.x0),bh=Math.max(1e-6,box.y1-box.y0),k=1-2*padding;
 const zoom=Math.max(c.minZoom??.05,Math.min(c.maxZoom??50,Math.min(c.view.width*k/bw,c.view.height*k/bh)));return {x:(box.x0+box.x1)/2,y:(box.y0+box.y1)/2,zoom,rotation:0};}
const FRAMING={wide:{fill:.92},medium:{fill:.6},'close-up':{fill:.9},'extreme-close-up':{fill:1.4}} as const;
/** Framing presets: subject height as a fraction of the view (medium .6, close-up .9…). Never zooms past the limits. */
export function frameSubject(c:CameraConfig,box:Box,kind:keyof typeof FRAMING,offset?:{x:number;y:number}):CameraState{const fill=FRAMING[kind].fill,bh=Math.max(1e-6,box.y1-box.y0),bw=Math.max(1e-6,box.x1-box.x0);
 const zoom=Math.max(c.minZoom??.05,Math.min(c.maxZoom??50,Math.min(c.view.height*fill/bh,c.view.width*Math.min(fill,.95)/bw)));
 return {x:(box.x0+box.x1)/2-(offset?.x??0)*c.view.width/zoom,y:(box.y0+box.y1)/2-(offset?.y??0)*c.view.height/zoom,zoom,rotation:0};}

/** Wide framing: a full-bleed scene (covering the view) is framed by the view itself, never zoomed out into empty margins. */
export function wideView(c:CameraConfig,scene:Box):CameraState{const v=c.view,covers=scene.x0<=v.x+1e-6&&scene.y0<=v.y+1e-6&&scene.x1>=v.x+v.width-1e-6&&scene.y1>=v.y+v.height-1e-6;return covers?cameraRest(c):fitView(c,scene,.04);}
type Key={time:number;value:number;easing?:'linear'|'step';auto?:'auto';in?:{speed:number;influence:number};out?:{speed:number;influence:number}};
/** Compile a shot intent into camera keys (+ signals for handheld/impact). Pure; boxes are resolved by the caller. */
export function compileShot(c:CameraConfig,shot:CameraShot,ctx:{from:CameraState;subject?:Box;scene:Box;duration:number;follow?:{ids:string[];offset:{x:number;y:number}}}):{tracks:Partial<Record<keyof CameraState,Key[]>>;signals:import('./model.js').Signal[];notes:string[]}{
 const start=shot.start,dur=shot.duration??1.5,end=Math.min(ctx.duration,start+dur),i=shot.intensity??1,notes:string[]=[];const tracks:Partial<Record<keyof CameraState,Key[]>>={};const signals:import('./model.js').Signal[]=[];
 const target=(f:CameraShot['to']|undefined,fallback:CameraState):CameraState=>{if(!f)return fallback;if(f.box)return fitView(c,{x0:f.box.x,y0:f.box.y,x1:f.box.x+f.box.width,y1:f.box.y+f.box.height},.06);
  const box=ctx.subject??ctx.scene;const s=f.framing?f.framing==='wide'?wideView(c,ctx.scene):frameSubject(c,box,f.framing,f.offset):fallback;return {...s,zoom:f.zoom??s.zoom,rotation:f.rotation??s.rotation};};
 const r=(n:number)=>Number(n.toFixed(4));const handles=(m:CameraShot['motion'])=>m==='snappy'?{out:.15,in:.7}:m==='lazy'?{out:.7,in:.3}:m==='linear'?undefined:{out:.5,in:.5};
 const move=(a:CameraState,b:CameraState,s0=start,s1=end)=>{const start=s0,end=s1;const view=(s:CameraState):[number,number,number]=>[s.x,s.y,c.view.width/s.zoom];const vw=vanWijk(view(a),view(b));const n=Math.max(4,Math.min(24,Math.round(6*(end-start))+2)),h=handles(shot.motion);
  const ease=(u:number)=>h?u*u*(3-2*u):u;// eased progress along the optimal path; tangents keep it continuous
  for(const k of CAMERA_PROPS)tracks[k]=[];
  for(let j=0;j<n;j++){const u=j/(n-1),time=r(start+(end-start)*u),[x,y,w]=vw.at(ease(u)),rot=a.rotation+(b.rotation-a.rotation)*ease(u);const first=j===0,last=j===n-1;
   const kk=(v:number):Key=>({time,value:r(v),...(first&&h?{out:{speed:0,influence:h.out}}:last&&h?{in:{speed:0,influence:h.in}}:{auto:'auto' as const})});
   tracks.x!.push(kk(x));tracks.y!.push(kk(y));tracks.zoom!.push(kk(c.view.width/w));tracks.rotation!.push(kk(rot));}
  notes.push(`optimal pan+zoom path length ${vw.S.toFixed(2)} (suggested duration ≈ ${(vw.S*.9).toFixed(2)} s)`);};
 const from=target(shot.from,ctx.from);
 switch(shot.intent){
  case 'establish':{const w=wideView(c,ctx.scene);move({...w},{...w,zoom:w.zoom*(1+.05*i)});break;}
  case 'reveal':case 'push-in':case 'pull-out':case 'pan':{const def=shot.intent==='pull-out'?wideView(c,ctx.scene):shot.intent==='pan'?{...from,x:(ctx.subject?(ctx.subject.x0+ctx.subject.x1)/2:from.x)}:frameSubject(c,ctx.subject??ctx.scene,shot.intent==='reveal'?'medium':'close-up');move(from,target(shot.to,def));break;}
  case 'orbit-2d':{const th=8*i;move({...from,rotation:-th},{...target(shot.to,from),rotation:th});break;}
  case 'cut':{const to=target(shot.to,frameSubject(c,ctx.subject??ctx.scene,'close-up'));for(const k of CAMERA_PROPS)tracks[k]=[{time:r(Math.max(0,start-1e-3)),value:r(from[k]),easing:'step'},{time:r(start),value:r(to[k]),easing:'step'}];notes.push('cut: hold then jump (exports as an instant transition)');break;}
  case 'follow':{
   // Ease into a framing of the subject, then track it: x/y expression signals on the camera layer read the subject's
   // evaluated offset through smooth() (lag by feel), crossfading in over the ramp; the caller holds the last followed
   // position as the end key, so the camera stays where the subject took it.
   const to=target(shot.to,frameSubject(c,ctx.subject??ctx.scene,'medium')),ramp=r(Math.min(.8,(end-start)/3));move(from,to,start,r(start+ramp));
   for(const k of CAMERA_PROPS)tracks[k]!.push({time:r(end),value:r(to[k]),in:{speed:0,influence:.5}});
   const ids=ctx.follow?.ids.slice(0,16)??[];if(!ids.length){notes.push('follow: no subject ids; framed once without tracking');break;}
   const lag=shot.motion==='snappy'?.1:shot.motion==='lazy'?.5:shot.motion==='linear'?.02:.25,mean=(prop:'x'|'y')=>`(${ids.map(id=>`ref('${id}','${prop}')`).join(' + ')})/${ids.length}`;
   for(const k of ['x','y'] as const)signals.push({id:`${shot.id??'shot'}-follow-${k}`,label:`follow ${shot.subject??''} (${k})`,output:{target:CAMERA_TARGET,property:k,layer:'camera'},source:{kind:'expr',expr:`${r(to[k]-ctx.follow!.offset[k])} + smooth(${mean(k)}, ${lag})`},envelope:{start:r(start),end:r(end),fadeIn:ramp}});
   notes.push(`follow: tracks the mean offset of ${ids.join(', ')} with ${lag}s lag (subjects nested under moving groups follow their own offset only)`);break;}
  case 'handheld':for(const [k,amp] of [['x',.004*c.view.width*i],['y',.004*c.view.height*i],['rotation',.25*i]] as [string,number][])signals.push({id:`${shot.id??'shot'}-handheld-${k}`,output:{target:CAMERA_TARGET,property:k as 'x',layer:'camera-shake'},source:{kind:'noise',frequency:.8,amplitude:amp,octaves:2,seed:(k.charCodeAt(0)*31+Math.round(start*100))|0},envelope:{start,end,fadeIn:Math.min(.4,(end-start)/4),fadeOut:Math.min(.4,(end-start)/4)}});break;
  case 'impact':{for(const k of CAMERA_PROPS)tracks[k]=[];const z=from.zoom,t1=r(start),t2=r(Math.min(end,start+.08)),t3=r(Math.min(end,start+.45));tracks.zoom=[{time:t1,value:r(z),out:{speed:0,influence:.2}},{time:t2,value:r(z*(1+.06*i)),in:{speed:0,influence:.3},out:{speed:0,influence:.3}},{time:t3,value:r(z),in:{speed:0,influence:.6}}];delete tracks.x;delete tracks.y;delete tracks.rotation;
   for(const [k,amp] of [['x',.01*c.view.width*i],['y',.008*c.view.height*i]] as [string,number][])signals.push({id:`${shot.id??'shot'}-impact-${k}`,output:{target:CAMERA_TARGET,property:k as 'x',layer:'camera-shake'},source:{kind:'oscillator',wave:'sine',period:.07,amplitude:amp},envelope:{start,end:Math.min(ctx.duration,start+.45),decay:9}});break;}
 }
 return {tracks,signals,notes};}

/** Camera critique: subject outside the action-safe area, viewport speed, zoom rate/range, roll. Descriptive. */
export function cameraFindings(c:CameraConfig,states:{time:number;state:CameraState;subject?:Box}[]){
 const out:{code:string;severity:'info'|'warning';message:string;repair:string}[]=[];if(states.length<2)return out;const safe=c.safeArea?.action??.9;const vw=c.view.width;
 let outside=0;for(const s of states){if(!s.subject)continue;const m=cameraMatrix(c,s.state);const pts=[[s.subject.x0,s.subject.y0],[s.subject.x1,s.subject.y1]].map(([x,y])=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]}));
  const sx0=c.view.x+c.view.width*(1-safe)/2,sx1=c.view.x+c.view.width*(1+safe)/2,sy0=c.view.y+c.view.height*(1-safe)/2,sy1=c.view.y+c.view.height*(1+safe)/2;
  const ix=Math.max(0,Math.min(sx1,Math.max(pts[0].x,pts[1].x))-Math.max(sx0,Math.min(pts[0].x,pts[1].x))),iy=Math.max(0,Math.min(sy1,Math.max(pts[0].y,pts[1].y))-Math.max(sy0,Math.min(pts[0].y,pts[1].y))),area=Math.abs((pts[1].x-pts[0].x)*(pts[1].y-pts[0].y))||1;if(ix*iy/area<.85)outside++;}
 const dt=states[1].time-states[0].time;if(outside*dt>.25)out.push({code:'MAI_CAMERA_SUBJECT_OUTSIDE',severity:'warning',message:`El sujeto sale del área segura durante ~${(outside*dt).toFixed(2)} s.`,repair:'Reencuadra (camera.fit / camera.shot con framing) o reduce el zoom.'});
 let fast=0,zoomRate=0,roll=0;for(let i=1;i<states.length;i++){const a=states[i-1].state,b=states[i].state;const sp=Math.hypot(b.x-a.x,b.y-a.y)*b.zoom/vw/dt;if(sp>1.2&&Math.abs(b.zoom-a.zoom)<1e-6||sp>2.5)fast++;zoomRate=Math.max(zoomRate,Math.abs(Math.log(b.zoom/a.zoom))/dt);roll=Math.max(roll,Math.abs(b.rotation));}
 if(fast)out.push({code:'MAI_CAMERA_FAST',severity:'info',message:'La cámara barre más de 1,2 anchos de vista por segundo.',repair:'Alarga el movimiento o usa un corte (intent cut) si el salto es intencional.'});
 if(zoomRate>1)out.push({code:'MAI_CAMERA_ZOOM_RATE',severity:'info',message:`Zoom muy rápido (${zoomRate.toFixed(2)}/s en escala logarítmica).`,repair:'Usa van Wijk (camera.shot) o más duración.'});
 if(roll>20)out.push({code:'MAI_CAMERA_ROLL',severity:'info',message:`Roll de ${roll.toFixed(0)}°.`,repair:'Más de 20° desorienta salvo intención dramática.'});
 return out;}

/** Untrusted metadata/ops: view, zoom limits, planes and depth targets (top-level planes only: no nesting). */
export function validateCamera(p:Project,exists:(id:string)=>boolean,contains:(outer:string,inner:string)=>boolean){const c=p.camera;if(!c)return;
 const fin=(v:unknown,lo:number,hi:number,what:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error(`Camera ${what} must be within ${lo}–${hi}`);};
 if(!c.view)throw Error('Camera needs a view');fin(c.view.x,-1e6,1e6,'view.x');fin(c.view.y,-1e6,1e6,'view.y');fin(c.view.width,1,1e5,'view.width');fin(c.view.height,1,1e5,'view.height');
 if(c.safeArea){fin(c.safeArea.action,.1,1,'safeArea.action');fin(c.safeArea.title,.1,1,'safeArea.title');}
 if(c.minZoom!==undefined)fin(c.minZoom,.01,100,'minZoom');if(c.maxZoom!==undefined)fin(c.maxZoom,.01,100,'maxZoom');if((c.minZoom??.05)>(c.maxZoom??50))throw Error('Camera minZoom must be ≤ maxZoom');
 for(const pl of c.planes??[]){if(!/^[A-Za-z_][\w-]{0,40}$/.test(pl.id))throw Error('Invalid camera plane id');fin(pl.factor,0,3,`plane ${pl.id} factor`);}
 const planes=new Set([...Object.keys(DEFAULT_PLANES),...(c.planes??[]).map(x=>x.id)]);const targets=(c.depth??[]).map(d=>d.target);if(targets.length>256)throw Error('At most 256 depth targets');
 for(const d of c.depth??[]){if(!exists(d.target))throw Error(`Camera depth target ${d.target} not found`);if(d.factor!==undefined)fin(d.factor,0,3,`depth ${d.target} factor`);else if(!d.plane||!planes.has(d.plane))throw Error(`Camera depth ${d.target}: plane must be one of ${[...planes].join(', ')}`);}
 for(const a of targets)for(const b of targets)if(a!==b&&contains(a,b))throw Error(`Depth targets cannot be nested (${b} is inside ${a})`);}
