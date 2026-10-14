import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function actualModule(path: string, deps: Record<string, unknown> = {}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module={exports:{} as Record<string,any>};
  new Function('require','exports','module',code)((id:string)=>{
    if(!Object.hasOwn(deps,id)) throw new Error('Unexpected dependency '+id);
    return deps[id];
  },module.exports,module);
  return module.exports;
}
type Node={type:unknown;props:Record<string,any>};
function nodes(root:unknown):Node[] {
  if(Array.isArray(root)) return root.flatMap(nodes);
  if(!root||typeof root!=='object'||!('props' in root)) return [];
  const node=root as Node;
  return [node,...nodes(node.props.children)];
}

const scenarios = [false, true].flatMap(cached => ['coworker', 'other', 'customer', 'classmate'].map(relationshipType => ({ cached, relationshipType, failed: false })));
scenarios.push({ cached: true, relationshipType: 'coworker', failed: true });
for (const { cached, relationshipType, failed } of scenarios) test(`current Person selection/submission cached=${cached} type=${relationshipType} GETfailure=${failed}`,async()=>{
  let resolve!: (value:unknown)=>void;
  let reject!: (reason:unknown)=>void;
  const response=new Promise((done,fail)=>{resolve=done;reject=fail;});
  const states:any[]=[];let index=0;
  const refs:any[]=[];let refIndex=0;
  const caseBodies:any[]=[];let creates=0,writes=0,reads=0;
  const effects:Array<()=>unknown>=[];
  const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
  const model=actualModule('src/app/pages/newConsultationModel.ts');
  const boundary={userId:'synthetic-user',epoch:1};
  const page=actualModule('src/app/pages/NewConsultation.tsx',{
    react:{
      useState:(initial:any)=>{
        const slot=index++;
        if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;
        return [states[slot],(next:any)=>{states[slot]=typeof next==='function'?next(states[slot]):next;}];
      },
      useRef:(initial:any)=>refs[refIndex++]??={current:initial},useEffect:(effect:()=>unknown)=>effects.push(effect),
    },
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-router':{useNavigate:()=>()=>{},useSearchParams:()=>[new URLSearchParams('personId=synthetic-A')]},
    'lucide-react':new Proxy({}, {get:(_target,key)=>String(key)}),
    '../api/sessionV17':{createPerson:async()=>{assert.equal(failed,true);creates++;return {person:{id:'created-B',displayName:'Synthetic typed B',relationshipType:'boss'}};},createAnalysisCase:async(body:unknown)=>{caseBodies.push(body);return {analysisCase:{id:'created-case'}};}},
    '../api/client':{fetchApiJson:()=>{reads++;return response;}},
    '../utils/clientTiming': { clientTiming: new Proxy({}, { get: () => () => null }) },
    '../utils/authBoundary':{captureAuthBoundary:()=>boundary,isCurrentAuthBoundary:()=>true,assertCurrentAuthBoundary:()=>{}},
    '../api/consultationMapper':actualModule('src/app/api/consultationMapper.ts'),
    '../utils/storage':{getConsultations:()=>[],saveConsultation:()=>{writes++;}},
    '../utils/relationStyles':{getRelationStyle:()=>({})},
    '../components/Navigation':{Navigation:()=>null},
    '../components/LegalLinks': { LegalLinks: () => null }, '../legal/documents': { dataHandlingNotice: 'Storage notice' },
    '../components/PersonEditor':{PersonEditor:()=>null},
    '../utils/consultationHistory':{findLatestConsultationByPersonId:()=>cached ? { personId:'synthetic-A',personName:'Stale historical name',relation:'上司' } : undefined,getLatestConsultationsByPerson:()=>[]},
    './newConsultationModel':model,
  });
  const render=()=>{index=0;refIndex=0;return nodes(page.NewConsultation());};
  let tree=render();
  const cleanup=effects.map(effect=>effect());
  const control=(id:string)=>tree.find(node=>node.props.id===id)!;
  assert.equal(control('person-name').props.disabled,true);
  const relation=tree.find(node=>node.type==='fieldset'&&JSON.stringify(node.props.children).includes('相手との関係'));
  assert.equal(relation?.props.disabled,true);
  assert.equal(control('event-facts').props.disabled,undefined);
  control('person-name').props.onChange({target:{value:'Synthetic typed B'}});
  assert.equal(states[0].personName,'');
  control('event-facts').props.onChange({target:{value:'Synthetic draft retained'}});
  if(failed)reject(new Error('Synthetic GET failure'));
  else resolve({person:{id:'synthetic-A',displayName:'Synthetic A',relationshipType}});
  await new Promise<void>(done=>setImmediate(done));
  tree=render();
  assert.equal(reads,1);
  if(failed){
    control('person-name').props.onChange({target:{value:'Synthetic typed B'}}); tree=render();
    control('user-action').props.onChange({target:{value:'Synthetic action'}}); tree=render();
    assert.equal(tree.find(node=>node.type==='button'&&node.props.type==='submit')?.props.disabled,false);
    assert.equal(tree.some(node=>node.type==='button'&&node.props.children==='相手の情報を再取得'),false);
    await tree.find(node=>node.type==='form')!.props.onSubmit({preventDefault(){}});
    assert.equal(creates,1);assert.equal(caseBodies[0]?.personId,'created-B');assert.equal(reads,1);
    cleanup.forEach(fn=>{if(typeof fn==='function')fn();});return;
  }
  assert.equal(control('person-name').props.value,'Synthetic A');
  assert.equal(control('person-name').props.disabled,false);
  assert.equal(control('event-facts').props.value,'Synthetic draft retained');
  const editor=tree.find(node=>node.props.person?.id==='synthetic-A')!;
  assert.equal(editor.props.person.displayName,'Synthetic A');
  editor.props.onEditingChange(true); tree=render();
  assert.equal(tree.find(node=>node.type==='button'&&node.props.type==='submit')?.props.disabled,true);
  editor.props.onSaved({id:'synthetic-A',displayName:'Explicitly saved A',relationshipType});
  editor.props.onEditingChange(false); tree=render();
  assert.equal(control('person-name').props.value,'Explicitly saved A');
  assert.equal(control('event-facts').props.value,'Synthetic draft retained');
  assert.equal(writes,0);
  control('user-action').props.onChange({target:{value:'Synthetic action'}}); tree=render();
  await tree.find(node=>node.type==='form')!.props.onSubmit({preventDefault(){}});
  assert.equal(caseBodies[0]?.personId,'synthetic-A');assert.equal(writes,1);
  control('person-name').props.onChange({target:{value:'Synthetic typed B'}});
  assert.equal(states[0].personName,'Synthetic typed B');
  assert.equal(states[0].personId,'');
  cleanup.forEach(fn=>{if(typeof fn==='function')fn();});
});

