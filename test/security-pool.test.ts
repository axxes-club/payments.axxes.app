import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
test('failed admission rollback destroys its client and pool failures are redacted',async()=>{
 let discarded:unknown;let listener:(error:Error)=>void=()=>{};const messages:unknown[][]=[];
 class Pool{
  constructor(options:{query_timeout:number}){assert.equal(options.query_timeout,3000);}
  on(event:string,handler:(error:Error)=>void){assert.equal(event,'error');listener=handler;}
  async connect(){return {query:async()=>{throw new Error('synthetic private connection details');},release:(error:unknown)=>{discarded=error;}};}
 }
 const module={exports:{} as any};
 runInNewContext(ts.transpileModule(readFileSync('src/lib/security-rate-limit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,process:{env:{DATABASE_URL:'synthetic'}},console:{error:(...args:unknown[])=>messages.push(args)},require:(id:string)=>id==='pg'?{Pool}:{}});
 assert.equal(await module.exports.paymentsAdmission(new Request('https://test')),false);
 assert.ok(discarded,'tainted connection must be removed from the pool');
 listener(new Error('synthetic private connection details'));
 assert.equal(messages.length,1);assert.ok(!JSON.stringify(messages).includes('private connection details'));
});
