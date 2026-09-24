import crypto from 'crypto';
import {getSessionUser} from '../../lib/auth.js';
import {upsertPinterestAccount} from '../../lib/pinterest-store.js';

function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}
function origin(req){if(process.env.APP_ORIGIN)return process.env.APP_ORIGIN.replace(/\/$/,'');const host=req.headers['x-forwarded-host']||req.headers.host;const proto=req.headers['x-forwarded-proto']||'https';return proto+'://'+host}
function seal(value,secret){const key=crypto.createHash('sha256').update(secret).digest(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return ['v1',iv.toString('base64url'),tag.toString('base64url'),enc.toString('base64url')].join('.')}

export default async function handler(req,res){
  const c=cookies(req),code=String(req.query.code||''),state=String(req.query.state||''),id=process.env.PINTEREST_APP_ID,secret=process.env.PINTEREST_APP_SECRET,env=c.da_oauth_env==='sandbox'?'sandbox':'production',redirect=c.da_oauth_redirect||origin(req)+'/api/auth/pinterest/callback';
  if(!id||!secret)return res.status(500).send('Pinterest application credentials are not configured.');
  if(!code||!state||state!==c.da_oauth_state)return res.status(400).send('Invalid or expired OAuth state.');
  const host=env==='sandbox'?'https://api-sandbox.pinterest.com':'https://api.pinterest.com';
  const r=await fetch(host+'/v5/oauth/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect})});
  let d={};try{d=await r.json()}catch{}
  if(!r.ok)return res.status(r.status).send('Pinterest OAuth exchange failed: '+(d?.message||d?.error||'Unknown error'));

  const access=env==='sandbox'?'da_sandbox_access':'da_access',refresh=env==='sandbox'?'da_sandbox_refresh':'da_refresh';
  const out=[`${access}=${encodeURIComponent(seal(d.access_token,secret))}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`,'da_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax','da_oauth_env=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax','da_oauth_redirect=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'];
  if(d.refresh_token)out.push(`${refresh}=${encodeURIComponent(seal(d.refresh_token,secret))}; Max-Age=5184000; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.setHeader('Set-Cookie',out);

  if(env==='production'){
    try{
      const user=await getSessionUser(req);
      if(user){
        let username=null;
        const ar=await fetch('https://api.pinterest.com/v5/user_account',{headers:{Authorization:'Bearer '+d.access_token,Accept:'application/json'}});
        if(ar.ok){const ad=await ar.json();username=ad?.username||null}
        await upsertPinterestAccount(user.id,{
          username,
          access_token:d.access_token,
          refresh_token:d.refresh_token||null,
          access_expires_at:new Date(Date.now()+Number(d.expires_in||2592000)*1000),
          refresh_expires_at:d.refresh_token_expires_in?new Date(Date.now()+Number(d.refresh_token_expires_in)*1000):null,
          scopes:d.scope||null
        });
      }
    }catch(e){console.error('Pinterest account persistence failed',e)}
  }
  res.redirect(302,'/?oauth='+(env==='sandbox'?'sandbox-connected':'connected'));
}
