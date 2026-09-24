import {getDb,ensureSchema,dbConfigured} from '../lib/db.js';
import {publishStoredPin} from '../lib/pinterest-store.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.CRON_SECRET) return res.status(503).json({error:'CRON_SECRET is not configured.'});
  if(String(req.headers.authorization||'')!==`Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Unauthorized'});
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
      results.push({id:pin.id,status:'failed',error:String(e.message||e)});
    }
  }
  return res.status(200).json({ok:true,processed:results.length,results});
}
