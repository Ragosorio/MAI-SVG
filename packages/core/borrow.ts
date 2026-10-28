// part.borrow: bring an alternate drawing of a part from another SVG of the same design system (e.g. the open right
// eye from "smile" so a winking character can start with both eyes open). Geometry and paint are copied as drawn —
// never redrawn — under a new group with prefixed ids, hidden by default so a sprite can switch to it. The source
// must share the artboard (same viewBox) unless `align` places it on an existing element.
import type {VectorDocument} from './document.js';
import type {Operation} from './model.js';
import {parseSvg} from '../converter/svg.js';
import {worldBox} from './space.js';
import {frameState} from './animation.js';

const TAGS=new Set(['path','rect','circle','ellipse','line','polygon','g']);
const COPY=new Set(['d','fill','stroke','stroke-width','stroke-opacity','fill-opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','fill-rule','opacity','x','y','cx','cy','r','rx','ry','width','height','x1','x2','y1','y2','points','transform']);
const IGNORE=new Set(['id','data-name','xmlns','class']);
type Borrow=Extract<Operation,{type:'part.borrow'}>;

export function borrowPart(m:VectorDocument,op:Borrow,touched:Set<string>){
 if(typeof op.svg!=='string'||op.svg.length>4_000_000)throw Error('part.borrow needs the source SVG text (≤4 MB); pass file through the part.borrow tool, ops.apply or a plan so the host can read it');
 if(!Array.isArray(op.ids)||!op.ids.length||op.ids.length>64)throw Error('part.borrow copies 1–64 source elements');
 const src=parseSvg(op.svg),root=src.documentElement;
 const vbA=(root.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number),vbB=(m.doc.documentElement.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number);
 if(!op.align&&(vbA.length!==4||vbA.some((v,i)=>Math.abs(v-vbB[i])>1e-6)))throw Error('Source artboard differs from the scene: pass align {to} to place the borrowed part');
 const byId=new Map<string,Element>();const walk=(e:Element)=>{const id=e.getAttribute('id');if(id)byId.set(id,e);for(const c of Array.from(e.childNodes))if(c.nodeType===1)walk(c as Element);};walk(root);
 if(m.index.has(op.id))throw Error(`ID ${op.id} already exists`);
 m.operation({type:'create',tag:'g',id:op.id,parent:op.parent,attrs:{'data-mai-name':op.name??op.id,...(op.hidden===false?{}:{opacity:'0'})}},touched);
 const copy=(e:Element,parent:string)=>{const tag=e.localName;if(!TAGS.has(tag))throw Error(`part.borrow cannot copy <${tag}> (shapes and groups only)`);
  const attrs:Record<string,string>={};for(const a of Array.from(e.attributes)){if(IGNORE.has(a.name)||a.name.startsWith('xmlns'))continue;
   if(!COPY.has(a.name))throw Error(`part.borrow: attribute ${a.name} on ${e.getAttribute('id')??tag} is not supported`);if(/url\(/.test(a.value))throw Error('part.borrow does not copy paint servers, masks or filters (url(#…))');attrs[a.name]=a.value;}
  const srcId=e.getAttribute('id');let id=`${op.id}--${(srcId??tag).replace(/[^\w.-]+/g,'-')}`;for(let i=2;m.index.has(id);i++)id=`${op.id}--${srcId??tag}-${i}`;
  m.operation({type:'create',tag:tag as 'g',id,parent,attrs},touched);if(tag==='g')for(const c of Array.from(e.childNodes))if(c.nodeType===1)copy(c as Element,id);};
 for(const sid of op.ids){const e=byId.get(sid);if(!e)throw Error(`Source element ${sid} not found (ids in source: ${[...byId.keys()].slice(0,30).join(', ')})`);copy(e,op.id);}
 if(op.align){const f=frameState({...m.project,tracks:[],signals:[],motionPaths:[],secondary:[],modifiers:[]},0,{camera:false}) as never;
  const to=worldBox(m,[op.align.to],f),me=worldBox(m,[op.id],f);if(!to||!me)throw Error('Cannot measure the borrowed part or the align target');
  const dx=(to.x0+to.x1)/2-(me.x0+me.x1)/2,dy=(op.align.anchor==='bottom'?to.y1-me.y1:(to.y0+to.y1)/2-(me.y0+me.y1)/2);
  m.operation({type:'attributes',id:op.id,attrs:{transform:`translate(${+dx.toFixed(3)} ${+dy.toFixed(3)})`}},touched);}
}
