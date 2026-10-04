import {parseSvg,serialize,elements,SVG_NS,assertSvg} from '../converter/svg.js';
import {safeId} from './document.js';import {segments} from './geometry.js';
export type Region={id:string;name:string;d:string};
export function separateParts(svg:string,config:{width:number;height:number;regions:Region[]}){
 assertSvg(svg);const doc=parseSvg(svg),root=doc.documentElement;const vb=(root.getAttribute('viewBox')??'').split(/[ ,]+/).map(Number);
 if(vb.length!==4||vb[0]!==0||vb[1]!==0||vb[2]!==config.width||vb[3]!==config.height)throw Error('Region coordinates must match the SVG viewBox');
 if(!config.regions.length||config.regions.length>16)throw Error('Provide 1–16 regions');
 if(elements(doc).some(e=>['animate','animateTransform','set'].includes(e.localName)||e.localName==='metadata'&&e.getAttribute('id')==='mai-project'||e.localName==='style'&&/animation|keyframes/i.test(e.textContent??'')))throw Error('Prepare parts before authoring animation; use a static SVG');
 const ids=new Set(elements(doc).map(e=>e.getAttribute('id')));const unique=(id:string)=>{safeId(id);if(ids.has(id))throw Error('Part ID collision: '+id);ids.add(id);return id;};
 const create=(tag:string,attrs:Record<string,string>)=>{const e=doc.createElementNS(SVG_NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const defs=elements(doc).find(e=>e.localName==='defs')??create('defs',{});if(!defs.parentNode)root.insertBefore(defs,root.firstChild);
 const sourceId=unique('mai-parts-source'),source=create('g',{id:sourceId,'data-mai-name':'Geometría original compartida'}),body=create('g',{id:unique('mai-parts-rest'),'data-mai-name':'Resto del personaje'});
 for(const n of Array.from(root.childNodes))if(n.nodeType===1&&!['defs','metadata','style','title','desc'].includes((n as unknown as {localName:string}).localName))source.appendChild(n);
 body.appendChild(source);root.appendChild(body);
 const bounds={x:'0',y:'0',width:String(config.width),height:String(config.height)};
 const makeMask=(id:string,base:boolean,region?:Region)=>{const m=create('mask',{id:unique(id),maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',...bounds,style:'mask-type:luminance'});m.appendChild(create('rect',{...bounds,fill:base?'white':'black'}));if(region)m.appendChild(create('path',{d:region.d,fill:'white','fill-rule':'evenodd'}));defs.appendChild(m);return m;};
 for(const r of config.regions){safeId(r.id);if(typeof r.name!=='string'||r.name.length>200||typeof r.d!=='string'||r.d.length>100000)throw Error('Invalid region');segments(r.d);}
 const rest=makeMask('mai-parts-rest-mask',true);body.setAttribute('mask','url(#mai-parts-rest-mask)');
 const masks=config.regions.map((r,i)=>{const m=makeMask('mai-parts-mask-'+i,false,r);rest.appendChild(create('path',{d:r.d,fill:'black','fill-rule':'evenodd'}));const g=create('g',{id:unique(r.id),'data-mai-name':r.name,mask:`url(#${m.getAttribute('id')})`});g.appendChild(create('use',{href:'#'+sourceId}));root.appendChild(g);return m;});
 // Later regions own overlap. Disjoint ownership avoids duplicated translucent edges.
 masks.forEach((m,i)=>config.regions.slice(i+1).forEach(r=>m.appendChild(create('path',{d:r.d,fill:'black','fill-rule':'evenodd'}))));
 const result=serialize(doc);assertSvg(result);return{svg:result,report:{sourceId,parts:config.regions.map(r=>({id:r.id,name:r.name})),overlapPolicy:'later region wins',geometryPreserved:true,rig:'rigid poses; masks must be rebuilt before deforming geometry',review:'required'}};
}
