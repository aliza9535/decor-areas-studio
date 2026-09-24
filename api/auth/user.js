import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from '../lib/db.js';
import {hashPassword,verifyPassword,createSession,getSessionUser,destroySession,sessionCookie,trustedPost} from '../lib/auth.js';

function cleanEmail(v){return String(v||'').trim().toLowerCase()}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query.action||'me');

  if(action==='me'){
    const user=await getSessionUser(req);
    return res.status(200).json({ok:true,configured:dbConfigured(),user:user?{id:user.id,email:user.email,plan:user.plan}:null});
  }
  if(!dbConfigured()) return res.status(503).json({error:'Account database is not connected yet.'});
  if(req.method!=='POST'&&!(action==='delete'&&req.method==='DELETE')) return res.status(405).json({error:'Method not allowed'});
  if(!trustedPost(req)) return res.status(403).json({error:'Cross-site request rejected'});
  await ensureSchema();
  const sql=getDb();

  if(action==='signup'){
    const email=cleanEmail(req.body?.email),password=String(req.body?.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
    if(password.length<8) return res.status(400).json({error:'Use at least 8 characters for your password.'});
    const exists=await sql`select id from app_users where email=${email} limit 1`;
    if(exists.length) return res.status(409).json({error:'An account with this email already exists.'});
    const id=crypto.randomUUID();
    await sql`insert into app_users(id,email,password_hash) values(${id},${email},${hashPassword(password)})`;
    const token=await createSession(id);
    res.setHeader('Set-Cookie',sessionCookie(token));
    return res.status(201).json({ok:true,user:{id,email,plan:'free'}});
  }

  if(action==='login'){
    const email=cleanEmail(req.body?.email),password=String(req.body?.password||'');
    const rows=await sql`select * from app_users where email=${email} limit 1`;
    const user=rows[0];
    if(!user||!verifyPassword(password,user.password_hash)) return res.status(401).json({error:'Email or password is incorrect.'});
    const token=await createSession(user.id);
    res.setHeader('Set-Cookie',sessionCookie(token));
    return res.status(200).json({ok:true,user:{id:user.id,email:user.email,plan:user.plan}});
  }

  if(action==='logout'){
    await destroySession(req);
    res.setHeader('Set-Cookie',sessionCookie('',0));
    return res.status(200).json({ok:true});
  }

  if(action==='delete'){
    const user=await getSessionUser(req);
    if(!user) return res.status(401).json({error:'Sign in first.'});
    await sql`delete from app_users where id=${user.id}`;
    res.setHeader('Set-Cookie',sessionCookie('',0));
    return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Unknown action'});
}
