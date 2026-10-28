// Reproduce F1 observation on the actual saved baseline, without changing the benchmark or live editor.
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {AgentService} from '../packages/agent/service.js';
import {fileWorkspace} from '../packages/cli/agent.js';
import {closeRenderer} from '../packages/server/render.js';
const input=resolve('experiments/motion-bench/2026-10-08T00-31-21-baseline/bell-notify-claude-1/final.svg');
const out=resolve('experiments/evidence/motion-f1');await mkdir(out,{recursive:true});
const svg=await readFile(input,'utf8'),ws=fileWorkspace(svg,'bell-baseline.svg');ws.cache=out;const service=new AgentService(ws);
try{
 const model=ws.model(),part='#'+model.project.tracks.find(t=>t.property==='rotation')!.target;
 const views=await service.call('render.motion',{part});
 const film=await service.call('render.filmstrip',{count:12,scale:2});
 const video=await service.call('render.video',{fps:24,width:384});
 const verification=await service.call('motion.verify',{assertions:[{type:'energy',part,min:1},{type:'returnsToRest',part,at:model.project.duration,tolerance:.1}]});
 await copyFile(video.path as string,join(out,'bell-baseline.mp4'));
 await copyFile(video.posterPath as string,join(out,'bell-poster.png'));
 await writeFile(join(out,'report.json'),JSON.stringify({input,part,views,film,video,verification,note:'Existing baseline observed with new tools. No new agent run or aesthetic approval.'},null,2));
 console.log(JSON.stringify({out,part,verification},null,2));
}finally{await closeRenderer();}
