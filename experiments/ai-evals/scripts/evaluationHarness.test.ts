import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineReport,candidateOutput} from './offline.js';
import {fixtureInput} from '../fixtures/dataset.js';
import {semanticFlags} from '../graders/semantic.js';
import {planBudget,requirePaidGate} from './budget.js';
test('offline evaluation has 30 synthetic inputs, records failures and never claims model quality',()=>{const r=offlineReport();assert.equal(r.rows.length,30);assert.equal(r.paidCalls,0);assert.ok(r.rows.every(x=>x.schema_success&&x.latency_total===null&&x.human_semantic_review==='NOT_RUN'));assert.equal(r.rows.find(x=>x.id==='unsafe_suggestion')?.validation_failure,'unsafe');assert.equal(r.rows.find(x=>x.id==='negation')?.validation_success,true);});
test('semantic graders flag contradictions even when schema parsing succeeds',()=>{for(const [id,flag] of [['anger_high_weak_evidence','score_reason_consistency'],['reassurance_high_concern','reassurance_concern_review'],['confidence_high_unknowns','confidence_unknowns_review'],['unavailable_source','source_fidelity'],['unavailable_source','personalization_off_compliance'],['unavailable_source','usual_current_consistency'],['contradictory_actions','semantic_contradiction'],['score_unavailable_source','score_unavailable_source']])assert.ok(semanticFlags(candidateOutput(id),fixtureInput(id,'合成入力です。')).includes(flag),id);});
test('paid budget rejects unset gate, nonfinite values and cap overflow before any send',()=>{const input={model:'gpt-6-luna',requestCount:25,estimatedInputTokens:5000,maximumOutputTokens:3000,maxRetry:0,inputUsdPerMillion:0.1,outputUsdPerMillion:0.5,budgetCapUsd:1};const p=planBudget(input);assert.throws(()=>requirePaidGate(p,{}));assert.doesNotThrow(()=>requirePaidGate(p,{ALLOW_PAID_MODEL_BENCHMARK:'1'}));assert.throws(()=>requirePaidGate(planBudget({...input,budgetCapUsd:0.001}),{ALLOW_PAID_MODEL_BENCHMARK:'1'}));assert.throws(()=>planBudget({...input,estimatedInputTokens:NaN}));});

test('forged or stale budget flags cannot bypass a cap',()=>{const p=planBudget({model:'gpt-6-luna',requestCount:25,estimatedInputTokens:5000,maximumOutputTokens:3000,maxRetry:0,inputUsdPerMillion:0.1,outputUsdPerMillion:0.5,budgetCapUsd:1});assert.throws(()=>requirePaidGate({...p,budgetCapUsd:0.00001,withinBudget:true},{ALLOW_PAID_MODEL_BENCHMARK:'1'}));});

test('review graders flag feedback and prior AI reified as observed facts', () => {
  const feedback = candidateOutput('neutral');
  feedback.summary.oneLine = 'フィードバックを客観的事実として確認済みです。相手の本心を示す確実な材料です。';
  const input = fixtureInput('feedback_present', '合成されたフィードバックがあります。');
  assert.ok(semanticFlags(feedback, input).includes('feedback_fact_reification'));
  const history = candidateOutput('neutral');
  history.summary.oneLine = '過去のAI要約は確認済みの観察事実です。相手の本心を直接示す材料としています。';
  assert.ok(semanticFlags(history, fixtureInput('conflicting_history', '合成された履歴です。')).includes('ai_summary_fact_reification'));
});

test('generic unrelated high concern cannot prove support for coldness in the fixture grader', () => {
  const output = candidateOutput('neutral');
  output.emotionScoreAnalysis.scores.coldness.score = 90;
  output.evidence.signalsForConcern[0].strength = 'high';
  output.evidence.signalsForConcern[0].text = '遅刻について困ったと言われました。冷たさの根拠ではありません。';
  assert.ok(semanticFlags(output, fixtureInput('neutral', '合成入力です。')).includes('score_axis_support_review'));
});

test('conflicting history has distinct sources and repeated-input contract evaluation is explicitly repeated', () => {
  const input=fixtureInput('same_person_conflicting_cases','合成された同一人物の二件です。');
  assert.equal(input.referenceContext.recentCaseSummaries.length,2);
  assert.notEqual(input.referenceContext.recentCaseSummaries[0]?.analysisCaseId,input.referenceContext.recentCaseSummaries[1]?.analysisCaseId);
  const row=offlineReport().rows.find(row=>row.id==='same_input_repeated');
  assert.equal(row?.repeat_contract_observations?.length,2);
});
