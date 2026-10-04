import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { optimize } from 'svgo';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_SVG_BYTES = 32 * 1024 * 1024;
export function parseSvg(source: string): Document {
  if (Buffer.byteLength(source) > MAX_SVG_BYTES) throw new Error('SVG exceeds 32 MiB limit');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('XML entities and DOCTYPE are forbidden');
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, message) => { errors.push(`${level}: ${message}`); } }).parseFromString(source, 'image/svg+xml');
  if (errors.length || !doc.documentElement || doc.documentElement.localName !== 'svg' || doc.documentElement.namespaceURI !== SVG_NS) throw new Error(`Invalid SVG XML: ${errors.join('; ')}`);
  return doc as unknown as Document;
}
export const serialize = (node: Node) => new XMLSerializer().serializeToString(node as never);
export const elements = (doc: Document | Element) => Array.from(doc.getElementsByTagName('*'));
export function inspectSvg(source: string, allowEmbeddedRaster = false) {
  const doc = parseSvg(source);
  const problems: string[] = [];
  const seen = new Set<string>();
  const fills = new Set<string>();
  let paths = 0, commands = 0, rasters = 0;
  for (const element of elements(doc)) {
    const tag = element.localName;
    if(element.namespaceURI !== SVG_NS) problems.push(`Non-SVG namespace: ${tag}`);
    if(['animate','animateTransform','set'].includes(tag) && /^(href|src|style|on.*)$/i.test(element.getAttribute('attributeName') ?? '')) problems.push('Unsafe animation target');
    if (['script', 'foreignObject', 'iframe', 'object', 'embed', 'audio', 'video'].includes(tag)) problems.push(`Forbidden element: ${tag}`);
    if (tag === 'image' || tag === 'feImage') {
      rasters++;
      if (!allowEmbeddedRaster || tag === 'feImage') problems.push(`Raster element: ${tag}`);
    }
    if (tag === 'path') { paths++; commands += (element.getAttribute('d')?.match(/[MmLlHhVvCcSsQqTtAaZz]/g) ?? []).length; }
    const id = element.getAttribute('id');
    if (id) { if (seen.has(id)) problems.push(`Duplicate ID: ${id}`); seen.add(id); }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName;
      const value = attribute.value.trim();
      if (/^on/i.test(attribute.name)) problems.push(`Event handler: ${attribute.name}`);
      if (name === 'href' && value && !value.startsWith('#')) {
        if (!(allowEmbeddedRaster && tag === 'image' && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(value))) problems.push(`External or unsafe reference on ${tag}`);
      }
      if (name === 'fill' && value !== 'none' && !value.startsWith('url(')) fills.add(value);
      checkUrls(value, problems);
      if(attribute.name==='style' && /@import|expression\s*\(|javascript:|data:|https?:/i.test(value)) problems.push('Unsafe inline CSS');
      if (/data:image/i.test(value) && !(allowEmbeddedRaster && tag === 'image' && name === 'href')) problems.push('Embedded raster data');
    }
    if (tag === 'style') {
      const css = element.textContent ?? '';
      if (/@import|expression\s*\(|javascript:|data:|https?:|\/\*/i.test(css)) problems.push('Unsupported or unsafe CSS');
      checkUrls(css, problems);
    }
  }
  for(const e of elements(doc)) {
    const values=[...Array.from(e.attributes).map(a=>a.value),...(e.localName==='style'?[e.textContent??'']:[])];
    for(const value of values) for(const m of value.matchAll(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g)) if(!seen.has(m[1])) problems.push(`Unresolved reference: ${m[1]}`);
    const href=e.getAttribute('href')||e.getAttributeNS('http://www.w3.org/1999/xlink','href');
    if(href?.startsWith('#')&&!seen.has(href.slice(1)))problems.push(`Unresolved reference: ${href}`);
  }
  if (elements(doc).length > 100000) problems.push('SVG exceeds 100,000 elements');
  return { valid: problems.length === 0, problems: [...new Set(problems)], paths, commands, colors: fills.size, rasterImages: rasters, bytes: Buffer.byteLength(source), elements: elements(doc).length };
}
function checkUrls(value: string, problems: string[]) {
  for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
    const reference = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (!reference.startsWith('#')) problems.push('Non-local url() reference');
  }
}
export function assertSvg(source: string, allowEmbeddedRaster = false) {
  const report = inspectSvg(source, allowEmbeddedRaster);
  if (!report.valid) throw new Error(report.problems.join('; '));
  return report;
}
export function optimizeSvg(source: string): string {
  // No preset-default: merging paths, deleting IDs or rewriting styles damages editability.
  const result = optimize(source, { multipass: false, plugins: ['removeComments', 'removeXMLProcInst', 'removeDoctype'] }).data;
  assertSvg(result);
  return result;
}
export function prefixIds(root: Element, prefix: string) {
  const all = [root, ...elements(root)];
  const mapping = new Map<string, string>();
  for (const e of all) { const id = e.getAttribute('id'); if (id) mapping.set(id, `${prefix}${id}`); }
  for (const e of all) {
    for (const a of Array.from(e.attributes)) {
      let value = a.value;
      if (a.name === 'id') value = mapping.get(value) ?? value;
      else {
        value = value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (m, q, id) => mapping.has(id) ? `url(#${mapping.get(id)})` : m);
        if (a.localName === 'href' && value.startsWith('#')) value = `#${mapping.get(value.slice(1)) ?? value.slice(1)}`;
        if (a.name === 'aria-labelledby' || a.name === 'aria-describedby') value = value.split(/\s+/).map(id => mapping.get(id) ?? id).join(' ');
        if (a.name === 'begin' || a.name === 'end') value = value.replace(/([\w-]+)\./g, (m, id) => mapping.has(id) ? `${mapping.get(id)}.` : m);
      }
      e.setAttribute(a.name, value);
    }
    // Generated VTracer SVG has no styles. Fail rather than incorrectly rewrite arbitrary CSS.
    if (e.localName === 'style' && mapping.size) throw new Error('Cannot prefix IDs in arbitrary generated CSS');
  }
}
