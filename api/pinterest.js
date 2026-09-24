import crypto from 'crypto';

const PROD='https://api.pinterest.com/v5';
const SANDBOX='https://api-sandbox.pinterest.com/v5';
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}
function origin(req){if(process.env.APP_ORIGIN)return process.env.APP_ORIGIN.replace(/\/$/,'');const host=req.headers['x-forwarded-host']||req.headers.host;const proto=req.headers['x-forwarded-proto']||'https';return proto+'://'+host}
function redirectUri(req){return origin(req)+'/api/auth/pinterest/callback'}
async function get(url,token){const r=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});let d={};try{d=await r.json()}catch{};return{ok:r.ok,status:r.status,data:d}}
function fail(out,res,fallback='Pinterest API request failed'){return res.status(out.status||502).json({ok:false,error:out.data?.message||out.data?.error||fallback})}
function unseal(value){if(!value)return null;if(!String(value).startsWith('v1.'))return value;try{const [,iv64,tag64,data64]=String(value).split('.'),key=crypto.createHash('sha256').update(process.env.PINTEREST_APP_SECRET||'').digest(),dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv64,'base64url'));dec.setAuthTag(Buffer.from(tag64,'base64url'));return Buffer.concat([dec.update(Buffer.from(data64,'base64url')),dec.final()]).toString('utf8')}catch{return null}}
function prodToken(req){const c=cookies(req);return unseal(c.da_access)}
function trustedPost(req){const h=String(req.headers.origin||'').replace(/\/$/,'');return !h||h===origin(req)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query.action||''),c=cookies(req);

  if(action==='status')return res.status(200).json({ok:true,productionConnected:!!c.da_access,sandboxConnected:!!c.da_sandbox_access,appConfigured:!!process.env.PINTEREST_APP_ID&&!!process.env.PINTEREST_APP_SECRET});

  if(action==='disconnect'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
    const names=['da_access','da_refresh','da_sandbox_access','da_sandbox_refresh','da_oauth_state','da_oauth_env','da_oauth_redirect'];
    res.setHeader('Set-Cookie',names.map(n=>`${n}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`));
    return res.status(200).json({ok:true});
  }

  if(action==='oauth'){
    const id=process.env.PINTEREST_APP_ID;if(!id)return res.status(500).json({error:'PINTEREST_APP_ID is not configured'});
    const env=req.query.env==='sandbox'?'sandbox':'production',state=crypto.randomBytes(24).toString('hex'),redirect=redirectUri(req),scope='user_accounts:read,boards:read,boards:write,pins:read,pins:write';
    res.setHeader('Set-Cookie',[`da_oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,`da_oauth_env=${env}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,`da_oauth_redirect=${encodeURIComponent(redirect)}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`]);
    return res.redirect(302,'https://www.pinterest.com/oauth/?client_id='+encodeURIComponent(id)+'&redirect_uri='+encodeURIComponent(redirect)+'&response_type=code&scope='+encodeURIComponent(scope)+'&state='+encodeURIComponent(state));
  }

  if(action==='account'){
    const token=prodToken(req);if(!token)return res.status(401).json({error:'Pinterest API access is not connected'});
    const r=await get(PROD+'/user_account',token);if(!r.ok)return fail(r,res);
    return res.status(200).json({ok:true,account:{username:r.data?.username||null,account_type:r.data?.account_type||null,profile_image:r.data?.profile_image||null}});
  }

  if(action==='boards'){
    const token=prodToken(req);if(!token)return res.status(401).json({error:'Pinterest OAuth is not connected'});
    let boards=[],bookmark=null,pages=0;
    do{
      const url=PROD+'/boards?page_size=100'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):'');
      const page=await get(url,token);if(!page.ok)return fail(page,res,'Could not load Pinterest Boards');
      if(Array.isArray(page.data?.items))boards.push(...page.data.items);
      bookmark=page.data?.bookmark||null;pages++;
    }while(bookmark&&pages<20);
    return res.status(200).json({ok:true,boards});
  }

  if(action==='pins'){
    const token=prodToken(req);if(!token)return res.status(401).json({error:'Pinterest OAuth is not connected'});
    const r=await get(PROD+'/pins?page_size=25&pin_metrics=true',token);if(!r.ok)return fail(r,res,'Could not load Pins');
    return res.status(200).json({ok:true,pins:r.data?.items||[]});
  }

  if(action==='analytics'){
    const token=prodToken(req);if(!token)return res.status(401).json({error:'Pinterest API access is not connected'});
    const end=new Date(),start=new Date(Date.now()-29*86400000),ymd=d=>d.toISOString().slice(0,10);
    const common='start_date='+ymd(start)+'&end_date='+ymd(end)+'&from_claimed_content=BOTH&pin_format=ALL&app_types=ALL&content_type=ALL&source=ALL';
    const [a,tp]=await Promise.all([
      get(PROD+'/user_account/analytics?'+common+'&split_field=NO_SPLIT',token),
      get(PROD+'/user_account/analytics/top_pins?'+common+'&sort_by=IMPRESSION&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,ENGAGEMENT&num_of_pins=10',token)
    ]);
    if(!a.ok)return fail(a,res,'Pinterest analytics unavailable');
    const first=Object.values(a.data||{}).find(v=>v&&typeof v==='object'&&(v.summary_metrics||v.daily_metrics))||{};
    return res.status(200).json({ok:true,summary:first.summary_metrics||{},series:first.daily_metrics||[],topPins:tp.ok?(tp.data?.pins||[]):[]});
  }

  if(action==='sandbox-setup'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
    const token=unseal(c.da_sandbox_access);if(!token)return res.status(401).json({error:'Pinterest Sandbox is not connected'});
    const headers={Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'};
    const desiredName='Decor Areas Studio Test',desiredDescription='Sandbox board for user-approved API testing.';
    let boards=[],bookmark=null,pages=0;
    do{
      const url=SANDBOX+'/boards?page_size=250'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):'');
      const page=await get(url,token);if(!page.ok)return fail(page,res,'Could not list Sandbox boards');
      if(Array.isArray(page.data?.items))boards.push(...page.data.items);
      bookmark=page.data?.bookmark||null;pages++;
    }while(bookmark&&pages<20);
    for(const board of boards){
      if(board?.id&&/pinscope/i.test(String(board.name||''))){
        const rr=await fetch(SANDBOX+'/boards/'+encodeURIComponent(board.id),{method:'PATCH',headers,body:JSON.stringify({name:desiredName,description:desiredDescription})});
        let d={};try{d=await rr.json()}catch{}
        if(rr.ok){board.name=d?.name||desiredName;board.description=d?.description||desiredDescription}
      }
    }
    let primary=boards.find(b=>String(b.name||'').trim().toLowerCase()===desiredName.toLowerCase());
    if(!primary){
      const rr=await fetch(SANDBOX+'/boards',{method:'POST',headers,body:JSON.stringify({name:desiredName,description:desiredDescription})});
      let d={};try{d=await rr.json()}catch{};if(!rr.ok)return res.status(rr.status).json({error:d?.message||'Could not create Sandbox board'});
      primary=d;boards.unshift(d);
    }
    const clean=[primary,...boards.filter(b=>b?.id!==primary?.id&&!/pinscope/i.test(String(b?.name||'')))];
    return res.status(200).json({ok:true,boards:clean,normalized:true});
  }

  if(action==='create'){
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
    const body=req.body||{},sandbox=body.sandbox===true,token=sandbox?unseal(c.da_sandbox_access):prodToken(req);
    if(!token)return res.status(401).json({error:'Pinterest API access is not connected'});
    if(!body.board_id||!String(body.title||'').trim())return res.status(400).json({error:'Board and title are required'});
    if(!body.image_base64&&!body.image_url)return res.status(400).json({error:'Choose an image'});
    const media_source=body.image_url
      ?{source_type:'image_url',url:String(body.image_url),is_standard:true}
      :{source_type:'image_base64',content_type:String(body.content_type||'image/jpeg'),data:String(body.image_base64),is_standard:true};
    const payload={board_id:String(body.board_id),title:String(body.title).trim(),description:String(body.description||''),alt_text:String(body.alt_text||''),media_source};
    if(body.destination)payload.link=String(body.destination);
    const rr=await fetch((sandbox?SANDBOX:PROD)+'/pins',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
    let d={};try{d=await rr.json()}catch{}
    if(!rr.ok)return res.status(rr.status).json({error:d?.message||d?.error||'Pinterest rejected the publishing request'});
    return res.status(201).json({ok:true,pin:d,environment:sandbox?'sandbox':'production'});
  }

  return res.status(400).json({error:'Unknown action'});
}
