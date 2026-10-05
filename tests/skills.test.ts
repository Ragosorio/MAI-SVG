// Skills are generated from skills-src: no drift between source and provider copies, every cited tool exists in the
// registry, and concrete JSON examples parse. A skill improvement must pass this before it is applied.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {buildSkills} from '../scripts/build-skills.js';
test('skills: generated copies match the source and cite only real tools',async()=>{
 const out=await buildSkills('.',false);assert.ok(Object.keys(out).length>=4);
 for(const [file,text]of Object.entries(out)){assert.equal(await readFile(file,'utf8'),text,`${file} is stale: run npm run skills`);
  for(const block of text.matchAll(/```json\n([\s\S]*?)```/g))if(!block[1].includes('<'))assert.doesNotThrow(()=>JSON.parse(block[1]),`${file}: invalid JSON example`);
  assert.ok(!/\{\{tool:/.test(text));}
});
