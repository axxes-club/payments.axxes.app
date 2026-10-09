/* eslint-disable @typescript-eslint/no-explicit-any -- test harness loads route modules into a VM sandbox; their exports are untyped. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {z} from 'zod';
const m={exports:{} as any};let creates=0;let validCaller=true;let admissions=0;
const stubs:any={
 '@/lib/payment-policy':{parseQuote:()=>({mode:'test',product:'qortr',amount:100,description:'test'}),checkoutParams:()=>({}),providerIdempotencyKey:()=>''},
 '@/lib/stripe':{apiCaller:()=>validCaller?{admin:true}:null,json:(v:any,s=200)=>new Response(JSON.stringify(v),{status:s}),stripe:()=>({checkout:{sessions:{create:async()=>{creates++;return{id:'cs_test_synthetic'}}}}})},
 '@/lib/products':{mayActFor:()=>true,registry:()=>({}),allowedReturnUrl:()=>true},
 '@/lib/security-rate-limit':{paymentsAdmission:async()=>{admissions++;return false;}}
};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/v1/checkouts/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,Request,Response,console,require:(id:string)=>stubs[id]});
test('checkout cannot call Stripe when shared admission fails',async()=>{
 const response=await m.exports.POST(new Request('https://payments.axxes.app/api/v1/checkouts',{method:'POST',headers:{authorization:'Bearer synthetic-key','idempotency-key':'synthetic-key-123'},body:'{}'}));
 assert.equal(response.status,429);assert.equal(creates,0);
});

test('unknown credentials cannot consume shared financial API budget',async()=>{
 validCaller=false;admissions=0;
 try{const response=await m.exports.POST(new Request('https://payments.axxes.app/api/v1/checkouts',{method:'POST',body:'{}'}));assert.equal(response.status,401);assert.equal(admissions,0);assert.equal(creates,0);}finally{validCaller=true;}
});
test('every v1 handler rejects unknown credentials before shared admission',async()=>{
 validCaller=false;
 try{
  for(const file of ['checkouts/route.ts','checkouts/[id]/route.ts','portal-sessions/route.ts','subscriptions/route.ts','subscriptions/[id]/route.ts']){
   const local={exports:{} as any};
   runInNewContext(ts.transpileModule(readFileSync(`src/app/api/v1/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:local,exports:local.exports,Request,Response,console,require:(id:string)=>id==='zod'?{z}:stubs[id]??{}});
   for(const method of ['GET','POST','DELETE'])if(typeof local.exports[method]==='function'){
    admissions=0;
    const response=await local.exports[method](new Request('https://payments.axxes.app/api/v1/synthetic',{method}),{params:Promise.resolve({id:'synthetic'})});
    assert.equal(response.status,401,`${file} ${method}`);assert.equal(admissions,0);assert.equal(creates,0);
   }
  }
 }finally{validCaller=true;}
});
