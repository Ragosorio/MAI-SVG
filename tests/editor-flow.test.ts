// S2 gate in a real browser: selection → canvas comment → board note → agent proposes a mix → agent commits a plan →
// WebSocket repaint (no reload) → undo from the editor restores scene and decision. Evidence is written to
// experiments/evidence/s2-editor-flow.json (revisions, preview hashes, timings).
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,symlink,rm,readFile,writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {studio,buildFixture,port} from '../scripts/fixtures/mini-character.js';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex').slice(0,16);
test('S2: selection, comment, proposal, mix, commit, live repaint and undo in the editor',async()=>{
 assert.ok(existsSync('apps/editor/dist/index.html'),'Build the editor first: npm run build');
 const root=await mkdtemp(join(tmpdir(),'mai-editor-flow-'));await mkdir(join(root,'apps/editor'),{recursive:true});await symlink(resolve('apps/editor/dist'),join(root,'apps/editor/dist'));
 const p=await port();const s=await studio(root,p);const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())&&existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{channel:'chrome'}:{})});
 const evidence:Record<string,unknown>={startedAt:new Date().toISOString()};
 try{await buildFixture(s.call,s.post);const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(s.url);await page.getByText('Sesión conectada').waitFor();
  const footer=async()=>Number((await page.locator('footer').innerText()).match(/rev (\d+)/)?.[1]);
  await page.getByRole('button',{name:'Minimizar'}).click();
  // 1. Selection is shared with agents.
  await page.locator('.parts .layer',{hasText:'mouth'}).first().click();
  await assert.doesNotReject(async()=>{for(let i=0;i<40;i++){const v=await (await fetch(s.url+'/api/selection')).json();if(v.ids.includes('mouth'))return;await new Promise(r=>setTimeout(r,100));}throw Error('selection not shared');});
  // 2. Canvas comment with time, parts and screenshot.
  await page.getByRole('button',{name:'Comentar en el lienzo (tiempo actual)'}).click();const box=await page.locator('.scene #mouth').boundingBox();await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.getByPlaceholder('¿Qué no te gusta o qué quieres aquí?').fill('Esta boca no debe cambiar de color, solo de forma');await page.getByRole('button',{name:'Comentar',exact:true}).click();
  await page.locator('.comment p',{hasText:'Esta boca no debe cambiar de color'}).waitFor();const comments=(await (await fetch(s.url+'/api/comments')).json()).comments;assert.equal(comments.length,1);assert.ok(comments[0].targets.includes('mouth'));assert.ok(comments[0].parts.some((x:{id:string})=>x.id==='mouth'));assert.ok(comments[0].screenshot);
  // 3. The human writes to the agent on the board; MAI records it verbatim (the agent interprets it).
  await page.locator('.choice-pill').click();await page.getByPlaceholder(/me gusta la primera/).fill('Me gusta la primera pero con los ojos de la tercera; conserva la boca y baja 30% el humo');await page.getByRole('button',{name:'Enviar al asistente'}).click();
  await page.getByText('Enviado:').waitFor();const inbox=(await (await fetch(s.url+'/api/inbox?after=0')).json()).events.map((e:{type:string})=>e.type);assert.ok(inbox.includes('comment.created')&&inbox.includes('choice.note'));
  // 4. Agent proposes the mix; the board grows live (version 2, derived option with provenance).
  const rev0=await footer();const combined=await s.call('variant.combine',{base:'A',take:{eyes:'C'},expectedRevision:rev0});assert.equal(combined.ok,true,JSON.stringify(combined.error));
  await page.locator('.choice-options article',{hasText:'Derivada de A'}).waitFor();const previews:Record<string,string>={};for(const o of ['A','B','C','D'])previews[o]=sha(await readFile(((await s.call('choices.inspect')).choice as {options:{id:string;previewPath:string}[]}).options.find(x=>x.id===o)!.previewPath));evidence.previewHashes=previews;
  // 5. Agent commits the plan; the editor repaints through the WebSocket without reload.
  const eyeBefore=await page.locator('.scene #eye-left-white').getAttribute('d'),mouthBefore=await page.locator('.scene #mouth').getAttribute('d');
  const inspect=await s.call('scene.inspect');const board=(await s.call('choices.inspect')).choice as {id:string;version:number};const navigations:string[]=[];page.on('framenavigated',f=>navigations.push(f.url()));
  const t0=Date.now();const done=await s.call('plan.execute',{plan:{protocol:'mai.agent-plan/v1',requestId:'s2-flow-1',sessionId:inspect.sessionId,documentId:inspect.documentId,expectedRevision:inspect.revision,mode:'commit',label:'A, ojos de C, boca como está, humo ×0.7',constraints:{preserve:[{part:{partId:'mouth',within:'char'},reference:{kind:'snapshot',id:inspect.snapshotId},channels:['geometry','paint','expression'],allowRigidMotion:true}]},commands:[{id:'expression',type:'variant.apply',target:{partId:'char'},board:{id:board.id,version:board.version},base:'A',take:{eyes:'C'}},{id:'smoke',type:'animation.adjust',target:{partId:'smoke',within:'char'},sourceId:'smoke-flow',property:'speed',scale:.7,onOverflow:'reject'}],validation:{times:[0,1,2],required:['structural','identity'],preview:false},provenance:{kind:'user-direction',text:'Me gusta la primera pero con los ojos de la tercera; conserva la boca y baja 30% el humo'}}});
  const service=Date.now()-t0;assert.equal(done.status,'committed',JSON.stringify(done.error));
  await page.waitForFunction(r=>document.querySelector('footer')?.textContent?.includes(`rev ${r}`),done.revision);const painted=Date.now()-t0;
  assert.notEqual(await page.locator('.scene #eye-left-white').getAttribute('d'),eyeBefore,'eyes repainted');assert.equal(await page.locator('.scene #mouth').getAttribute('d'),mouthBefore,'mouth kept as it was');assert.equal(navigations.length,0,'no page reload');
  await page.locator('.activity li',{hasText:'Plan aplicado'}).waitFor();evidence.commit={baseRevision:done.baseRevision,revision:done.revision,identity:(done.identity as {status:string}).status,serviceMs:service,visibleMs:painted,note:'visibleMs = response + WebSocket + React repaint, single sample'};
  // 6. Undo from the editor restores scene and decision together.
  await page.getByRole('button',{name:'Deshacer'}).click();await page.waitForFunction(r=>document.querySelector('footer')?.textContent?.includes(`rev ${r}`),Number(done.revision)+1);
  await page.locator('.choice-panel').waitFor();assert.equal(await page.locator('.scene #eye-left-white').getAttribute('d'),eyeBefore);const state=await (await fetch(s.url+'/api/state')).json();assert.equal(state.choice.status,'pending');assert.equal((state.project.acceptances??[]).length,0);assert.equal(state.project.modifiers[0].params.speedFactor??1,1);
  evidence.undo={revision:state.revision,board:state.choice.status};await page.screenshot({path:join(root,'after-undo.png')});
  await mkdir('experiments/evidence',{recursive:true});await writeFile('experiments/evidence/s2-editor-flow.json',JSON.stringify({...evidence,finishedAt:new Date().toISOString(),browser:browser.version()},null,1));
 }finally{await browser.close();await s.app.close();await rm(root,{recursive:true,force:true});}
});
