import dns from 'dns/promises';
import net from 'net';

function isPrivate(ip){
  if(net.isIP(ip)===4){
    const p=ip.split('.').map(Number);
    return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);
  }
  if(net.isIP(ip)===6) return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80');
  return false;
}
async function validate(raw){
  const u=new URL(raw);
  if(!['http:','https:'].includes(u.protocol)) throw new Error('Only public http/https URLs are supported.');
  if(['localhost','0.0.0.0'].includes(u.hostname)) throw new Error('Local addresses are not supported.');
  const addrs=await dns.lookup(u.hostname,{all:true});
  if(!addrs.length||addrs.some(a=>isPrivate(a.address))) throw new Error('Private network addresses are not supported.');
  return u;
}
async function safeFetch(raw,depth=0){
  if(depth>3) throw new Error('Too many redirects.');
  const u=await validate(raw);
  const r=await fetch(u,{redirect:'manual',headers:{'User-Agent':'DecorAreasStudio/1.0 (+https://studio.decorareas.com)'},signal:AbortSignal.timeout(10000)});
  if([301,302,303,307,308].includes(r.status)){
    const loc=r.headers.get('location'); if(!loc) throw new Error('Redirect had no location.');
    return safeFetch(new URL(loc,u).toString(),depth+1);
  }
  if(!r.ok) throw new Error('Could not fetch this page (HTTP '+r.status+').');
  const len=Number(r.headers.get('content-length')||0);
  if(len>2500000) throw new Error('Page is too large to import.');
  return {response:r,url:u.toString()};
}
function decode(s=''){return String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim()}
function meta(html,key){
  const tags=html.match(/<meta\s+[^>]*>/gi)||[];
  for(const tag of tags){
    const prop=(tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)||[])[1];
    if(String(prop||'').toLowerCase()!==key.toLowerCase()) continue;
    return decode((tag.match(/content\s*=\s*["']([^"']*)["']/i)||[])[1]||'');
  }
  return '';
}
function titleOf(html){return meta(html,'og:title')||decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const raw=String(req.query.url||'').trim();
  if(String(req.query.authorized||'')!=='true') return res.status(400).json({error:'Confirm that you own or are authorized to use this article before importing it.'});
  if(!raw) return res.status(400).json({error:'Paste a public article URL.'});
  try{
    const {response,url}=await safeFetch(raw);
    const type=String(response.headers.get('content-type')||'');
    if(!type.includes('text/html')) return res.status(400).json({error:'This URL is not an HTML article page.'});
    const html=(await response.text()).slice(0,2500000);
    const canonical=(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)||[])[1]||url;
    let image=meta(html,'og:image')||meta(html,'twitter:image');
    if(image){try{image=new URL(image,url).toString()}catch{image=''}}
    return res.status(200).json({ok:true,article:{
      title:titleOf(html).slice(0,100),
      description:(meta(html,'og:description')||meta(html,'description')||meta(html,'twitter:description')).slice(0,500),
      image,
      url:canonical
    }});
  }catch(e){return res.status(400).json({error:String(e.message||e)})}
}
