import type {VectorDocument} from './document.js';import type {Operation,ProtectionLevel,Project} from './model.js';import {ALLOWED,LEVEL_MEANING} from './semantic.js';
import {elements} from '../converter/svg.js';import {frameState} from './animation.js';import {topology} from './geometry.js';
// Identity protection has two layers:
// 1. categories(): fast, explanatory pre-check per operation (direct targets plus known indirect routes).
// 2. capture/verifyIdentity(): the guarantee. The evaluated state of everything a protected part renders
//    (subtree, referenced defs/<use> masters, instances, inherited style, animated frames) is compared before and
//    after the whole transaction; any change outside the allowed categories rolls the transaction back.
export class IdentityError extends Error{readonly code='IDENTITY_BLOCKED';constructor(message:string,readonly detail:Record<string,unknown>){super(message);}}
const poseCat=(k:string,v:unknown)=>['scaleX','scaleY'].includes(k)&&v!==1?'scale':'rigid';
const attrCat=(k:string)=>k==='data-mai-name'||k==='data-mai-locked'?'none':['d','transform','x','y','cx','cy','r','rx','ry','width','height','x1','x2','y1','y2','points'].includes(k)?'geometry':['opacity','display','visibility'].includes(k)?'visibility':['mask','clip-path','href','xlink:href'].includes(k)?'structure':'style';
const propCat=(p:string)=>['x','y','rotation'].includes(p)?'rigid':['scaleX','scaleY'].includes(p)?'scale':p==='opacity'?'visibility':['fill','stroke'].includes(p)||p.startsWith('attr:')?'style':'geometry';
// Parameters reach geometry/paint through drivers and expression features: resolve those routes explicitly.
export function paramImpact(p:Project,params:string[]){const targets:string[]=[],cats=new Set<string>();const base=(n:string)=>n.split('@')[0];
 for(const d of p.expression?.drivers??[])if(params.some(n=>n===d.param||base(n)===base(d.param))){targets.push(d.target);cats.add(propCat(d.property));}
 for(const f of p.expression?.features??[])if(!f.frozen&&params.some(n=>Object.hasOwn(f.keys,base(n))&&(!n.includes('@')||n.endsWith('@'+f.role)||n.endsWith('@'+(f.role.startsWith('eye')?'eyes':f.role.startsWith('brow')?'brows':f.role.startsWith('ear')?'ears':f.role))))){targets.push(...f.paths);cats.add('geometry');}
 for(const m of p.modifiers??[])if(params.some(n=>n.startsWith(m.id+'.'))){targets.push(...m.targets);cats.add('geometry');}
 return {targets,cats:[...cats]};}
