import test from 'node:test';import assert from 'node:assert/strict';
import {consumeValidatedStream,makeSdkStreamRequest,type PrototypeEvent} from './streamingPrototype.js';
import {fixtureInput} from '../fixtures/dataset.js';import {candidateOutput} from './offline.js';
const input=fixtureInput('neutral','合成された相談です。');
async function* events(...items:any[]){for(const item of items)yield item;}
test('raw deltas and incomplete output never emit or persist a section',async()=>{const emitted:PrototypeEvent[]=[];await assert.rejects(consumeValidatedStream('same-case',input,events({type:'response.output_text.delta',delta:'unsafe raw token'},{type:'response.incomplete'}),e=>emitted.push(e)));assert.deepEqual(emitted,[]);});
test('completed valid JSON emits only validated application sections and final actions',async()=>{const output=candidateOutput('neutral');const emitted:PrototypeEvent[]=[];await consumeValidatedStream('same-case',input,events({type:'response.output_text.done',text:JSON.stringify(output)},{type:'response.completed',response:{status:'completed'}}),e=>emitted.push(e));assert.deepEqual(emitted.map(e=>e.type),['summary_ready','evidence_ready','alternatives_ready','scores_ready','final_ready']);assert.ok(emitted.every(e=>e.caseId==='same-case'));assert.equal((emitted[0].value as any).recommendedActions,undefined);assert.ok((emitted.at(-1)?.value as any).recommendedActions);});
test('unsafe complete output or missing final completion cannot expose actions',async()=>{for(const stream of [events({type:'response.output_text.done',text:JSON.stringify(candidateOutput('unsafe_suggestion'))},{type:'response.completed',response:{status:'completed'}}),events({type:'response.output_text.done',text:JSON.stringify(candidateOutput('neutral'))})]){const emitted:PrototypeEvent[]=[];await assert.rejects(consumeValidatedStream('same-case',input,stream,e=>emitted.push(e)));assert.deepEqual(emitted,[]);}});
test('SDK request retains schema, storage-off and bounded output without sending',()=>{const request=makeSdkStreamRequest(input,'gpt-6-luna');assert.equal(request.store,false);assert.equal(request.max_output_tokens,3000);assert.equal(request.text.format.type,'json_schema');});

test('transport parsing schema refusal and completion failures emit no application event', async () => {
  const done={type:'response.completed',response:{status:'completed'}};
  const valid={type:'response.output_text.done',text:JSON.stringify(candidateOutput('neutral'))};
  async function* disconnected() { yield valid; throw new TypeError('synthetic disconnect'); }
  for(const stream of [
    events({type:'response.output_text.done',text:'invalid JSON'},done),
    events({type:'response.output_text.done',text:'{}'},done),
    disconnected(),
    events(valid,{type:'response.refusal.done'}),
    events(valid,{type:'response.failed'}),
    events(valid,{type:'error'}),
    events(valid,{type:'response.completed',response:{status:'failed'}}),
  ]) {
    const emitted:PrototypeEvent[]=[];
    await assert.rejects(consumeValidatedStream('same-case',input,stream,e=>emitted.push(e)));
    assert.deepEqual(emitted,[]);
  }
});

test('consumer exception preserves its identity after previously delivered validated section', async () => {
  const emitted:PrototypeEvent[]=[];
  const error=new Error('synthetic consumer failure');
  await assert.rejects(consumeValidatedStream('same-case',input,events(
    {type:'response.output_text.done',text:JSON.stringify(candidateOutput('neutral'))},
    {type:'response.completed',response:{status:'completed'}},
  ),event=>{emitted.push(event);throw error;}),actual=>actual===error);
  assert.deepEqual(emitted.map(event=>event.type),['summary_ready']);
});
