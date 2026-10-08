import {createHash,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {securityRateLimit} from "../src/lib/security-rate-limit";
async function main(){
 const url=new URL(process.env.DATABASE_URL??"");
 if(!["127.0.0.1","localhost"].includes(url.hostname)||url.pathname!=="/security_test")throw new Error("Only a disposable local security_test database is permitted");
 const db=new Pool({connectionString:url.toString()});
 await db.query(readFileSync("scripts/security-rate-limits.sql","utf8"));
 await db.query("TRUNCATE payments_security_rate_limits");
 const retained=randomUUID();const hash=createHash("sha256").update(retained).digest("hex");
 await db.query("INSERT INTO payments_security_rate_limits(key,count,reset_at) VALUES ($1,1,now()+interval '1 hour')",[hash]);
 await db.query("INSERT INTO payments_security_rate_limits(key,count,reset_at) SELECT 'expired-'||n,1,now()-interval '2 hours' FROM generate_series(1,25) n");
 assert.equal(await securityRateLimit(retained,3),true);
 assert.equal(Number((await db.query("SELECT count(*) AS count FROM payments_security_rate_limits")).rows[0].count),6,"cleanup deletes at most twenty expired keys");
 assert.equal((await db.query("SELECT count FROM payments_security_rate_limits WHERE key=$1",[hash])).rows[0].count,2,"current key is preserved");
 await db.query("UPDATE payments_security_rate_limits SET count=2147483647 WHERE key=$1",[hash]);
 assert.equal(await securityRateLimit(retained,3),false);
 assert.equal((await db.query("SELECT count FROM payments_security_rate_limits WHERE key=$1",[hash])).rows[0].count,4,"counter saturates before addition");
 const key=randomUUID();const results=await Promise.all(Array.from({length:50},()=>securityRateLimit(key,3)));
 assert.equal(results.filter(Boolean).length,3);
 await db.end();console.log("Postgres concurrency: exactly 3 of 50 admitted; bounded cleanup passed");
}
main().catch(error=>{console.error(error.name,error.message);process.exitCode=1;});
