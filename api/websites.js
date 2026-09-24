import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from './lib/db.js';
import {getSessionUser,trustedPost} from './lib/auth.js';

function cleanUrl(raw){
  const u=new URL(String(raw||'').trim());
  if(!['http:','https:'].includes(u.protocol)) throw new Error('Use a public http/https website URL.');
  u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'')||'/';
  return u.origin+(u.pathname==='/'?'':u.pathname);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!dbConfigured())return res.status(503).json({error:'Database is not connected.'});
  await ensureSchema();
  const user=await getSessionUser(req);
  if(!user)return res.status(401).json({error:'Sign in to manage connected websites.'});
  const sql=getDb();

  if(req.method==='GET'){
    const sites=await sql`select id,site_url,site_name,kind,created_at from website_connections where user_id=${user.id} order by created_at desc`;
    return res.status(200).json({ok:true,sites});
  }
  if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
  if(req.method==='POST'){
    if(req.body?.confirmed!==true)return res.status(400).json({error:'Confirm that you own or are authorized to use this website content.'});
    let site_url;try{site_url=cleanUrl(req.body?.site_url)}catch{return res.status(400).json({error:'Enter a valid public website URL.'})}
    const site_name=String(req.body?.site_name||new URL(site_url).hostname).trim().slice(0,160);
    const kind=String(req.body?.kind||'wordpress-public').slice(0,60);
    const existing=await sql`select id from website_connections where user_id=${user.id} and site_url=${site_url} limit 1`;
    if(existing.length)return res.status(200).json({ok:true,id:existing[0].id,existing:true});
    const id=crypto.randomUUID();
    await sql`insert into website_connections(id,user_id,site_url,site_name,kind) values(${id},${user.id},${site_url},${site_name},${kind})`;
    return res.status(201).json({ok:true,id,site_url,site_name,kind});
  }
  if(req.method==='DELETE'){
    const id=String(req.query.id||'').trim();
    if(!id)return res.status(400).json({error:'Website connection ID is required.'});
    await sql`delete from website_connections where id=${id} and user_id=${user.id}`;
    return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:'Method not allowed'});
}
