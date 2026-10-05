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

test('pending selected Person lookup disables identity edits and preserves unrelated draft',async()=>{
  let resolve!: (value:unknown)=>void;
  const response=new Promise(done=>{resolve=done;});
  const states:any[]=[];let index=0;
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
      useRef:()=>({current:null}),useEffect:(effect:()=>unknown)=>effects.push(effect),
    },
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-router':{useNavigate:()=>()=>{},useSearchParams:()=>[new URLSearchParams('personId=synthetic-A')]},
    'lucide-react':new Proxy({}, {get:(_target,key)=>String(key)}),
    '../api/sessionV17':{createPerson:()=>{throw new Error('unexpected create');},createAnalysisCase:()=>{throw new Error('unexpected create');}},
    '../api/client':{fetchApiJson:()=>response},
    '../utils/clientTiming': { clientTiming: new Proxy({}, { get: () => () => null }) },
    '../utils/authBoundary':{captureAuthBoundary:()=>boundary,isCurrentAuthBoundary:()=>true,assertCurrentAuthBoundary:()=>{}},
    '../api/consultationMapper':{relationshipLabel:()=> '同僚'},
    '../utils/storage':{getConsultations:()=>[],saveConsultation:()=>{}},
    '../utils/relationStyles':{getRelationStyle:()=>({})},
    '../components/Navigation':{Navigation:()=>null},
    '../utils/consultationHistory':{findLatestConsultationByPersonId:()=>undefined,getLatestConsultationsByPerson:()=>[]},
    './newConsultationModel':model,
  });
  const render=()=>{index=0;return nodes(page.NewConsultation());};
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
  resolve({person:{id:'synthetic-A',displayName:'Synthetic A',relationshipType:'coworker'}});
  await new Promise<void>(done=>setImmediate(done));
  tree=render();
  assert.equal(control('person-name').props.value,'Synthetic A');
  assert.equal(control('person-name').props.disabled,false);
  assert.equal(control('event-facts').props.value,'Synthetic draft retained');
  control('person-name').props.onChange({target:{value:'Synthetic typed B'}});
  assert.equal(states[0].personName,'Synthetic typed B');
  assert.equal(states[0].personId,'');
  cleanup.forEach(fn=>{if(typeof fn==='function')fn();});
});
