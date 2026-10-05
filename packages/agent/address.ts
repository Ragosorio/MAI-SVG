import type {VectorDocument} from '../core/document.js';
import type {SemanticNode} from '../core/model.js';
import {elements} from '../converter/svg.js';
// Semantic addressing: agents name parts the way humans think about them ("candy.flask.smoke", "mouth", "eyes")
// and MAI resolves them to real SVG IDs. Ambiguity is returned with candidates, never guessed.
export class AgentError extends Error{constructor(readonly code:string,message:string,readonly extra:Record<string,unknown>={},readonly status=422){super(message);}}
const slug=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const GROUPS:Record<string,string[]>={eyes:['eye-left','eye-right'],brows:['brow-left','brow-right'],ears:['ear-left','ear-right']};
export function nodes(m:VectorDocument){return (m.project.semantic?.nodes??[]).filter(n=>n.status!=='rejected');}
export function addressOf(m:VectorDocument,n:SemanticNode){const chain:string[]=[];let c:SemanticNode|undefined=n;const seen=new Set<string>();while(c&&!seen.has(c.id)){seen.add(c.id);chain.unshift(c.id);c=c.parent?nodes(m).find(x=>x.id===c!.parent):undefined;}return chain.join('.');}
const descendants=(m:VectorDocument,n:SemanticNode):SemanticNode[]=>{const kids=nodes(m).filter(x=>x.parent===n.id);return [...kids,...kids.flatMap(k=>descendants(m,k))];};
const matches=(n:SemanticNode,seg:string)=>{const s=slug(seg);return n.id===seg||slug(n.id)===s||n.role===s||slug(n.label)===s||(GROUPS[s]?.includes(n.role)??false);};
// Every SVG id covered by a node: its targets and, for groups, all descendant elements' ids.
export function nodeIds(m:VectorDocument,n:SemanticNode,deep=false){const ids=new Set<string>();for(const t of n.targets){if(!m.index.has(t))continue;ids.add(t);if(deep)for(const e of elements(m.index.get(t)!)){const id=e.getAttribute('id');if(id)ids.add(id);}}if(deep)for(const d of descendants(m,n))for(const id of nodeIds(m,d,true))ids.add(id);return [...ids];}
export type Resolved={ref:string;nodes:SemanticNode[];ids:string[];addresses:string[];via:'svg-id'|'semantic'};
export function resolve(m:VectorDocument,ref:string):Resolved{
 if(typeof ref!=='string'||!ref.trim()||ref.length>300)throw new AgentError('INVALID_ARGUMENT','Target reference must be a non-empty string');
 if(ref.startsWith('#')){const id=ref.slice(1);if(!m.index.has(id))throw new AgentError('NOT_FOUND',`SVG id ${id} does not exist`);return {ref,nodes:[],ids:[id],addresses:[],via:'svg-id'};}
 const all=nodes(m);const exact=all.find(n=>n.id===ref);if(exact)return pack(m,ref,[exact]);
 const segs=ref.split('.').filter(Boolean);let current:SemanticNode[]|null=null;
 for(const seg of segs){const pool:SemanticNode[]=current===null?all:current.flatMap(c=>descendants(m,c));const hit=pool.filter(n=>matches(n,seg));if(!hit.length){current=[];break;}
  // Prefer the shallowest matches (a part's own child over a grandchild with the same role).
  const depth=(n:SemanticNode)=>addressOf(m,n).split('.').length;const min=Math.min(...hit.map(depth));current=hit.filter(n=>depth(n)===min);}
 if(current&&current.length){const last=slug(segs.at(-1)!);const group=GROUPS[last];
  // Collective references ("eyes") never cross characters: two owners means ambiguity, resolved with "candy.eyes".
  const owners=[...new Set(current.map(n=>ownerOf(m,n).id))];
  if(owners.length>1)throw new AgentError('AMBIGUOUS_TARGET',`"${ref}" matches parts of ${owners.length} different owners`,{candidates:current.map(n=>({id:n.id,address:addressOf(m,n),owner:ownerOf(m,n).id,role:n.role,label:n.label,status:n.status})),suggestions:owners.map(o=>`${o}.${ref}`)},409);
  if(current.length===1||(group&&current.every(n=>group.includes(n.role))))return pack(m,ref,current);
  throw new AgentError('AMBIGUOUS_TARGET',`"${ref}" matches ${current.length} parts`,{candidates:current.map(n=>({id:n.id,address:addressOf(m,n),role:n.role,label:n.label,confidence:n.confidence??(n.status==='confirmed'?1:.5),status:n.status}))},409);}
 if(m.index.has(ref))return {ref,nodes:[],ids:[ref],addresses:[],via:'svg-id'};
 const scored=all.map(n=>({n,score:similarity(slug(ref),[n.id,n.role,slug(n.label),addressOf(m,n)])})).filter(x=>x.score>.3).sort((a,b)=>b.score-a.score).slice(0,5);
 throw new AgentError('NOT_FOUND',`No part matches "${ref}"`,{suggestions:scored.map(x=>({id:x.n.id,address:addressOf(m,x.n),role:x.n.role,label:x.n.label})),hint:'Use part.candidates with a point/box to locate it visually, then part.label to name it.'},404);
}
// Owner = nearest ancestor-or-self that is a character, else the root of the part's tree.
export function ownerOf(m:VectorDocument,n:SemanticNode):SemanticNode{const all=nodes(m);let c:SemanticNode=n;const seen=new Set<string>();let root=n;while(c&&!seen.has(c.id)){seen.add(c.id);if(c.role==='character')return c;root=c;const p=c.parent?all.find(x=>x.id===c.parent):undefined;if(!p)break;c=p;}return root;}
// Mutations need confirmed parts: a proposal does not acquire authority by being named.
export function requireConfirmed(r:Resolved){const pending=r.nodes.filter(n=>n.status!=='confirmed');if(pending.length)throw new AgentError('UNCONFIRMED_TARGET',`${pending.map(n=>n.id).join(', ')} ${pending.length>1?'are':'is'} only proposed`,{candidates:pending.map(n=>({id:n.id,role:n.role,label:n.label,confidence:n.confidence})),recovery:{action:'confirm',tools:['part.candidates','part.label']}},409);return r;}
function pack(m:VectorDocument,ref:string,list:SemanticNode[]):Resolved{return {ref,nodes:list,ids:[...new Set(list.flatMap(n=>nodeIds(m,n)))],addresses:list.map(n=>addressOf(m,n)),via:'semantic'};}
function similarity(a:string,options:string[]){let best=0;for(const o of options){const b=slug(o);if(!b)continue;if(b.includes(a)||a.includes(b))best=Math.max(best,.8);const grams=(s:string)=>new Set(Array.from({length:Math.max(1,s.length-1)},(_,i)=>s.slice(i,i+2)));const x=grams(a),y=grams(b);let inter=0;for(const g of x)if(y.has(g))inter++;best=Math.max(best,2*inter/(x.size+y.size));}return best;}
// Expression slot of a node (mouth/eyes/brows/ears) for parameter scoping.
export const slotOfRole=(role:string)=>role.startsWith('eye')?'eyes':role.startsWith('brow')?'brows':role.startsWith('ear')?'ears':role==='muzzle'?'mouth':role;
