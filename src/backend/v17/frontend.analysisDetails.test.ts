import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeAnalysis } from '../../app/utils/analysisViewModel.js';

// Execute the actual page/mapper with synthetic I/O and JSX seams; not a browser/a11y proof.
function pageText(raw: unknown, elements: { type: string; props: Record<string, unknown> }[] = []): string {
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const view = normalizeAnalysis(raw)!;
  const deps: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router': { useParams: () => ({ id: 'synthetic-case' }), useNavigate: () => () => {} },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '../components/Navigation': { Navigation: () => null },
    '../components/AnalysisScoreRadar': { AnalysisScoreRadar: () => null },
    '../components/AnalysisFeedbackForm': { AnalysisFeedbackForm: () => null },
    '../hooks/useHydratedAnalysis': { useHydratedAnalysis: () => ({
      consultation: { id: 'synthetic-case', personName: 'Synthetic person', event: 'synthetic event', reaction: 'synthetic reaction' },
      view, loading: false, error: null, status: 'analyzed', retry: () => {},
    }) },
  };
  // Execute the disclosure component too, so hiding detail panels cannot drop provenance.
  const disclosure = { exports: {} };
  const disclosureSource = ts.transpileModule(readFileSync('src/app/components/ReadingDisclosure.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'exports', 'module', disclosureSource)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, disclosure.exports, disclosure);
  deps['../components/ReadingDisclosure'] = disclosure.exports;
  const source = ts.transpileModule(readFileSync('src/app/pages/AnalysisV17.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as { AnalysisV17: () => unknown } };
  new Function('require', 'exports', 'module', source)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module);
  function content(node: any): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(content).join(' ');
    if (typeof node.type === 'function') return content(node.type(node.props));
    if (typeof node.type === 'string') elements.push(node);
    return content(node.props?.children);
  }
  return content(module.exports.AnalysisV17());
}
function fixture(enabled = true) {
  const scores = Object.fromEntries(['anger', 'coldness', 'distance', 'busyness', 'flatness', 'reassurance'].map(key => [key, {
    label: key, score: 10, category: ['busyness', 'flatness'].includes(key) ? 'context' : key === 'reassurance' ? 'relief' : 'concern', reason: 'synthetic score reason',
  }]));
  return { result: { analysis: { confidenceLevel: 'medium', emotionScoreAnalysis: { scores },
    evidence: { signalsForConcern: [{ text: '入力材料', source: 'current_case', strength: 'low' }], signalsAgainstConcern: [
      { text: '後日の報告', source: 'feedback', strength: 'medium' },
      { text: '過去の推測', source: 'recent_case', strength: 'high' },
    ], unknowns: ['まだ未確認'] },
    usualVsCurrent: { enabled, comparisonConclusion: '比較の結論',
      usualPatternsUsed: [{ label: '過去情報固有ラベル', source: 'person_profile', relevance: 'low' }],
      sameAsUsual: [{ label: '共通点固有ラベル', reason: '共通点の具体的な理由' }],
      deviationSignals: [{ label: '相違点固有ラベル', reason: '相違点の具体的な理由', strength: 'medium' }],
    },
  } } };
}

test('actual result page renders source meanings and AI-rated strength next to evidence', () => {
  const text = pageText(fixture());
  for (const label of ['今回の入力（ユーザー記入）', 'ユーザーの振り返り（本人の報告）', '過去のAI要約（推測を含む）', '保存された人物要約（推測を含む）', '根拠の強さ（AI評価）', '今回との関連度（AI評価）', '状況の材料']) assert.ok(text.includes(label), label);
});

test('collapsed detail panels retain input, all score reasons and comparison provenance', () => {
  const elements: { type: string; props: Record<string, unknown> }[] = [];
  const text = pageText(fixture(), elements);
  const panels = elements.filter((node) => node.type === 'details');
  assert.ok(panels.length >= 3);
  assert.ok(panels.every((node) => node.props.open === undefined));
  assert.equal(text.match(/synthetic score reason/g)?.length, 6);
  for (const label of ['synthetic event', 'synthetic reaction', '過去情報固有ラベル', '保存された人物要約（推測を含む）', '共通点の具体的な理由']) assert.ok(text.includes(label), label);
  assert.ok(elements.some((node) => node.type === 'a' && node.props.href === '#analysis-evidence'));
  assert.ok(elements.some((node) => node.props.id === 'analysis-evidence'));
});

test('actual result page renders same/deviation reasons only for an enabled comparison', () => {
  const on = pageText(fixture());
  for (const label of ['共通点固有ラベル', '共通点の具体的な理由', '相違点固有ラベル', '相違点の具体的な理由']) assert.ok(on.includes(label), label);
  const off = pageText(fixture(false));
  for (const label of ['共通点固有ラベル', '相違点固有ラベル', '過去情報固有ラベル']) assert.equal(off.includes(label), false, label);
});

test('confidence copy does not claim measured accuracy or stability', () => {
  const text = pageText(fixture());
  assert.ok(text.includes('確信度はAI自身の評価です'));
  assert.ok(text.includes('正解率や出力の安定性を実測した値ではなく'));
  assert.equal(text.includes('出力の安定性の目安'), false);
});

test('legacy evidence explicitly renders absent source and strength without fabricated comparisons', () => {
  const text = pageText({ result: { scores: {}, reasons: [{ label: '旧ラベル', detail: '旧説明' }], goodSignals: [{ text: '旧材料' }] } });
  assert.ok(text.includes('旧ラベル'));
  assert.ok(text.includes('出典情報なし'));
  assert.ok(text.includes('評価情報なし'));
  assert.equal(text.includes('過去のAI要約（推測を含む）'), false);
});

test('missing legacy confidence is not presented as an AI self-rating', () => {
  const text = pageText({ result: { scores: {} } });
  assert.ok(text.includes('記録なし'));
  assert.ok(text.includes('確信度の記録がありません'));
  assert.equal(text.includes('確信度はAI自身の評価です'), false);
});
