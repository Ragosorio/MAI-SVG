// Writes (with --update) or checks the motion-engine golden fixtures. See tests/golden-scenes.ts.
import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {SCENES,snapshot,diff} from '../tests/golden-scenes.js';
const dir=new URL('../tests/fixtures/',import.meta.url);mkdirSync(dir,{recursive:true});
const update=process.argv.includes('--update');let failed=0;
for(const scene of SCENES){
 const file=new URL(`golden-${scene.name}.json`,dir),snap=snapshot(scene);
 if(update||!existsSync(file)){writeFileSync(file,JSON.stringify(snap,null,1)+'\n');console.log(`wrote ${file.pathname} (${snap.frames.length} frames)`);continue;}
 const d=diff(snap,JSON.parse(readFileSync(file,'utf8')));if(d.length){failed++;console.log(`${scene.name}: ${d.length} differences\n  ${d.join('\n  ')}`);}else console.log(`${scene.name}: ok`);
}
process.exit(failed?1:0);
