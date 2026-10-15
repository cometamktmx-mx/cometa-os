import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
async function scenario(committed) {
  let states=[],refs=[],cursor=0,refCursor=0,posts=0,rows=[],bytes;
  const handle={current:null};
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=refCursor++;return refs[i]??={current:initial};},useEffect(){},useImperativeHandle(ref,create){ref.current=create();}};
  const imports={'react':react,'react/jsx-runtime':jsx,'next/image':{default:()=>null}};
  const scope={exports:{},crypto,URL,FormData,File,console,fetch:async(url,options)=>{
    if(url==='http://local.test/photo')return {ok:true,arrayBuffer:async()=>bytes};
    if(options?.method==='POST'){posts++;bytes=await options.body.get('file').arrayBuffer();if(committed)rows=[{id:'saved',public_url:'http://local.test/photo',sort_order:0,is_primary:true}];throw Error('response lost');}
    return {ok:true,json:async()=>({media:rows})};
  },require:n=>{assert.ok(n in imports);return imports[n];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/comu/seller/product-editor-media.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,scope);
  function nodes(n){if(!n||typeof n!=='object')return [];return [n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
  function render(){cursor=0;refCursor=0;return scope.exports.default({sellerId:'seller',locked:false,onPreview(){},handle});}
  let tree=render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{files:[new File(['image'],'test.png',{type:'image/png'})]},currentTarget:{value:''}});
  await new Promise(r=>setTimeout(r,30));render();await assert.rejects(handle.current.flush('listing'));assert.equal(posts,1);
  render();if(committed)await handle.current.flush('listing');else await assert.rejects(handle.current.flush('listing'),/confirmación/);
  assert.equal(posts,1,'Never blindly upload twice after an ambiguous response');
}
await scenario(true);await scenario(false);
console.log('PASS media: response lost after storage commit reconciles by SHA-256; unresolved upload is quarantined, never blindly resent.');
