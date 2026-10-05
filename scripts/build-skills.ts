// One skill source, several agent harnesses (Impeccable's providers pattern, own implementation):
// skills-src/<name>/{SKILL.src.md,reference/*.md} → .claude/skills/<name>/ (Claude Code) and .agents/skills/<name>/ (Codex).
// {{tool:<registry name>}} expands to the MCP tool and CLI command, so a skill can never cite a tool that does not exist.
import {readdir,readFile,writeFile,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';
import {toolByName} from '../packages/agent/registry.js';
const PROVIDERS=[{id:'claude-code',dir:'.claude/skills',frontmatter:['name','description','license']},{id:'codex',dir:'.agents/skills',frontmatter:['name','description']}];
const HEADER='<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->\n';
export function expand(text:string,file:string){return text.replace(/\{\{tool:([\w.]+)\}\}/g,(_,name:string)=>{const t=toolByName(name);if(!t)throw Error(`${file}: unknown tool {{tool:${name}}}`);return `\`${t.mcp}\` / \`mai ${t.cli}\``;});}
function frontmatter(src:string,keep:string[]){const m=/^---\n([\s\S]*?)\n---\n/.exec(src);if(!m)throw Error('SKILL.src.md needs frontmatter');const fields=Object.fromEntries(m[1].split('\n').filter(Boolean).map(l=>{const i=l.indexOf(':');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));return {head:'---\n'+keep.filter(k=>fields[k]).map(k=>`${k}: ${fields[k]}`).join('\n')+'\n---\n',body:src.slice(m[0].length)};}
export async function buildSkills(root='.',write=true){const out:Record<string,string>={};
 for(const name of await readdir(join(root,'skills-src'))){const base=join(root,'skills-src',name),src=await readFile(join(base,'SKILL.src.md'),'utf8');const refs=await readdir(join(base,'reference')).catch(()=>[] as string[]);
  for(const p of PROVIDERS){const {head,body}=frontmatter(src,p.frontmatter);const dir=join(p.dir,name);out[join(dir,'SKILL.md')]=head+HEADER+expand(body,`${name}/SKILL.src.md`);for(const r of refs.filter(f=>f.endsWith('.md')))out[join(dir,'reference',r)]=HEADER+expand(await readFile(join(base,'reference',r),'utf8'),`${name}/reference/${r}`);}}
 if(write){for(const p of PROVIDERS)for(const name of await readdir(join(root,'skills-src'))){await rm(join(root,p.dir,name,'reference'),{recursive:true,force:true});await rm(join(root,p.dir,name,'references'),{recursive:true,force:true});}
  for(const [file,text]of Object.entries(out)){await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),text);}}
 return out;}
if(process.argv[1]?.endsWith('build-skills.ts'))console.log(JSON.stringify({written:Object.keys(await buildSkills())},null,1));
