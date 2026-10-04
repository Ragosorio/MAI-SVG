import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {VectorDocument} from '../packages/core/document.js';
import {exportSvg} from '../packages/core/export.js';
import type {Operation,Emotion} from '../packages/core/model.js';
const input='experiments/color-preserved/candy_alchemist_cat/high-color-preserved.svg';
const original=await readFile(input,'utf8');const doc=new DOMParser().parseFromString(original,'image/svg+xml');const root=doc.documentElement!,serializer=new XMLSerializer();
const defs=Array.from(root.childNodes).filter(n=>n.nodeType===1&&(n as unknown as {localName:string}).localName==='defs').map(n=>Array.from(n.childNodes).map(c=>serializer.serializeToString(c)).join('')).join('');
const art=Array.from(root.childNodes).filter(n=>n.nodeType===1&&(n as unknown as {localName:string}).localName!=='defs').map(n=>serializer.serializeToString(n)).join('');
const head='M195 0H455L473 227L425 254L370 270L284 264L222 247L199 209Z';
const ellipse=(x:number,y:number,rx:number,ry:number)=>`M${x-rx} ${y}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0Z`;
const flask='M474 214L529 217L564 329L550 382L512 407L447 382L443 323Z';
const eyes=ellipse(296,196,21,22)+ellipse(378,181,21,23),mouth=ellipse(337,232,26,12);
const ref='<use href="#candy-original"/>';
const source=`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700" viewBox="0 0 700 700" data-mai-preset="high-color-preserved"><defs>${defs}
<clipPath id="candy-smoke-cut"><path clip-rule="evenodd" d="M0 0H700V700H0ZM474 52H637V224H474Z"/></clipPath>
<clipPath id="candy-body-clip"><path clip-rule="evenodd" d="M0 0H700V700H0Z${head}${flask}"/></clipPath>
<clipPath id="candy-flask-clip"><path d="${flask}"/></clipPath>
<clipPath id="candy-head-clip"><path d="${head}"/></clipPath>
<clipPath id="candy-face-cut"><path clip-rule="evenodd" d="M0 0H700V700H0Z${eyes}"/></clipPath>
<clipPath id="candy-left-cut"><ellipse cx="296" cy="196" rx="21" ry="22"/></clipPath>
<clipPath id="candy-right-cut"><ellipse cx="378" cy="181" rx="21" ry="23"/></clipPath>
<clipPath id="candy-mouth-cut"><ellipse cx="337" cy="232" rx="26" ry="12"/></clipPath>
<radialGradient id="candy-fur"><stop stop-color="#fff2dd"/><stop offset="1" stop-color="#ead2b0"/></radialGradient>
</defs><g id="candy-character" data-mai-name="Candy · convertido desde PNG">
<g id="candy-body" clip-path="url(#candy-body-clip)"><g id="candy-original" clip-path="url(#candy-smoke-cut)" ${root.getAttribute('mask')?`mask="${root.getAttribute('mask')}"`:''} data-mai-name="Trazado original high-color-preserved">${art}</g></g>
<g id="candy-flask" data-mai-name="Frasco y mano originales"><g clip-path="url(#candy-flask-clip)">${ref}</g></g>
<g id="candy-head" data-mai-name="Cabeza · preparación por recorte vectorial"><g clip-path="url(#candy-head-clip)"><g clip-path="url(#candy-face-cut)">${ref}</g>
<g id="candy-left-eye" data-mai-name="Ojo turquesa original"><g clip-path="url(#candy-left-cut)">${ref}</g></g>
<g id="candy-right-eye" data-mai-name="Ojo violeta original"><g clip-path="url(#candy-right-cut)">${ref}</g></g>
<g id="candy-mouth-original" data-mai-name="Boca conservada en la cabeza original"/>
<path id="candy-sad-brow-left" d="M275 174C287 165 303 159 316 163C304 165 289 170 276 178Z" fill="#9b727e" opacity="0"/>
<path id="candy-sad-brow-right" d="M357 147C370 145 386 150 398 158L397 162C384 155 370 150 357 151Z" fill="#996991" opacity="0"/>
<path id="candy-tear-left" d="M277 213C273 220 269 226 273 230C281 235 287 228 282 223Z" fill="#9ae3ff" opacity="0"/>
<path id="candy-lid-left" d="M276 187Q296 177 316 187L316 190Q296 181 276 190Z" fill="#f5dfc9" opacity="0"/>
<path id="candy-lid-right" d="M358 171Q378 161 398 171L398 174Q378 165 358 174Z" fill="#f4dbd9" opacity="0"/>
</g></g></g>
<g id="candy-vfx-happy" opacity="0" fill="#ff7eb8"><path d="M478 127C461 105 435 130 478 158C521 130 495 105 478 127Z"/><path d="M185 158C175 144 158 160 185 178C212 160 195 144 185 158Z"/></g>
<g id="candy-vfx-surprise" opacity="0" fill="#ffe69f"><path d="M472 98L465 116L447 123L465 130L472 149L479 130L497 123L479 116Z"/></g>
<g id="candy-vfx-sad" opacity="0" fill="#9adeff"><path d="M463 162Q443 188 463 191Q483 188 463 162Z"/></g>
<g id="candy-vfx-sleep" opacity="0" fill="#e9ceff"><path d="M470 110H496L470 136H496" fill="none" stroke="#e9ceff" stroke-width="5" stroke-linecap="round"/><path d="M508 86H528L508 106H528" fill="none" stroke="#e9ceff" stroke-width="4"/></g>
<g id="candy-vfx-neutral" opacity="1"/><g id="candy-vfx-angry" opacity="0" stroke="#ff8f9c" stroke-width="4" fill="none"><path d="M466 123v12h-12M478 147v-12h12M466 147v-5M478 123v5"/></g></svg>`;
const model=new VectorDocument(source,'Candy Alchemist · emociones desde PNG');
const ops:Operation[]=[{type:'timeline',duration:9,fps:24,loop:true},...(['candy-left-eye','candy-right-eye','candy-head','candy-character']as const).map((id,i)=>({type:'pose' as const,id,pose:{pivotX:[296,378,337,350][i],pivotY:[196,181,255,400][i]}}))];
function expression(id:string,name:string,rotation:number,lid=0):Emotion{return{id,name,targets:{'candy-head':{pose:{rotation}},'candy-lid-left':{attrs:{opacity:String(lid)}},'candy-lid-right':{attrs:{opacity:String(lid)}},'candy-sad-brow-left':{attrs:{opacity:id==='sad'?'.65':'0'}},'candy-sad-brow-right':{attrs:{opacity:id==='sad'?'.65':'0'}},'candy-tear-left':{attrs:{opacity:'0'}}}};}
// Preserve the original facial geometry. Expressions use acting and restrained eyelids.
const moods=[expression('neutral','Sereno',0),expression('happy','Feliz',-2),expression('surprised','Sorprendido',1),expression('angry','Enojado',2,.35),expression('sad','Triste',-2,.2),expression('sleepy','Somnoliento',-1.5,.5),expression('blink','Parpadeo',0,1)];
ops.push({type:'identity.protect',ids:['candy-original','candy-left-eye','candy-right-eye','candy-mouth-original']});
for(const emotion of moods)ops.push({type:'emotion.define',emotion});
ops.push({type:'sprite.define',sprite:{id:'candy-emotion-vfx',name:'Efectos de Candy',initial:'neutral',variants:Object.fromEntries(['neutral','happy','surprise','angry','sad','sleep'].map(s=>[s,['candy-vfx-'+s]]))}});
for(const [time,id,state]of [[0,'neutral','neutral'],[.55,'neutral','neutral'],[.66,'blink','neutral'],[.8,'neutral','neutral'],[1.3,'happy','happy'],[2,'happy','happy'],[2.55,'surprised','surprise'],[3.2,'surprised','surprise'],[3.8,'angry','angry'],[4.35,'angry','angry'],[4.9,'sad','sad'],[5.55,'sad','sad'],[6.15,'sleepy','sleep'],[6.8,'sleepy','sleep'],[7.4,'happy','happy'],[8,'happy','happy'],[8.5,'neutral','neutral'],[9,'neutral','neutral']]as const){ops.push({type:'emotion.keyframe',id,time,easing:'ease-in-out'},{type:'sprite.keyframe',id:'candy-emotion-vfx',state,time});}
for(const [time,value]of [[0,0],[1,-2],[1.5,-6],[2,0],[3,-3],[4,0],[5,3],[6,5],[6.8,5],[7.5,-6],[8.5,0],[9,0]])ops.push({type:'keyframe',target:'candy-character',property:'y',time,value,easing:'ease-in-out'});
ops.push({type:'pose',id:'candy-flask',pose:{pivotX:460,pivotY:376}});
for(const [time,value]of [[0,0],[1.2,-1.5],[1.8,1],[2.8,-2],[3.4,0],[4.2,1.5],[5.2,0],[6.5,.7],[7.5,-1.5],[9,0]])ops.push({type:'keyframe',target:'candy-flask',property:'rotation',time,value,easing:'ease-in-out'});
for(const [id,open,closed]of [['candy-lid-left','M276 187Q296 177 316 187L316 190Q296 181 276 190Z','M276 174Q296 170 316 174L316 215Q296 208 276 215Z'],['candy-lid-right','M358 171Q378 161 398 171L398 174Q378 165 358 174Z','M358 158Q378 154 398 158L398 201Q378 194 358 201Z']])for(const [time,value]of [[0,open],[.55,open],[.66,closed],[.8,open],[9,open]]as const)ops.push({type:'keyframe',target:id,property:'d',time,value,easing:'ease-in-out'});
ops.push({type:'fluid.add',config:{id:'candy-bottle-smoke',kind:'smoke',x:515,y:220,width:100,height:150,parent:'candy-flask',quality:'high',cycles:3,color:'#ef98d7',seed:7}});
model.apply(ops);await mkdir('examples/candy-emotions',{recursive:true});
await writeFile('examples/candy-emotions/candy-source.svg',source);await writeFile('examples/candy-emotions/candy-operations.json',JSON.stringify(ops,null,2));
for(const profile of ['editable','standalone']as const){const result=exportSvg(model,{profile,tolerance:.25,maxSamples:5000});await writeFile(`examples/candy-emotions/candy-${profile}.svg`,result.svg);await writeFile(`examples/candy-emotions/candy-${profile}.json`,JSON.stringify(result.report,null,2));}
await writeFile('examples/candy-emotions/provenance.json',JSON.stringify({source:input,png:'fixtures/candy_alchemist_cat.png',sha256:createHash('sha256').update(original).digest('hex'),preset:'high-color-preserved',originalGeometryRetained:true,preparation:'Rigid vector crops; original eyes/nose/mouth retained. Conservative acting and temporary eyelids; no replacement mouth or copied fur patches',operations:ops.length,tracks:model.project.tracks.length},null,2));
console.log(JSON.stringify({operations:ops.length,tracks:model.project.tracks.length,objects:model.count}));
