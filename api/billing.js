import Stripe from 'stripe';
import {getDb,ensureSchema,dbConfigured} from './lib/db.js';
import {getSessionUser,trustedPost} from './lib/auth.js';

function origin(req){
  if(process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/,'');
  const host=req.headers['x-forwarded-host']||req.headers.host,proto=req.headers['x-forwarded-proto']||'https';
  return proto+'://'+host;
}
function configured(){return !!process.env.STRIPE_SECRET_KEY}
function stripe(){return new Stripe(process.env.STRIPE_SECRET_KEY)}
function priceId(plan){return ({starter:process.env.STRIPE_PRICE_STARTER,pro:process.env.STRIPE_PRICE_PRO,agency:process.env.STRIPE_PRICE_AGENCY})[plan]||null}
function planFromPrice(id){
  if(id&&id===process.env.STRIPE_PRICE_AGENCY) return 'agency';
  if(id&&id===process.env.STRIPE_PRICE_PRO) return 'pro';
  if(id&&id===process.env.STRIPE_PRICE_STARTER) return 'starter';
  return 'free';
}
function formatPrice(p){
  if(!p) return null;
  return {amount:p.unit_amount,currency:p.currency,interval:p.recurring?.interval||null,interval_count:p.recurring?.interval_count||1};
}
async function configuredPrices(s){
  const out={};
  for(const plan of ['starter','pro','agency']){
    const id=priceId(plan);
    if(!id) continue;
    try{out[plan]=formatPrice(await s.prices.retrieve(id))}catch{}
  }
  return out;
}
async function syncExisting(sql,s,user){
  if(!user?.stripe_subscription_id) return user?.plan||'free';
  try{
    const sub=await s.subscriptions.retrieve(user.stripe_subscription_id);
    const plan=['active','trialing'].includes(sub.status)?planFromPrice(sub.items?.data?.[0]?.price?.id):'free';
    if(plan!==user.plan) await sql`update app_users set plan=${plan} where id=${user.id}`;
    return plan;
  }catch{return user.plan||'free'}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const user=await getSessionUser(req);
  if(req.method==='GET'){
    if(!configured()) return res.status(200).json({ok:true,databaseConfigured:dbConfigured(),stripeConfigured:false,prices:{},user:user?{email:user.email,plan:user.plan}:null});
    const s=stripe();let plan=user?.plan||'free';
    if(user&&dbConfigured()){await ensureSchema();plan=await syncExisting(getDb(),s,user)}
    return res.status(200).json({ok:true,databaseConfigured:dbConfigured(),stripeConfigured:true,prices:await configuredPrices(s),user:user?{email:user.email,plan}:null});
  }
  if(!trustedPost(req)) return res.status(403).json({error:'Cross-site request rejected'});
  if(!user) return res.status(401).json({error:'Sign in before managing a paid plan.'});
  if(!configured()) return res.status(503).json({error:'Billing is not connected yet.'});
  await ensureSchema();
  const sql=getDb(),s=stripe(),action=String(req.query.action||'');

  if(action==='checkout'){
    const plan=String(req.body?.plan||''),price=priceId(plan);
    if(!price) return res.status(400).json({error:'This plan is not configured in billing yet.'});
    const params={mode:'subscription',line_items:[{price,quantity:1}],client_reference_id:user.id,
      success_url:origin(req)+'/?checkout=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:origin(req)+'/?checkout=cancel',
      allow_promotion_codes:true,metadata:{user_id:user.id,plan}};
    if(user.stripe_customer_id) params.customer=user.stripe_customer_id; else params.customer_email=user.email;
    const session=await s.checkout.sessions.create(params);
    return res.status(200).json({ok:true,url:session.url});
  }
  if(action==='sync'){
    const sessionId=String(req.body?.session_id||'');
    let customer=user.stripe_customer_id,subscription=user.stripe_subscription_id,plan=user.plan;
    if(sessionId){
      const session=await s.checkout.sessions.retrieve(sessionId,{expand:['subscription']});
      if(session.client_reference_id!==user.id) return res.status(403).json({error:'This checkout does not belong to your account.'});
      customer=typeof session.customer==='string'?session.customer:session.customer?.id||customer;
      const sub=typeof session.subscription==='string'?await s.subscriptions.retrieve(session.subscription):session.subscription;
      subscription=sub?.id||subscription;
      plan=sub&&['active','trialing'].includes(sub.status)?planFromPrice(sub.items?.data?.[0]?.price?.id):'free';
    }else plan=await syncExisting(sql,s,user);
    await sql`update app_users set plan=${plan},stripe_customer_id=${customer||null},stripe_subscription_id=${subscription||null} where id=${user.id}`;
    return res.status(200).json({ok:true,plan});
  }
  if(action==='portal'){
    if(!user.stripe_customer_id) return res.status(400).json({error:'No billing customer is attached to this account yet.'});
    const p=await s.billingPortal.sessions.create({customer:user.stripe_customer_id,return_url:origin(req)+'/?billing=return'});
    return res.status(200).json({ok:true,url:p.url});
  }
  return res.status(400).json({error:'Unknown billing action'});
}