export function categories(op:Operation,p?:Project):{targets:string[];cats:string[];scale:number}{
 const targets:string[]=[];const cats=new Set<string>();let scale=0;const add=(t:string[],c:string[])=>{targets.push(...t);c.forEach(x=>cats.add(x));};
 const skipId=['semantic.','modifier.','secondary.','emotion.','sprite.','state.','marker.','region.time','clip.','layer.','param.','expression.','component.','filter.','viseme','lipsync','decision.','preservation','landmark.','timeline'];
 if('id'in op&&typeof op.id==='string'&&!skipId.some(s=>op.type.startsWith(s))&&op.type!=='region.extract')targets.push(op.id);
 if('ids'in op&&Array.isArray(op.ids)&&!op.type.startsWith('semantic.'))targets.push(...op.ids);
 if('target'in op&&typeof op.target==='string'&&op.type!=='filter.set'&&!(op.type==='keyframe'&&op.property==='param')&&!(op.type==='track.edit'&&op.property==='param'))targets.push(op.target.split('::')[0]);
 switch(op.type){
  case 'pose':for(const [k,v]of Object.entries(op.pose)){cats.add(poseCat(k,v));if(poseCat(k,v)==='scale')scale=Math.max(scale,Math.abs(Number(v)-1));}break;
  case 'keyframe':if(op.property==='param'){if(p)add(paramImpact(p,[op.target]).targets,paramImpact(p,[op.target]).cats);break;}if(['scaleX','scaleY'].includes(op.property)&&op.value!==1)scale=Math.max(scale,Math.abs(Number(op.value)-1));cats.add(op.property==='scaleX'||op.property==='scaleY'?(op.value===1?'rigid':'scale'):propCat(op.property));break;
  case 'track.edit':case 'track.copy':if(op.property==='param'){if(p)add(paramImpact(p,[op.target]).targets,paramImpact(p,[op.target]).cats);break;}cats.add(propCat(op.property));if(op.type==='track.copy')targets.push(op.to);break;
  case 'attributes':for(const k of Object.keys(op.attrs))cats.add(attrCat(k));break;
  case 'point.move':case 'mesh.add':case 'mesh.move':case 'skin.bind':case 'skin.weight':cats.add('geometry');break;
  case 'point.add':case 'point.remove':case 'path.split':case 'path.close':case 'path.curve':case 'path.join':case 'path.simplify':case 'path.boolean':case 'morph.apply':cats.add('topology');break;
  case 'gradient':cats.add('style');break;
  case 'filter.set':cats.add('style');if(op.target)targets.push(op.target);break;
  case 'delete':case 'group':case 'ungroup':case 'order':case 'part.prepare':case 'create':cats.add('structure');if(op.type==='create'&&op.parent)targets.push(op.parent);break;
  case 'expression.feature':add(op.feature.paths,['geometry']);break;
  case 'expression.key':case 'expression.freeze':case 'expression.remove':{const f=p?.expression?.features.find(x=>x.id===op.feature);if(f)add(f.paths,['geometry']);break;}
  case 'expression.driver':add([op.driver.target],[propCat(op.driver.property)]);break;
  case 'param.set':case 'expression.set':if(p){const names=Object.keys(op.params);if(op.type==='expression.set'&&op.preset)names.push(...Object.keys(p.expression?.presets[op.preset]??{}));const r=paramImpact(p,names);add(r.targets,r.cats);}break;
  case 'lipsync':if(p){const r=paramImpact(p,Object.keys(p.params??{}));add(r.targets,r.cats);}break;
  case 'modifier.add':add(op.modifier.targets,['geometry']);break;
  case 'modifier.update':case 'modifier.remove':case 'modifier.order':case 'modifier.bake':{const m=p?.modifiers?.find(x=>x.id===op.id);if(m)add(m.targets,['geometry']);break;}
  case 'fluid.animate':add(op.targets,['geometry']);break;
  case 'region.extract':add([op.source],['extract']);break;
  case 'secondary.add':add([op.secondary.target],[op.secondary.property==='rotation'||op.secondary.property==='x'||op.secondary.property==='y'?'rigid':'scale']);break;
  case 'secondary.update':case 'secondary.remove':case 'secondary.bake':{const s=p?.secondary?.find(x=>x.id===op.id);if(s)add([s.target],['rigid']);break;}
  case 'component.define':add([op.master],['structure']);break;
  case 'rename':case 'lock':cats.add('none');break;
  default:break;
 }
 cats.delete('none');return {targets:[...new Set(targets)],cats:[...cats],scale};
}
export function protectedNodes(model:VectorDocument){const nodes:{id:string;targets:string[];levels:ProtectionLevel[]}[]=[];
 for(const id of model.project.identity?.ids??[])nodes.push({id:`identity:${id}`,targets:[id],levels:['protected']});
 const all=model.project.semantic?.nodes??[];
 // A semantic group inherits the constraints of its protected descendants (and vice versa for its own policy).
 for(const n of all)if(n.status!=='rejected'&&n.protection?.length&&!n.protection.every(l=>l==='free')){const kids=all.filter(x=>{let c=x;const seen=new Set<string>();while(c.parent&&!seen.has(c.id)){seen.add(c.id);if(c.parent===n.id)return true;c=all.find(y=>y.id===c.parent)??c;if(!c.parent)break;}return false;});nodes.push({id:n.id,targets:[...new Set([...n.targets,...kids.flatMap(k=>k.targets)])],levels:n.protection});}
 return nodes;}
