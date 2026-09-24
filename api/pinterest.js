import {getSessionUser} from './lib/auth.js';
import {getFreshAccessToken,getPinterestAccount} from './lib/pinterest-store.js';
import crypto from 'crypto';

const PROD='https://api.pinterest.com/v5';
const SANDBOX='https://api-sandbox.pinterest.com/v5';
const OAUTH_PROD='https://api.pinterest.com/v5/oauth/token';
const OAUTH_SANDBOX='https://api-sandbox.pinterest.com/v5/oauth/token';
const REQUIRED_SCOPE='user_accounts:read,boards:read,boards:write,pins:read,pins:write';

function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}
function origin(req){if(process.env.APP_ORIGIN)return process.env.APP_ORIGIN.replace(/\/$/,'');const host=req.headers['x-forwarded-host']||req.headers.host;const proto=req.headers['x-forwarded-proto']||'https';return proto+'://'+host}
function redirectUri(req){return origin(req)+'/api/auth/pinterest/callback'}
function unseal(value){if(!value)return null;if(!String(value).startsWith('v1.'))return value;try{const [,iv64,tag64,data64]=String(value).split('.'),key=crypto.createHash('sha256').update(process.env.PINTEREST_APP_SECRET||'').digest(),dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv64,'base64url'));dec.setAuthTag(Buffer.from(tag64,'base64url'));return Buffer.concat([dec.update(Buffer.from(data64,'base64url')),dec.final()]).toString('utf8')}catch{return null}}
function seal(value,secret){const key=crypto.createHash('sha256').update(secret).digest(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return ['v1',iv.toString('base64url'),tag.toString('base64url'),enc.toString('base64url')].join('.')}
function trustedPost(req){const h=String(req.headers.origin||'').replace(/\/$/,'');return !h||h===origin(req)}
function appendCookies(res,lines){const current=res.getHeader('Set-Cookie');const arr=current?(Array.isArray(current)?current:[current]):[];res.setHeader('Set-Cookie',[...arr,...lines])}
function authNames(env){return env==='sandbox'?{access:'da_sandbox_access',refresh:'da_sandbox_refresh'}:{access:'da_access',refresh:'da_refresh'}}
function authCookie(name,value,maxAge){return `${name}=${encodeURIComponent(value)}; Max-Age=${Math.max(60,Number(maxAge)||60)}; Path=/; HttpOnly; Secure; SameSite=Lax`}
function clearCookie(name){return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`}
function base(env){return env==='sandbox'?SANDBOX:PROD}
function oauthEndpoint(env){return env==='sandbox'?OAUTH_SANDBOX:OAUTH_PROD}
async function parse(r){let d={};try{d=await r.json()}catch{};return d}
function fail(out,res,fallback='Pinterest API request failed'){return res.status(out.status||502).json({ok:false,error:out.data?.message||out.data?.error||fallback})}

async function refreshAccess(req,res,env){const c=cookies(req),names=authNames(env),refresh=unseal(c[names.refresh]),id=process.env.PINTEREST_APP_ID,secret=process.env.PINTEREST_APP_SECRET;if(!refresh||!id||!secret)return null;const r=await fetch(oauthEndpoint(env),{method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh})});const d=await parse(r);if(!r.ok||!d.access_token)return null;const lines=[authCookie(names.access,seal(d.access_token,secret),d.expires_in||2592000)];if(d.refresh_token)lines.push(authCookie(names.refresh,seal(d.refresh_token,secret),d.refresh_token_expires_in||5184000));appendCookies(res,lines);return d.access_token}
async function token(req,res,env){const c=cookies(req),names=authNames(env),access=unseal(c[names.access]);if(access)return access;const refreshed=await refreshAccess(req,res,env);if(refreshed)return refreshed;if(env==='production'){try{const user=await getSessionUser(req);if(user)return await getFreshAccessToken(user.id)}catch{}}return null}
async function pinterest(req,res,env,path,opt={}){let t=await token(req,res,env);if(!t)return{ok:false,status:401,data:{message:'Pinterest OAuth is not connected'}};const run=async tok=>{const r=await fetch(base(env)+path,{...opt,headers:{Authorization:'Bearer '+tok,Accept:'application/json',...(opt.headers||{})}});return{ok:r.ok,status:r.status,data:await parse(r)}};let out=await run(t);if(out.status===401){const next=await refreshAccess(req,res,env);if(next)out=await run(next)}return out}
function validHttpUrl(value){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query.action||''),c=cookies(req);

  if(action==='status'){let dbConnected=false;try{const user=await getSessionUser(req);if(user)dbConnected=!!(await getPinterestAccount(user.id))}catch{}return res.status(200).json({ok:true,standardAccess:true,productionConnected:!!(c.da_access||c.da_refresh)||dbConnected,sandboxConnected:!!(c.da_sandbox_access||c.da_sandbox_refresh),appConfigured:!!process.env.PINTEREST_APP_ID&&!!process.env.PINTEREST_APP_SECRET,workspaceConnected:dbConnected});}

  if(action==='disconnect'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
    appendCookies(res,['da_access','da_refresh','da_sandbox_access','da_sandbox_refresh','da_oauth_state','da_oauth_env','da_oauth_redirect'].map(clearCookie));
    return res.status(200).json({ok:true});
  }

  if(action==='oauth'){
    const id=process.env.PINTEREST_APP_ID;if(!id)return res.status(500).json({error:'PINTEREST_APP_ID is not configured'});
    const env=req.query.env==='sandbox'?'sandbox':'production',state=crypto.randomBytes(24).toString('hex'),redirect=redirectUri(req);
    appendCookies(res,[authCookie('da_oauth_state',state,600),authCookie('da_oauth_env',env,600),authCookie('da_oauth_redirect',redirect,600)]);
    return res.redirect(302,'https://www.pinterest.com/oauth/?client_id='+encodeURIComponent(id)+'&redirect_uri='+encodeURIComponent(redirect)+'&response_type=code&scope='+encodeURIComponent(REQUIRED_SCOPE)+'&state='+encodeURIComponent(state));
  }

  if(action==='account'){
    const out=await pinterest(req,res,'production','/user_account');if(!out.ok)return fail(out,res);
    return res.status(200).json({ok:true,account:{username:out.data?.username||null,account_type:out.data?.account_type||null,profile_image:out.data?.profile_image||null}});
  }

  if(action==='boards'){
    let boards=[],bookmark=null,pages=0;do{const out=await pinterest(req,res,'production','/boards?page_size=250'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):''));if(!out.ok)return fail(out,res,'Could not load Pinterest Boards');if(Array.isArray(out.data?.items))boards.push(...out.data.items);bookmark=out.data?.bookmark||null;pages++}while(bookmark&&pages<50);
    return res.status(200).json({ok:true,boards});
  }

  if(action==='create-board'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});const body=req.body||{},name=String(body.name||'').trim(),description=String(body.description||'').trim();if(!name)return res.status(400).json({error:'Board name is required'});
    const out=await pinterest(req,res,'production','/boards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description})});if(!out.ok)return fail(out,res,'Pinterest rejected the Board creation request');return res.status(201).json({ok:true,board:out.data});
  }

  if(action==='pins'){
    const bookmark=req.query.bookmark?String(req.query.bookmark):'';const out=await pinterest(req,res,'production','/pins?page_size=250&pin_metrics=true'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):''));if(!out.ok)return fail(out,res,'Could not load Pinterest Pins');return res.status(200).json({ok:true,pins:out.data?.items||[],bookmark:out.data?.bookmark||null});
  }

  if(action==='delete-pin'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});const id=String(req.body?.pin_id||'').trim();if(!id)return res.status(400).json({error:'Pin ID is required'});const out=await pinterest(req,res,'production','/pins/'+encodeURIComponent(id),{method:'DELETE'});if(!out.ok)return fail(out,res,'Pinterest rejected the Pin deletion request');return res.status(200).json({ok:true});
  }

  if(action==='analytics'){
    const days=Math.min(90,Math.max(7,Number(req.query.days)||30)),end=new Date(),start=new Date(Date.now()-(days-1)*86400000),ymd=d=>d.toISOString().slice(0,10),common='start_date='+ymd(start)+'&end_date='+ymd(end)+'&from_claimed_content=BOTH&pin_format=ALL&app_types=ALL&content_type=ALL&source=ALL';
    const a=await pinterest(req,res,'production','/user_account/analytics?'+common+'&split_field=NO_SPLIT');if(!a.ok)return fail(a,res,'Pinterest analytics unavailable');
    const tp=await pinterest(req,res,'production','/user_account/analytics/top_pins?'+common+'&sort_by=IMPRESSION&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,ENGAGEMENT&num_of_pins=50');
    const first=Object.values(a.data||{}).find(v=>v&&typeof v==='object'&&(v.summary_metrics||v.daily_metrics))||{};
    return res.status(200).json({ok:true,days,summary:first.summary_metrics||{},series:first.daily_metrics||[],topPins:tp.ok?(tp.data?.pins||[]):[]});
  }

  if(action==='sandbox-setup'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});const desiredName='Decor Areas Studio Test',desiredDescription='Sandbox board for user-approved API testing.';let boards=[],bookmark=null,pages=0;
    do{const page=await pinterest(req,res,'sandbox','/boards?page_size=250'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):''));if(!page.ok)return fail(page,res,'Could not list Sandbox boards');if(Array.isArray(page.data?.items))boards.push(...page.data.items);bookmark=page.data?.bookmark||null;pages++}while(bookmark&&pages<20);
    let primary=boards.find(b=>String(b.name||'').trim().toLowerCase()===desiredName.toLowerCase());if(!primary){const rr=await pinterest(req,res,'sandbox','/boards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:desiredName,description:desiredDescription})});if(!rr.ok)return fail(rr,res,'Could not create Sandbox board');primary=rr.data;boards.unshift(primary)}
    return res.status(200).json({ok:true,boards:[primary,...boards.filter(b=>b?.id!==primary?.id&&!/pinscope/i.test(String(b?.name||'')))]});
  }

  if(action==='create'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});const body=req.body||{},env=body.sandbox===true?'sandbox':'production',title=String(body.title||'').trim(),destination=String(body.destination||'').trim();if(!body.board_id||!title)return res.status(400).json({error:'Board and title are required'});if(!body.image_base64&&!body.image_url)return res.status(400).json({error:'Choose, design or generate an image'});if(destination&&!validHttpUrl(destination))return res.status(400).json({error:'Destination URL must start with http:// or https://'});
    const media_source=body.image_url?{source_type:'image_url',url:String(body.image_url),is_standard:true}:{source_type:'image_base64',content_type:String(body.content_type||'image/jpeg'),data:String(body.image_base64),is_standard:true},payload={board_id:String(body.board_id),title:title.slice(0,100),description:String(body.description||'').slice(0,800),alt_text:String(body.alt_text||'').slice(0,500),media_source};if(destination)payload.link=destination;
    const out=await pinterest(req,res,env,'/pins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!out.ok)return fail(out,res,'Pinterest rejected the publishing request');return res.status(201).json({ok:true,pin:out.data,environment:env});
  }

  return res.status(400).json({error:'Unknown action'});
}