// Builds the Candy benchmark exclusively through the agent tool surface (POST /api/agent/call), the same calls
// Claude/Codex make via CLI or MCP. Output: examples/candy-studio/{candy-studio.svg, build-log.json, previews}.
import {mkdtemp,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {createServer} from 'node:net';import {once} from 'node:events';
import {startEditorServer} from '../packages/server/server.js';
const out=resolve('examples/candy-studio');await mkdir(out,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'mai-candy-studio-'));const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
const app=await startEditorServer(port,root);const url=`http://127.0.0.1:${port}`;const cfg=JSON.parse(await readFile(join(root,'.cache/session.json'),'utf8'));
let revision=0;const log:unknown[]=[];
async function call(tool:string,args:Record<string,unknown>={},mutates=true){const body={tool,args:mutates?{expectedRevision:revision,...args}:args};const r=await fetch(`${url}/api/agent/call`,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':cfg.token},body:JSON.stringify(body)});const v=await r.json();log.push({tool,args,ok:v.ok,revision:v.revision,changes:v.changes,error:v.error});if(!v.ok)throw Error(`${tool}: ${JSON.stringify(v.error)}`);revision=v.revision;process.stderr.write(`✓ ${tool} → rev ${revision}\n`);return v;}
try{
 const svg=await readFile('assets/vector/candy_alchemist_cat.svg','utf8');
 const imported=await fetch(`${url}/api/import`,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':cfg.token},body:JSON.stringify({name:'candy.svg',base64:Buffer.from(svg).toString('base64'),expectedRevision:0})}).then(r=>r.json());revision=imported.revision;
 await call('timeline.set',{duration:6,fps:24,loop:true,label:'Timeline 6 s'});
 // Real artwork regions become editable parts (pixel-identical at rest, alpha preserved).
 await call('part.extract',{id:'mouth',name:'Boca original',source:'#mai-artwork',alpha:false,region:{kind:'ellipse',cx:344,cy:230,rx:28,ry:14},role:'mouth'});
 await call('part.extract',{id:'eye-left',name:'Ojo turquesa',source:'#mai-artwork',alpha:false,region:{kind:'ellipse',cx:296,cy:195,rx:24,ry:23},role:'eye-left'});
 await call('part.extract',{id:'eye-right',name:'Ojo violeta',source:'#mai-artwork',alpha:false,region:{kind:'ellipse',cx:379,cy:180,rx:24,ry:23},role:'eye-right'});
 await call('part.extract',{id:'smoke',name:'Humo original del frasco',source:'#mai-artwork',role:'smoke',region:{kind:'polygon',points:[{x:482,y:76},{x:630,y:76},{x:630,y:214},{x:548,y:214},{x:530,y:204},{x:518,y:197},{x:500,y:197},{x:484,y:180}]}});
 await call('ops.apply',{ops:[{type:'group',ids:['mai-artwork','mouth','eye-left','eye-right','smoke'],id:'candy-root',name:'Candy'},{type:'pose',id:'candy-root',pose:{pivotX:350,pivotY:640}}],label:'Agrupar personaje'});
 await call('part.label',{id:'candy',role:'character',label:'Candy',targets:['candy-root']});
 await call('part.label',{id:'head',role:'head',label:'Cabeza',targets:[],parent:'candy',region:{kind:'ellipse',cx:337,cy:190,rx:112,ry:86}});
 await call('part.label',{id:'flask',role:'flask',label:'Frasco',targets:[],parent:'candy',region:{kind:'rect',x:443,y:198,width:122,height:210}});
 await call('part.label',{id:'nose',role:'nose',label:'Nariz',targets:[],parent:'head',region:{kind:'ellipse',cx:340,cy:211,rx:11,ry:7}});
 for(const [id,label]of [['mouth','Boca'],['eye-left','Ojo izquierdo (turquesa)'],['eye-right','Ojo derecho (violeta)']])await call('part.label',{id,role:id,label,parent:'head'});
 await call('part.label',{id:'smoke',role:'smoke',label:'Humo',parent:'flask'});
 // Expression rig on the original features: boundary pins keep seams invisible, landmarks drive shape keys.
 await call('expression.rig',{part:'mouth',role:'mouth',landmarks:{left:{x:331,y:234},right:{x:358,y:230},center:{x:341.5,y:227},lower:{x:346,y:232}}});
 await call('expression.rig',{part:'eye-left',role:'eye-left',landmarks:{inner:{x:314,y:199},outer:{x:277,y:195},upper:{x:297,y:177},lower:{x:296,y:211},iris:{x:297,y:197}}});
 await call('expression.rig',{part:'eye-right',role:'eye-right',landmarks:{inner:{x:360,y:180},outer:{x:397,y:178},upper:{x:378,y:161},lower:{x:378,y:197},iris:{x:377,y:181}}});
 await call('identity.preserve',{targets:['nose'],levels:['protected']});
 await call('identity.preserve',{targets:['mouth','eyes'],levels:['deformable','color-preserved','topology-preserved'],freezeExpression:false});
 // The smoke that is already drawn starts to flow (no template geometry).
 await call('fluid.animate',{target:'candy.flask.smoke',preset:'smoke',quality:'balanced'});
 await call('motion.preset',{target:'candy',kind:'breathe',layer:'pose',amplitude:.012});
 const inspect=await call('scene.inspect',{},false);
 const exported=await call('export',{profile:'editable'});await copyFile(exported.savedFile,join(out,'candy-studio.svg'));
 const audit=await call('audit',{},false);const identity=await call('identity.check',{times:[0,1.5,3]},false);const crit=await call('critique',{samples:48},false);
 const frames=await call('preview.render',{times:[0,1.5,3],scale:1},false);for(const f of frames.frames)await copyFile(f.path,join(out,`frame-${f.time}.png`));
 const face=await call('preview.render',{times:[0],part:'head',scale:2},false);await copyFile(face.frames[0].path,join(out,'face-rest.png'));
 for(const [name,params]of [['sad',{sadness:.9}],['happy',{happiness:.9}],['surprised',{surprise:.9}],['angry',{anger:.9}]] as const){
  const r=await call('expression.apply',{params,dryRun:true,preview:{times:[0],part:'head'}});await copyFile(r.preview.frames[0].path,join(out,`face-${name}.png`));}
 await writeFile(join(out,'build-log.json'),JSON.stringify({builtAt:new Date().toISOString(),source:'assets/vector/candy_alchemist_cat.svg',calls:log,inspect:{parts:inspect.parts,expressionFeatures:inspect.expressionFeatures,modifiers:inspect.modifiers},audit:audit.summary,identity:{pass:identity.pass,perceptual:identity.perceptual},critique:crit.deterministic},null,1));
 console.log(JSON.stringify({ok:true,revision,out,audit:audit.summary,identityPass:identity.pass},null,2));
}finally{await app.close();}