const allowedFor=(levels:ProtectionLevel[])=>levels.map(l=>new Set(ALLOWED[l])).reduce((a,b)=>new Set([...a].filter(x=>b.has(x))));
const scaleBudget=(m:VectorDocument)=>({strict:.02,balanced:.05,free:.15}[m.project.preservation??'balanced']);
export function guardIdentity(model:VectorDocument,op:Operation,renderCache?:Map<string,Set<string>>){
 if(op.type==='identity.protect'||op.type==='identity.release'||op.type.startsWith('semantic.')||op.type==='landmark.set'||op.type==='landmark.delete')return;
 const nodes=protectedNodes(model);if(!nodes.length)return;const {targets,cats,scale}=categories(op,model.project);if(!targets.length||!cats.length)return;
 const isAncestor=(a:Node,b:Node)=>{let p:Node|null=b;while(p){if(p===a)return true;p=p.parentNode;}return false;};
 for(const n of nodes){const allowed=allowedFor(n.levels);const set=renderCache?.get(n.id)??renderSet(model,n.targets);renderCache?.set(n.id,set);
  for(const target of targets){const e=model.index.get(target);if(!e)continue;let ancestorOnly=false;
   const related=set.has(target)||n.targets.some(id=>{const p=model.index.get(id);if(!p)return false;if(isAncestor(p as unknown as Node,e as unknown as Node))return true;
    if(op.type!=='create'&&isAncestor(e as unknown as Node,p as unknown as Node)&&cats.some(c=>['structure','style','geometry','topology','scale'].includes(c))){ancestorOnly=true;return true;}return false;});
   if(!related)continue;const blocked=cats.filter(c=>!allowed.has(c)&&!(ancestorOnly&&(c==='rigid'||c==='visibility'||(c==='scale'&&scale<=scaleBudget(model)))));
   if(blocked.length)throw new IdentityError(`Protected identity (${n.id}: ${n.levels.join('+')}) blocks ${blocked.join(', ')} on ${target} via ${op.type}. ${n.levels.map(l=>LEVEL_MEANING[l]).join(' ')} Release or change protection explicitly, or use an allowed operation.`,{part:n.id,levels:n.levels,blocked,target,operation:op.type});}}
}
// Everything whose rendering is part of these elements: subtree, transitively referenced defs (<use> masters,
// gradients, masks, clipPaths, filters, patterns) and <use> instances that display the protected content.
export function renderSet(m:VectorDocument,ids:string[]){const set=new Set<string>(),queue=[...ids];const refs=(e:Element)=>{const out:string[]=[];for(const a of Array.from(e.attributes)){for(const r of a.value.matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g))out.push(r[1]);if((a.name==='href'||a.name==='xlink:href')&&a.value.startsWith('#'))out.push(a.value.slice(1));}return out;};
 while(queue.length){const id=queue.pop()!;if(set.has(id))continue;const e=m.index.get(id);if(!e)continue;set.add(id);for(const x of [e,...elements(e)]){const xid=x.getAttribute('id');if(xid&&!set.has(xid)&&x!==e)set.add(xid);for(const r of refs(x))if(!set.has(r))queue.push(r);}}
 for(const e of elements(m.doc))if(e.localName==='use'){const href=(e.getAttribute('href')??e.getAttribute('xlink:href')??'').slice(1);const id=e.getAttribute('id');if(id&&ids.includes(href))set.add(id);}
 return set;}
