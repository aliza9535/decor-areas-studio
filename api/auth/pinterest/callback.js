import {getSessionUser,createSession,sessionCookie} from '../../../server/auth.js';
import {getDb,ensureSchema} from '../../../server/db.js';
import {upsertPinterestAccount} from '../../../server/pinterest-store.js';
import crypto from 'crypto';
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}
function origin(req){if(process.env.APP_ORIGIN)return process.env.APP_ORIGIN.replace(/\/$/,'');const host=req.headers['x-forwarded-host']||req.headers.host;const proto=req.headers['x-forwarded-proto']||'https';return proto+'://'+host}
function seal(value,secret){const key=crypto.createHash('sha256').update(secret).digest(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return ['v1',iv.toString('base64url'),tag.toString('base64url'),enc.toString('base64url')].join('.')}
function authCookie(name,value,maxAge){return `${name}=${encodeURIComponent(value)}; Max-Age=${Math.max(60,Number(maxAge)||60)}; Path=/; HttpOnly; Secure; SameSite=Lax`}
function clearCookie(name){return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`}
export default async function handler(req,res){
  const c=cookies(req),code=String(req.query.code||''),state=String(req.query.state||''),id=process.env.PINTEREST_APP_ID,secret=process.env.PINTEREST_APP_SECRET,env=c.da_oauth_env==='sandbox'?'sandbox':'production',redirect=c.da_oauth_redirect||origin(req)+'/api/auth/pinterest/callback';
  if(!id||!secret)return res.status(500).send('Pinterest application credentials are not configured.');if(!code||!state||state!==c.da_oauth_state)return res.status(400).send('Invalid or expired OAuth state.');
  const host=env==='sandbox'?'https://api-sandbox.pinterest.com':'https://api.pinterest.com';const r=await fetch(host+'/v5/oauth/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect})});let d={};try{d=await r.json()}catch{};if(!r.ok)return res.status(r.status).send('Pinterest OAuth exchange failed: '+(d?.message||d?.error||'Unknown error'));
  const recovery=env==='production'&&c.da_oauth_recovery==='1';
  const access=env==='sandbox'?'da_sandbox_access':'da_access',refresh=env==='sandbox'?'da_sandbox_refresh':'da_refresh',out=[authCookie(access,seal(d.access_token,secret),d.expires_in||2592000),clearCookie('da_oauth_state'),clearCookie('da_oauth_env'),clearCookie('da_oauth_redirect'),clearCookie('da_oauth_recovery')];if(d.refresh_token)out.push(authCookie(refresh,seal(d.refresh_token,secret),d.refresh_token_expires_in||5184000));
  if(env==='production'){
    try{
      let username=null;
      const ar=await fetch('https://api.pinterest.com/v5/user_account',{headers:{Authorization:'Bearer '+d.access_token,Accept:'application/json'}});
      if(ar.ok){const ad=await ar.json();username=ad?.username||null}
      const user=await getSessionUser(req);
      if(user){
        await upsertPinterestAccount(user.id,{username,access_token:d.access_token,refresh_token:d.refresh_token||null,access_expires_at:new Date(Date.now()+Number(d.expires_in||2592000)*1000),refresh_expires_at:d.refresh_token_expires_in?new Date(Date.now()+Number(d.refresh_token_expires_in)*1000):null,scopes:d.scope||null});
      }else if(recovery&&username){
        await ensureSchema();
        const rows=await getDb()`select u.id from pinterest_accounts p join app_users u on u.id=p.user_id
          where lower(coalesce(p.username,''))=lower(${username}) and u.role='owner' limit 1`;
        if(rows.length){
          const session=await createSession(rows[0].id);
          out.push(sessionCookie(session),authCookie('da_owner_recovered','1',900));
          res.setHeader('Set-Cookie',out);
          return res.redirect(302,'/app/?recovered=1');
        }
      }
    }catch(e){console.error('Pinterest account persistence/recovery failed',e)}
  }
  res.setHeader('Set-Cookie',out);
  res.redirect(302,recovery?'/app/?recover=failed':'/app/?oauth='+(env==='sandbox'?'sandbox-connected':'connected'));
}