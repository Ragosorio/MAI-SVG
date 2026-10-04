import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {VectorDocument} from '../core/document.js';
import {exportSvg,type ExportOptions} from '../core/export.js';
import {renderSvg,closeRenderer} from '../server/render.js';
export async function session(path='state',data?:unknown){const config=JSON.parse(await readFile('.cache/session.json','utf8'));const response=await fetch(`${config.url}/api/${path}`,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':config.token},body:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;}
export async function sessionCommand(command:string,args:string[],option:(name:string,fallback?:string)=>string|undefined){
 const expected=()=>{const value=option('--expected-revision');if(value===undefined||!Number.isInteger(Number(value)))throw Error('Specify --expected-revision N. Inspect the current revision before editing.');return Number(value);};
 const input=args[0]&&!args[0].startsWith('--')?args[0]:undefined;
 if(command==='session'){if(input!=='attach')throw Error('Use mai session attach');return session();}
 if(command==='objects')return session(`objects?filter=${encodeURIComponent(option('--filter','')!)}&offset=${option('--offset','0')}&limit=${option('--limit','80')}`);
 if(command==='object'){if(!input)throw Error('Specify object ID');return session('object?id='+encodeURIComponent(input));}
 if(command==='history')return session('history');
 if(command==='undo'||command==='redo')return session(command,{expectedRevision:expected()});
 if(command==='load'){if(!input)throw Error('Specify SVG');const name=option('--name',input.split('/').at(-1))!;return session('import',{name:/\.svg$/i.test(name)?name:name+'.svg',base64:Buffer.from(await readFile(input,'utf8')).toString('base64'),vectorize:false,expectedRevision:expected()});}
 if(command==='insert'){if(!input)throw Error('Specify SVG file');return session('insert',{svg:await readFile(input,'utf8'),name:option('--name',input),expectedRevision:expected(),placement:{x:Number(option('--x','0')),y:Number(option('--y','0')),width:Number(option('--width','700')),height:Number(option('--height','700'))}});}
 if(command==='apply'){if(!input)throw Error('Specify operations JSON');const value=JSON.parse(await readFile(input,'utf8'));return session(args.includes('--dry-run')?'preview':'apply',{ops:Array.isArray(value)?value:value.ops,expectedRevision:expected(),label:option('--label','CLI transaction')});}
 if(command==='open'){if(!input)throw Error('Specify asset name or demo');return session('open',{name:input,kind:option('--kind','vector'),expectedRevision:expected()});}
 if(command==='export'){
  const profile=option('--profile','standalone');if(!['editable','standalone'].includes(profile!))throw Error('Unknown export profile');const options:ExportOptions={profile:profile as ExportOptions['profile'],tolerance:Number(option('--tolerance','.25')),maxBytes:Number(option('--max-bytes',String(32*1024*1024)))};
  const result=input?exportSvg(new VectorDocument(await readFile(input,'utf8')),options):await session('export',{...options,expectedRevision:expected()});const output=resolve(option('--output',`experiments/export-${profile}.svg`)!);if(input&&resolve(input)===output)throw Error('Use a different output from input');await writeFile(output,result.svg);return{output,...result.report};
 }
 if(command==='render'){
  const time=Number(option('--time','0'));if(!Number.isFinite(time)||time<0)throw Error('Invalid render time');const output=resolve(option('--output','experiments/frame.png')!);if(input&&output===resolve(input))throw Error('Cannot overwrite input');
  if(input){const source=await readFile(input,'utf8');const model=new VectorDocument(source);const svg=model.project.tracks.length?exportSvg(model,{profile:'standalone'}).svg:source;try{const result=await renderSvg(svg,time);await writeFile(output,result.png);return{...result,png:undefined,output};}finally{await closeRenderer();}}
  const result=await session('render',{time,expectedRevision:expected()});await writeFile(output,Buffer.from(result.base64,'base64'));return{...result,base64:undefined,output};
 }
 throw Error('Unknown session command');
}