test('retry uses the failed selected Person instead of the original URL Person', async () => {
  const states:any[]=[]; let index=0;
  const refs:any[]=[]; let refIndex=0;
  const effects:Array<()=>unknown>=[];
  const requests:string[]=[];
  const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
  const personB={personId:'B',personName:'Selected B',relation:'同僚'};
  const page=actualModule('src/app/pages/NewConsultation.tsx',{
    react:{useState:(initial:any)=>{const slot=index++;if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;return[states[slot],(next:any)=>{states[slot]=typeof next==='function'?next(states[slot]):next;}];},useRef:(initial:any)=>refs[refIndex++]??={current:initial},useEffect:(effect:()=>unknown)=>effects.push(effect)},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-router':{useNavigate:()=>()=>{},useSearchParams:()=>[new URLSearchParams('personId=A')]},
    'lucide-react':new Proxy({}, {get:(_target,key)=>String(key)}),
    '../api/sessionV17':{},
    '../api/client':{fetchApiJson:async(path:string)=>{requests.push(path);const id=path.split('/').at(-1);if(id==='B'&&requests.length===2)throw new Error('Synthetic B failure');return{person:{id,displayName:id==='A'?'Original A':'Selected B',relationshipType:'coworker'}};}},
    '../utils/clientTiming':{clientTiming:new Proxy({}, {get:()=>()=>null})},
    '../utils/authBoundary':{captureAuthBoundary:()=>({}),isCurrentAuthBoundary:()=>true,assertCurrentAuthBoundary:()=>{}},
    '../api/consultationMapper':actualModule('src/app/api/consultationMapper.ts'),
    '../utils/storage':{getConsultations:()=>[],saveConsultation:()=>{}},
    '../utils/relationStyles':{getRelationStyle:()=>({})},
    '../components/Navigation':{Navigation:()=>null},
    '../components/LegalLinks': { LegalLinks: () => null }, '../legal/documents': { dataHandlingNotice: 'Storage notice' },
    '../components/PersonEditor':{PersonEditor:()=>null},
    '../utils/consultationHistory':{findLatestConsultationByPersonId:()=>undefined,getLatestConsultationsByPerson:()=>[personB]},
    './newConsultationModel':actualModule('src/app/pages/newConsultationModel.ts'),
  });
  const render=()=>{index=0;refIndex=0;return nodes(page.NewConsultation());};
  let tree=render();const cleanup=effects.map(effect=>effect());
  await new Promise<void>(done=>setImmediate(done)); tree=render();
  tree.find(n=>n.props.id==='person-name')!.props.onChange({target:{value:'Selected B'}});tree=render();
  tree.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Selected B'))!.props.onClick();
  await new Promise<void>(done=>setImmediate(done));tree=render();
  tree.find(n=>n.type==='button'&&n.props.children==='相手の情報を再取得')!.props.onClick();
  await new Promise<void>(done=>setImmediate(done));tree=render();
  assert.deepEqual(requests,['/api/persons/A','/api/persons/B','/api/persons/B']);
  assert.equal(tree.find(n=>n.props.id==='person-name')!.props.value,'Selected B');
  cleanup.forEach(fn=>{if(typeof fn==='function')fn();});
});
