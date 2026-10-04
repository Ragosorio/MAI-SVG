import {readFile,writeFile,mkdir} from 'node:fs/promises';import sharp from 'sharp';import {VectorDocument} from '../packages/core/document.js';
const folder='examples/candy-emotions',model=new VectorDocument(await readFile(folder+'/candy-editable.svg','utf8'));
const states=[['sereno',0],['feliz',1.6],['sorprendido',2.8],['enojado',4.1],['triste',5.2],['dormido',6.5]]as const;
await mkdir(folder+'/sprites',{recursive:true});const frames=[];
for(const [i,[name,time]]of states.entries()){await writeFile(`${folder}/sprites/candy-${name}.svg`,model.frame(time));const input=`experiments/candy-fluids-final/candidate-0-frame-${i}.png`;frames.push({input:await sharp(input).resize(230,230).png().toBuffer(),left:i%3*230,top:Math.floor(i/3)*230});}
await sharp({create:{width:690,height:460,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).png().toFile(folder+'/candy-spritesheet.png');
await writeFile(folder+'/candy-spritesheet.json',JSON.stringify({master:'candy-editable.svg',columns:3,rows:2,cell:230,frames:states.map(([name,time],i)=>({name,time,svg:`sprites/candy-${name}.svg`,x:i%3*230,y:Math.floor(i/3)*230,width:230,height:230})),note:'PNG atlas is optional; individual sprites and animation masters remain pure vector SVG.'},null,2));console.log('Six vector sprites and PNG atlas saved.');
