// Isolated editor session for visual checks: temporary root, its own .cache, the mini character and a pending
// sadness board. Never touches the project's .cache (the human's artistic session).
import {mkdtemp,symlink,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {studio,buildFixture} from './fixtures/mini-character.js';
const root=await mkdtemp(join(tmpdir(),'mai-sandbox-'));
await import('node:fs/promises').then(fs=>fs.mkdir(join(root,'apps/editor'),{recursive:true}));await symlink(resolve('apps/editor/dist'),join(root,'apps/editor/dist'));
const port=Number(process.env.PORT??4400);const s=await studio(root,port);await buildFixture(s.call,s.post);
await writeFile(join(root,'README.txt'),'MAI sandbox session root (temporary).');
console.log(`MAI sandbox ready: ${s.url} (root ${root})`);
process.on('SIGTERM',()=>void s.app.close().then(()=>process.exit(0)));process.on('SIGINT',()=>void s.app.close().then(()=>process.exit(0)));
