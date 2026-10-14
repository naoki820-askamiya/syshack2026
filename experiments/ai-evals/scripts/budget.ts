export interface BudgetInput {model:string;requestCount:number;estimatedInputTokens:number;maximumOutputTokens:number;maxRetry:number;inputUsdPerMillion:number;outputUsdPerMillion:number;budgetCapUsd:number}
export function planBudget(p: BudgetInput) {
  if(!p.model.trim()||![p.requestCount,p.estimatedInputTokens,p.maximumOutputTokens].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(p.maxRetry)||p.maxRetry<0||p.maxRetry>2||![p.inputUsdPerMillion,p.outputUsdPerMillion,p.budgetCapUsd].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid budget plan.');
  const maximumRequests=p.requestCount*(p.maxRetry+1);
  const estimatedMaximumUsd=maximumRequests*(p.estimatedInputTokens*p.inputUsdPerMillion+p.maximumOutputTokens*p.outputUsdPerMillion)/1e6;
  return {...p,maximumRequests,estimatedMaximumUsd,withinBudget:estimatedMaximumUsd<=p.budgetCapUsd};
}
export function requirePaidGate(plan: ReturnType<typeof planBudget>, env: Record<string,string|undefined>) {
  if(env.ALLOW_PAID_MODEL_BENCHMARK!=='1') throw new Error('Paid benchmark is disabled.');
  if(!planBudget(plan).withinBudget) throw new Error('Maximum estimate exceeds budget cap.');
}
// UTF-8 byte count is a conservative planning bound for this text, not an exact tokenizer.
export const estimateTokens=(text:string)=>Buffer.byteLength(text,'utf8');
