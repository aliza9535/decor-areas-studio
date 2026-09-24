import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from './db.js';

function key(){
  const raw=process.env.TOKEN_ENCRYPTION_KEY||process.env.PINTEREST_APP_SECRET||'';
  return crypto.createHash('sha256').update(raw).digest();
}
function seal(value){
  if(value==null||value==='')return '';
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return ['cfg1',iv.toString('base64url'),tag.toString('base64url'),enc.toString('base64url')].join('.');
}
function unseal(value){
  if(!value)return '';
  if(!String(value).startsWith('cfg1.'))return String(value);
  try{
    const [,iv64,tag64,data64]=String(value).split('.');
    const dec=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv64,'base64url'));
    dec.setAuthTag(Buffer.from(tag64,'base64url'));
    return Buffer.concat([dec.update(Buffer.from(data64,'base64url')),dec.final()]).toString('utf8');
  }catch{return ''}
}
export async function getSetting(name,fallback=''){
  if(!dbConfigured())return fallback;
  await ensureSchema();
  const rows=await getDb()`select value,sensitive from app_settings where key=${name} limit 1`;
  if(!rows.length)return fallback;
  return rows[0].sensitive?unseal(rows[0].value):String(rows[0].value||'');
}
export async function hasSetting(name){
  if(!dbConfigured())return false;
  await ensureSchema();
  const rows=await getDb()`select 1 from app_settings where key=${name} and coalesce(value,'')<>'' limit 1`;
  return !!rows.length;
}
export async function setSetting(name,value,{sensitive=false}={}){
  await ensureSchema();
  const stored=sensitive?seal(value):String(value??'');
  await getDb()`insert into app_settings(key,value,sensitive,updated_at) values(${name},${stored},${sensitive},now())
    on conflict(key) do update set value=excluded.value,sensitive=excluded.sensitive,updated_at=now()`;
}
export async function deleteSetting(name){
  if(!dbConfigured())return;
  await ensureSchema();
  await getDb()`delete from app_settings where key=${name}`;
}
export function listFrom(value,fallback=[]){
  const arr=String(value||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
  return arr.length?[...new Set(arr)]:fallback;
}
export async function getOpenAIConfig(){
  const apiKey=process.env.OPENAI_API_KEY||await getSetting('openai_api_key','');
  const textModels=listFrom(await getSetting('openai_text_models',''),['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol']);
  const imageModels=listFrom(await getSetting('openai_image_models',''),['gpt-image-2']);
  const defaultPrompt=await getSetting('ai_default_prompt','Create clear, useful Pinterest-ready copy from the user supplied content. Keep every output editable, natural, accurate, and free of unsupported performance claims.');
  return {apiKey,textModels,imageModels,defaultPrompt};
}
export async function getEmailConfig(){
  return {
    apiKey:process.env.RESEND_API_KEY||await getSetting('resend_api_key',''),
    from:process.env.EMAIL_FROM||await getSetting('email_from','')
  };
}
