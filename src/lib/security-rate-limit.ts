import {createHash} from "node:crypto";
import {Pool} from "pg";
let pool: Pool|undefined;
async function take(key:string,limit:number){
 try{
  if(!process.env.DATABASE_URL)return false;
  pool??=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:3000,statement_timeout:3000});
  const id=createHash("sha256").update(key).digest("hex");
  const rows=await pool.query<{count:number}>(`INSERT INTO payments_security_rate_limits(key,count,reset_at) VALUES ($1,1,now()+interval '1 minute')
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN payments_security_rate_limits.reset_at<=now() THEN 1 ELSE LEAST(payments_security_rate_limits.count+1,$2::integer+1) END,
   reset_at=CASE WHEN payments_security_rate_limits.reset_at<=now() THEN EXCLUDED.reset_at ELSE payments_security_rate_limits.reset_at END RETURNING count`,[id,limit]);
  return !!rows.rows[0] && rows.rows[0].count<=limit;
 }catch{return false;}
}
export async function paymentsAdmission(request:Request){
 return await take("global-api",600) && await take(`caller:${request.headers.get("authorization")??"anonymous"}`,120);
}
