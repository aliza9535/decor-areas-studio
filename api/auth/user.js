import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from '../../server/db.js';
import {hashPassword,verifyPassword,createSession,getSessionUser,destroySession,sessionCookie,trustedPost,appOrigin} from '../../server/auth.js';
import {getEmailConfig} from '../../server/settings.js';

function cleanEmail(v){return String(v||'').trim().toLowerCase()}
function publicUser(u){return u?{id:u.id,email:u.email,plan:u.plan,role:u.role||'user',ai_credits:Number(u.ai_credits||0),email_verified:!!u.email_verified_at}:null}

async function issueVerification(user,req){
  const cfg=await getEmailConfig();
  if(!cfg.apiKey||!cfg.from)return {sent:false,reason:'Email provider is not configured yet.'};
  const sql=getDb(),token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');
  await sql`delete from email_verifications where user_id=${user.id}`;
  await sql`insert into email_verifications(id,user_id,token_hash,expires_at) values(${crypto.randomUUID()},${user.id},${hash},now()+interval '24 hours')`;
  const verifyUrl=appOrigin(req)+'/api/auth/user?action=verify&token='+encodeURIComponent(token);
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+cfg.apiKey,'Content-Type':'application/json'},body:JSON.stringify({
    from:cfg.from,to:[user.email],subject:'Verify your Decor Areas Studio email',
    html:'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px"><h2>Verify your email</h2><p>Confirm this email address to finish setting up your Decor Areas Studio workspace.</p><p><a href="'+verifyUrl+'" style="display:inline-block;background:#6847dc;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Verify email</a></p><p style="color:#777;font-size:12px">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p></div>'
  })});
  if(!r.ok){let d={};try{d=await r.json()}catch{};return {sent:false,reason:d?.message||'Email provider rejected the message.'}}
  return {sent:true};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query.action||'me');

  if(action==='verify'&&req.method==='GET'){
    if(!dbConfigured())return res.status(503).send('Database is unavailable.');
    await ensureSchema();const sql=getDb(),token=String(req.query.token||''),hash=crypto.createHash('sha256').update(token).digest('hex');
    const rows=await sql`select user_id from email_verifications where token_hash=${hash} and expires_at>now() limit 1`;
    if(!rows.length)return res.status(400).send('This verification link is invalid or expired.');
    await sql`update app_users set email_verified_at=now() where id=${rows[0].user_id}`;
    await sql`delete from email_verifications where user_id=${rows[0].user_id}`;
    return res.redirect(302,'/app/?verified=1');
  }

  if(action==='me'){
    const user=await getSessionUser(req);
    return res.status(200).json({ok:true,configured:dbConfigured(),user:publicUser(user)});
  }

  if(!dbConfigured())return res.status(503).json({error:'Account database is not connected.'});
  if(req.method!=='POST'&&!(action==='delete'&&req.method==='DELETE'))return res.status(405).json({error:'Method not allowed'});
  if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
  await ensureSchema();const sql=getDb();

  if(action==='signup'){
    const email=cleanEmail(req.body?.email),password=String(req.body?.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter a valid email address.'});
    if(password.length<8)return res.status(400).json({error:'Use at least 8 characters for your password.'});
    if((await sql`select id from app_users where email=${email} limit 1`).length)return res.status(409).json({error:'An account with this email already exists.'});
    const count=Number((await sql`select count(*)::int as n from app_users`)[0]?.n||0),role=count===0?'owner':'user',credits=role==='owner'?1000:25,id=crypto.randomUUID();
    await sql`insert into app_users(id,email,password_hash,role,ai_credits,email_verified_at) values(${id},${email},${hashPassword(password)},${role},${credits},${role==='owner'?new Date():null})`;
    const rows=await sql`select * from app_users where id=${id} limit 1`,user=rows[0],session=await createSession(id);res.setHeader('Set-Cookie',sessionCookie(session));
    const verification=role==='owner'?{sent:false,reason:'Owner bootstrap account is verified.'}:await issueVerification(user,req);
    return res.status(201).json({ok:true,user:publicUser(user),verification});
  }

  if(action==='login'){
    const email=cleanEmail(req.body?.email),password=String(req.body?.password||''),rows=await sql`select * from app_users where email=${email} limit 1`,user=rows[0];
    if(!user||!verifyPassword(password,user.password_hash))return res.status(401).json({error:'Email or password is incorrect.'});
    const session=await createSession(user.id);res.setHeader('Set-Cookie',sessionCookie(session));
    return res.status(200).json({ok:true,user:publicUser(user)});
  }

  if(action==='resend'){
    const user=await getSessionUser(req);if(!user)return res.status(401).json({error:'Sign in first.'});
    if(user.email_verified_at)return res.status(200).json({ok:true,alreadyVerified:true});
    const result=await issueVerification(user,req);
    if(!result.sent)return res.status(503).json({error:result.reason});
    return res.status(200).json({ok:true,sent:true});
  }

  if(action==='change-password'){
    const user=await getSessionUser(req);if(!user)return res.status(401).json({error:'Sign in first.'});
    const current=String(req.body?.current_password||''),next=String(req.body?.new_password||'');
    if(next.length<8)return res.status(400).json({error:'Use at least 8 characters for the new password.'});
    const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}));
    const recovered=cookies.da_owner_recovered==='1'&&user.role==='owner';
    if(!recovered){
      const rows=await sql`select password_hash from app_users where id=${user.id} limit 1`;
      if(!rows.length||!verifyPassword(current,rows[0].password_hash))return res.status(401).json({error:'Current password is incorrect.'});
    }
    await sql`update app_users set password_hash=${hashPassword(next)} where id=${user.id}`;
    res.setHeader('Set-Cookie','da_owner_recovered=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax');
    return res.status(200).json({ok:true});
  }

  if(action==='logout'){await destroySession(req);res.setHeader('Set-Cookie',sessionCookie('',0));return res.status(200).json({ok:true})}

  if(action==='delete'){
    const user=await getSessionUser(req);if(!user)return res.status(401).json({error:'Sign in first.'});
    await sql`delete from app_users where id=${user.id}`;res.setHeader('Set-Cookie',sessionCookie('',0));return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Unknown action'});
}
