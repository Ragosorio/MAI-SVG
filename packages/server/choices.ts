import sharp from 'sharp';
import {readFile,writeFile,mkdir,rename}from 'node:fs/promises';import {join}from 'node:path';import {randomUUID}from 'node:crypto';
import {VectorDocument,contentHash}from '../core/document.js';import {parseSvg,serialize,elements,SVG_NS}from '../converter/svg.js';import type {Operation}from '../core/model.js';import {renderSvg}from './render.js';
import {compileSpec,combineSpecs,type OptionSpec}from '../core/direct.js';import {interpretations}from '../core/expression.js';
// Visual choice boards: 2–6 real alternatives rendered from operations. Proposing never edits the scene; choosing is
// a normal revisioned transaction. Agents read the human's words, then derive new options with structured calls
// (combine: base + take slots + preserve + scale). Notes keep the human's exact words as context.
type Option={id:string;label:string;description:string;ops:Operation[];spec?:OptionSpec;highlight?:string[];derivedFrom?:{base:string;take:Record<string,string>;preserve:string[];scale:Record<string,number>}};
type Generator={kind:'expression';emotion:string;intensity:number;slots:string[];seed:number;time?:number;layer?:string;keep?:string[]};
export type ChoiceRequest={id:string;prompt:string;recommended:string;reason:string;time?:number;kind?:string;previewRegion?:{x:number;y:number;width:number;height:number};previewScale?:1|2;options:(Omit<Option,'ops'>&{ops?:Operation[]})[];generator?:Generator};
type Note={at:string;author:'user'|'agent';text:string};
// version increases whenever the visible set of options changes; plans name {id, version} so "la primera" always means
// the option the human actually saw.
export type Choice=Omit<ChoiceRequest,'options'>&{options:Option[];revision:number;contentHash?:string;version:number;status:'pending'|'chosen'|'dismissed';selected?:string;notes:Note[];history:{at:string;event:string}[]};
const safe=(s:string)=>typeof s==='string'&&/^[a-zA-Z][\w-]{0,60}$/.test(s);
export class Choices{
 current?:Choice;
 constructor(readonly folder:string){}
 async restore(){try{this.current=JSON.parse(await readFile(join(this.folder,'current.json'),'utf8'));if(this.current){this.current.notes??=[];this.current.history??=[];this.current.version??=1;}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 previewPath(option:string){return join(this.folder,`${this.current!.id}-${option}.png`);}
 public(){if(!this.current)return null;const {options,...rest}=this.current;return{...rest,options:options.map(({ops,...o})=>({...o,preview:`/api/choice-preview?id=${this.current!.id}&option=${o.id}`}))};}
 // Agent view: everything needed to reason about a human reply, including preview image paths it can look at.
 inspect(){const c=this.current;if(!c)return null;const slots=[...new Set(c.options.flatMap(o=>[...Object.keys(o.spec?.params??{}).map(k=>k.split('@')[1]).filter(Boolean),...Object.keys(o.spec?.slots??{}),...Object.keys(o.spec?.modifiers??{})]))];
  return {id:c.id,version:c.version,kind:c.kind??'generic',status:c.status,revision:c.revision,prompt:c.prompt,recommended:c.recommended,reason:c.reason,time:c.time??0,selected:c.selected,combinableSlots:slots,options:c.options.map((o,i)=>({id:o.id,position:i+1,label:o.label,description:o.description,combinable:!!o.spec,params:o.spec?.params,slots:o.spec?Object.fromEntries(slots.map(s=>[s,Object.fromEntries(Object.entries(o.spec!.params??{}).filter(([k])=>k.endsWith('@'+s)).map(([k,v])=>[k.split('@')[0],v]))])):undefined,derivedFrom:o.derivedFrom,previewPath:this.previewPath(o.id),operations:o.ops.length})),notes:c.notes,history:c.history};}
 async save(){await mkdir(this.folder,{recursive:true});const temp=join(this.folder,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(this.current));await rename(temp,join(this.folder,'current.json'));}
 private async render(model:VectorDocument,options:Option[],time:number,region?:ChoiceRequest['previewRegion'],scale=1){
  // One draft document; each option is applied and rolled back (cheap for non-structural ops).
  const draft=new VectorDocument(model.toSVG());const images:Buffer[]=[];
  for(const o of options){const snapshot=draft.capture(o.ops);draft.apply(o.ops);const k=scale===2?2:1;const rendered=await renderSvg(o.highlight?.length?highlighted(draft.frame(time),o.highlight):draft.frame(time),0,'chromium',k);draft.restore(snapshot);
   if(region){const b=region;if((b.x+b.width)*k>rendered.width||(b.y+b.height)*k>rendered.height)throw Error('Preview region outside canvas');images.push(await sharp(rendered.png).extract({left:b.x*k,top:b.y*k,width:b.width*k,height:b.height*k}).png().toBuffer());}else images.push(rendered.png);}
  await mkdir(this.folder,{recursive:true});return images;}
 private validateOption(o:Option){if(!safe(o.id)||!o.label||o.label.length>100||!o.description||o.description.length>1000||!Array.isArray(o.ops)||!o.ops.length||o.ops.length>500)throw Error('Invalid choice option');}
 async propose(r:ChoiceRequest,model:VectorDocument,revision:number){
  if(!safe(r.id)||!r.prompt||r.prompt.length>1000||!r.reason||r.reason.length>1000||!Array.isArray(r.options)||r.options.length<2||r.options.length>6||new Set(r.options.map(o=>o.id)).size!==r.options.length||!r.options.some(o=>o.id===r.recommended)||!Number.isFinite(r.time??0)||(r.time??0)<0||(r.time??0)>model.project.duration||JSON.stringify(r).length>2e6)throw Error('Invalid choice request');
  if(this.current?.status==='pending')throw Error('Resolve or dismiss the pending choice first');
  if(r.previewRegion){const b=r.previewRegion;if(![b.x,b.y,b.width,b.height].every(Number.isInteger)||b.x<0||b.y<0||b.width<1||b.height<1)throw Error('Invalid preview region');}
  const options:Option[]=r.options.map(o=>({...o,ops:o.ops??(o.spec?compileSpec(o.spec):[])}));for(const o of options)this.validateOption(o);
  const images=await this.render(model,options,r.time??0,r.previewRegion,r.previewScale);for(let i=0;i<images.length;i++)await writeFile(join(this.folder,`${r.id}-${options[i].id}.png`),images[i]);
  this.current={...structuredClone(r),options,revision,contentHash:contentHash(model),version:1,status:'pending',notes:[],history:[{at:new Date().toISOString(),event:`propuestas ${options.map(o=>o.id).join(', ')}`}]};await this.save();return this.public();
 }
 // Expression board: interpretations of one emotion distributed across facial slots (mouth/eyes/brows/ears).
 async proposeExpression(input:{id?:string;emotion:string;intensity:number;count?:number;time?:number;slots?:string[];previewRegion?:ChoiceRequest['previewRegion'];previewScale?:1|2;prompt?:string;seed?:number;keep?:string[];recommended?:string;reason?:string},model:VectorDocument,revision:number){
  const slots=input.slots??[...new Set((model.project.expression?.features??[]).map(f=>f.role.startsWith('eye')?'eyes':f.role.startsWith('brow')?'brows':f.role.startsWith('ear')?'ears':f.role))];if(!slots.length)throw Error('The scene has no expression features; create them with expression.rig first');
  const gen:Generator={kind:'expression',emotion:input.emotion,intensity:input.intensity,slots,seed:input.seed??1,time:input.time,keep:input.keep};const opts=this.fromGenerator(gen,input.count??3);
  return this.propose({id:input.id??`expr-${input.emotion}-${Date.now().toString(36)}`,prompt:input.prompt??`¿Cómo quieres que se lea «${input.emotion}»?`,recommended:input.recommended??opts[0].id,reason:input.reason??'Concentra la emoción en los ojos y deforma menos la boca: máxima legibilidad con mínima deformación.',time:input.time,kind:'expression',previewRegion:input.previewRegion,previewScale:input.previewScale,options:opts,generator:gen},model,revision);
 }
 private fromGenerator(g:Generator,count:number){return interpretations(g.emotion,g.intensity,count,g.slots.filter(s=>!(g.keep??[]).includes(s)),g.seed).map((x,i)=>({id:String.fromCharCode(65+i),label:x.label,description:x.description+((g.keep??[]).length?` Conserva ${g.keep!.join(', ')} original.`:''),spec:{params:x.params}}));} // Board time is only the preview instant; variants are static expressions.
 async preview(id:string,option:string){if(!safe(id)||!safe(option)||this.current?.id!==id||!this.current.options.some(o=>o.id===option))throw Error('Unknown choice preview');return readFile(join(this.folder,`${id}-${option}.png`));}
 // Projection of journaled acceptances (project.acceptances): undo/redo of the transaction moves the board with it.
 sync(project:import('../core/model.js').Project){const c=this.current;if(!c)return false;const acc=[...(project.acceptances??[])].reverse().find(a=>a.boardId===c.id&&a.version===c.version);
  if(acc&&(c.status!=='chosen'||c.selected!==acc.option)){if(!c.options.some(o=>o.id===acc.option)&&acc.spec){const spec=acc.spec as OptionSpec;c.options.push({id:acc.option,label:acc.label??acc.option,description:`Aceptada en ${acc.requestId??'transacción'}${acc.text?`: «${acc.text.slice(0,160)}»`:''}`,ops:compileSpec(spec),spec});}c.status='chosen';c.selected=acc.option;c.history.push({at:acc.at,event:`aceptada ${acc.option}${acc.supersedes?` (reemplaza ${acc.supersedes})`:''} (${acc.source})`});return true;}
  if(!acc&&c.status==='chosen'){c.status='pending';delete c.selected;c.options=c.options.filter(o=>!/^Aceptada en /.test(o.description));c.history.push({at:new Date().toISOString(),event:'aceptación deshecha'});return true;}return false;}
 pending(id:string,revision:number,version?:number,model?:VectorDocument){const c=this.current;if(!c||c.id!==id||c.status!=='pending')throw Object.assign(Error('No matching pending choice'),{code:'NO_PENDING_CHOICE',status:422});if(version!==undefined&&version!==c.version)throw Object.assign(Error(`Board ${id} is at version ${c.version}, plan names version ${version}`),{code:'STALE_CHOICE',status:409});if(!this.fresh(c,revision,model))throw Object.assign(Error('Choice is stale: regenerate previews against the current revision'),{status:409,code:'STALE_CHOICE'});return c;}
 // Previews stay valid while the scene content is identical (e.g. after undo back to it), not only at the same revision.
 fresh(c:Choice,revision:number,model?:VectorDocument){return c.revision===revision||(!!model&&!!c.contentHash&&c.contentHash===contentHash(model));}
 selected(id:string,option:string,revision:number,model?:VectorDocument){const c=this.pending(id,revision,undefined,model);const o=c.options.find(o=>o.id===option);if(!o)throw Error('Unknown choice option');return o;}
 // Structured combination decided by the agent: never auto-applied; returns a new previewed option.
 async combine(id:string,args:{base:string;take?:Record<string,string>;preserve?:string[];scale?:Record<string,number>;label?:string;description?:string},model:VectorDocument,revision:number){
  const c=this.pending(id,revision,undefined,model),base=c.options.find(o=>o.id===args.base);if(!base)throw Error(`Option ${args.base} does not exist`);if(!base.spec)throw Object.assign(Error('This board was built from raw operations, not combinable specs; propose a new board with explicit operations'),{code:'NOT_COMBINABLE'});
  if(c.options.length>=6)throw Object.assign(Error('The board already has 6 options: choose, dismiss or start a new board'),{code:'BOARD_FULL'});
  const specs=Object.fromEntries(c.options.filter(o=>o.spec).map(o=>[o.id,o.spec!]));const {spec,notes}=combineSpecs(base.spec,specs,args);
  const letters=c.options.map(o=>o.id).filter(x=>/^[A-Z]$/.test(x)).map(x=>x.charCodeAt(0));const id2=String.fromCharCode(Math.max(64,...letters)+1);
  const label=args.label??[`${args.base}`,...Object.entries(args.take??{}).map(([s,o])=>`${s} de ${o}`),...(args.preserve??[]).map(s=>`${s} original`),...Object.entries(args.scale??{}).map(([s,f])=>`${s==='*'?'intensidad':s} ×${f}`)].join(' + ').slice(0,100);
  const option:Option={id:id2,label,description:args.description??`Combinación: base ${args.base}${Object.keys(args.take??{}).length?', '+Object.entries(args.take!).map(([s,o])=>`${s} de ${o}`).join(', '):''}${(args.preserve??[]).length?', conserva '+args.preserve!.join(', '):''}.`,ops:compileSpec(spec),spec,derivedFrom:{base:args.base,take:args.take??{},preserve:args.preserve??[],scale:args.scale??{}}};
  if(!option.ops.length)option.ops=[{type:'param.set',params:Object.fromEntries(Object.keys(base.spec.params??{}).map(k=>[k,0]))}];
  this.validateOption(option);const [png]=await this.render(model,[option],c.time??0,c.previewRegion,c.previewScale);await writeFile(join(this.folder,`${c.id}-${option.id}.png`),png);c.options.push(option);c.version++;c.history.push({at:new Date().toISOString(),event:`combinada ${option.id}: ${label} (v${c.version})`});await this.save();
  return {option:{id:option.id,label:option.label,description:option.description,params:spec.params,previewPath:this.previewPath(option.id)},notes};
 }
 async regenerate(id:string,args:{count?:number;keep?:string[];intensity?:number},model:VectorDocument,revision:number){const c=this.pending(id,revision,undefined,model);if(!c.generator)throw Object.assign(Error('This board has no generator; propose new options explicitly'),{code:'NOT_REGENERABLE'});
  const g={...c.generator,seed:c.generator.seed+c.options.length,intensity:args.intensity??c.generator.intensity,keep:[...new Set([...(c.generator.keep??[]),...(args.keep??[])])]};const fresh=this.fromGenerator(g,Math.min(Math.max(2,args.count??3),6)).map(o=>({...o,ops:compileSpec(o.spec)}));
  const images=await this.render(model,fresh,c.time??0,c.previewRegion,c.previewScale);c.options=fresh;for(let i=0;i<images.length;i++)await writeFile(join(this.folder,`${c.id}-${fresh[i].id}.png`),images[i]);c.generator=g;c.recommended=fresh[0].id;c.version++;c.history.push({at:new Date().toISOString(),event:`regeneradas ${fresh.map(o=>o.id).join(', ')}${g.keep.length?' conservando '+g.keep.join(', '):''}`});await this.save();return this.inspect();}
 async note(id:string,text:string,author:'user'|'agent'){const c=this.current;if(!c||c.id!==id)throw Error('Unknown choice');if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Note must be 1–4000 characters');c.notes.push({at:new Date().toISOString(),author,text});c.notes=c.notes.slice(-100);await this.save();return c.notes.at(-1)!;}
}
// Segmentation previews: outline candidate paths on the rendered copy only; the scene is never touched.
function highlighted(svg:string,ids:string[]){const doc=parseSvg(svg),root=doc.documentElement,set=new Set(ids);const overlay=doc.createElementNS(SVG_NS,'g');overlay.setAttribute('pointer-events','none');
 for(const e of elements(doc))if(e.localName==='path'&&set.has(e.getAttribute('id')??'')){const c=doc.createElementNS(SVG_NS,'path');c.setAttribute('d',e.getAttribute('d')!);let t='',a:Node|null=e;const chain:string[]=[];while(a&&a.nodeType===1&&a!==root){const tr=(a as Element).getAttribute('transform');if(tr)chain.unshift(tr);a=a.parentNode;}t=chain.join(' ');if(t)c.setAttribute('transform',t);c.setAttribute('fill','#ff2bd6');c.setAttribute('fill-opacity','.35');c.setAttribute('stroke','#ff2bd6');c.setAttribute('stroke-width','1.2');overlay.appendChild(c);}
 root.appendChild(overlay);return serialize(doc);}
