import dns from 'dns/promises';
import net from 'net';

function isPrivate(ip){
  if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)}
  if(net.isIP(ip)===6)return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80');
  return false;
}
async function validate(raw){
  const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('Only public http/https URLs are supported.');
  if(['localhost','0.0.0.0'].includes(u.hostname))throw new Error('Local addresses are not supported.');
  const addrs=await dns.lookup(u.hostname,{all:true});if(!addrs.length||addrs.some(a=>isPrivate(a.address)))throw new Error('Private network addresses are not supported.');
  return u;
}
async function safeFetch(raw,depth=0,extraHeaders={}){
  if(depth>3)throw new Error('Too many redirects.');
  const u=await validate(raw),r=await fetch(u,{redirect:'manual',headers:{'User-Agent':'DecorAreasStudio/3.0 (+https://studio.decorareas.com)',...extraHeaders},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get('location');if(!loc)throw new Error('Redirect had no location.');const next=new URL(loc,u);const headers=next.origin===u.origin?extraHeaders:{};return safeFetch(next.toString(),depth+1,headers)}
  if(!r.ok)throw new Error('Could not fetch this page (HTTP '+r.status+').');
  const len=Number(r.headers.get('content-length')||0);if(len>3000000)throw new Error('Page is too large to import.');
  return {response:r,url:u.toString()};
}
function decode(s=''){return String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#8217;/g,"'").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function meta(html,key){
  const tags=html.match(/<meta\s+[^>]*>/gi)||[];
  for(const tag of tags){const prop=(tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)||[])[1];if(String(prop||'').toLowerCase()!==key.toLowerCase())continue;return decode((tag.match(/content\s*=\s*["']([^"']*)["']/i)||[])[1]||'')}
  return '';
}
function titleOf(html){return meta(html,'og:title')||decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')}
function imageFromPost(p){return p?._embedded?.['wp:featuredmedia']?.[0]?.source_url||p?.jetpack_featured_media_url||''}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query.action||'article');
  try{
    if(action==='image'){
      const raw=String(req.query.url||'').trim();if(!raw)return res.status(400).json({error:'Image URL is required.'});
      const {response}=await safeFetch(raw),type=String(response.headers.get('content-type')||'');
      if(!/^image\/(jpeg|png|webp)$/i.test(type.split(';')[0]))return res.status(400).json({error:'Only JPG, PNG and WebP article images are supported.'});
      const buf=Buffer.from(await response.arrayBuffer());if(buf.length>5*1024*1024)return res.status(413).json({error:'Article image is larger than 5 MB.'});
      return res.status(200).json({ok:true,content_type:type.split(';')[0],data:buf.toString('base64')});
    }
    if(action==='wordpress'){
      const body=req.method==='POST'?(req.body||{}):req.query,raw=String(body.site||'').trim();if(!raw)return res.status(400).json({error:'Enter your WordPress site URL.'});
      const root=await validate(raw.startsWith('http')?raw:'https://'+raw),limit=Math.min(50,Math.max(1,Number(body.limit)||24)),mode=String(body.mode||'public'),authenticated=mode==='authenticated';
      let headers={},username='',appPassword='';
      if(authenticated){
        username=String(body.username||'').trim().slice(0,160);appPassword=String(body.app_password||'').trim().slice(0,300);
        if(!username||!appPassword)return res.status(400).json({error:'Enter the WordPress username and an Application Password.'});
        headers.Authorization='Basic '+Buffer.from(username+':'+appPassword).toString('base64')
      }
      const statuses=authenticated?['publish','draft','private','pending','future']:['publish'],all=[];
      for(const status of statuses){
        const endpoint=new URL('/wp-json/wp/v2/posts',root);endpoint.searchParams.set('per_page',String(limit));endpoint.searchParams.set('_embed','1');endpoint.searchParams.set('status',status);if(authenticated)endpoint.searchParams.set('context','edit');
        try{
          const {response}=await safeFetch(endpoint.toString(),0,headers);
          if(response.status===401||response.status===403)throw new Error('WordPress rejected the username or Application Password.');
          const posts=await response.json();if(Array.isArray(posts))for(const p of posts)if(!all.some(x=>String(x.id)===String(p.id)))all.push(p)
        }catch(e){if(status==='publish'||/rejected/i.test(String(e.message)))throw e}
        if(all.length>=limit)break
      }
      const posts=all.slice(0,limit).map(p=>({id:p.id,title:decode(p.title?.rendered||p.title?.raw||''),excerpt:decode(p.excerpt?.rendered||p.excerpt?.raw||''),url:p.link,image:imageFromPost(p),date:p.date||null,status:p.status||'publish'})).filter(p=>p.url);
      return res.status(200).json({ok:true,site:root.origin,mode:authenticated?'authenticated':'public',posts});
    }
    const raw=String(req.query.url||'').trim();if(!raw)return res.status(400).json({error:'Paste a public article URL.'});
    const {response,url}=await safeFetch(raw),type=String(response.headers.get('content-type')||'');if(!type.includes('text/html'))return res.status(400).json({error:'This URL is not an HTML article page.'});
    const html=(await response.text()).slice(0,3000000),canonical=(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)||[])[1]||url;
    let image=meta(html,'og:image')||meta(html,'twitter:image');if(image){try{image=new URL(image,url).toString()}catch{image=''}}
    return res.status(200).json({ok:true,article:{title:titleOf(html).slice(0,140),description:(meta(html,'og:description')||meta(html,'description')||meta(html,'twitter:description')).slice(0,700),image,url:canonical}});
  }catch(e){return res.status(400).json({error:String(e.message||e)})}
}
