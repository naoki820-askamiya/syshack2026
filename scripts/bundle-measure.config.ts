import base from '../vite.config';
import {mergeConfig,defineConfig,type Plugin} from 'vite';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
const probe:Plugin={name:'kigen-bundle-measurement',apply:'build',generateBundle(_options,bundle){
  const chunks=Object.values(bundle).filter(item=>item.type==='chunk');
  const renderedByPackage:Record<string,number>={};
  for(const chunk of chunks)for(const [id,module] of Object.entries(chunk.modules)){
    const normalized=id.replaceAll('\\','/');
    const tail=normalized.split('/node_modules/').at(-1)!;
    const group=normalized.includes('/node_modules/')?(tail.startsWith('@')?tail.split('/').slice(0,2).join('/'):tail.split('/')[0]):'application';
    renderedByPackage[group]=(renderedByPackage[group]??0)+module.renderedLength;
  }
  const target=resolve('experiments/performance/bundle.json');mkdirSync(resolve(target,'..'),{recursive:true});
  writeFileSync(target,JSON.stringify({mode:'LOCAL_PRODUCTION_BUILD_MEASUREMENT',chunks:chunks.map(c=>({file:c.fileName,isEntry:c.isEntry,bytes:Buffer.byteLength(c.code),gzipBytes:gzipSync(c.code).length,imports:c.imports,dynamicImports:c.dynamicImports})),renderedCharactersBeforeMinification:renderedByPackage,limitations:['Rendered characters attribute transformed module code before final minification; not each package compressed-byte share.','No browser parse, network, layout or perceived latency measured.','No route splitting, chart removal, cache or DB index was adopted.']},null,2)+'\n');
}};
export default defineConfig(mergeConfig(base,{plugins:[probe]}));
