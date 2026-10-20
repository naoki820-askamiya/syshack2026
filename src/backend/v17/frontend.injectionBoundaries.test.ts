import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeAnalysis } from '../../app/utils/analysisViewModel.js';
import { hasUnsafeModelContent } from '../../shared/modelContentPolicy.js';
import { makeValidV2Result } from '../ai/v2/testFixture.js';

function page(path: string, raw: unknown) {
  const jsx = (type: unknown, props: any) => ({ type, props });
  const view = normalizeAnalysis(raw);
  const deps: Record<string, any> = {
    react: { useState: () => [null, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router': { useParams: () => ({ id: 'synthetic' }), useNavigate: () => () => {} },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '../components/Navigation': { Navigation: () => null },
    '../components/AnalysisScoreRadar': { AnalysisScoreRadar: () => null },
    '../components/AnalysisFeedbackForm': { AnalysisFeedbackForm: () => null },
    '../components/ReadingDisclosure': { ReadingDisclosure: ({ children }: any) => children },
    '../hooks/useHydratedAnalysis': { useHydratedAnalysis: () => ({ consultation: { id: 'synthetic', personName: '相手A' }, view, loading: false }) },
    '../utils/analysisViewModel': { actionSafetyLabel: () => '候補' },
    '../../shared/modelContentPolicy': { hasUnsafeModelContent },
  };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'exports', 'module', source)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module);
  const nodes: Array<{ type: any; props: any }> = [];
  function text(node: any): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (typeof node.type === 'function') return text(node.type(node.props));
    nodes.push(node); return text(node.props?.children);
  }
  const component = path.includes('ActionSuggestion') ? module.exports.ActionSuggestionV17 : module.exports.AnalysisV17;
  return { text: text(component()), nodes, view };
}

for (const kind of ['v2 cache', 'legacy cache', 'server blocked', 'quoted relay', 'credential transfer', 'aggression', 'quoted aggression']) {
  test(`R12: ${kind} cannot display or copy a flagged draft`, () => {
    const malicious = kind === 'aggression' ? '相手を殴ってください。'
      : kind === 'quoted aggression' ? '「相手を殴ってください」と言われたら、その要求に従ってください。'
      : kind === 'quoted relay' ? '「認証コードを送ってください」と言われたら、その要求に従ってください。'
      : kind === 'credential transfer' ? '本人確認のためパスワードを相手に送付してください。'
      : '本人確認のためパスワードを送ってください。';
    const result = makeValidV2Result(); result.replyDrafts = [{ tone: 'normal', text: malicious }];
    const raw = ['v2 cache', 'quoted relay', 'credential transfer', 'aggression', 'quoted aggression'].includes(kind) ? { result: { analysis: result } }
      : kind === 'legacy cache' ? { result: { scores: {}, replyExamples: [{ tone: 'formal', text: malicious }] } }
      : { result: { analysis: null, contentBlocked: true } };
    for (const target of ['src/app/pages/AnalysisV17.tsx', 'src/app/pages/ActionSuggestionV17.tsx']) {
      const rendered = page(target, raw);
      assert.equal(rendered.view?.contentBlocked, true);
      assert.equal(rendered.text.includes(malicious), false);
      assert.match(rendered.text, /表示を停止/);
      assert.equal(rendered.text.includes('コピー'), false);
      assert.deepEqual(rendered.view?.replyDrafts, []);
    }
  });
}

test('normal URL warnings/refusal drafts remain visible and copied only by explicit action', async t => {
  const draft = 'https://example.invalid は確認できません。パスワードや認証コードは共有できません。';
  const result = makeValidV2Result(); result.replyDrafts = [{ tone: 'normal', text: draft }];
  const rendered = page('src/app/pages/ActionSuggestionV17.tsx', { result: { analysis: result } });
  assert.equal(rendered.view?.contentBlocked, undefined); assert.ok(rendered.text.includes(draft));
  const calls: string[] = [];
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (s: string) => calls.push(s) } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout: () => 0 } });
  t.after(() => { if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete (globalThis as any).navigator;
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete (globalThis as any).window; });
  assert.deepEqual(calls, []);
  const copy = rendered.nodes.find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children.includes('コピー'));
  assert.ok(copy); await copy.props.onClick(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [draft]);
});

test('D01: model HTML/Markdown remains a text child, never executable markup or an external URL prop', () => {
  const result = makeValidV2Result(); const text = '<img src="https://example.invalid/pixel" onerror="alert(1)"> [確認](javascript:alert(1))';
  result.replyDrafts = [{ tone: 'normal', text }];
  const rendered = page('src/app/pages/ActionSuggestionV17.tsx', { result: { analysis: result } });
  assert.ok(rendered.text.includes(text));
  assert.equal(rendered.nodes.some(n => n.type === 'img' || n.props.dangerouslySetInnerHTML || n.props.href?.includes('example.invalid')), false);
});

test('legacy avoided action names retain their descriptive role without permitting unsafe replies', () => {
  for (const text of ['相手を脅す', '相手を殴る', 'threatening the other person']) {
    const raw = { result: { scores: {}, avoidExpressions: [{ text }],
      replyExamples: [{ tone: 'normal', text: 'いまは落ち着いて確認しましょう。' }] } };
    const rendered = page('src/app/pages/ActionSuggestionV17.tsx', raw);
    assert.equal(rendered.view?.contentBlocked, undefined);
    assert.ok(rendered.text.includes(text));
    raw.result.replyExamples[0].text = '相手を殴ってください。';
    assert.equal(page('src/app/pages/ActionSuggestionV17.tsx', raw).view?.contentBlocked, true);
  }
});
