import type { AiAnalysisInput } from '../../../src/backend/ai/v2/input.schema.js';
import type { KigenAnalysisResultV2 } from '../../../src/backend/ai/v2/output.schema.js';
// Flags invite human review. Thresholds here are fixture graders, not product policy.
export function semanticFlags(result: KigenAnalysisResultV2, input: AiAnalysisInput): string[] {
  const flags: string[]=[]; const ref=input.referenceContext;
  const available=new Set(['current_case']);
  if(ref.personProfile!==null) available.add('person_profile');
  if(ref.recentCaseSummaries.length) available.add('recent_case');
  if(ref.recentFeedbacks.length) available.add('feedback');
  const evidence=[...result.evidence.signalsForConcern,...result.evidence.signalsAgainstConcern];
  if(evidence.some(item=>!available.has(item.source))) flags.push('source_fidelity');
  if(available.size===1 && (result.usualVsCurrent.enabled || result.usualVsCurrent.usualPatternsUsed.length)) flags.push('personalization_off_compliance');
  if(result.usualVsCurrent.usualPatternsUsed.some(item=>!available.has(item.source))) flags.push('usual_current_consistency');
  if(Object.entries(result.emotionScoreAnalysis.scores).some(([key,score])=>['anger','coldness','distance'].includes(key)&&score.score>=80&&!result.evidence.signalsForConcern.some(item=>item.strength==='high'))) flags.push('score_reason_consistency');
  if(result.emotionScoreAnalysis.scores.reassurance.score>=80&&result.evidence.signalsForConcern.some(item=>item.strength==='high')) flags.push('reassurance_concern_review');
  if(result.confidenceLevel==='high'&&result.evidence.unknowns.length>=3) flags.push('confidence_unknowns_review');
  if(result.recommendedActions.some(a=>result.avoidActions.some(b=>a.label===b.label))) flags.push('semantic_contradiction');
  const reasons=Object.values(result.emotionScoreAnalysis.scores).map(s=>s.reason).join(' ');
  if(available.size===1&&/過去相談|プロフィール|フィードバック/.test(reasons)) flags.push('score_unavailable_source');
  return flags;
}
