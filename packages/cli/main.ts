#!/usr/bin/env node
import {creative}from './creative.js';
import {runTool,toolHelp,parseArgs,callSession}from './agent.js';
import {toolByName}from '../agent/registry.js';
import {startMcp}from '../mcp/server.js';
import {assisted} from './assist.js';
import {identityCheck}from './identity.js';
import { readFile, writeFile, mkdir, readdir, copyFile, stat, rename, realpath } from 'node:fs/promises';
import { resolve, join, basename, extname, relative, sep } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {startEditorServer} from '../server/server.js';
import {preview} from './preview.js';
import {spriteSheet} from '../core/spritesheet.js';
import {renderSvg,closeRenderer} from '../server/render.js';
import {proof} from './proof.js';
import {audit,quality,capabilities} from '../core/agent.js';
import {VectorDocument} from '../core/document.js';
import {session,sessionCommand} from './session.js';
import { PRESETS, convertFile, MAX_INPUT_BYTES } from '../converter/index.js';
import { assertSvg, parseSvg, serialize, elements } from '../converter/svg.js';
import { writeGallery, type GalleryEntry } from './gallery.js';
const args=process.argv.slice(2);const command=args.shift();
const option=(name:string,fallback?:string)=>{const index=args.indexOf(name);if(index<0)return fallback; if(!args[index+1]||args[index+1].startsWith('--'))throw new Error(`${name} requires a value`);return args[index+1];};
const has=(name:string)=>args.includes(name);
async function atomic(path:string,text:string){const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,text);await rename(temp,path);}
function selectPresets(){const id=option('--preset');if(id){const p=PRESETS.find(p=>p.id===id);if(!p)throw new Error(`Unknown preset: ${id}`);return [p];}if(has('--compare'))return PRESETS.slice(0,2);if(!has('--quality'))return [PRESETS.find(p=>p.id==='high-color-preserved')!];const quality=option('--quality','balanced');if(!['balanced','high'].includes(quality!))throw new Error('Quality must be balanced or high');return [PRESETS[quality==='high'?1:0]];}
async function vectorize(){
  const input=args[0];if(!input||input.startsWith('--'))throw new Error('Specify an input image, SVG or directory');
  const source=await realpath(resolve(input));const info=await stat(source);
  const output=resolve(option('--output','experiments/run')!);
  if(output===source||info.isDirectory()&&!relative(source,output).startsWith('..'))throw new Error('Output must be outside the source directory');
  await mkdir(output,{recursive:true});
  const files=info.isDirectory()?(await readdir(source)).filter(f=>/\.(png|webp|jpe?g|svg)$/i.test(f)&&!f.startsWith('_')).sort().map(f=>join(source,f)):[source];
  if(!files.length)throw new Error('No supported inputs');
  const stems=new Map<string,number>();for(const file of files){const stem=basename(file,extname(file));stems.set(stem,(stems.get(stem)??0)+1);}
  const presets=selectPresets();const entries:GalleryEntry[]=[];const failures:{input:string;preset:string;error:string}[]=[];
  const reports:Record<string,unknown>[]=[];
  // Sequential bounded work: at most one WASM worker active; source stays read-only.
  for(const file of files){
    const stem=basename(file,extname(file));const name=(stems.get(stem)??0)>1?`${stem}-${extname(file).slice(1).toLowerCase()}`:stem;
    const dir=join(output,name);await mkdir(dir,{recursive:true});
    const entry:GalleryEntry={name,candidates:[]};
    try {
      if((await stat(file)).size>MAX_INPUT_BYTES)throw new Error(`Input too large: ${basename(file)}`);
      if(!/\.svg$/i.test(file)) await sharp(file,{limitInputPixels:4_000_000}).rotate().png().toFile(join(dir,'original.png'));
      else await copyFile(file,join(dir,'source.svg'));
    } catch(error) {
      const failure={input:basename(file),preset:'decode',error:String(error)};failures.push(failure);await atomic(join(dir,'decode.error.json'),JSON.stringify(failure,null,2));process.stderr.write(`  FAILED: ${String(error)}\n`);continue;
    }
    for(const preset of presets){
      process.stderr.write(`Tracing ${basename(file)} / ${preset.id}\n`);
      try{const result=await convertFile(file,preset);await atomic(join(dir,`${preset.id}.svg`),result.svg);if(option('--identity-profile')){const gate=await identityCheck(option('--identity-reference',join(dir,'original.png'))!,join(dir,`${preset.id}.svg`),JSON.parse(await readFile(option('--identity-profile')!,'utf8')),[0],join(dir,preset.id+'-identity'));(result.report as Record<string,unknown>).identityGate=gate;if(!gate.pass){result.report.status='identity-review-failed';failures.push({input:basename(file),preset:preset.id,error:'Feature identity gate failed'});}}await atomic(join(dir,`${preset.id}.json`),JSON.stringify(result.report,null,2));reports.push({input:basename(file),...result.report});entry.candidates.push({id:preset.id,report:result.report});process.stderr.write(`  ${result.report.paths} paths · ${Math.round(result.report.bytes/1024)} KiB · raster images: ${result.report.rasterImages}\n`);}
      catch(error){const failure={input:basename(file),preset:preset.id,error:String(error)};failures.push(failure);await atomic(join(dir,`${preset.id}.error.json`),JSON.stringify(failure,null,2));process.stderr.write(`  FAILED: ${String(error)}\n`);}
    }
    if(!/\.svg$/i.test(file))entries.push(entry);
  }
  await atomic(join(output,'report.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),status:'pending-visual-review',reports,failures},null,2));
  if(entries.length)await writeGallery(output,entries);
  console.log(JSON.stringify({output,gallery:entries.length?join(output,'index.html'):null,candidates:reports.length,failures:failures.length,status:'pending-visual-review'},null,2));
  if(failures.length)process.exitCode=1;
}
async function serve(){
  const root=await realpath(resolve(option('--directory','experiments/run')!));
  const port=Number(option('--port','4317'));if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
  const types:Record<string,string>={'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8'};
  const server=createServer(async(req,res)=>{
    try{
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
      const pathname=decodeURIComponent(new URL(req.url!,'http://localhost').pathname);const requested=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
      const file=await realpath(requested);const rel=relative(root,file);
      if(rel.startsWith(`..${sep}`)||rel==='..'||file===root||!types[extname(file)]){res.writeHead(403);res.end();return;}
      const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'"});res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  server.on('error',error=>{console.error(String(error));process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`MAI SVG comparison gallery: http://127.0.0.1:${port}`));
}
async function editabilityProof(){
  const input=args[0];if(!input)throw new Error('Specify SVG input');const source=await readFile(input,'utf8');assertSvg(source);const doc=parseSvg(source);
  const shape=elements(doc).find(e=>e.localName==='path'&&e.getAttribute('id')?.startsWith('mai-shape-'));
  if(!shape)throw new Error('No identified artwork path');const id=shape.getAttribute('id');shape.setAttribute('fill','#ff00ff');
  const edited=serialize(doc);assertSvg(edited);const output=resolve(option('--output','experiments/editability-proof.svg')!);if(output===resolve(input))throw new Error('Proof cannot overwrite candidate');await writeFile(output,edited);console.log(JSON.stringify({selectedPath:id,operation:'set fill',output,reopened:!!elements(parseSvg(edited)).find(e=>e.getAttribute('id')===id&&e.getAttribute('fill')==='#ff00ff')}));
}
// Legacy file-oriented commands keep their contract; everything else goes through the agent tool registry.
const legacy=(command==='export'&&args[0]!=='capabilities')||['apply','load','insert','session','objects','object','open','render','vectorize','segment','separate','identity-check','spritesheet','proof','gallery','serve','prove-editable','context','quality','validate','help','--help'].includes(command??'help')||(command==='compare'&&args.filter(a=>/\.svg$/i.test(a)).length===2)||(command==='preview'&&args.some(a=>/\.svg$/i.test(a)))||(command==='fluid'&&args[0]!=='animate');
async function agentEntry(){if(command==='tools'){console.log(toolHelp());return true;}if(command==='mcp'){await startMcp();return true;}
 if(command==='call'){const tool=toolByName(args[0]??'');if(!tool){console.log(JSON.stringify({ok:false,error:{code:'UNKNOWN_TOOL',message:`Unknown tool ${args[0]}`}}));process.exitCode=1;return true;}
  // `call` is the generic form of every verb: same parser, same envelope, same exit codes (0 ok, 1 error, 2 conflict).
  process.exitCode=await runTool([...tool.cli.split(' '),...args.slice(1).filter(a=>a!=='--json')]);return true;}
 if(legacy)return false;const argv=[command!,...args].filter(a=>a!=='--json').map(a=>command==='choices'&&a==='show'?'inspect':a);const code=await runTool(argv);if(code<0)return false;process.exitCode=code;return true;}
try{
  if(await agentEntry()){}
  else if(await creative(command,args,option)){}
  else if(['segment','separate','identity-check'].includes(command!))console.log(JSON.stringify(await assisted(command!,args,option),null,2));
  else if(command==='preview'){if(!args[0]||args[0].startsWith('--'))throw Error('Specify SVG');const output=resolve(option('--output','experiments/preview.gif')!);if(output===resolve(args[0]))throw Error('Cannot overwrite source');console.log(JSON.stringify(await preview(args[0],output,Number(option('--fps','10')),Number(option('--width','480'))),null,2));}
  else if(command==='spritesheet'){if(!args[0]||args[0].startsWith('--'))throw Error('Specify editable SVG');const model=new VectorDocument(await readFile(args[0],'utf8'));const frames=Number(option('--frames','24'));if(!Number.isInteger(frames)||frames<2||frames>120)throw Error('Frames must be 2–120');const times=option('--times')?.split(',').map(Number)??Array.from({length:frames},(_,i)=>model.project.duration*i/frames);const result=spriteSheet(model,times,Number(option('--columns','6')),Number(option('--cell','180')));const output=resolve(option('--output','experiments/spritesheet.svg')!);if(output===resolve(args[0]))throw Error('Cannot overwrite source');await writeFile(output,result.svg);await writeFile(output+'.json',JSON.stringify(result.manifest,null,2));if(has('--png')){try{await writeFile(output+'.png',(await renderSvg(result.svg)).png);}finally{await closeRenderer();}}console.log(JSON.stringify({output,manifest:result.manifest},null,2));}
  else if(command==='proof'||command==='compare'){const inputs=command==='proof'?[args[0]]:[args[0],args[1]];if(inputs.some(f=>!f||f.startsWith('--')))throw Error('Specify SVG file(s)');console.log(JSON.stringify(await proof(inputs,option('--output','experiments/proof-'+Date.now())!,option('--times','0,2.5,5')!.split(',').map(Number)),null,2));}
  else if(command==='context'){const documents=Object.fromEntries(await Promise.all(['PRODUCT.md','VECTOR.md','MOTION.md'].map(async name=>[name,await readFile(name,'utf8')])));let state;try{state=await session();}catch{state={connected:false};}console.log(JSON.stringify({schemaVersion:1,documents,capabilities,state,next:'Inspect target IDs, preview transaction, apply against observed revision, prove renders, audit and export.'},null,2));}
  else if(command==='capabilities')console.log(JSON.stringify(capabilities,null,2));
  else if(command==='quality')console.log(JSON.stringify(quality(option('--intent','fidelity')!),null,2));
  else if(command==='audit'){const config=JSON.parse(await readFile('.cache/session.json','utf8').catch(()=>'{"url":""}'));const svg=args[0]&&!args[0].startsWith('--')?await readFile(args[0],'utf8'):await(await fetch(config.url+'/api/svg')).text();console.log(JSON.stringify(audit(new VectorDocument(svg)),null,2));}
  else if(command==='vectorize')await vectorize();
  else if(command==='inspect'||command==='validate'){if(command==='validate'&&(!args[0]||args[0].startsWith('--')))throw Error('Specify SVG input');console.log(JSON.stringify(args[0]&&!args[0].startsWith('--')?assertSvg(await readFile(args[0],'utf8')):await session(),null,2));}
  else if(command==='gallery'){
    const output=resolve(option('--directory','experiments/review')!);const entries:GalleryEntry[]=[];
    for(const name of (await readdir(output)).sort()){
      const dir=join(output,name);if(!(await stat(dir)).isDirectory())continue;
      try{await stat(join(dir,'original.png'));}catch{continue;}
      const candidates=[];
      for(const file of (await readdir(dir)).filter(f=>f.endsWith('.json')&&!f.endsWith('.error.json')).sort()){
        const report=JSON.parse(await readFile(join(dir,file),'utf8'));if(!report.preset||!report.valid)continue;
        await stat(join(dir,`${report.preset}.svg`));candidates.push({id:report.preset,report});
      }
      if(candidates.length)entries.push({name,candidates});
    }
    await writeGallery(output,entries);console.log(JSON.stringify({gallery:join(output,'index.html'),images:entries.length,candidates:entries.reduce((n,e)=>n+e.candidates.length,0)}));
  }
  else if(command==='serve'){if(has('--directory'))await serve();else{const app=await startEditorServer(Number(option('--port','4318')));let closing=false;const close=async()=>{if(closing)return;closing=true;await app.close();process.exit(0);};process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());}}
  else if(['load','insert','session','objects','object','apply','open','history','undo','redo','export','render'].includes(command!))console.log(JSON.stringify(await sessionCommand(command!,args,option),null,2));
  else if(command==='prove-editable')await editabilityProof();
  else if(!command||command==='help'||command==='--help')console.log(`MAI SVG

mai fluid FILE.svg --config FLUID.json --output OUT.svg [--live --expected-revision N]\nmai choices show|propose REQUEST.json|choose ID OPTION|dismiss ID --expected-revision N\nmai segment IMAGE --regions HINTS.json --output REGIONS.json\nmai separate FILE.svg --regions REGIONS.json --output PARTS.svg\nmai identity-check FILE.svg --reference PNG --profile PROFILE.json --times 0,1.5 --output DIR\nmai load FILE.svg --expected-revision N\nmai preview FILE.svg --fps 10 --width 480 --output FILE.gif\nmai spritesheet FILE.svg --frames 24 --columns 6 --cell 180 --output SHEET.svg [--png]\nmai proof FILE.svg --times 0,2.5,5 --output NEW_DIR\nmai compare BEFORE.svg AFTER.svg --times 0,2.5,5 --output NEW_DIR\nmai context\nmai capabilities\nmai quality --intent fidelity|edit|motion\nmai audit [FILE.svg]\nmai insert FILE.svg --expected-revision N [--x X --y Y --width W --height H]\nmai serve [--port 4318]
mai vectorize INPUT --preset high-color-preserved --output DIR
mai inspect [FILE.svg] --json
mai session attach
mai objects [--filter NAME] [--offset N]
mai object ID
mai apply operations.json --expected-revision N [--dry-run]
mai open demo|CAT_NAME --expected-revision N [--kind vector|animated]
mai history
mai undo|redo --expected-revision N
mai export [FILE.svg] --profile editable|standalone --output FILE.svg [--expected-revision N]
mai render [FILE.svg] --time 1.5 --output FILE.png [--expected-revision N]
mai validate FILE.svg
mai gallery --directory DIR
mai serve --directory DIR --port 4317

Live commands require a running local editor and explicit revision. See docs/CLI.md.`);
  else throw new Error(`Command ${command} is not implemented. Run mai help.`);
}catch(error){console.error(JSON.stringify({error:String(error)}));process.exitCode=1;}
