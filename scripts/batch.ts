import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {convertFile,PRESETS} from '../packages/converter/index.js';
import {assertSvg,parseSvg,elements,prefixIds,serialize,SVG_NS} from '../packages/converter/svg.js';
const source='/Users/roor.osorio/Desktop/No one/assets/cats-source';
const preset=PRESETS.find(p=>p.id==='high-color-preserved')!;
const selected={selectedAt:'2026-10-04',preset:preset.id,userStatement:'que sea el high-color-preserved ese es',referenceStyles:['candy_alchemist_cat','iridescent_origami_cat','canelo_cozy_cat','jelly_aquatic_cat','steampunk_clockwork_cat'],unseenCatsRequireReview:true};
await writeFile('docs/QUALITY-SELECTION.json',JSON.stringify(selected,null,2));
const records=[];
for(const file of (await readdir(join(source,'png'))).filter(f=>f.endsWith('.png')&&!f.startsWith('_')).sort()){
 const name=file.slice(0,-4),input=join(source,'png',file),local=join('fixtures/all',file);await copyFile(input,local);
 const hash=createHash('sha256').update(await readFile(input)).digest('hex');
 const dest=join('assets/vector',`${name}.svg`);let result;
 try {
   try {const report=JSON.parse(await readFile(join('experiments/review',name,`${preset.id}.json`),'utf8'));if(report.sha256!==hash)throw Error('Hash mismatch');result={svg:await readFile(join('experiments/review',name,`${preset.id}.svg`),'utf8'),report};}
   catch {try{const report=JSON.parse(await readFile(dest+'.json','utf8'));if(report.sha256!==hash||report.preset!==preset.id)throw Error('Outdated');result={svg:await readFile(dest,'utf8'),report};}catch{console.error(`Tracing ${name}`);result=await convertFile(local,preset);}}
   assertSvg(result.svg);await writeFile(dest,result.svg);await writeFile(dest+'.json',JSON.stringify(result.report,null,2));
   const wrapper=parseSvg(await readFile(join(source,`${name}.svg`),'utf8'));assertSvg(serialize(wrapper),true);
   const image=elements(wrapper).find(e=>e.localName==='image')!;const vector=parseSvg(result.svg).documentElement;prefixIds(vector,`${name}-`);const nested=wrapper.createElementNS(SVG_NS,'svg');
   for(const a of Array.from(image.attributes))if(a.localName!=='href')nested.setAttribute(a.name,a.value);
   nested.setAttribute('viewBox',vector.getAttribute('viewBox')!);nested.setAttribute('preserveAspectRatio',image.getAttribute('preserveAspectRatio')||'xMidYMid meet');
   for(const node of Array.from(vector.childNodes))nested.appendChild(wrapper.importNode(node,true));image.parentNode!.replaceChild(nested,image);const animated=serialize(wrapper);assertSvg(animated);await writeFile(join('assets/animated',`${name}.svg`),animated);
   const status=result.report.paths>20000?'requires-cleanup':'converted-pending-review';records.push({name,source:input,sha256:hash,preset:preset.id,status,...result.report,vector:dest,animated:join('assets/animated',`${name}.svg`)});console.error(`${name}: ${result.report.paths} paths, ${(result.report.bytes/1048576).toFixed(1)} MiB`);
 }catch(error){records.push({name,source:input,sha256:hash,preset:preset.id,status:'failed',error:String(error)});console.error(`${name}: FAILED ${String(error)}`);}
 await writeFile('assets/manifest.json',JSON.stringify({schemaVersion:1,quality:selected,completed:records.length,total:32,records},null,2));
}
console.log(JSON.stringify({total:records.length,converted:records.filter(r=>r.status!=='failed').length,failed:records.filter(r=>r.status==='failed').length}));
