import type {VectorDocument} from './document.js';
import {elements,assertSvg} from '../converter/svg.js';
import {segments,topology} from './geometry.js';
import {pathBoxes} from './semantic.js';
import {featureDisplacements,PRESERVATION} from './expression.js';
import {featureHandles} from './expression.js';
import {foldReport} from './warp.js';
import {PROFILES} from './profiles.js';
// Deterministic detectors: problems that never need an LLM. Severity: error (broken), warning (risk), info (hint).
export type Finding={code:string;severity:'error'|'warning'|'info';message:string;repair:string;target?:string;count?:number};
const refs=(v:string|null)=>[...(v??'').matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g)].map(m=>m[1]);
export function detect(model:VectorDocument,profileId?:string){
 const f:Finding[]=[],add=(code:string,severity:Finding['severity'],message:string,repair:string,target?:string,count?:number)=>f.push({code,severity,message,repair,...(target?{target}:{}),...(count!==undefined?{count}:{})});
 const p=model.project,all=elements(model.doc),ids=new Set(all.map(e=>e.getAttribute('id')).filter(Boolean) as string[]);const referenced=new Set<string>();
 let broken=0,nan=0,zero=0,tiny=0,huge=0,raster=0,script=0,external=0,invisible=0,points=0,outside=0;let firstBroken='',firstZero='',firstHuge='';
 const vb=(model.doc.documentElement.getAttribute('viewBox')??'0 0 700 700').split(/[\s,]+/).map(Number),boxes=pathBoxes(model);
 for(const e of all){const id=e.getAttribute('id')??undefined;
  for(const a of Array.from(e.attributes)){for(const r of refs(a.value)){referenced.add(r);if(!ids.has(r)){broken++;firstBroken||=`${id??e.localName} → #${r}`;}}
   if((a.name==='href'||a.name==='xlink:href')&&a.value.startsWith('#')){referenced.add(a.value.slice(1));if(!ids.has(a.value.slice(1))){broken++;firstBroken||=`${id??e.localName} → ${a.value}`;}}
   if((a.name==='href'||a.name==='xlink:href')&&/^(https?:|data:|\/\/)/i.test(a.value))external++;if(/\bNaN\b|Infinity/.test(a.value)){nan++;}if(/^on/i.test(a.name))script++;}
  if(e.localName==='image')raster++;if(e.localName==='script'||e.localName==='foreignObject')script++;
  if(e.localName==='path'){const b=id?boxes.get(id):undefined;if(b){points+=b.n;const area=(b.x1-b.x0)*(b.y1-b.y0);if(b.x1-b.x0<1e-6&&b.y1-b.y0<1e-6){zero++;firstZero||=id!;}else if(area<.25)tiny++;if(b.n>5000){huge++;firstHuge||=id!;}if(b.x1<vb[0]-50||b.y1<vb[1]-50||b.x0>vb[0]+vb[2]+50||b.y0>vb[1]+vb[3]+50)outside++;}else if(!(e.getAttribute('d')??'').trim()){zero++;firstZero||=id??'path';}}
  if(['path','rect','circle','ellipse','polygon'].includes(e.localName)&&!model.inDefs(e)&&(e.getAttribute('opacity')==='0'&&!p.tracks.some(t=>t.target===id&&t.property==='opacity')&&!(p.expression?.drivers??[]).some(d=>d.target===id)||e.getAttribute('fill')==='none'&&(!e.getAttribute('stroke')||e.getAttribute('stroke')==='none')))invisible++;
  if(e.localName==='mask'&&!elements(e).some(x=>['path','rect','circle','ellipse','polygon','use','g'].includes(x.localName)))add('MAI_INVALID_MASK','error','Máscara vacía: oculta todo lo que la usa.','Elimina la referencia o reconstruye su contenido.',id);
  if(e.localName==='clipPath'&&!elements(e).some(x=>['path','rect','circle','ellipse','polygon','use','text'].includes(x.localName)))add('MAI_BROKEN_CLIP','error','clipPath vacío: recorta todo.','Elimina el clip-path o define su geometría.',id);
  if(e.localName==='feGaussianBlur'&&Number((e.getAttribute('stdDeviation')??'0').split(/[\s,]+/)[0])>50)add('MAI_HUGE_FILTER','warning','Desenfoque mayor a 50: muy costoso por fotograma.','Reduce stdDeviation o limita la región del filtro.',id);
  if(e.localName==='feTurbulence'&&Number(e.getAttribute('numOctaves')??1)>4)add('MAI_HUGE_FILTER','warning','feTurbulence con más de 4 octavas: costo alto sin ganancia visible.','Usa 1–3 octavas.',id);
 }
 if(broken)add('MAI_BROKEN_REF','error',`${broken} referencias a IDs inexistentes (p. ej. ${firstBroken}).`,'Restaura el destino o elimina la referencia; nunca renombres IDs referenciados sin actualizar usos.',undefined,broken);
 if(nan)add('MAI_NAN','error',`${nan} atributos con NaN/Infinity.`,'Revisa la operación que los generó y deshazla.',undefined,nan);
 if(zero)add('MAI_ZERO_LENGTH','warning',`${zero} trazos sin área ni longitud (${firstZero}).`,'Elimínalos con mai optimize; no aportan imagen.',firstZero,zero);
 if(tiny)add('MAI_TINY_GEOMETRY','info',`${tiny} trazos menores de 0.25 px².`,'Candidatos de limpieza para perfiles web/game; conserva los que pertenecen a facciones protegidas.',undefined,tiny);
 if(huge)add('MAI_PATH_EXPLOSION','warning',`${huge} trazos con más de 5000 puntos (${firstHuge}).`,'Simplifica o divide el trazo antes de rig/morph.',firstHuge,huge);
 if(outside)add('MAI_BAD_BBOX','info',`${outside} trazos fuera del lienzo.`,'Geometría invisible: recorta o elimina si no se anima hacia dentro.',undefined,outside);
 if(invisible)add('MAI_INVISIBLE','info',`${invisible} formas invisibles sin animación que las muestre.`,'Elimina o documenta (sprites/expresiones usan opacidad 0 a propósito).',undefined,invisible);
 if(raster)add('MAI_RASTER','error',`${raster} imágenes raster incrustadas.`,'Vectoriza (mai vectorize); MAI nunca incrusta imágenes para simular fidelidad.',undefined,raster);
 if(script)add('MAI_SCRIPT','error','El SVG contiene script, foreignObject o manejadores on*.','Elimina el código; la interactividad se exporta con el runtime de MAI.');
 if(external)add('MAI_EXTERNAL','error',`${external} referencias externas.`,'Incluye los recursos de forma vectorial y local.',undefined,external);
 const defs=all.filter(e=>['linearGradient','radialGradient','filter','mask','clipPath','pattern','symbol','marker'].includes(e.localName)&&e.getAttribute('id')&&!referenced.has(e.getAttribute('id')!));if(defs.length)add('MAI_UNREACHABLE','info',`${defs.length} definiciones no referenciadas.`,'mai optimize las elimina en perfiles de entrega.',defs[0].getAttribute('id')!,defs.length);
 // Authoring integrity.
 for(const t of p.tracks){if(t.property==='param')continue;const target=t.target.split('::')[0];if(!t.property.startsWith('bone')&&!ids.has(target))add('MAI_ORPHAN_TRACK','error',`Pista ${t.property} apunta a ${t.target}, que no existe.`,'Borra la pista (track.edit delete).',t.target);
  if(t.property==='d'){const tp=new Set(t.keys.map(k=>{try{return topology(String(k.value));}catch{return 'invalid';}}));if(tp.size>1)add('MAI_IMPOSSIBLE_MORPH','error',`Keyframes de ${t.target} con topologías distintas.`,'Usa morph.apply (normaliza y empareja) en vez de keyframes d crudos.',t.target);}
  if(p.loop&&t.keys.length>1&&JSON.stringify(t.keys[0].value)!==JSON.stringify(t.keys.at(-1)!.value)&&t.property!=='rotation')add('MAI_LOOP_SEAM','warning',`${t.target}.${t.property}: primer y último valor distintos en un loop.`,'Iguala extremos o desactiva loop a propósito.',t.target);
  if(t.keys.length===1)add('MAI_SINGLE_KEY','info',`${t.target}.${t.property} tiene un solo keyframe (estático).`,'Añade otro keyframe si querías movimiento.',t.target);}
 for(const s of p.skins)if(!ids.has(s.target))add('MAI_ORPHAN_RIG','error',`Skin de ${s.target} sin trazo.`,'skin.unbind',s.target);
 for(const x of p.expression?.features??[]){const missing=x.paths.filter(id=>!ids.has(id));if(missing.length)add('MAI_ORPHAN_RIG','error',`Rasgo ${x.id}: ${missing.length} trazos inexistentes.`,'Vuelve a crear el rasgo (expression.feature).',x.id);
  const extreme=Object.fromEntries(Object.keys(x.keys).map(k=>[k,1]));const disp=featureDisplacements(x,extreme,'free'),fold=foldReport(featureHandles(x,disp),{x:Math.min(...x.pins.map(q=>q.x)),y:Math.min(...x.pins.map(q=>q.y)),width:Math.max(...x.pins.map(q=>q.x))-Math.min(...x.pins.map(q=>q.x)),height:Math.max(...x.pins.map(q=>q.y))-Math.min(...x.pins.map(q=>q.y))},10);
  if(fold.folds)add('MAI_WARP_FOLD','warning',`Rasgo ${x.id}: con todos los parámetros al máximo el warp se pliega (${fold.folds} muestras).`,'Reduce las claves o amplía la región/pines; revisa el preview en la pose extrema.',x.id);
  const budget=PRESERVATION[p.preservation??'balanced'].maxDisplacement*x.size,raw=Object.values(featureDisplacements(x,extreme,'free')).reduce((m,d)=>Math.max(m,Math.hypot(d.dx,d.dy)),0);if(raw>budget*1.6)add('MAI_IDENTITY_BUDGET','info',`Rasgo ${x.id}: la mezcla extrema pide ${raw.toFixed(1)} px y el modo ${p.preservation??'balanced'} la limita a ${budget.toFixed(1)} px.`,'Es intencional: la preservación recorta deformaciones excesivas.',x.id);}
 for(const m of p.modifiers??[]){const missing=m.targets.filter(id=>!ids.has(id));if(missing.length)add('MAI_ORPHAN_MODIFIER','error',`Modificador ${m.id}: ${missing.length} trazos inexistentes.`,'modifier.remove y recrear.',m.id);}
 for(const n of p.semantic?.nodes??[]){if(n.status==='rejected')continue;const missing=n.targets.filter(t=>!ids.has(t));if(missing.length)add('MAI_ORPHAN_SEMANTIC','warning',`Parte ${n.id}: ${missing.length} IDs inexistentes.`,'Actualiza la parte (part.label) o elimínala.',n.id);
  if(/^(eye|mouth|nose|muzzle|iris|pupil|brow)/.test(n.role)&&n.status==='confirmed'&&!n.protection?.length&&!(p.identity?.ids??[]).some(id=>n.targets.includes(id)))add('MAI_IDENTITY_UNPROTECTED','warning',`Facción ${n.label} (${n.role}) sin protección de identidad.`,'identity.preserve con nivel deformable/protected según el trabajo.',n.id);}
 const proposed=(p.semantic?.nodes??[]).filter(n=>n.status==='proposed').length;if(proposed)add('MAI_SEMANTIC_PENDING','info',`${proposed} partes propuestas sin confirmar.`,'Muestra candidatos al usuario (part.candidates) antes de depender de ellas.',undefined,proposed);
 const report=assertSvg(model.toSVG());let budget:Record<string,unknown>|undefined;
 if(profileId){const pr=PROFILES[profileId];if(!pr)throw Error(`Unknown profile ${profileId}`);const filters=all.filter(e=>e.localName==='filter').length,masks=all.filter(e=>e.localName==='mask').length;const over:string[]=[];if(report.paths>pr.maxPaths)over.push(`paths ${report.paths}>${pr.maxPaths}`);if(points>pr.maxPoints)over.push(`points ${points}>${pr.maxPoints}`);if(report.bytes>pr.maxBytes)over.push(`bytes ${report.bytes}>${pr.maxBytes}`);if(filters>pr.maxFilters)over.push(`filters ${filters}>${pr.maxFilters}`);if(masks>pr.maxMasks)over.push(`masks ${masks}>${pr.maxMasks}`);
  budget={profile:pr.id,paths:report.paths,points,bytes:report.bytes,filters,masks,over};if(over.length)add('MAI_OUT_OF_BUDGET','warning',`Fuera del presupuesto ${pr.label}: ${over.join(', ')}.`,`mai optimize --profile ${pr.id} y compara perceptualmente.`);}
 const summary={errors:f.filter(x=>x.severity==='error').length,warnings:f.filter(x=>x.severity==='warning').length,info:f.filter(x=>x.severity==='info').length};
 return {schemaVersion:2,revision:p.revision,valid:report.valid&&!summary.errors,metrics:{...report,points},summary,findings:f,...(budget?{budget}:{}),visualApproval:'not evaluated'};
}
export function pointsOf(d:string){return segments(d).reduce((n,s)=>n+s.points.length,0);}
