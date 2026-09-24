import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from './lib/db.js';
import {getSessionUser,trustedPost} from './lib/auth.js';

const LIMITS={free:10,starter:100,pro:500,agency:2000};
function safe(v,n){return String(v||'').trim().slice(0,n)}
function validHttpUrl(value){if(!value)return true;try{const u=new URL(String(value));return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}
async function gapConflict(sql,userId,when,ignoreId=''){
  const rows=ignoreId
    ?await sql`select id,scheduled_at,title from scheduled_pins where user_id=${userId} and status='scheduled' and id<>${ignoreId}
      and scheduled_at>${new Date(when.getTime()-1800000)} and scheduled_at<${new Date(when.getTime()+1800000)} limit 1`
    :await sql`select id,scheduled_at,title from scheduled_pins where user_id=${userId} and status='scheduled'
      and scheduled_at>${new Date(when.getTime()-1800000)} and scheduled_at<${new Date(when.getTime()+1800000)} limit 1`;
  return rows[0]||null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!dbConfigured()) return res.status(503).json({error:'Scheduler database is not connected yet.'});
  await ensureSchema();
  const user=await getSessionUser(req);
  if(!user) return res.status(401).json({error:'Create an account or sign in to use the scheduler.'});
  const sql=getDb();

  if(req.method==='GET'){
    const items=await sql`select id,board_id,board_name,title,description,destination,alt_text,image_url,content_type,scheduled_at,status,pinterest_pin_id,last_error,published_at,created_at
      from scheduled_pins where user_id=${user.id} order by scheduled_at desc limit 200`;
    return res.status(200).json({ok:true,items,gapMinutes:30,plan:user.plan,limit:LIMITS[user.plan]||LIMITS.free});
  }
  if(!trustedPost(req)) return res.status(403).json({error:'Cross-site request rejected'});

  if(req.method==='POST'){
    const b=req.body||{},when=new Date(b.scheduled_at);
    if(b.approved!==true) return res.status(400).json({error:'Review and explicitly approve this exact Pin before scheduling it.'});
    if(!b.board_id||!safe(b.title,100)) return res.status(400).json({error:'Board and title are required.'});
    if(Number.isNaN(when.getTime())||when.getTime()<Date.now()+5*60000) return res.status(400).json({error:'Choose a publishing time at least 5 minutes in the future.'});
    if(!b.image_data&&!b.image_url) return res.status(400).json({error:'Choose an image or use an imported article image.'});
    if(!validHttpUrl(b.destination)||!validHttpUrl(b.image_url)) return res.status(400).json({error:'Destination and hosted image URLs must use http:// or https://.'});
    if(b.image_data&&String(b.image_data).length>2900000) return res.status(413).json({error:'Scheduled uploads must be under about 2 MB. Use a smaller image or a hosted image URL.'});
    const count=(await sql`select count(*)::int as n from scheduled_pins where user_id=${user.id} and status='scheduled'`)[0]?.n||0;
    const cap=LIMITS[user.plan]||LIMITS.free;
    if(count>=cap) return res.status(403).json({error:`Your ${user.plan} plan allows up to ${cap} Pins in the active queue.`});
    const conflict=await gapConflict(sql,user.id,when);
    if(conflict) return res.status(409).json({error:'Scheduled Pins must be at least 30 minutes apart.',conflict});
    const id=crypto.randomUUID();
    await sql`insert into scheduled_pins(id,user_id,board_id,board_name,title,description,destination,alt_text,image_data,image_url,content_type,scheduled_at,approved_at,status)
      values(${id},${user.id},${safe(b.board_id,128)},${safe(b.board_name,160)||null},${safe(b.title,100)},${safe(b.description,500)||null},
      ${safe(b.destination,2000)||null},${safe(b.alt_text,500)||null},${b.image_data?String(b.image_data):null},${safe(b.image_url,3000)||null},
      ${safe(b.content_type,80)||'image/jpeg'},${when},now(),'scheduled')`;
    return res.status(201).json({ok:true,id,scheduled_at:when.toISOString(),gapMinutes:30});
  }

  if(req.method==='PATCH'){
    const id=safe(req.body?.id,100),when=new Date(req.body?.scheduled_at);
    if(!id||Number.isNaN(when.getTime())||when.getTime()<Date.now()+5*60000) return res.status(400).json({error:'Choose a valid future time.'});
    const conflict=await gapConflict(sql,user.id,when,id);
    if(conflict) return res.status(409).json({error:'Scheduled Pins must be at least 30 minutes apart.',conflict});
    const rows=await sql`update scheduled_pins set scheduled_at=${when},status='scheduled',last_error=null where id=${id} and user_id=${user.id} and status in ('scheduled','failed') returning id`;
    if(!rows.length) return res.status(404).json({error:'Scheduled Pin not found or cannot be changed.'});
    return res.status(200).json({ok:true});
  }

  if(req.method==='DELETE'){
    const id=safe(req.query.id,100);
    const rows=await sql`update scheduled_pins set status='cancelled' where id=${id} and user_id=${user.id} and status in ('scheduled','failed') returning id`;
    if(!rows.length) return res.status(404).json({error:'Scheduled Pin not found.'});
    return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:'Method not allowed'});
}
