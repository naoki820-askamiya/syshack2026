import type OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {aiAnalysisInputSchema,type AiAnalysisInput} from '../../../src/backend/ai/v2/input.schema.js';
import {kigenAnalysisResultV2Schema} from '../../../src/backend/ai/v2/output.schema.js';
import {buildAiInstructions} from '../../../src/backend/ai/v2/instructions.js';
import {buildAiInput} from '../../../src/backend/ai/v2/context.js';
import {validateAiOutput} from '../../../src/backend/ai/v2/validation.js';
// Transport-only prototype. No app route, persistence, API client construction or paid runner.
export function makeSdkStreamRequest(input:AiAnalysisInput, model:string) {
  return {model,store:false,instructions:buildAiInstructions(),input:buildAiInput(aiAnalysisInputSchema.parse(input)),max_output_tokens:3000,
    text:{format:zodTextFormat(kigenAnalysisResultV2Schema,'kigen_analysis_result_v2')}};
}
export type PrototypeEvent={type:'summary_ready'|'evidence_ready'|'alternatives_ready'|'scores_ready'|'final_ready';caseId:string;value:unknown};
type TransportEvent={type:string;text?:string;response?:{status?:string}};
export async function consumeValidatedStream(caseId:string,input:AiAnalysisInput,stream:AsyncIterable<TransportEvent>,emit:(event:PrototypeEvent)=>void){
  let completedText:string|undefined;let completed=false;
  for await(const event of stream){
    if(event.type==='response.output_text.done') completedText=event.text;
    if(event.type==='response.failed'||event.type==='response.incomplete'||event.type==='error'||event.type==='response.refusal.done') throw new Error('Stream failed; retry the saved case after reading server state.');
    if(event.type==='response.completed') completed=event.response?.status==='completed';
  }
  if(!completed||completedText===undefined) throw new Error('No completed structured output.');
  const validated=validateAiOutput(JSON.parse(completedText),input.referenceContext);
  emit({type:'summary_ready',caseId,value:validated.summary});
  emit({type:'evidence_ready',caseId,value:validated.evidence});
  emit({type:'alternatives_ready',caseId,value:validated.alternativeInterpretations});
  emit({type:'scores_ready',caseId,value:validated.emotionScoreAnalysis});
  emit({type:'final_ready',caseId,value:validated});
  return validated;
}
// The installed SDK accepts the request without a dependency update. Never called by the offline runner.
export type InstalledStreamClient=Pick<OpenAI['responses'],'stream'>;
