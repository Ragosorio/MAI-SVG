// plan.execute: compile a mai.agent-plan/v1 on a draft, validate it, and publish it as ONE transaction.
// The LLM decides what to do; this module only resolves stable IDs, compiles deterministic operations,
// checks identity against an explicit reference and commits atomically (docs/adr/002).
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {Ajv2020} from 'ajv/dist/2020.js';
import {VectorDocument,contentHash} from '../core/document.js';
import type {Operation,SemanticNode,ProtectionLevel,Project} from '../core/model.js';
import {frameState} from '../core/animation.js';
import {renderSet,categories} from '../core/identity-guard.js';
import {combineSpecs,compileSpec,type OptionSpec} from '../core/direct.js';
import {flowFilter} from '../core/modifiers.js';
import {detect} from '../core/detectors.js';
import {elements} from '../converter/svg.js';
import {regionBounds} from '../core/warp.js';
import {nodes,ownerOf,addressOf,AgentError} from './address.js';
import type {Choice} from '../server/choices.js';
const schema=JSON.parse(readFileSync(new URL('./schemas/agent-plan.v1.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false});const validatePlan=ajv.compile(schema);
export type PartRef={partId:string;within?:string};
export type Plan={protocol:'mai.agent-plan/v1';requestId:string;sessionId:string;documentId:string;expectedRevision:number;mode:'dry-run'|'commit';label:string;
 constraints?:{preserve:{part:PartRef;reference:{kind:'snapshot'|'baseline';id:string};channels:('geometry'|'paint'|'expression')[];allowRigidMotion:boolean}[]};
 commands:({id:string;type:'variant.apply';target:PartRef;board:{id:string;version:number};base:string;take?:Record<string,string>;rechoose?:boolean}|{id:string;type:'identity.preserve';target:PartRef;reference:{kind:'snapshot'|'baseline';id:string};policy:ProtectionLevel}|{id:string;type:'animation.adjust';target:PartRef;sourceId:string;property:'speed';scale:number;onOverflow:'reject'})[];
 validation:{times:number[];required:('structural'|'identity'|'perceptual')[];preview:boolean};provenance:{kind:'user-direction'|'editor-choice'|'agent-proposal';text:string;referenceId?:string}};
export type Receipt=Record<string,unknown>&{requestId:string;hash:string;status:string};
export type PlanHost={model:()=>VectorDocument;revision:()=>number;sessionId:()=>string;documentId:()=>string;board:()=>Choice|undefined;
 reference:(ref:{kind:'snapshot'|'baseline';id:string})=>Promise<{doc:VectorDocument;label:string}>;saveSnapshot:(doc:VectorDocument,label:number|string)=>Promise<string>;
 render:(doc:VectorDocument,time:number,region?:{x:number;y:number;width:number;height:number})=>Promise<Buffer>;metrics:(a:Buffer,b:Buffer,region?:{x:number;y:number;width:number;height:number})=>Promise<{mae:number;ssim:number;silhouetteIoU:number}>;writeArtifact:(name:string,png:Buffer)=>Promise<string>;
 commit:(ops:Operation[],expectedRevision:number,label:string,precondition:()=>void,receipt:(tx:{revision:number;id:string})=>Receipt)=>Promise<Receipt>;receipts:Map<string,Receipt>};
const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v as object).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`:JSON.stringify(v);
export const planHash=(p:unknown)=>createHash('sha256').update(canonical(p)).digest('hex');
export const undoToken=(documentId:string,transactionId:string)=>Buffer.from(JSON.stringify({v:1,d:documentId,t:transactionId})).toString('base64url');
export function readUndoToken(token:string){try{const v=JSON.parse(Buffer.from(token,'base64url').toString());if(v.v===1&&typeof v.d==='string'&&typeof v.t==='string')return v as {v:1;d:string;t:string};}catch{}return undefined;}
const slotOf=(role:string)=>role.startsWith('eye')?'eyes':role.startsWith('brow')?'brows':role.startsWith('ear')?'ears':role==='muzzle'?'mouth':role;
const round=(n:number,d=4)=>Number(n.toFixed(d));
export class PlanExecutor{
 running=new Map<string,{status:'running';startedAt:string;cancel:boolean;hash:string}>();
 constructor(readonly host:PlanHost){}
 status(requestId:string){const r=this.host.receipts.get(requestId);if(r)return {...r,replayed:true};const run=this.running.get(requestId);if(run)return {ok:true,requestId,status:'running',committed:false,startedAt:run.startedAt};return {ok:false,requestId,status:'unknown',committed:false,error:{code:'NOT_FOUND',message:`No receipt for ${requestId} (never received, or outside retention)`}};}
 cancel(requestId:string){const run=this.running.get(requestId);if(!run)return {ok:false,requestId,error:{code:'NOT_FOUND',message:'Not running'}};run.cancel=true;return {ok:true,requestId,status:'cancelling'};}
 async execute(plan:Plan):Promise<Receipt>{
  if(!validatePlan(plan)){const e=validatePlan.errors![0];throw new AgentError(e.keyword==='const'&&e.instancePath==='/protocol'?'UNSUPPORTED_VERSION':'INVALID_ARGUMENT',`plan${e.instancePath}: ${e.message}`,{path:`plan${e.instancePath.replace(/\//g,'.')}`,errors:validatePlan.errors!.slice(0,10).map(x=>({path:x.instancePath,message:x.message}))},400);}
  const hash=planHash(plan);const prior=this.host.receipts.get(plan.requestId);
  if(prior){if(prior.hash!==hash)throw new AgentError('REQUEST_ID_REUSED',`requestId ${plan.requestId} was used for a different plan`,{recovery:{action:'new-request-id'}},409);return {...prior,replayed:true};}
  if(this.running.has(plan.requestId))return {ok:true,requestId:plan.requestId,hash,status:'running',committed:false};
  this.running.set(plan.requestId,{status:'running',startedAt:new Date().toISOString(),cancel:false,hash});
  try{const r=await this.run(plan,hash);if(r.committed||plan.mode==='dry-run')this.host.receipts.set(plan.requestId,r);return r;}finally{this.running.delete(plan.requestId);}
 }
 private cancelled(plan:Plan){if(this.running.get(plan.requestId)?.cancel)throw new AgentError('CANCELLED','Plan cancelled before commit; nothing was applied',{committed:false},409);}
 private async run(plan:Plan,hash:string):Promise<Receipt>{const h=this.host,base=h.model();
  // 1. Session, document, revision and command-level semantic validation (no fuzzy matching).
  if(plan.sessionId!==h.sessionId())throw new AgentError('DOCUMENT_MISMATCH',`Plan targets session ${plan.sessionId}; current is ${h.sessionId()}`,{expected:plan.sessionId,actual:h.sessionId(),recovery:{action:'reinspect',tools:['scene.inspect']}},409);
  if(plan.documentId!==h.documentId())throw new AgentError('DOCUMENT_MISMATCH',`Plan targets document ${plan.documentId}; current is ${h.documentId()}`,{expected:plan.documentId,actual:h.documentId(),recovery:{action:'reinspect',tools:['scene.inspect']}},409);
  if(plan.expectedRevision!==h.revision())throw new AgentError('REVISION_CONFLICT','La escena cambió desde la inspección.',{path:'expectedRevision',expected:plan.expectedRevision,actual:h.revision(),recovery:{action:'reinspect',tools:['scene.inspect','choices.inspect']}},409);
  const ids=new Set<string>();for(const c of plan.commands){if(ids.has(c.id))throw new AgentError('INVALID_ARGUMENT',`Duplicate command id ${c.id}`,{path:`commands.${c.id}`},400);ids.add(c.id);}
  const d=base.project.duration;for(const t of plan.validation.times)if(t>d)throw new AgentError('INVALID_ARGUMENT',`validation time ${t} exceeds duration ${d}`,{path:'validation.times'},400);
  const preserves=[...(plan.constraints?.preserve??[]),...plan.commands.filter(c=>c.type==='identity.preserve').map(c=>({part:c.target,reference:(c as {reference:{kind:'snapshot'|'baseline';id:string}}).reference,channels:['geometry','paint','expression'] as ('geometry'|'paint'|'expression')[],allowRigidMotion:true}))];
  if(preserves.length&&!plan.validation.required.includes('identity'))throw new AgentError('INVALID_ARGUMENT','preserve constraints and identity.preserve require validation.required to include "identity"',{path:'validation.required'},400);
  const part=(r:PartRef,path:string)=>{const n=nodes(base).find(x=>x.id===r.partId);if(!n)throw new AgentError('NOT_FOUND',`Part ${r.partId} does not exist`,{path,suggestions:nodes(base).slice(0,20).map(x=>({id:x.id,address:addressOf(base,x)}))},404);
   if(n.status!=='confirmed')throw new AgentError('UNCONFIRMED_TARGET',`${r.partId} is only proposed`,{path,recovery:{action:'confirm',tools:['part.candidates','part.label']}},409);
   if(r.within){const owner=ownerOf(base,n);let ok=owner.id===r.within||n.id===r.within;let c:SemanticNode|undefined=n;const seen=new Set<string>();while(!ok&&c?.parent&&!seen.has(c.id)){seen.add(c.id);if(c.parent===r.within)ok=true;c=nodes(base).find(x=>x.id===c!.parent);}if(!ok)throw new AgentError('NOT_FOUND',`${r.partId} is not inside ${r.within}`,{path},404);}return n;};
  const partSet=(n:SemanticNode)=>{const kids=nodes(base).filter(x=>{let c:SemanticNode|undefined=x;const seen=new Set<string>();while(c?.parent&&!seen.has(c.id)){seen.add(c.id);if(c.parent===n.id)return true;c=nodes(base).find(y=>y.id===c!.parent);}return false;});return renderSet(base,[...n.targets,...kids.flatMap(k=>k.targets)]);};
  if(plan.provenance.kind==='agent-proposal'&&plan.mode==='commit'&&plan.commands.some(c=>c.type==='variant.apply'))throw new AgentError('INVALID_ARGUMENT','An agent proposal cannot accept a pending choice; it needs user direction or an editor choice',{path:'provenance.kind'},400);
  // 2. Capture identity constraints on the reference BEFORE compiling anything.
  const times=plan.validation.times;const captured=[] as {part:SemanticNode;address:string;set:Set<string>;channels:string[];rigid:boolean;reference:string;refDoc:VectorDocument;frames:Map<string,Record<string,string>>[];statics:Map<string,Record<string,string>>;ancestors:string[];pick:(a:Record<string,string>)=>Record<string,string>}[];
  for(const [i,p] of preserves.entries()){const n=part(p.part,`constraints.preserve.${i}.part`);const ref=await h.reference(p.reference);const set=partSet(n);
   const keys=(name:string)=>p.channels.includes('paint')&&['fill','stroke','stop-color','stop-opacity','opacity','fill-opacity','stroke-opacity','style','filter','stroke-width','color'].includes(name)||(p.channels.includes('geometry')||p.channels.includes('expression'))&&['d','points','x','y','cx','cy','r','rx','ry','width','height','x1','x2','y1','y2'].includes(name)||(!p.allowRigidMotion&&name==='transform');
   const pick=(attrs:Record<string,string>)=>Object.fromEntries(Object.entries(attrs).filter(([k])=>keys(k)));
   const statics=new Map<string,Record<string,string>>();for(const id of set){const e=ref.doc.index.get(id);if(e)statics.set(id,pick(Object.fromEntries(Array.from(e.attributes).map(a=>[a.name,a.value]))));}
   const frames=times.map(t=>{const f=frameState(ref.doc.project,t);const out=new Map<string,Record<string,string>>();for(const id of set){out.set(id,pick(f.attrs[id]??{}));if(!p.allowRigidMotion&&f.poses[id])out.get(id)!.pose=JSON.stringify(f.poses[id]);}return out;});
   const ancestors:string[]=[];for(const id of n.targets){let a=base.index.get(id)?.parentNode as Element|null;while(a&&a.nodeType===1){const x=a.getAttribute('id');if(x)ancestors.push(x);a=a.parentNode as Element|null;}}
   captured.push({part:n,address:addressOf(base,n),set,channels:p.channels,rigid:p.allowRigidMotion,reference:ref.label,refDoc:ref.doc,frames,statics,ancestors,pick});}
  const preservedSlots=new Set<string>();for(const c of captured)for(const f of base.project.expression?.features??[])if(f.node===c.part.id||f.paths.some(id=>c.set.has(id)))preservedSlots.add(slotOf(f.role));
  this.cancelled(plan);
  // 3. Compile commands in order on a draft; nothing is committed per command.
  const draft=new VectorDocument(base.toSVG());const allOps:Operation[]=[];const changes:Record<string,unknown>[]=[];const warnings:string[]=[];let board:{id:string;version:number;supersedes?:string}|undefined;
  for(const [i,cmd] of plan.commands.entries()){const path=`commands.${i}`;let ops:Operation[];
   if(cmd.type==='variant.apply'){part(cmd.target,`${path}.target`);const c=h.board();if(!c||c.id!==cmd.board.id)throw new AgentError('STALE_CHOICE',`Board ${cmd.board.id} is not the current board`,{path:`${path}.board`},409);
    if(c.version!==cmd.board.version)throw new AgentError('STALE_CHOICE',`Board ${c.id} is at version ${c.version}; plan names ${cmd.board.version}`,{path:`${path}.board.version`,actual:c.version},409);const rechoose=cmd.rechoose===true&&c.status==='chosen';
    if(c.status!=='pending'&&!rechoose)throw new AgentError('STALE_CHOICE',`Board ${c.id} is ${c.status}`,{path:`${path}.board`,...(c.status==='chosen'?{selected:c.selected,recovery:{action:'rechoose',hint:'If the human changed their mind, repeat variant.apply with rechoose:true: the new acceptance supersedes the previous one in this same transaction (undo returns to it).',alternatives:['history.undo with the token of the transaction that accepted it, when it is the latest']}}:{})},409);
    // Re-choosing replaces the parameters of the accepted option; operations other than parameters cannot be superseded safely.
    const previous=rechoose?[...(base.project.acceptances??[])].reverse().find(a=>a.boardId===c.id&&a.version===c.version):undefined;
    if(rechoose&&!previous)throw new AgentError('STALE_CHOICE',`Board ${c.id} has no journaled acceptance to supersede`,{path:`${path}.board`,recovery:{action:'reinspect',tools:['choices.inspect']}},409);
    const prevSpec=previous?.spec as OptionSpec|undefined;if(previous&&(!prevSpec||(prevSpec.base??[]).length||Object.values(prevSpec.slots??{}).some(l=>l.length)||Object.keys(prevSpec.modifiers??{}).length))throw new AgentError('NOT_COMBINABLE',`The accepted option ${previous.option} applied operations other than parameters; it cannot be superseded automatically`,{path:`${path}.rechoose`,recovery:{action:'undo',tools:['history.undo']}},422);
    if(rechoose)warnings.push(`Board ${c.id} previews were rendered at revision ${c.revision}; re-choosing replaces the parameters of ${previous!.option}. Check the dry-run previews before describing the result.`);
    else if(c.revision!==plan.expectedRevision&&(!c.contentHash||c.contentHash!==contentHash(base)))throw new AgentError('STALE_CHOICE',`Board previews were rendered at revision ${c.revision} and the scene content changed since (now ${plan.expectedRevision})`,{path:`${path}.board`,recovery:{action:'regenerate',tools:['choice.regenerate','expression.propose']}},409);
    board={id:c.id,version:c.version,...(previous?{supersedes:previous.option}:{})};const opt=(id:string,p:string)=>{const o=c.options.find(x=>x.id===id);if(!o)throw new AgentError('NOT_FOUND',`Option ${id} is not on board ${c.id} v${c.version}`,{path:p,options:c.options.map(x=>x.id)},404);if(!o.spec)throw new AgentError('NOT_COMBINABLE',`Option ${id} has no combinable spec`,{path:p},422);return o;};
    const baseOpt=opt(cmd.base,`${path}.base`);const take=cmd.take??{};const boardSlots=new Set(c.options.flatMap(o=>Object.keys(o.spec?.params??{}).map(k=>k.split('@')[1]).filter(Boolean)));
    for(const [slot,from]of Object.entries(take)){const o=opt(from,`${path}.take.${slot}`);if(!Object.keys(o.spec!.params??{}).some(k=>k.endsWith('@'+slot)))throw new AgentError('NOT_COMBINABLE',`Option ${from} does not define slot ${slot}`,{path:`${path}.take.${slot}`,slots:[...boardSlots]},422);if(preservedSlots.has(slot))throw new AgentError('NOT_COMBINABLE',`Slot ${slot} is preserved by a constraint and also taken from ${from}`,{path:`${path}.take.${slot}`},422);}
    const specs=Object.fromEntries(c.options.filter(o=>o.spec).map(o=>[o.id,o.spec!]));let spec:OptionSpec=structuredClone(baseOpt.spec!);
    // Global parameters reach every slot: split them per slot so preserved slots stay as they are, or refuse.
    for(const k of Object.keys(spec.params??{}))if(!k.includes('@')&&preservedSlots.size){if(!boardSlots.size)throw new AgentError('NOT_COMBINABLE',`Global parameter ${k} would also change a preserved part`,{path:`${path}.base`},422);for(const s of boardSlots)if(!preservedSlots.has(s))spec.params![`${k}@${s}`]=spec.params![k];delete spec.params![k];}
    if((spec.base??[]).length||Object.keys(spec.slots??{}).some(s=>preservedSlots.has(s))){const touches=[...(spec.base??[]),...Object.entries(spec.slots??{}).filter(([s])=>preservedSlots.has(s)).flatMap(([,o])=>o)].some(op=>categories(op,base.project).targets.some(t=>captured.some(cp=>cp.set.has(t))));if(touches)throw new AgentError('NOT_COMBINABLE','Option operations touch a preserved part',{path:`${path}.base`},422);}
    spec=combineSpecs(spec,specs,{take,preserve:[...preservedSlots]}).spec;
    if(prevSpec)for(const k of Object.keys(prevSpec.params??{})){if(spec.params&&k in spec.params)continue;const slot=k.split('@')[1];if(!slot&&preservedSlots.size)throw new AgentError('NOT_COMBINABLE',`The accepted option set the global parameter ${k}; resetting it would also change a preserved part`,{path:`${path}.rechoose`,recovery:{action:'undo',tools:['history.undo']}},422);if(!slot||!preservedSlots.has(slot))(spec.params??={})[k]=0;}
    const derived=Object.keys(take).length>0||preservedSlots.size>0;const optionId=derived?`D-${cmd.base}${Object.entries(take).map(([s,o])=>`-${s}${o}`).join('')}${preservedSlots.size?'-keep':''}`.replace(/[^\w-]/g,'').slice(0,60):cmd.base;
    const label=[cmd.base,...Object.entries(take).map(([s,o])=>`${s} de ${o}`),...[...preservedSlots].map(s=>`${s} como está`)].join(' + ');
    ops=[...compileSpec(spec),{type:'choice.accept',acceptance:{boardId:c.id,version:c.version,option:optionId,label,spec:spec as Record<string,unknown>,requestId:plan.requestId,source:plan.provenance.kind==='editor-choice'?'editor-choice':'user-direction',text:plan.provenance.text,...(previous?{supersedes:previous.option}:{})}},{type:'decision.log',decision:{kind:'choice',summary:`${c.prompt} → ${label}`,source:'user'}}];
    const before=base.project.params??{};changes.push({commandId:cmd.id,kind:'variant',board:{id:c.id,version:c.version},base:cmd.base,take,preservedSlots:[...preservedSlots],option:optionId,params:Object.fromEntries(Object.entries(spec.params??{}).map(([k,v])=>[k,{from:before[k]?.default??before[k.split('@')[0]]?.default??0,to:v}]))});}
   else if(cmd.type==='identity.preserve'){const n=part(cmd.target,`${path}.target`);await h.reference(cmd.reference);const levels=[...new Set([...(n.protection??[]),cmd.policy])] as ProtectionLevel[];
    ops=[{type:'semantic.protect',id:n.id,protection:levels},{type:'semantic.label',node:{...structuredClone(n),reference:cmd.reference}}];changes.push({commandId:cmd.id,kind:'identity',part:addressOf(base,n),levels:{from:n.protection??[],to:levels},reference:cmd.reference});}
   else{const n=part(cmd.target,`${path}.target`);const set=partSet(n);const p=draft.project;const k=cmd.scale;
    const mod=(p.modifiers??[]).find(m=>m.id===cmd.sourceId),sec=(p.secondary??[]).find(s=>s.id===cmd.sourceId);const trackRef=/^track:([^:]+):([^:]+)(?::(.+))?$/.exec(cmd.sourceId);
    if(mod){if(!mod.targets.some(t=>set.has(t)))throw new AgentError('NOT_FOUND',`Source ${cmd.sourceId} does not animate ${n.id}`,{path:`${path}.sourceId`},404);const from=mod.params.speedFactor??1,to=round(from*k,6);
     if(mod.technique==='filter'){const f=flowFilter(mod,'x',p.duration);const tiles=Math.abs(f.travel.x||f.travel.y)/f.tile;if(Math.abs(tiles*to-Math.round(tiles*to))>1e-9)throw new AgentError('LOOP_INCOMPATIBLE',`Filter flow needs whole tiles per loop: ×${k} gives ${round(tiles*to)} tiles`,{path:`${path}.scale`,alternatives:['switch technique to geometry (crossfade loop)','change duration so the factor fits','choose a factor giving whole tiles']},422);}
     ops=[{type:'modifier.update',id:mod.id,params:{speedFactor:to}}];changes.push({commandId:cmd.id,sourceId:mod.id,kind:'modifier',property:'speed',from,to,loopPolicy:p.loop&&Math.abs(to-Math.round(to))>1e-9&&mod.technique!=='filter'?`crossfade(${mod.params.loopBlend??.2})`:'exact'});}
    else if(sec){if(!set.has(sec.target))throw new AgentError('NOT_FOUND',`Source ${cmd.sourceId} does not animate ${n.id}`,{path:`${path}.sourceId`},404);
     // Time scaling of a damped spring: ω×k ⇒ stiffness×k², damping×k, delay÷k.
     const next={stiffness:round(sec.stiffness*k*k),damping:round(sec.damping*k),delay:round(sec.delay/k)};ops=[{type:'secondary.update',id:sec.id,secondary:next}];changes.push({commandId:cmd.id,sourceId:sec.id,kind:'secondary',property:'speed',from:{stiffness:sec.stiffness,damping:sec.damping,delay:sec.delay},to:next});}
    else if(trackRef){const [,target,property,layer]=trackRef;if(!set.has(target))throw new AgentError('NOT_FOUND',`Track ${cmd.sourceId} is not on ${n.id}`,{path:`${path}.sourceId`},404);const t=p.tracks.find(x=>x.target===target&&x.property===property&&(x.layer??'base')===(layer??'base'));if(!t||t.keys.length<2)throw new AgentError('NOT_FOUND',`Track ${cmd.sourceId} not found`,{path:`${path}.sourceId`},404);
     const start=t.keys[0].time,end=t.keys.at(-1)!.time,newEnd=start+(end-start)/k;if(newEnd>p.duration+1e-9)throw new AgentError('TIMELINE_OVERFLOW',`Slowing ${cmd.sourceId} ×${k} ends at ${round(newEnd)}s, beyond the ${p.duration}s timeline`,{path:`${path}.scale`,alternatives:['extend the timeline first','choose a smaller change']},422);
     ops=[{type:'track.edit',target,property:property as never,action:'stretch',amount:round(1/k,8),...(layer&&layer!=='base'?{layer}:{})}];changes.push({commandId:cmd.id,sourceId:cmd.sourceId,kind:'track',property:'speed',from:{start,end},to:{start,end:round(newEnd)}});}
    else throw new AgentError('NOT_FOUND',`Animation source ${cmd.sourceId} does not exist`,{path:`${path}.sourceId`,hint:'scene.inspect lists sources per part'},404);}
   try{draft.apply(ops);}catch(e){const err=e as {code?:string;message:string;detail?:Record<string,unknown>};throw new AgentError(err.code??'VALIDATION_FAILED',`${cmd.id}: ${err.message}`,{path,commandId:cmd.id,...(err.detail??{})},422);}
   allOps.push(...ops);this.cancelled(plan);}
  // 4. Gates on the draft (same evaluator as preview/export). Required gates that cannot run block the commit.
  const structural=(()=>{const a=detect(base),b=detect(draft);const known=new Set(a.findings.filter(f=>f.severity==='error').map(f=>f.code));const added=b.findings.filter(f=>f.severity==='error'&&!known.has(f.code));return {status:added.length?'fail':'pass',newErrors:added};})();
  if(structural.status==='fail')throw new AgentError('VALIDATION_FAILED','Structural validation failed on the draft',{structural},422);
  const identity=await this.regionPixels(this.verify(captured,draft,times),captured,draft,times);
  if(plan.validation.required.includes('identity')){if(identity.status==='not_evaluated')throw new AgentError('VALIDATION_NOT_EVALUATED','Identity gate required but no part was evaluated',{identity},422);if(identity.status==='fail')throw new AgentError('IDENTITY_BLOCKED','A preserved part would change',{identity},422);}
  let perceptual:Record<string,unknown>={status:'not_requested'};
  if(plan.validation.required.includes('perceptual')){perceptual=await this.perceptual(captured,draft,times,plan);if(perceptual.status!=='pass')throw new AgentError(perceptual.status==='not_evaluated'?'VALIDATION_NOT_EVALUATED':'VALIDATION_FAILED','Perceptual gate did not pass',{perceptual},422);}
  this.cancelled(plan);
  // 5. Draft snapshot and previews outside the write queue.
  const draftSnapshot=await h.saveSnapshot(draft,`draft-${plan.requestId}`);const artifacts:Record<string,unknown>[]=[];
  if(plan.validation.preview)for(const t of times){try{const png=await h.render(draft,t);artifacts.push({id:`preview-${plan.requestId}-${t}`,kind:'preview',time:t,snapshotId:draftSnapshot,path:await h.writeArtifact(`${plan.requestId}-${t}.png`,png),sha256:createHash('sha256').update(png).digest('hex')});}catch(e){warnings.push(`preview at ${t}s failed: ${String((e as Error).message).slice(0,160)}`);}}
  const common={protocol:'mai.agent-result/v1',requestId:plan.requestId,hash,tool:'plan.execute',sessionId:h.sessionId(),documentId:h.documentId(),baseRevision:plan.expectedRevision,changes,identity:{...identity,...(perceptual.status!=='not_requested'?{perceptual}:{})},structural,artifacts,warnings,operations:allOps.length};
  if(plan.mode==='dry-run')return {ok:true,...common,status:'prepared',committed:false,revision:plan.expectedRevision,snapshotId:draftSnapshot};
  this.cancelled(plan);
  // 6. Commit: CAS on revision and board version, one transaction, receipt journaled with it.
  return h.commit(allOps,plan.expectedRevision,plan.label,()=>{const c=h.board();if(board&&(!c||c.id!==board.id||c.version!==board.version||(board.supersedes?c.status!=='chosen'||c.selected!==board.supersedes:c.status!=='pending')))throw new AgentError('STALE_CHOICE','The board changed while the plan was being prepared',{recovery:{action:'reinspect',tools:['choices.inspect']}},409);},
   tx=>({ok:true,...common,status:'committed',committed:true,revision:tx.revision,draftSnapshotId:draftSnapshot,transaction:{id:tx.id,undoToken:undoToken(h.documentId(),tx.id)}}));
 }
 // Deterministic channel comparison against the captured reference (rigid motion optionally ignored).
 private verify(captured:{part:SemanticNode;address:string;set:Set<string>;channels:string[];rigid:boolean;reference:string;frames:Map<string,Record<string,string>>[];statics:Map<string,Record<string,string>>;pick:(a:Record<string,string>)=>Record<string,string>}[],draft:VectorDocument,times:number[]){
  if(!captured.length)return {status:'not_evaluated' as const,reference:null,evaluatedParts:[],evaluatedTimes:[],skippedParts:[],reason:'no preserve constraints in this plan'};
  const results=captured.map(c=>{const mismatches:{id:string;channel:string;time?:number}[]=[];const keys=(attrs:Record<string,string>)=>Object.keys(attrs);
   for(const [id,ref]of c.statics){const e=draft.index.get(id);if(!e){mismatches.push({id,channel:'structure'});continue;}const cur=c.pick(Object.fromEntries(Array.from(e.attributes).map(a=>[a.name,a.value])));for(const k of new Set([...keys(ref),...keys(cur)]))if(cur[k]!==ref[k])mismatches.push({id,channel:k});}
   times.forEach((t,i)=>{const f=frameState(draft.project,t);for(const [id,ref]of c.frames[i]){const cur=f.attrs[id]??{};for(const k of keys(ref))if(k!=='pose'&&cur[k]!==ref[k])mismatches.push({id,channel:k,time:t});for(const k of keys(cur))if(!(k in ref)&&(c.channels.includes('paint')||k==='d')&&k!=='pose'&&['d','fill','stroke','opacity'].includes(k))mismatches.push({id,channel:k,time:t});if(!c.rigid&&ref.pose!==undefined&&JSON.stringify(f.poses[id])!==ref.pose)mismatches.push({id,channel:'pose',time:t});}});
   const elements=c.statics.size;return {part:c.address,reference:c.reference,elements,status:!elements?'not_evaluated':mismatches.length?'fail':'pass',mismatches:mismatches.slice(0,20),mismatchCount:mismatches.length};});
  const evaluated=results.filter(r=>r.status!=='not_evaluated');
  return {status:(!evaluated.length?'not_evaluated':evaluated.some(r=>r.status==='fail')?'fail':'pass') as 'pass'|'fail'|'not_evaluated',reference:[...new Set(results.map(r=>r.reference))].join(', '),evaluatedParts:evaluated.map(r=>r.part),evaluatedTimes:times,skippedParts:results.filter(r=>r.status==='not_evaluated').map(r=>r.part),parts:results};}
 // A preserved part drawn inside shared artwork (region, no own elements) is compared by pixels in its region, like identity.check.
 private async regionPixels(identity:ReturnType<PlanExecutor['verify']>,captured:{part:SemanticNode;address:string;refDoc:VectorDocument}[],draft:VectorDocument,times:number[]){
  const parts=(identity.parts??[]) as (NonNullable<typeof identity.parts>[number]&Record<string,unknown>)[];const pending=captured.filter(c=>c.part.region&&parts.find(r=>r.part===c.address)?.status==='not_evaluated');if(!pending.length)return identity;
  const threshold={strict:.75,balanced:1.5,free:3}[draft.project.preservation??'balanced'];const h=this.host;
  try{const cache=new Map<VectorDocument,Map<number,Buffer>>();const png=async(d:VectorDocument,t:number)=>{const m=cache.get(d)??new Map<number,Buffer>();cache.set(d,m);if(!m.has(t))m.set(t,await h.render(d,t));return m.get(t)!;};
   for(const c of pending){const box=regionBounds(c.part.region!);const samples:{time:number;mae:number;ssim:number}[]=[];for(const t of times){const r=await h.metrics(await png(c.refDoc,t),await png(draft,t),box);samples.push({time:t,mae:r.mae,ssim:r.ssim});}
    const i=parts.findIndex(r=>r.part===c.address);const fail=samples.filter(x=>x.mae>threshold);parts[i]={...parts[i],method:'region-pixels',threshold:{mae:threshold},samples,status:fail.length?'fail':'pass',mismatchCount:fail.length,mismatches:fail.map(x=>({id:c.part.id,channel:'pixels',time:x.time}))};}}
  catch(e){for(const c of pending){const i=parts.findIndex(r=>r.part===c.address);parts[i]={...parts[i],method:'region-pixels',reason:`RENDERER_UNAVAILABLE: ${String((e as Error).message).slice(0,160)}`};}}
  const evaluated=parts.filter(r=>r.status!=='not_evaluated');
  return {...identity,status:(!evaluated.length?'not_evaluated':evaluated.some(r=>r.status==='fail')?'fail':'pass') as 'pass'|'fail'|'not_evaluated',evaluatedParts:evaluated.map(r=>r.part),skippedParts:parts.filter(r=>r.status==='not_evaluated').map(r=>r.part),parts};}
 private async perceptual(captured:{part:SemanticNode;address:string;set:Set<string>}[],draft:VectorDocument,times:number[],plan:Plan){
  if(!captured.length)return {status:'not_evaluated',reason:'no preserved parts'};const h=this.host;const out:Record<string,unknown>[]=[];
  try{for(const c of captured){const pr=(plan.constraints?.preserve??[]).find(p=>p.part.partId===c.address.split('.').at(-1))??(plan.commands.find(x=>x.type==='identity.preserve'&&x.target.partId===c.address.split('.').at(-1)) as {reference:{kind:'snapshot'|'baseline';id:string}}|undefined);if(!pr)continue;const ref=await h.reference(pr.reference);const box=c.part.region?regionBounds(c.part.region):regionOf(draft,c.set);if(!box)continue;
    for(const t of times){const m=await h.metrics(await h.render(ref.doc,t),await h.render(draft,t),box);out.push({part:c.address,time:t,...m,status:m.mae<=1.5?'pass':'fail'});}}}
  catch(e){return {status:'not_evaluated',reason:'RENDERER_UNAVAILABLE',message:String((e as Error).message).slice(0,200)};}
  return {status:!out.length?'not_evaluated':out.some(x=>x.status==='fail')?'fail':'pass',threshold:{mae:1.5},evaluated:out};}
}
function regionOf(m:VectorDocument,set:Set<string>){const pts:{x:number;y:number}[]=[];for(const id of set){const e=m.index.get(id);if(e?.localName!=='path')continue;const d=e.getAttribute('d')??'';const nums=d.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number)??[];for(let i=0;i+1<nums.length;i+=2)pts.push({x:nums[i],y:nums[i+1]});}if(!pts.length)return undefined;const x=Math.min(...pts.map(p=>p.x)),y=Math.min(...pts.map(p=>p.y));return {x,y,width:Math.max(...pts.map(p=>p.x))-x,height:Math.max(...pts.map(p=>p.y))-y};}
export type {Project};void elements;
