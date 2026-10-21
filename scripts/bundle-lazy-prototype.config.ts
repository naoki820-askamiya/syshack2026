import measured from './bundle-measure.config';
import { defineConfig, mergeConfig, type Plugin } from 'vite';

// Build comparison only. No production route file or app configuration is modified.
const prototype: Plugin = {
  name: 'kigen-lazy-route-build-prototype',
  enforce: 'pre',
  transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/app/routes.tsx')) return;
    let result = source;
    for (const name of ['AnalysisV17', 'ActionSuggestionV17']) {
      const line = `import { ${name} } from './pages/${name}';`;
      if (!result.includes(line)) throw new Error('Prototype source contract changed: ' + name);
      result = result.replace(line, `const ${name} = lazy(() => import('./pages/${name}').then(m => ({ default: m.${name} })));`);
      result = result.replaceAll(`<${name} />`, `<Suspense fallback={null}><${name} /></Suspense>`);
    }
    return `import { lazy, Suspense } from 'react';\n${result}`;
  },
};
export default defineConfig(mergeConfig(measured, {
  plugins: [prototype],
  build: { outDir: 'dist/lazy-prototype' },
}));
