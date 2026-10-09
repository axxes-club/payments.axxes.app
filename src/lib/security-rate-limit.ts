import {createHash} from "node:crypto";
import {Pool,type PoolClient} from "pg";
let pool: Pool|undefined;
function admissionPool(){
 if(!pool){pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:3000,statement_timeout:3000,query_timeout:3000});pool.on('error',()=>console.error('Payments admission connection unavailable'));}
 return pool;
}
export async function securityRateLimit(key:string,limit:number,client?:PoolClient){
 try{
  if(!process.env.DATABASE_URL)return false;
  const connection=admissionPool();
  const id=createHash("sha256").update(key).digest("hex");
  const rows=await (client??connection).query<{count:number}>(`WITH cleanup AS (DELETE FROM payments_security_rate_limits WHERE reset_at < CURRENT_TIMESTAMP - INTERVAL '1 hour' AND key <> $1 AND key IN (SELECT key FROM payments_security_rate_limits WHERE reset_at < CURRENT_TIMESTAMP - INTERVAL '1 hour' AND key <> $1 LIMIT 20) RETURNING key)
   INSERT INTO payments_security_rate_limits(key,count,reset_at) VALUES ($1,1,now()+interval '1 minute')
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN payments_security_rate_limits.reset_at<=now() THEN 1 ELSE LEAST(payments_security_rate_limits.count,$2::integer)+1 END,
   reset_at=CASE WHEN payments_security_rate_limits.reset_at<=now() THEN EXCLUDED.reset_at ELSE payments_security_rate_limits.reset_at END RETURNING count`,[id,limit]);
  return !!rows.rows[0] && rows.rows[0].count<=limit;
 }catch{return false;}
}
export async function paymentsAdmission(request:Request){
 let client:PoolClient|undefined;let discard:Error|undefined;
 try{
  if(!process.env.DATABASE_URL)return false;
  const connection=admissionPool();
  client=await connection.connect();await client.query('BEGIN');
  const admitted=await securityRateLimit("global-api",600,client)&&await securityRateLimit(`caller:${request.headers.get("authorization")??"anonymous"}`,120,client);
  await client.query(admitted?'COMMIT':'ROLLBACK');return admitted;
 }catch{if(client)try{await client.query('ROLLBACK');}catch{discard=new Error('Admission rollback unavailable');}return false;}finally{client?.release(discard);}
}
