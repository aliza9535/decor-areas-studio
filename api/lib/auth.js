import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from './db.js';

export function parseCookies(req){
  return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf('=');
    return i<0?[x,'']:[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))];
  }));
}
export function appOrigin(req){
  if(process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/,'');
  const host=req.headers['x-forwarded-host']||req.headers.host,proto=req.headers['x-forwarded-proto']||'https';
  return proto+'://'+host;
}
export function trustedPost(req){
  const actual=String(req.headers.origin||'').replace(/\/$/,'');
  return !actual||actual===appOrigin(req);
}
export function hashPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const out=crypto.scryptSync(String(password),salt,64).toString('hex');
  return 'scrypt$'+salt+'$'+out;
}
export function verifyPassword(password,stored){
  try{
    const [,salt,expected]=String(stored).split('$');
    const actual=crypto.scryptSync(String(password),salt,64);
    const exp=Buffer.from(expected,'hex');
    return actual.length===exp.length&&crypto.timingSafeEqual(actual,exp);
  }catch{return false}
}
export function sessionCookie(token,maxAge=2592000){
  return 'da_session='+encodeURIComponent(token)+'; Max-Age='+maxAge+'; Path=/; HttpOnly; Secure; SameSite=Lax';
}
export async function createSession(userId){
  await ensureSchema();
  const sql=getDb(),token=crypto.randomBytes(32).toString('base64url');
  const hash=crypto.createHash('sha256').update(token).digest('hex'),id=crypto.randomUUID();
  await sql`insert into app_sessions(id,user_id,token_hash,expires_at) values(${id},${userId},${hash},now()+interval '30 days')`;
  return token;
}
export async function getSessionUser(req){
  if(!dbConfigured()) return null;
  await ensureSchema();
  const token=parseCookies(req).da_session;
  if(!token) return null;
  const hash=crypto.createHash('sha256').update(token).digest('hex'),sql=getDb();
  const rows=await sql`select u.id,u.email,u.plan,u.stripe_customer_id,u.stripe_subscription_id
    from app_sessions s join app_users u on u.id=s.user_id
    where s.token_hash=${hash} and s.expires_at>now() limit 1`;
  return rows[0]||null;
}
export async function destroySession(req){
  if(!dbConfigured()) return;
  await ensureSchema();
  const token=parseCookies(req).da_session;if(!token)return;
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  await getDb()`delete from app_sessions where token_hash=${hash}`;
}
