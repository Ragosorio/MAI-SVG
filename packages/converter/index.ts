import sharp from 'sharp';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Options } from '@visioncortex/vtracer';
import { SVG_NS, assertSvg, parseSvg, serialize, prefixIds, optimizeSvg, elements } from './svg.js';

export interface Preset { id: string; options: Options; alphaColors: number; alphaSimplify: number; quantizeColors?: number; quantizeAlpha?: boolean; }
export const PRESETS: Preset[] = [
  { id:'balanced-color-preserved', options:{mode:'spline',hierarchical:'stacked',colorPrecision:8,layerDifference:2,filterSpeckle:1,simplify:0.5,pathPrecision:3,optimize:0},alphaColors:16,alphaSimplify:0.25,quantizeColors:128,quantizeAlpha:true },
  { id:'high-color-preserved', options:{mode:'spline',hierarchical:'stacked',colorPrecision:8,layerDifference:1,filterSpeckle:0,simplify:0.25,pathPrecision:3,optimize:0},alphaColors:32,alphaSimplify:0.15,quantizeColors:256,quantizeAlpha:true },
  { id:'balanced-palette96', options:{mode:'spline',hierarchical:'stacked',colorPrecision:8,layerDifference:8,filterSpeckle:2,simplify:0.8,maxColors:96,pathPrecision:3,optimize:0},alphaColors:16,alphaSimplify:0.35,quantizeColors:96,quantizeAlpha:true },
  { id:'high-palette192', options:{mode:'spline',hierarchical:'stacked',colorPrecision:8,layerDifference:4,filterSpeckle:0,simplify:0.35,maxColors:192,pathPrecision:3,optimize:0},alphaColors:32,alphaSimplify:0.2,quantizeColors:192,quantizeAlpha:true },
  { id:'balanced-spline-stacked', options:{mode:'spline',hierarchical:'stacked',colorPrecision:7,layerDifference:12,filterSpeckle:2,simplify:0.8,maxColors:96,pathPrecision:3,optimize:0},alphaColors:32,alphaSimplify:0.35 },
  { id:'high-spline-stacked', options:{mode:'spline',hierarchical:'stacked',colorPrecision:8,layerDifference:4,filterSpeckle:0,simplify:0.35,maxColors:256,pathPrecision:3,optimize:0},alphaColors:64,alphaSimplify:0.2 },
  { id:'balanced-polygon-cutout', options:{mode:'polygon',hierarchical:'cutout',colorPrecision:7,layerDifference:12,filterSpeckle:2,simplify:0.6,maxColors:96,pathPrecision:3,optimize:0},alphaColors:32,alphaSimplify:0.35 },
  { id:'high-spline-cutout', options:{mode:'spline',hierarchical:'cutout',colorPrecision:8,layerDifference:4,filterSpeckle:0,simplify:0.35,maxColors:256,pathPrecision:3,optimize:0},alphaColors:64,alphaSimplify:0.2 },
];
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_PIXELS = 4_000_000;
export async function decodeRaster(input: Buffer) {
  if (!input.length || input.length > MAX_INPUT_BYTES) throw new Error('Raster input must be between 1 byte and 32 MiB');
  const image = sharp(input, {limitInputPixels:MAX_PIXELS,animated:false,failOn:'error'});
  const metadata = await image.metadata();
  if (!['png','webp','jpeg'].includes(metadata.format ?? '')) throw new Error('Only PNG, WebP and JPG are supported');
  if ((metadata.pages ?? 1) > 1) throw new Error('Animated or multi-page raster inputs are not supported');
  const {data,info} = await image.rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let nonOpaque=0, transparent=0, visible=0;
  for(let i=3;i<data.length;i+=4){ if(data[i]<255) nonOpaque++; if(!data[i]) transparent++; else visible++; }
  return {data,width:info.width,height:info.height,format:metadata.format,nonOpaque,transparent,visible};
}
function trace(data: Buffer, width: number, height: number, options: Options, timeoutMs=120000): Promise<string> {
  return new Promise((resolve,reject)=>{
    const worker = new Worker(new URL('./trace-worker.mjs',import.meta.url), {workerData:{rgba:new Uint8Array(data),width,height,options},resourceLimits:{maxOldGenerationSizeMb:768}});
    let settled=false;
    const finish=(error?:Error,svg?:string)=>{ if(settled)return; settled=true; clearTimeout(timer); void worker.terminate(); error?reject(error):resolve(svg!); };
    const timer=setTimeout(()=>finish(new Error('Vectorization exceeded 120 seconds')),timeoutMs);
    worker.once('message',({svg,error})=>finish(error?new Error(error):undefined,svg));
    worker.once('error',error=>finish(error));
    worker.once('exit',code=>{if(!settled)finish(new Error(`Vectorization worker exited (${code})`));});
  });
}
export async function vectorizeRaster(input: Buffer,preset=PRESETS.find(p=>p.id==='high-color-preserved')!) {
  const start=performance.now(); const image=await decodeRaster(input);
  if(!image.visible) throw new Error('Image is entirely transparent');
  let colorPixels=image.data;
  if(preset.quantizeColors) {
    // Quantize BEFORE tracing, so equal colors form larger regions rather than merely
    // recoloring thousands of already fragmented shapes in the exported SVG.
    const palettePng=await sharp(image.data,{raw:{width:image.width,height:image.height,channels:4}}).removeAlpha().png({palette:true,colours:preset.quantizeColors,dither:0}).toBuffer();
    colorPixels=await sharp(palettePng).ensureAlpha().raw().toBuffer();
    for(let i=3;i<colorPixels.length;i+=4)colorPixels[i]=image.data[i];
  }
  const colorSource=await trace(colorPixels,image.width,image.height,preset.options);
  const doc=parseSvg(colorSource); const root=doc.documentElement;
  root.setAttribute('viewBox',`0 0 ${image.width} ${image.height}`);
  root.setAttribute('data-mai-preset',preset.id);
  const shapes=doc.createElementNS(SVG_NS,'g'); shapes.setAttribute('id','mai-artwork');
  for(const child of Array.from(root.childNodes)) shapes.appendChild(child);
  root.appendChild(shapes);
  if(image.nonOpaque) {
    // VTracer discards partial alpha. Trace luminance into a VECTOR mask explicitly.
    const alpha=Buffer.alloc(image.data.length);
    for(let i=0;i<alpha.length;i+=4) {const original=image.data[i+3];const value=preset.quantizeAlpha?Math.round(Math.round(original*(preset.alphaColors-1)/255)*255/(preset.alphaColors-1)):original;alpha[i]=alpha[i+1]=alpha[i+2]=value;alpha[i+3]=255;}
    const alphaSource=await trace(alpha,image.width,image.height,{mode:'spline',hierarchical:'cutout',colorPrecision:8,layerDifference:1,filterSpeckle:0,maxColors:preset.alphaColors,simplify:preset.alphaSimplify,pathPrecision:3,optimize:0});
    const alphaRoot=parseSvg(alphaSource).documentElement;
    const defs=doc.createElementNS(SVG_NS,'defs'); const mask=doc.createElementNS(SVG_NS,'mask');
    mask.setAttribute('id','mai-alpha');mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('maskContentUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',String(image.width));mask.setAttribute('height',String(image.height));mask.setAttribute('style','mask-type:luminance');
    for(const child of Array.from(alphaRoot.childNodes)) mask.appendChild(doc.importNode(child,true));
    defs.appendChild(mask);root.insertBefore(defs,shapes);shapes.setAttribute('mask','url(#mai-alpha)');
  }
  for(const [index,e] of elements(shapes).entries()) if(e.localName==='path'&&!e.hasAttribute('id'))e.setAttribute('id',`mai-shape-${index+1}`);
  const svg=optimizeSvg(serialize(doc));
  const validation=assertSvg(svg);
  const metrics=await compareRaster(input,svg,image.width,image.height);
  return {svg,report:{preset:preset.id,options:preset.options,prequantizedColors:preset.quantizeColors ?? null,alpha:{quantizedBeforeTracing:!!preset.quantizeAlpha,strategy:image.nonOpaque?'vector-luminance-mask':'opaque',colors:preset.alphaColors,nonOpaquePixels:image.nonOpaque,transparentPixels:image.transparent},width:image.width,height:image.height,sourceFormat:image.format,sourceBytes:input.length,sha256:createHash('sha256').update(input).digest('hex'),...validation,artworkPaths:elements(shapes).filter(e=>e.localName==='path').length,alphaMaskPaths:elements(root).filter(e=>e.localName==='mask').reduce((count,mask)=>count+elements(mask).filter(e=>e.localName==='path').length,0),...metrics,elapsedMs:Math.round(performance.now()-start),processRssBytes:process.memoryUsage().rss,status:'pending-visual-review'}};
}
export async function compareRaster(input: Buffer,svg: string,width:number,height:number) {
  const original=(await sharp(input).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer());
  const rendered=await sharp(Buffer.from(svg),{limitInputPixels:MAX_PIXELS}).resize(width,height).toColourspace('srgb').ensureAlpha().raw().toBuffer();
  let rgb=0,alpha=0,intersection=0,union=0,visibleCount=0,edgeRgb=0,edgeCount=0;
  for(let i=0;i<original.length;i+=4){
    const a=original[i+3]/255,b=rendered[i+3]/255;
    const visible=a>0.01||b>0.01;
    const error=(Math.abs(original[i]*a-rendered[i]*b)+Math.abs(original[i+1]*a-rendered[i+1]*b)+Math.abs(original[i+2]*a-rendered[i+2]*b))/3;
    if(visible){rgb+=error;visibleCount++;alpha+=Math.abs(original[i+3]-rendered[i+3]);}
    if(a>0&&a<1){edgeRgb+=error;edgeCount++;}
    if(a>0.5&&b>0.5)intersection++;if(a>0.5||b>0.5)union++;
  }
  return {premultipliedRgbMae:round(rgb/Math.max(1,visibleCount)),alphaMae:round(alpha/Math.max(1,visibleCount)),partialAlphaRgbMae:round(edgeRgb/Math.max(1,edgeCount)),silhouetteIoU:round(union?intersection/union:1)};
}
const round=(value:number)=>Number(value.toFixed(4));
export async function vectorizeSvg(input: string,preset=PRESETS.find(p=>p.id==='high-color-preserved')!) {
  assertSvg(input,true);const doc=parseSvg(input);
  const images=elements(doc).filter(e=>e.localName==='image');
  if(!images.length) return {svg:optimizeSvg(input),reports:[]};
  const reports=[];
  for(const [index,image] of images.entries()) {
    const href=image.getAttribute('href')||image.getAttributeNS('http://www.w3.org/1999/xlink','href');
    const match=href?.match(/^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=\s]+)$/);
    if(!match)throw new Error('Only embedded PNG/WebP/JPEG images may be vectorized');
    const result=await vectorizeRaster(Buffer.from(match[2],'base64'),preset);reports.push(result.report);
    const rasterRoot=parseSvg(result.svg).documentElement;
    const nested=doc.createElementNS(SVG_NS,'svg');
    prefixIds(rasterRoot,`mai-embedded-${index}-`);
    for(const a of Array.from(image.attributes)) if(a.localName!=='href')nested.setAttribute(a.name,a.value);
    nested.setAttribute('viewBox',rasterRoot.getAttribute('viewBox')!);
    nested.setAttribute('preserveAspectRatio',image.getAttribute('preserveAspectRatio')||'xMidYMid meet');
    if(!nested.hasAttribute('width')||!nested.hasAttribute('height'))throw new Error('Embedded image must specify width and height');
    if(!nested.hasAttribute('id'))nested.setAttribute('id',`mai-embedded-${index}`);
    for(const child of Array.from(rasterRoot.childNodes))nested.appendChild(doc.importNode(child,true));
    image.parentNode!.replaceChild(nested,image);
  }
  // Only generated raster geometry is optimized; preserve the surrounding document verbatim structurally.
  const svg=serialize(doc);assertSvg(svg);return {svg,reports};
}
export async function convertFile(path:string,preset=PRESETS.find(p=>p.id==='high-color-preserved')!) {
  const input=await readFile(path);
  if(/\.svg$/i.test(path)){const result=await vectorizeSvg(input.toString('utf8'),preset);return {svg:result.svg,report:{...assertSvg(result.svg),sources:result.reports,status:'pending-visual-review',preset:preset.id}};}
  return vectorizeRaster(input,preset);
}
