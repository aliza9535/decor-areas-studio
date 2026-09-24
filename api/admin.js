import crypto from 'crypto';
import {getDb,ensureSchema,dbConfigured} from './lib/db.js';
import {getSessionUser,trustedPost} from './lib/auth.js';
import {getSetting,hasSetting,setSetting,deleteSetting,getOpenAIConfig,getEmailConfig,listFrom} from './lib/settings.js';

async function owner(req,res){
  if(!dbConfigured()){res.status(503).json({error:'Database is not connected.'});return null}
  await ensureSchema();
  const user=await getSessionUser(req);
  if(!user){res.status(401).json({error:'Sign in first.'});return null}
  if(user.role!=='owner'){res.status(403).json({error:'Owner access required.'});return null}
  return user;
}
function int(v,fallback,min=0,max=100000){
  const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const user=await owner(req,res);if(!user)return;
  const sql=getDb(),action=String(req.query.action||'status');

  if(req.method==='GET'){
    if(action==='status'){
      const ai=await getOpenAIConfig(),email=await getEmailConfig();
      const users=await sql`select id,email,plan,role,ai_credits,email_verified_at,created_at from app_users order by created_at asc limit 250`;
      const textCost=int(await getSetting('ai_text_credit_cost','1'),1,0,1000);
      const imageLow=int(await getSetting('ai_image_low_credit_cost','4'),4,0,1000);
      const imageMedium=int(await getSetting('ai_image_medium_credit_cost','8'),8,0,1000);
      const imageHigh=int(await getSetting('ai_image_high_credit_cost','14'),14,0,1000);
      return res.status(200).json({ok:true,owner:{email:user.email},ai:{
        configured:!!ai.apiKey,keyStored:!!process.env.OPENAI_API_KEY||await hasSetting('openai_api_key'),
        textModels:ai.textModels,imageModels:ai.imageModels,defaultPrompt:ai.defaultPrompt,
        costs:{text:textCost,image:{low:imageLow,medium:imageMedium,high:imageHigh}}
      },email:{
        configured:!!email.apiKey&&!!email.from,keyStored:!!process.env.RESEND_API_KEY||await hasSetting('resend_api_key'),
        from:email.from||''
      },users:users.map(u=>({...u,email_verified:!!u.email_verified_at}))});
    }
    if(action==='models'){
      const ai=await getOpenAIConfig();
      if(!ai.apiKey)return res.status(503).json({error:'Configure an OpenAI API key first.'});
      const r=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+ai.apiKey}});
      let d={};try{d=await r.json()}catch{}
      if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'Could not load OpenAI models.'});
      const ids=(d.data||[]).map(x=>String(x.id||'')).filter(Boolean).sort();
      const imageModels=ids.filter(id=>/image/i.test(id));
      const textModels=ids.filter(id=>/^gpt-/i.test(id)&&!/image|realtime|audio|transcrib|tts|live/i.test(id));
      return res.status(200).json({ok:true,textModels,imageModels,all:ids});
    }
    return res.status(400).json({error:'Unknown action'});
  }

  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!trustedPost(req))return res.status(403).json({error:'Cross-site request rejected'});
  const b=req.body||{};

  if(action==='save-ai'){
    if(String(b.api_key||'').trim())await setSetting('openai_api_key',String(b.api_key).trim(),{sensitive:true});
    if(b.clear_key===true)await deleteSetting('openai_api_key');
    if(b.text_models!=null)await setSetting('openai_text_models',listFrom(b.text_models,[]).join(','));
    if(b.image_models!=null)await setSetting('openai_image_models',listFrom(b.image_models,[]).join(','));
    if(b.default_prompt!=null)await setSetting('ai_default_prompt',String(b.default_prompt).trim().slice(0,8000));
    if(b.costs){
      await setSetting('ai_text_credit_cost',String(int(b.costs.text,1,0,1000)));
      await setSetting('ai_image_low_credit_cost',String(int(b.costs.image?.low,4,0,1000)));
      await setSetting('ai_image_medium_credit_cost',String(int(b.costs.image?.medium,8,0,1000)));
      await setSetting('ai_image_high_credit_cost',String(int(b.costs.image?.high,14,0,1000)));
    }
    return res.status(200).json({ok:true});
  }

  if(action==='save-email'){
    if(String(b.api_key||'').trim())await setSetting('resend_api_key',String(b.api_key).trim(),{sensitive:true});
    if(b.clear_key===true)await deleteSetting('resend_api_key');
    if(b.from!=null)await setSetting('email_from',String(b.from).trim().slice(0,300));
    return res.status(200).json({ok:true});
  }

  if(action==='credits'){
    const userId=String(b.user_id||''),delta=int(b.delta,0,-100000,100000);
    if(!userId||!delta)return res.status(400).json({error:'Choose a user and a non-zero credit adjustment.'});
    const rows=await sql`update app_users set ai_credits=greatest(0,ai_credits+${delta}) where id=${userId} returning id,email,ai_credits`;
    if(!rows.length)return res.status(404).json({error:'User not found.'});
    await sql`insert into credit_ledger(id,user_id,delta,reason) values(${crypto.randomUUID()},${userId},${delta},${String(b.reason||'Owner adjustment').slice(0,240)})`;
    return res.status(200).json({ok:true,user:rows[0]});
  }

  return res.status(400).json({error:'Unknown action'});
}
