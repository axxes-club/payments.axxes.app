import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function load(file:string,stubs:Record<string,unknown>={}) {
 const m={exports:{} as any};const cache:Record<string,unknown>={};
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Request,Response,TextDecoder,Uint8Array,setTimeout,clearTimeout,console:{info(){},error(){}},process:{env:{STRIPE_WEBHOOK_SECRET:'synthetic'}},require:(id:string)=>stubs[id]??(cache[id]??=load(`src/lib/${id.split('/').at(-1)}.ts`))});
 return m.exports;
}
test('webhook rejects UTF-8 body exceeding byte cap before signature verification',async()=>{
 let verified=0;
 const route=load('src/app/api/webhooks/stripe/route.ts',{
  '@/lib/stripe':{json:(v:unknown,s=200)=>Response.json(v,{status:s}),stripe:()=>({webhooks:{constructEvent:()=>{verified++;return{livemode:true,id:'synthetic',type:'ignored'};}}})},
  '@/lib/events':{productEvent:async()=>undefined,deliver:async()=>true}
 });
 const response=await route.POST(new Request('https://payments.axxes.app/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':'synthetic'},body:'é'.repeat(600000)}));
 assert.equal(response.status,413);assert.equal(verified,0);
});

test('reader stops after byte cap without consuming remaining chunks',async()=>{
 const {readBody}=load('src/lib/request-body.ts');let pulls=0;
 const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(12));}} ,{highWaterMark:0});
 const request=new Request('https://payments.axxes.app',{method:'POST',body,duplex:'half'} as RequestInit);
 await assert.rejects(readBody(request,16,100), (error:any)=>error.status===413);
 assert.equal(pulls,2);
});
test('reader deadline also bounds stalled cancellation',async()=>{
 const {readBody}=load('src/lib/request-body.ts');
 const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}});
 const request=new Request('https://payments.axxes.app',{method:'POST',body,duplex:'half'} as RequestInit);
 await assert.rejects(readBody(request,16,20),(error:any)=>error.status===408);
});
test('reader preserves UTF-8 split across chunks for signature verification',async()=>{
 const {readBody}=load('src/lib/request-body.ts');
 const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([0xc3]));controller.enqueue(new Uint8Array([0xa9]));controller.close();}});
 assert.equal(await readBody(new Request('https://payments.axxes.app',{method:'POST',body,duplex:'half'} as RequestInit),2,100),'é');
});
test('reader preserves leading BOM in the signed payload',async()=>{
 const {readBody}=load('src/lib/request-body.ts');
 assert.equal(await readBody(new Request('https://payments.axxes.app',{method:'POST',body:'\uFEFF{}'})), '\uFEFF{}');
});
