import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from './db.js';

const API='https://api.pinterest.com/v5';
function key(){return crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY||process.env.PINTEREST_APP_SECRET||'').digest()}
export function sealSecret(value){
  if(!value)return null;
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return ['db1',iv.toString('base64url'),tag.toString('base64url'),enc.toString('base64url')].join('.');
}
export function unsealSecret(value){
  if(!value)return null;
  if(!String(value).startsWith('db1.'))return value;
  try{
    const [,iv64,tag64,data64]=String(value).split('.');
    const dec=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv64,'base64url'));
    dec.setAuthTag(Buffer.from(tag64,'base64url'));
    return Buffer.concat([dec.update(Buffer.from(data64,'base64url')),dec.final()]).toString('utf8');
  }catch{return null}
}
export async function upsertPinterestAccount(userId,data){
  if(!dbConfigured())return false;
  await ensureSchema();
  const sql=getDb();
  await sql`insert into pinterest_accounts(user_id,username,access_token,refresh_token,access_expires_at,refresh_expires_at,scopes,updated_at)
    values(${userId},${data.username||null},${sealSecret(data.access_token)},${sealSecret(data.refresh_token)},${data.access_expires_at||null},${data.refresh_expires_at||null},${data.scopes||null},now())
    on conflict(user_id) do update set username=excluded.username,access_token=excluded.access_token,
      refresh_token=coalesce(excluded.refresh_token,pinterest_accounts.refresh_token),
      access_expires_at=excluded.access_expires_at,refresh_expires_at=coalesce(excluded.refresh_expires_at,pinterest_accounts.refresh_expires_at),
      scopes=excluded.scopes,updated_at=now()`;
  return true;
}
export async function getPinterestAccount(userId){
  if(!dbConfigured())return null;
  await ensureSchema();
  const rows=await getDb()`select * from pinterest_accounts where user_id=${userId} limit 1`;
  return rows[0]||null;
}
export async function getFreshAccessToken(userId){
  const acct=await getPinterestAccount(userId);
  if(!acct)throw new Error('Pinterest is not connected for this workspace.');
  const expiry=acct.access_expires_at?new Date(acct.access_expires_at).getTime():0;
  if(expiry>Date.now()+5*60*1000)return unsealSecret(acct.access_token);
  const refresh=unsealSecret(acct.refresh_token);
  if(!refresh)throw new Error('Pinterest authorization needs to be reconnected.');
  const id=process.env.PINTEREST_APP_ID,secret=process.env.PINTEREST_APP_SECRET;
  const r=await fetch(API+'/oauth/token',{method:'POST',headers:{
    Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'
  },body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh})});
  let d={};try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(d?.message||d?.error||'Pinterest token refresh failed');
  const sql=getDb(),accessExpiry=new Date(Date.now()+Number(d.expires_in||2592000)*1000);
  const refreshExpiry=d.refresh_token_expires_in?new Date(Date.now()+Number(d.refresh_token_expires_in)*1000):acct.refresh_expires_at;
  await sql`update pinterest_accounts set access_token=${sealSecret(d.access_token)},refresh_token=${sealSecret(d.refresh_token||refresh)},
    access_expires_at=${accessExpiry},refresh_expires_at=${refreshExpiry||null},scopes=${d.scope||acct.scopes||null},updated_at=now()
    where user_id=${userId}`;
  return d.access_token;
}
export async function publishStoredPin(userId,pin){
  const token=await getFreshAccessToken(userId);
  const media_source=pin.image_url
    ?{source_type:'image_url',url:String(pin.image_url),is_standard:true}
    :{source_type:'image_base64',content_type:String(pin.content_type||'image/jpeg'),data:String(pin.image_data||''),is_standard:true};
  const payload={board_id:String(pin.board_id),title:String(pin.title),description:String(pin.description||''),alt_text:String(pin.alt_text||''),media_source};
  if(pin.destination)payload.link=String(pin.destination);
  const r=await fetch(API+'/pins',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
  let d={};try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(d?.message||d?.error||'Pinterest rejected the scheduled Pin.');
  return d;
}
