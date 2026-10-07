import React,{useEffect,useState} from 'react';
import {regionBounds} from '../../../packages/core/warp.js';
import {FLUID_PRESETS} from '../../../packages/core/modifiers.js';
import type {Operation,Project} from '../../../packages/core/model.js';

// Review candidates on the visible geometry. Never change defs, masks or shared reference artwork.
export const ColorCleanup=React.memo(function ColorCleanup({scene,selected,project,revision,onSelect,apply,busy}:{scene:React.RefObject<HTMLDivElement|null>;selected:string[];project:Project;revision:number;onSelect:(ids:string[])=>void;apply:(ops:Operation[],label:string)=>Promise<unknown>;busy:boolean}){
 const [tolerance,setTolerance]=useState(12),[scope,setScope]=useState<'selection'|'drawing'>('selection'),[candidates,setCandidates]=useState<string[]>([]),[chosen,setChosen]=useState<string[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{setCandidates([]);setChosen([]);},[revision]);
 useEffect(()=>{const root=scene.current;if(!root)return;const marked:SVGElement[]=[];
  for(const id of chosen){const el=root.querySelector<SVGElement>('#'+CSS.escape(id));if(el){el.setAttribute('data-mai-cleanup-preview','true');marked.push(el);}}
  return()=>{for(const el of marked)el.removeAttribute('data-mai-cleanup-preview');};
 },[chosen,scene,revision]);
 function find(){const root=scene.current;if(!root)return;
  const scopes=scope==='selection'?selected.map(id=>root.querySelector('#'+CSS.escape(id))).filter((e):e is Element=>!!e):[root];
  if(!scopes.length){setMessage('Selecciona una región o un grupo primero.');setCandidates([]);setChosen([]);return;}
  const protectedTargets=[...project.identity?.ids??[],...(project.semantic?.nodes??[]).filter(n=>(n.protection??[]).some(p=>p!=='free')).flatMap(n=>n.targets)];
  const protectedEls=protectedTargets.map(id=>root.querySelector('#'+CSS.escape(id))).filter(Boolean);
  const svg=root.querySelector('svg'),matrix=svg?.getScreenCTM();
  const regions=(project.semantic?.nodes??[]).filter(n=>n.region&&(n.protection??[]).some(p=>p!=='free')).map(n=>{const b=regionBounds(n.region!);const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix??new DOMMatrix()));return {x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};});
  let skipped=0;const ids:string[]=[];
  for(const el of root.querySelectorAll<SVGGraphicsElement>('path[id],rect[id],circle[id],ellipse[id],polygon[id]')){
   if(el.closest('defs,mask,clipPath,symbol,metadata')||!scopes.some(s=>s===el||s.contains(el)))continue;
   const style=getComputedStyle(el),rgb=/^rgba?\(([^)]+)\)$/.exec(style.fill)?.[1].split(/[\s,\/]+/).map(Number);
   if(!rgb||rgb.length<3||rgb.slice(0,3).some(c=>!Number.isFinite(c)||255-c>tolerance)||Number(style.fillOpacity)<=0||Number(style.opacity)<=0||style.display==='none'||style.visibility==='hidden')continue;
   const box=el.getBoundingClientRect();
   if((rgb.length===4&&rgb[3]<=0)||!box.width||!box.height)continue;
   if(el.closest('[data-mai-locked="true"]')||protectedEls.some(p=>p===el||p!.contains(el))||regions.some(r=>box.right>=r.x&&box.left<=r.right&&box.bottom>=r.y&&box.top<=r.bottom)){skipped++;continue;}
   ids.push(el.id);
  }
  setCandidates(ids.slice(0,500));setChosen([]);setMessage(`${ids.length} candidatas · ${skipped} protegidas excluidas${ids.length>500?' · se muestran 500; reduce la región':''}`);
 }
 return <section aria-label="Limpieza por color"><h4>LIMPIEZA POR COLOR</h4><p className="hint">Busca blancos y revisa los brillos antes de quitarlos. Usa Selección por región para acotar la zona.</p>
 <label>Buscar en<select aria-label="Ámbito de limpieza" value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setCandidates([]);setChosen([]);}}><option value="selection">Selección actual</option><option value="drawing">Todo el dibujo</option></select></label>
 <label>Tolerancia del blanco<input aria-label="Tolerancia del blanco" type="range" min="0" max="60" value={tolerance} onChange={e=>{setTolerance(+e.target.value);setCandidates([]);setChosen([]);}}/>{tolerance}/255</label>
 <button disabled={busy} onClick={find}>Buscar blancos</button><p role="status">{message}</p>
 {candidates.length>0&&<><button onClick={()=>setChosen(chosen.length===candidates.length?[]:candidates)}>Marcar / desmarcar candidatas</button><div style={{maxHeight:160,overflow:'auto'}}>{candidates.map(id=><label key={id}><input type="checkbox" aria-label={`Revisar ${id}`} checked={chosen.includes(id)} onChange={e=>setChosen(prev=>e.target.checked?[...prev,id]:prev.filter(x=>x!==id))}/>{id}</label>)}</div>
 <div className="button-grid"><button disabled={!chosen.length} onClick={()=>onSelect(chosen)}>Seleccionar marcadas</button><button disabled={busy||!chosen.length} onClick={async()=>{const v=await apply([{type:'delete',ids:chosen}],'Quitar blancos revisados');if(v){setCandidates([]);setChosen([]);onSelect([]);setMessage('Formas retiradas. Deshacer restaura la limpieza.');}}}>Quitar marcadas ({chosen.length})</button></div><p className="hint">Las marcadas se resaltan en magenta. Las protecciones siguen activas.</p></>}
 </section>;
});


export const FlowControls=React.memo(function FlowControls({project,revision,apply,busy}:{project:Project;revision:number;apply:(ops:Operation[],label:string)=>Promise<unknown>;busy:boolean}){
 const flows=(project.modifiers??[]).filter(m=>m.kind==='flow'&&m.enabled&&m.technique!=='filter');
 if(!flows.length)return null;
 return <section aria-label="Movimiento de fluidos"><h4>MOVIMIENTO DE FLUIDOS</h4>{flows.map(m=><div key={m.id}><strong>{m.id}</strong><p className="hint">Anima la forma original. Ajusta subida y remolinos y revisa la reproducción.</p>
 <button disabled={busy} onClick={()=>void apply([{type:'modifier.update',id:m.id,direction:FLUID_PRESETS.smoke.direction,params:{...FLUID_PRESETS.smoke.params,speedFactor:m.params.speedFactor??1}}],'Humo ascendente')}>Humo ascendente</button>
 <div className="fields">{([['speedFactor','Velocidad',0.1,3,.1],['lift','Subida',0,3,.1],['swirl','Remolinos',0,2,.1],['wave','Ondulación lateral',0,2,.1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={`${label} ${m.id}`} type="number" min={min} max={max} step={step} disabled={busy} key={key+revision} defaultValue={m.params[key]??(key==='speedFactor'?1:0)} onBlur={e=>{const value=+e.target.value;if(Number.isFinite(value)&&value>=min&&value<=max&&value!==(m.params[key]??(key==='speedFactor'?1:0)))void apply([{type:'modifier.update',id:m.id,params:{[key]:value}}],`Fluido: ${label}`);}}/></label>)}</div></div>)}</section>;
});
