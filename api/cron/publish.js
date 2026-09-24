import {createRemoteJWKSet,jwtVerify} from 'jose';
import {getDb,ensureSchema,dbConfigured} from '../lib/db.js';
import {publishStoredPin} from '../lib/pinterest-store.js';

const AUDIENCE='decor-areas-studio-scheduler';
const JWKS=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));

async function authorized(req){
  const header=String(req.headers.authorization||'');
  if(!header.startsWith('Bearer ')) return false;
  const bearer=header.slice(7);
  if(process.env.CRON_SECRET&&bearer===process.env.CRON_SECRET) return true;
  try{
    const {payload}=await jwtVerify(bearer,JWKS,{issuer:'https://token.actions.githubusercontent.com',audience:AUDIENCE});
    return payload.repository==='aliza9535/decor-areas-studio'
      && payload.ref==='refs/heads/main'
      && ['schedule','workflow_dispatch'].includes(String(payload.event_name||''));
  }catch{return false}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!(await authorized(req))) return res.status(401).json({error:'Unauthorized scheduler trigger'});
  if(!dbConfigured()) return res.status(503).json({error:'Database is not configured.'});
  await ensureSchema();
  const sql=getDb();
  const due=await sql`select * from scheduled_pins where status='scheduled' and approved_at is not null and scheduled_at<=now() order by scheduled_at asc limit 20`;
  const results=[];
  for(const pin of due){
    const claim=await sql`update scheduled_pins set status='publishing' where id=${pin.id} and status='scheduled' returning id`;
    if(!claim.length) continue;
    try{
      const created=await publishStoredPin(pin.user_id,pin);
      await sql`update scheduled_pins set status='published',pinterest_pin_id=${created.id||null},published_at=now(),last_error=null where id=${pin.id}`;
      results.push({id:pin.id,status:'published',pinId:created.id||null});
    }catch(e){
      await sql`update scheduled_pins set status='failed',last_error=${String(e.message||e).slice(0,1000)} where id=${pin.id}`;
      results.push({id:pin.id,status:'failed'});
    }
  }
  return res.status(200).json({ok:true,processed:results.length,results});
}
