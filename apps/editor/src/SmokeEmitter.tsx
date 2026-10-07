import React,{useState} from 'react';
import type {Operation,Project} from '../../../packages/core/model.js';
import type {SmokeEmitterConfig} from '../../../packages/core/smoke.js';
const defaults:SmokeEmitterConfig={id:'smoke-emitter',x:100,y:180,width:80,height:120,density:24,lifetime:4,diffusion:.75,turbulence:.5,wind:0,opacity:.28,color:'#ddd8e4',seed:17};
export const SmokeEmitterControls=React.memo(function SmokeEmitterControls({project,apply,busy}:{project:Project;apply:(ops:Operation[],label:string)=>Promise<unknown>;busy:boolean}){
 const existing=project.smokeEmitters?.[0];
 return <EmitterForm key={JSON.stringify(existing??null)} existing={existing} apply={apply} busy={busy}/>;
});
function EmitterForm({existing,apply,busy}:{existing?:SmokeEmitterConfig;apply:(ops:Operation[],label:string)=>Promise<unknown>;busy:boolean}){
 const [config,setConfig]=useState<SmokeEmitterConfig>(()=>({...defaults,...existing}));
 const set=(key:keyof SmokeEmitterConfig,value:number|string)=>setConfig(c=>({...c,[key]:value}));
 const fields=[['x','Origen X',-10000,10000,1],['y','Origen Y',-10000,10000,1],['height','Altura',1,1000,5],['width','Anchura',1,1000,5],['lifetime','Tiempo de subida (s)',.2,60,.2],['density','Densidad',4,48,1],['diffusion','Expansión',.1,2,.1],['turbulence','Turbulencia',0,2,.1],['wind','Viento',-2,2,.1],['opacity','Opacidad',0,1,.02]] as const;
 return <section aria-label="Emisor de humo"><h4>EMISOR DE HUMO</h4><p className="hint">Bocanadas que nacen, ascienden, se expanden y se disipan. El tiempo de subida se ajusta al loop de la escena.</p>
 <div className="fields">{fields.map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={config[key]??defaults[key]} onChange={e=>set(key,+e.target.value)} disabled={busy}/></label>)}</div>
 {config.palette?.map((color,i)=><label key={i}>Tono {i+1}<input aria-label={`Tono de humo ${i+1}`} type="color" value={color} disabled={busy} onChange={e=>setConfig(c=>({...c,palette:c.palette!.map((v,j)=>j===i?e.target.value:v)}))}/></label>)}
 <label>Color del humo<input aria-label="Color del humo" type="color" value={config.color} onChange={e=>setConfig(c=>({...c,color:e.target.value,palette:undefined}))}/></label>
 <button disabled={busy} onClick={()=>void apply([...(existing?[{type:'delete' as const,ids:[existing.id]}]:[]),{type:'fluid.add',config:{...config,kind:'smoke',mode:'emitter'}}],existing?'Ajustar emisor de humo':'Crear emisor de humo')}>{existing?'Aplicar humo':'Crear emisor de humo'}</button><p className="hint">Un cambio por acción; Deshacer recupera el anterior. El humo dibujado se conserva como una capa independiente.</p>
 </section>;
}