type Capture={nodes:{id:string;levels:ProtectionLevel[];set:Set<string>;ancestors:string[]}[];statics:Map<string,Record<string,string>|null>;times:number[];frames?:ReturnType<typeof frameState>[];mods:boolean};
const STYLE=['fill','stroke','color','opacity','filter','style','mask','clip-path','stroke-width','fill-opacity','stroke-opacity','display','visibility','transform'];
const globalOps=new Set(['timeline.retime','timeline','layer.set','preservation','clip.place','lipsync','state.add','expression.preset','expression.set','param.set','param.define','delete','ungroup','group']);
export function captureIdentity(m:VectorDocument,ops:Operation[]):Capture|undefined{
 const nodes=protectedNodes(m);if(!nodes.length||ops.every(o=>['identity.protect','identity.release','decision.log','marker.set','marker.delete','region.time','region.time.delete','rename','lock'].includes(o.type)||o.type.startsWith('semantic.')||o.type.startsWith('landmark.')))return undefined;
 const statics=new Map<string,Record<string,string>|null>();const list=nodes.map(n=>{const set=renderSet(m,n.targets);const ancestors=new Set<string>();for(const id of n.targets){let p=m.index.get(id)?.parentNode as Element|null;while(p&&p.nodeType===1){const a=p.getAttribute('id');if(a)ancestors.add(a);p=p.parentNode as Element|null;}}
  for(const id of set){const e=m.index.get(id);statics.set(id,e?Object.fromEntries(Array.from(e.attributes).filter(a=>!a.name.startsWith('data-mai')).map(a=>[a.name,a.value])):null);}
  for(const id of ancestors){const e=m.index.get(id);statics.set('^'+id,e?Object.fromEntries(STYLE.filter(k=>e.hasAttribute(k)).map(k=>[k,e.getAttribute(k)!])):null);}
  return {id:n.id,levels:n.levels,set,ancestors:[...ancestors]};});
 // Evaluated frames only when the transaction can reach protected channels (directly or through drivers/params/modifiers).
 const protectedIds=new Set(list.flatMap(n=>[...n.set,...n.ancestors]));const reach=ops.some(o=>globalOps.has(o.type)||categories(o,m.project).targets.some(t=>protectedIds.has(t)));if(!reach)return {nodes:list,statics,times:[],mods:false};
 const mods=(m.project.modifiers??[]).some(x=>x.targets.some(t=>protectedIds.has(t)))||ops.some(o=>(o.type==='modifier.add'&&o.modifier.targets.some(t=>protectedIds.has(t)))||(o.type==='fluid.animate'&&o.targets.some(t=>protectedIds.has(t))));
 const keyTimes=m.project.tracks.filter(t=>t.property==='param'||protectedIds.has(t.target)).flatMap(t=>t.keys.map(k=>k.time));const d=m.project.duration;const times=[...new Set([0,d/2,d,...keyTimes])].sort((a,b)=>a-b).slice(0,12);
 return {nodes:list,statics,times,mods:true&&mods,frames:times.map(t=>frameState(m.project,t,{modifiers:mods}))};
}
const scaleOf=(t:string)=>{const m=/scale\(\s*(-?[\d.e+-]+)(?:[\s,]+(-?[\d.e+-]+))?\s*\)/.exec(t);return m?[Number(m[1]),Number(m[2]??m[1])]:[1,1];};
export function verifyIdentity(m:VectorDocument,cap:Capture|undefined,ops:Operation[]){
 if(!cap)return;const via=[...new Set(ops.map(o=>o.type))].join(', ');
 // An explicit, audited protection change for a part in this same transaction is the human/agent's decision: skip it.
 const released=new Set<string>([...ops.filter(o=>o.type==='semantic.protect').map(o=>(o as {id:string}).id),...ops.filter(o=>o.type==='identity.release').flatMap(o=>(o as {ids:string[]}).ids.map(id=>`identity:${id}`))]);const after=cap.times.length?cap.times.map(t=>frameState(m.project,Math.min(t,m.project.duration),{modifiers:cap.mods||(m.project.modifiers??[]).some(x=>cap.nodes.some(n=>x.targets.some(id=>n.set.has(id))))})):[];
 for(const n of cap.nodes){if(released.has(n.id))continue;const allowed=allowedFor(n.levels);const found=new Map<string,Set<string>>();const note=(cat:string,id:string)=>{if(cat==='none')return;const s=found.get(cat)??new Set<string>();s.add(id);found.set(cat,s);};
  for(const id of n.set){const before=cap.statics.get(id),e=m.index.get(id);if(before===undefined)continue;if(!e){if(before)note('structure',id);continue;}if(!before){note('structure',id);continue;}
   const now=Object.fromEntries(Array.from(e.attributes).filter(a=>!a.name.startsWith('data-mai')).map(a=>[a.name,a.value]));for(const k of new Set([...Object.keys(before),...Object.keys(now)]))if(before[k]!==now[k]){if(k==='d'&&before[k]&&now[k]){try{note(topology(before[k])===topology(now[k])?'geometry':'topology',id);}catch{note('geometry',id);}}else if(k==='transform'){const a=scaleOf(before[k]??''),b=scaleOf(now[k]??'');note(Math.abs(a[0]-b[0])>1e-6||Math.abs(a[1]-b[1])>1e-6?'scale':'rigid',id);}else note(attrCat(k),id);}}
  for(const id of n.ancestors){const before=cap.statics.get('^'+id),e=m.index.get(id);if(!before||!e)continue;for(const k of STYLE){const v=e.getAttribute(k)??undefined;if(before[k]!==v){if(k==='transform'){const a=scaleOf(before[k]??''),b=scaleOf(v??'');if(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))>scaleBudget(m))note('scale','^'+id);}else if(!['opacity','display','visibility'].includes(k))note(attrCat(k),'^'+id);}}}
  cap.frames?.forEach((f0,i)=>{const f1=after[i];if(!f1)return;for(const id of n.set){const a=f0.attrs[id]??{},b=f1.attrs[id]??{};for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(a[k]!==b[k]){if(k==='d'&&a[k]&&b[k]){try{note(topology(a[k])===topology(b[k])?'geometry':'topology',id);}catch{note('geometry',id);}}else note(attrCat(k),id);}
    const p0=f0.poses[id],p1=f1.poses[id];if(p0||p1)for(const k of ['x','y','rotation','scaleX','scaleY'] as const){const x=p0?.[k]??(k.startsWith('scale')?1:0),y=p1?.[k]??(k.startsWith('scale')?1:0);if(Math.abs(x-y)>1e-6)note(k.startsWith('scale')?'scale':'rigid',id);}}
   for(const id of n.ancestors){const p0=f0.poses[id],p1=f1.poses[id];for(const k of ['scaleX','scaleY'] as const){const x=p0?.[k]??1,y=p1?.[k]??1;if(Math.abs(x-y)>scaleBudget(m)&&Math.abs(y-1)>scaleBudget(m))note('scale','^'+id);}}});
  const blocked=[...found].filter(([c])=>!allowed.has(c));
  if(blocked.length)throw new IdentityError(`Protected identity (${n.id}: ${n.levels.join('+')}) would change ${blocked.map(([c,ids])=>`${c} of ${[...ids].slice(0,3).join(', ')}${ids.size>3?` (+${ids.size-3})`:''}`).join('; ')} via ${via}. ${n.levels.map(l=>LEVEL_MEANING[l]).join(' ')} The whole transaction was rolled back.`,{part:n.id,levels:n.levels,blocked:Object.fromEntries(blocked.map(([c,ids])=>[c,[...ids].slice(0,20)])),operations:via,evaluatedTimes:cap.times});}
}
