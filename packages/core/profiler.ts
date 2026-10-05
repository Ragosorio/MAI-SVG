import type {VectorDocument} from './document.js';
import {elements,serialize} from '../converter/svg.js';
import {frameState} from './animation.js';
import {pathBoxes} from './semantic.js';
// Cost model for "why is this slow?": counts plus a weighted estimate per top-level region, and a measured
// evaluation time of the animation engine. Browser paint time is not measured here (see mai preview timings).
export function profile(model:VectorDocument){
 const p=model.project,all=elements(model.doc),boxes=pathBoxes(model);let points=0;for(const b of boxes.values())points+=b.n;
 const count=(tag:string)=>all.filter(e=>e.localName===tag).length;const filters=all.filter(e=>e.localName==='filter'),primitives=filters.reduce((n,f)=>n+elements(f).filter(e=>e.localName.startsWith('fe')).length,0);
 const animatedPaths=new Set([...p.tracks.filter(t=>t.property==='d').map(t=>t.target),...(p.expression?.features??[]).flatMap(f=>f.paths),...(p.modifiers??[]).filter(m=>m.enabled&&m.technique!=='filter').flatMap(m=>m.targets),...p.skins.map(s=>s.target)]);
 const animatedPoints=[...animatedPaths].reduce((n,id)=>n+(boxes.get(id)?.n??0),0);
 const start=performance.now();const samples=5;for(let i=0;i<samples;i++)frameState(p,p.duration*i/samples);const evalMs=(performance.now()-start)/samples;
 const regions=[...model.doc.documentElement.childNodes].filter(n=>n.nodeType===1).map(n=>n as Element).filter(e=>!['defs','metadata','title','style'].includes(e.localName)).flatMap(e=>e.localName==='g'&&elements(e).filter(x=>x.parentNode===e&&x.localName==='g').length>1?elements(e).filter(x=>x.parentNode===e):[e]).map(e=>{const paths=[e,...elements(e)].filter(x=>x.localName==='path');const pts=paths.reduce((n,x)=>n+(boxes.get(x.getAttribute('id')??'')?.n??0),0);const masked=[e,...elements(e)].filter(x=>x.getAttribute('mask')||x.getAttribute('clip-path')).length;const filtered=[e,...elements(e)].filter(x=>x.getAttribute('filter')).length;const anim=paths.filter(x=>animatedPaths.has(x.getAttribute('id')??'')).length;return {id:e.getAttribute('id')??e.localName,name:e.getAttribute('data-mai-name')??undefined,paths:paths.length,points:pts,masks:masked,filters:filtered,animatedPaths:anim,cost:Math.round(paths.length+pts*.05+masked*300+filtered*800+anim*20)};}).sort((a,b)=>b.cost-a.cost).slice(0,12);
 const bytes=Buffer.byteLength(serialize(model.doc));const reasons:string[]=[];
 if(boxes.size>20000)reasons.push(`${boxes.size} trazos: el navegador pinta cada uno; perfil web/game los reduce.`);
 if(animatedPoints>50000)reasons.push(`${animatedPoints} puntos se recalculan por fotograma (expresiones/modificadores/morph): usa técnica filter o menos muestras.`);
 if(primitives>8)reasons.push(`${primitives} primitivas de filtro: cada una repinta su región por fotograma.`);
 if(count('mask')>4)reasons.push(`${count('mask')} máscaras: composición extra por fotograma.`);
 if(evalMs>16)reasons.push(`El motor de animación tarda ${evalMs.toFixed(1)} ms por fotograma (>16 ms rompe 60 fps en el editor).`);
 return {schemaVersion:1,revision:p.revision,counts:{elements:all.length,paths:boxes.size,points,masks:count('mask'),clipPaths:count('clipPath'),filters:filters.length,filterPrimitives:primitives,gradients:count('linearGradient')+count('radialGradient'),uses:count('use'),tracks:p.tracks.length,animatedPaths:animatedPaths.size,animatedPoints,modifiers:(p.modifiers??[]).length,expressionFeatures:(p.expression?.features??[]).length},bytes,engine:{frameEvalMs:Number(evalMs.toFixed(2)),estimatedEditorFps:Math.min(60,Math.round(1000/Math.max(1,evalMs)))},hotspots:regions,reasons,note:'Coste estimado (no es tiempo de pintado medido). Mide con mai preview --times y DevTools para cifras reales.'};
}
