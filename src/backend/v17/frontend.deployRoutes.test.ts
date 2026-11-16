import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function rewriteFor(pathname: string): string | undefined {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: { source: string; destination: string }[] };
  return config.rewrites.find(r => new RegExp('^' + r.source.replace(/:[A-Za-z]+(\*)?/g, (_match, wildcard) => wildcard ? '.*' : '[^/]+') + '$').test(pathname))?.destination;
}

test('registered deep client routes reload into the SPA without swallowing API/assets', () => {
  for (const pathname of ['/login', '/history', '/new', '/analysis/case-1', '/action/case-1', '/settings', '/privacy-settings', '/persons/person-1', '/analysis-cases/case-1']) {
    assert.equal(rewriteFor(pathname), '/index.html', pathname);
  }
  for (const pathname of ['/assets/app.js', '/health', '/build.json']) {
    assert.equal(rewriteFor(pathname), undefined, pathname);
  }
  const routesSource = readFileSync('src/app/routes.tsx', 'utf8');
  for (const match of routesSource.matchAll(/path: '(.*?)'/g)) {
    if (match[1] !== '/') assert.equal(rewriteFor(match[1]!.replace(/:[A-Za-z]+/g, 'fixture-id')), '/index.html', match[1]);
  }
});


test('same-origin API requests reach the verified backend without CDN caching', () => {
  assert.equal(rewriteFor('/api/auth/session'), 'https://kigen404.onrender.com/api/:path*');
  assert.equal(rewriteFor('/api/persons'), 'https://kigen404.onrender.com/api/:path*');
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const headers = config.headers.find((rule: any) => rule.source === '/api/:path*').headers;
  assert.ok(headers.some((header: any) => header.key === 'x-vercel-enable-rewrite-caching' && header.value === '0'));
  assert.ok(headers.some((header: any) => header.key === 'Cache-Control' && header.value === 'no-store'));
  assert.match(readFileSync('src/app/auth/supabase.ts', 'utf8'), /export const serverUrl = '';/);
});
