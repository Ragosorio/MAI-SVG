import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertSvg,parseSvg,elements,serialize} from '../packages/converter/svg.js';
const root='experiments/review';const reports=[];
for(const name of await readdir(root)){
  if(!(await stat(join(root,name))).isDirectory())continue;
  for(const id of ['balanced-color-preserved','high-color-preserved','high-spline-stacked']){
    const stem=join(root,name,id);
    try{
      const report=JSON.parse(await readFile(`${stem}.json`,'utf8'));const svg=await readFile(`${stem}.svg`,'utf8');
      const checked=assertSvg(svg);const doc=parseSvg(svg);
      report.artworkPaths=elements(doc).filter(e=>e.localName==='g'&&e.getAttribute('id')==='mai-artwork').reduce((n,g)=>n+elements(g).filter(e=>e.localName==='path').length,0);
      report.alphaMaskPaths=elements(doc).filter(e=>e.localName==='mask').reduce((n,g)=>n+elements(g).filter(e=>e.localName==='path').length,0);
      report.candidateSha256=createHash('sha256').update(svg).digest('hex');
      reports.push({input:name,...report,validation:checked});await writeFile(`${stem}.json`,JSON.stringify(report,null,2));
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
}
await writeFile(join(root,'summary.json'),JSON.stringify({schemaVersion:1,status:'pending-visual-review',originalsModified:false,reports},null,2));
const original=parseSvg(await readFile('fixtures/candy_alchemist_cat.svg','utf8'));
const converted=parseSvg(await readFile('experiments/wrapper/candy_alchemist_cat/balanced-color-preserved.svg','utf8'));
const sourceNodes=elements(original).filter(e=>['defs','g','ellipse','circle'].includes(e.localName)&&!elements(e).some(c=>c.localName==='image'));
function canonical(node:Node):unknown {
  if(node.nodeType===1){const e=node as Element;return {name:e.localName,namespace:e.namespaceURI,attributes:Array.from(e.attributes).map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0])),children:Array.from(e.childNodes).filter(c=>c.nodeType!==3||!!c.textContent?.trim()).map(canonical)};}
  return {type:node.nodeType,text:node.textContent};
}
const convertedSignatures=new Set(elements(converted).filter(e=>['defs','g','ellipse','circle'].includes(e.localName)).map(e=>JSON.stringify(canonical(e))));
const preserved=sourceNodes.every(e=>convertedSignatures.has(JSON.stringify(canonical(e))));
if(!preserved)throw new Error('Original surrounding SVG nodes changed');
await writeFile('experiments/evidence/wrapper-preservation.json',JSON.stringify({unchangedSurroundingElements:sourceNodes.length,passed:preserved,sourceViewBox:original.documentElement.getAttribute('viewBox'),outputViewBox:converted.documentElement.getAttribute('viewBox'),output:assertSvg(serialize(converted))},null,2));
console.log(JSON.stringify({candidates:reports.length,wrapperPreserved:preserved}));
