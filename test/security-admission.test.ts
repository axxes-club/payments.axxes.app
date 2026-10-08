import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const m={exports:{} as any};let creates=0;
const stubs:any={
 '@/lib/payment-policy':{parseQuote:()=>({mode:'test',product:'qortr',amount:100,description:'test'}),checkoutParams:()=>({}),providerIdempotencyKey:()=>''},
 '@/lib/stripe':{apiCaller:()=>({admin:true}),json:(v:any,s=200)=>new Response(JSON.stringify(v),{status:s}),stripe:()=>({checkout:{sessions:{create:async()=>{creates++;return{id:'cs_test_synthetic'}}}}})},
 '@/lib/products':{mayActFor:()=>true,registry:()=>({}),allowedReturnUrl:()=>true},
 '@/lib/security-rate-limit':{paymentsAdmission:async()=>false}
};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/v1/checkouts/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,Request,Response,console,require:(id:string)=>stubs[id]});
test('checkout cannot call Stripe when shared admission fails',async()=>{
 const response=await m.exports.POST(new Request('https://payments.axxes.app/api/v1/checkouts',{method:'POST',headers:{authorization:'Bearer synthetic-key','idempotency-key':'synthetic-key-123'},body:'{}'}));
 assert.equal(response.status,429);assert.equal(creates,0);
});
