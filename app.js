const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const state={fileData:null,fileType:null,remoteImage:null,user:null,dbConfigured:false,productionConnected:false,sandboxConnected:false,workspacePinterestConnected:false,boards:[],boardsLoaded:false,schedule:[],article:null,billing:null,analytics:null,pins:[],pinsLoaded:false,designerImage:null,designerData:null};
const pageMeta={
  dashboard:['Dashboard','Content operations at a glance'],analytics:['Analytics','Authorized organic performance'],create:['Create Pin','Publish now or schedule'],scheduler:['Scheduler','Approved future publishing'],blog:['Blog → Pin','Turn your article into a reviewed Pin'],library:['Pin Library','Authorized account content'],boards:['Boards','Organize content'],integrations:['Integrations','Connections and safeguards'],plans:['Plans','Subscriptions and queue capacity'],settings:['Settings','Account, authorization and data controls']
};
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function compact(v){const n=Number(v||0);return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(n>=1e5?0:1)+'K':String(Math.round(n))}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2600)}
async function api(url,opt){const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{};if(!r.ok){const e=new Error(d.error||('HTTP '+r.status));e.status=r.status;e.data=d;throw e}return d}
function post(url,body){return api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})})}
function show(name){
  $$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$$('.page').forEach(p=>p.classList.remove('active'));
  const p=$('#page-'+name);if(!p)return;p.classList.add('active');$('#pageTitle').textContent=pageMeta[name]?.[0]||name;$('#pageSub').textContent=pageMeta[name]?.[1]||'';
  if(name==='analytics'){loadAnalytics(false);loadPins(false)} if(name==='create')loadBoards(false); if(name==='scheduler')loadSchedule(); if(name==='library')loadPins(false); if(name==='boards')loadBoards(false); if(name==='integrations')loadIntegrations(); if(name==='plans')loadBilling(); if(name==='settings')refreshSettings();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('.nav,.jump').forEach(b=>b.addEventListener('click',()=>show(b.dataset.page)));
$('#accountAction').onclick=()=>show('settings');

async function loadUser(){
  try{
    const d=await api('/api/auth/user?action=me');state.dbConfigured=!!d.configured;state.user=d.user||null;
  }catch{state.dbConfigured=false;state.user=null}
  $('#accountAction').textContent=state.user?state.user.email:'Sign in';
  $('#authForms').classList.toggle('hidden',!!state.user);$('#signedInPanel').classList.toggle('hidden',!state.user);
  $('#accountStatus').textContent=state.user?'Signed in':state.dbConfigured?'Signed out':'Database not connected';$('#accountStatus').className='status-chip '+(state.user?'good':state.dbConfigured?'':'warn');
  if(state.user){$('#signedInEmail').textContent=state.user.email;$('#signedInPlan').textContent=state.user.plan||'free'}
  $('#dbIntegration').textContent=state.dbConfigured?'Connected':'Not connected';$('#dbIntegration').className='status-chip '+(state.dbConfigured?'good':'warn');
  $('#schedulerIntegration').textContent=state.dbConfigured?'Backend ready':'Requires database';$('#schedulerIntegration').className='status-chip '+(state.dbConfigured?'good':'warn');
  $('#checkScheduler').className='check '+(state.dbConfigured?'good':'');$('#checkSchedulerText').textContent=state.dbConfigured?'Database ready':'Database not connected';
  return state.user;
}
let authMode='login';
$('.auth-tab').forEach(b=>b.onclick=()=>{authMode=b.dataset.auth;$('.auth-tab').forEach(x=>x.classList.toggle('active',x===b));$('#authSubmit').textContent=authMode==='signup'?'Create account':'Sign in';$('#authPassword').autocomplete=authMode==='signup'?'new-password':'current-password';$('#authTerms').classList.toggle('hidden',authMode!=='signup')});
$('#authSubmit').onclick=async()=>{
  const n=$('#authNotice');n.className='notice subtle';n.textContent='Working…';
  try{
    if(authMode==='signup'&&!$('#acceptTerms').checked)throw new Error('Agree to the Terms and Privacy Policy to create an account.');
    const d=await post('/api/auth/user?action='+authMode,{email:$('#authEmail').value,password:$('#authPassword').value});
    state.user=d.user;n.className='notice success';n.textContent=authMode==='signup'?'Account created. Reconnect Pinterest once so scheduling can run securely in the background.':'Signed in.';
    await loadUser();await loadStatus();await loadBilling();toast(authMode==='signup'?'Account created':'Signed in');
  }catch(e){n.className='notice error';n.textContent=e.message}
};
$('#logout').onclick=async()=>{try{await post('/api/auth/user?action=logout',{});await loadUser();toast('Signed out')}catch(e){toast(e.message)}};
$('#deleteAccount').onclick=async()=>{
  if(!state.user){toast('Sign in first');return} if(!confirm('Delete this workspace account and its stored scheduler data? This cannot be undone.'))return;
  try{await api('/api/auth/user?action=delete',{method:'DELETE'});state.user=null;await loadUser();toast('Workspace account deleted')}catch(e){toast(e.message)}
};

async function loadStatus(){
  try{
    const s=await api('/api/pinterest?action=status');state.productionConnected=!!s.productionConnected;state.workspacePinterestConnected=!!s.workspacePinterestConnected;state.sandboxConnected=!!s.sandboxConnected;
    $('#connectionDot').classList.toggle('on',state.productionConnected);$('#connectionText').textContent=state.productionConnected?'Connected':'Not connected';
    $('#pinterestIntegration').textContent=state.productionConnected?'Connected':'Not connected';$('#pinterestIntegration').className='status-chip '+(state.productionConnected?'good':'warn');
    $('#sandboxIntegration').textContent=state.sandboxConnected?'Connected':'Optional';$('#sandboxIntegration').className='status-chip '+(state.sandboxConnected?'good':'');
    $('#pinterestSetting').textContent=state.productionConnected?'Connected':'Not connected';$('#pinterestSetting').className='status-chip '+(state.productionConnected?'good':'warn');
    $('#checkOAuth').className='check '+(state.productionConnected?'good':'');$('#checkOAuthText').textContent=state.productionConnected?'Connected':'Awaiting OAuth';
    const banner=$('#createNotice');banner.querySelector('.dot').classList.toggle('on',state.productionConnected);banner.querySelector('strong').textContent=state.productionConnected?'Pinterest connected':'Pinterest not connected';banner.querySelector('small').textContent=state.productionConnected?'Production publishing is available.':'Connect Pinterest to load Boards and publish.';
    if(!state.productionConnected){$('#board').innerHTML='<option value="">Connect Pinterest first…</option>';$('#publish').disabled=true;$('#schedulePin').disabled=true}
  }catch(e){$('#connectionText').textContent='Connection error'}
}
async function loadAccount(){
  if(!state.productionConnected)return;
  try{const d=await api('/api/pinterest?action=account');if(d.account?.username)$('#connectionText').textContent='@'+d.account.username}catch{}
}
async function loadBoards(force=false){
  if(!state.productionConnected)return;
  if(state.boardsLoaded&&!force){renderBoards();return}
  try{const d=await api('/api/pinterest?action=boards');state.boards=d.boards||[];state.boardsLoaded=true;renderBoards();const n=$('#boardNotice');if(n){n.className='notice success';n.textContent='Boards loaded from the authorized Pinterest account.'}}
  catch(e){const n=$('#boardNotice');if(n){n.className='notice error';n.textContent=e.message}if($('#board'))$('#board').innerHTML='<option value="">Could not load Boards</option>'}
}
function renderBoards(){
  if($('#board')){$('#board').innerHTML=state.boards.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name||b.id)+'</option>').join('')||'<option value="">No Boards returned</option>';$('#publish').disabled=!state.boards.length;$('#schedulePin').disabled=!state.boards.length}
  if($('#boardCount'))$('#boardCount').textContent=String(state.boards.length);
  if($('#boardList'))$('#boardList').innerHTML=state.boards.map(b=>'<div class="board-item"><div><strong>'+esc(b.name||'Untitled Board')+'</strong><small>'+esc(b.id||'')+'</small></div><span class="status-chip">Board</span></div>').join('')||'<div class="empty-state">No Boards returned.</div>';
}
$('#refreshBoards').onclick=()=>{state.boardsLoaded=false;loadBoards(true)};
$('#createBoard').onclick=async()=>{const name=$('#newBoardName').value.trim(),description=$('#newBoardDescription').value.trim(),n=$('#boardNotice');if(!name){n.className='notice error';n.textContent='Enter a Board name.';return}if(!confirm('Create this user-selected Board on the connected Pinterest account?'))return;n.className='notice';n.textContent='Creating Board…';try{const d=await post('/api/pinterest?action=create-board',{name,description});n.className='notice success';n.textContent='Board created: '+(d.board?.name||name);$('#newBoardName').value='';$('#newBoardDescription').value='';state.boardsLoaded=false;await loadBoards(true)}catch(e){n.className='notice error';n.textContent=e.message}};

function metricFrom(m,key){return Number(m?.[key]||0)}
function normalizeSeries(series){
  return (series||[]).map(x=>({date:x.date||x.DATE||'',value:Number(x.metrics?.IMPRESSION??x.IMPRESSION??x.impression??0)})).filter(x=>x.date);
}
function drawLine(canvas,series,empty){
  const pts=normalizeSeries(series);const wrap=empty; if(!canvas)return;
  if(!pts.length){wrap?.classList.remove('hidden');const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);return}
  wrap?.classList.add('hidden');const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(300,rect.width*dpr);canvas.height=Math.max(180,rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const w=rect.width,h=rect.height,pad={l:18,r:14,t:18,b:26},max=Math.max(...pts.map(p=>p.value),1),min=0;
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='#ececf2';ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
  const xy=pts.map((p,i)=>({x:pad.l+(w-pad.l-pad.r)*(pts.length===1?.5:i/(pts.length-1)),y:h-pad.b-(h-pad.t-pad.b)*(p.value-min)/(max-min||1)}));
  const g=ctx.createLinearGradient(0,pad.t,0,h-pad.b);g.addColorStop(0,'rgba(111,73,219,.22)');g.addColorStop(1,'rgba(111,73,219,0)');
  ctx.beginPath();ctx.moveTo(xy[0].x,h-pad.b);xy.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.lineTo(xy[xy.length-1].x,h-pad.b);ctx.closePath();ctx.fillStyle=g;ctx.fill();
  ctx.beginPath();xy.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#6d45d8';ctx.lineWidth=2.2;ctx.stroke();
  ctx.fillStyle='#6d45d8';xy.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle='#969aa7';ctx.font='9px system-ui';ctx.textAlign='center';const labels=[0,Math.floor((pts.length-1)/2),pts.length-1];labels.forEach(i=>{ctx.fillText(String(pts[i].date).slice(5),xy[i].x,h-8)});
}
async function loadAnalytics(force=false){
  if(state.analytics&&!force){renderAnalytics(state.analytics);return true}
  const n=$('#analyticsNotice');n.className='notice';n.textContent='Loading authorized analytics…';
  try{const d=await api('/api/pinterest?action=analytics');state.analytics=d;renderAnalytics(d);n.className='notice success';n.textContent='Live organic analytics loaded for the authorized Pinterest account.';$('#checkAnalytics').className='check good';$('#checkAnalyticsText').textContent='Authorized metrics working';return true}
  catch(e){n.className='notice';n.textContent='Connect Pinterest to load authorized organic analytics.';$('#checkAnalytics').className='check';$('#checkAnalyticsText').textContent='Awaiting connection';return false}
}
function drawBars(canvas,pins,empty){
  if(!canvas)return;const rows=(pins||[]).slice(0,8).map((p,i)=>({label:'Pin '+(i+1),value:Number(p.metrics?.IMPRESSION||0)}));if(!rows.length||!rows.some(x=>x.value)){empty?.classList.remove('hidden');return}
  empty?.classList.add('hidden');const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(300,rect.width*dpr);canvas.height=Math.max(180,rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=rect.width,h=rect.height,pad=26,max=Math.max(...rows.map(x=>x.value),1),gap=8,bw=(w-pad*2-gap*(rows.length-1))/rows.length;ctx.clearRect(0,0,w,h);ctx.fillStyle='#eeeafc';rows.forEach((x,i)=>{const bh=(h-50)*(x.value/max),left=pad+i*(bw+gap),top=h-24-bh;ctx.fillRect(left,top,bw,bh);ctx.fillStyle='#6d45d8';ctx.fillRect(left,top,bw,Math.min(bh,4));ctx.fillStyle='#8e93a0';ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillText(x.label,left+bw/2,h-8);ctx.fillStyle='#eeeafc'});}
function renderPerformance(canvas,d,empty){const pts=normalizeSeries(d.series);if(pts.length)drawLine(canvas,d.series,empty);else drawBars(canvas,d.topPins,empty)}
function renderAnalytics(d){
  const m=d.summary||{};const vals={imp:metricFrom(m,'IMPRESSION'),save:metricFrom(m,'SAVE'),click:metricFrom(m,'PIN_CLICK'),out:metricFrom(m,'OUTBOUND_CLICK')};
  $('#metricImpressions').textContent=$('#dashImpressions').textContent=compact(vals.imp);$('#metricSaves').textContent=$('#dashSaves').textContent=compact(vals.save);$('#metricClicks').textContent=compact(vals.click);$('#metricOutbound').textContent=$('#dashOutbound').textContent=compact(vals.out);$('#heroImpressions').textContent=compact(vals.imp);
  $('#topPins').innerHTML=(d.topPins||[]).map(p=>'<tr><td>'+esc(p.pin_id||'—')+'</td><td>'+compact(p.metrics?.IMPRESSION)+'</td><td>'+compact(p.metrics?.SAVE)+'</td><td>'+compact(p.metrics?.PIN_CLICK)+'</td><td>'+compact(p.metrics?.OUTBOUND_CLICK)+'</td></tr>').join('')||'<tr><td colspan="5">Pinterest returned no Top Pins for this date range.</td></tr>';
  renderPerformance($('#trendChart'),d,$('#trendEmpty'));renderPerformance($('#analyticsChart'),d,$('#analyticsTrendEmpty'));
}
$('#refreshAnalytics').onclick=()=>loadAnalytics(true);$('#refreshDashboard').onclick=async()=>{state.analytics=null;await loadAnalytics(true);await loadSchedule()};

function pinImage(p){const imgs=p?.media?.images||p?.media_source?.images||{};const first=Object.values(imgs).find(v=>v&&v.url);return p?.image?.url||first?.url||p?.media?.images?.originals?.url||''}
async function loadPins(force=false){
  if(!state.productionConnected)return;if(state.pinsLoaded&&!force){renderPins();return}
  const n=$('#libraryNotice');if(n){n.className='notice';n.textContent='Loading Pins from Pinterest…'}
  try{const d=await api('/api/pinterest?action=pins');state.pins=d.pins||[];state.pinsLoaded=true;renderPins();if(n){n.className='notice success';n.textContent='Loaded '+state.pins.length+' Pins directly from Pinterest.'}}
  catch(e){if(n){n.className='notice error';n.textContent=e.message}}
}
function renderPins(){
  if($('#pinGallery'))$('#pinGallery').innerHTML=state.pins.slice(0,9).map(p=>'<div class="pin-tile" style="'+(pinImage(p)?'background-image:url(&quot;'+esc(pinImage(p))+'&quot;)':'')+'"><span>'+esc(String(p.title||p.id||'Pin').slice(0,28))+'</span></div>').join('')||'<div class="empty-state">No recent Pins returned.</div>';
  if($('#pinGrid'))$('#pinGrid').innerHTML=state.pins.map(p=>{const img=pinImage(p);return '<article class="pin-card"><div class="pin-thumb" '+(img?'style="background-image:url(&quot;'+esc(img)+'&quot;)"':'')+'>'+(!img?'Pinterest Pin':'')+'</div><h3>'+esc(p.title||'Untitled Pin')+'</h3><p>'+esc((p.description||'').slice(0,150))+'</p><div class="pin-meta"><span>'+esc(p.id||'')+'</span><span>'+esc(p.created_at?new Date(p.created_at).toLocaleDateString():'')+'</span></div><div class="pin-actions"><a class="mini" href="https://www.pinterest.com/pin/'+encodeURIComponent(String(p.id||''))+'/" target="_blank" rel="noopener">View</a>'+(p.link?'<a class="mini" href="'+esc(p.link)+'" target="_blank" rel="noopener">Destination</a>':'')+'<button class="mini danger delete-pin" data-id="'+esc(p.id)+'">Delete</button></div></article>'}).join('')||'<div class="empty-state">Pinterest returned no Pins.</div>';
  $('.delete-pin').forEach(b=>b.onclick=()=>deletePin(b.dataset.id));
}
async function deletePin(id){if(!id||!confirm('Delete this specific Pin from Pinterest? This cannot be undone in Decor Areas Studio.'))return;try{await post('/api/pinterest?action=delete-pin',{pin_id:id});state.pinsLoaded=false;await loadPins(true);toast('Pin deleted')}catch(e){toast(e.message)}}
$('#refreshPins').onclick=()=>{state.pinsLoaded=false;loadPins(true)};

$('#title').oninput=()=>{$('#previewTitle').textContent=$('#title').value||'Your Pin title';$('#titleCount').textContent=$('#title').value.length+' / 100'};
$('#description').oninput=()=>$('#previewDescription').textContent=$('#description').value||'Your description will appear here.';
$('#destination').oninput=()=>{try{$('#previewDomain').textContent=new URL($('#destination').value).hostname}catch{$('#previewDomain').textContent='your-site.com'}};
$('#imageFile').onchange=()=>{
  const f=$('#imageFile').files[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)){toast('Use JPG, PNG or WebP');return}if(f.size>2*1024*1024){toast('Use an image under 2 MB so it can be published or scheduled reliably');return}
  const r=new FileReader();r.onload=()=>{const data=String(r.result),i=data.indexOf(',');state.fileData=data.slice(i+1);state.fileType=f.type;state.remoteImage=null;$('#preview').style.backgroundImage='url("'+data+'")';$('#preview').textContent=''};r.readAsDataURL(f)
};

function designerCtx(){return $('#designerCanvas').getContext('2d')}
function drawWrapped(ctx,text,x,y,maxWidth,lineHeight,maxLines=5){const words=String(text||'Your Pin headline').split(/\s+/);let line='',lines=[];for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;if(lines.length>=maxLines-1)break}else line=test}if(line&&lines.length<maxLines)lines.push(line);lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));return lines.length}
function renderDesigner(){const c=$('#designerCanvas'),ctx=designerCtx(),style=$('#designerStyle').value,headline=$('#designerHeadline').value.trim()||'Your Pin headline',brand=$('#designerBrand').value.trim()||'yourdomain.com';ctx.clearRect(0,0,c.width,c.height);if(state.designerImage){const img=state.designerImage,scale=Math.max(c.width/img.width,c.height/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h)}else{const g=ctx.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,'#ece9ff');g.addColorStop(1,'#d6d9e3');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height)}if(style==='editorial'){const g=ctx.createLinearGradient(0,c.height*.38,0,c.height);g.addColorStop(0,'rgba(12,12,16,0)');g.addColorStop(1,'rgba(12,12,16,.86)');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.font='700 66px Georgia';ctx.textAlign='left';drawWrapped(ctx,headline,58,820,680,74,4);ctx.font='700 22px Arial';ctx.fillText(brand.toUpperCase(),60,1110)}else if(style==='clean'){ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(44,735,712,350);ctx.fillStyle='#17171d';ctx.font='700 58px Arial';ctx.textAlign='left';drawWrapped(ctx,headline,78,825,640,66,4);ctx.font='700 21px Arial';ctx.fillStyle='#6255b8';ctx.fillText(brand.toUpperCase(),80,1040)}else{ctx.fillStyle='rgba(38,24,83,.78)';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.font='800 72px Arial';ctx.textAlign='center';drawWrapped(ctx,headline,400,470,650,84,5);ctx.font='700 24px Arial';ctx.fillText(brand.toUpperCase(),400,1060)}state.designerData=c.toDataURL('image/jpeg',.88)}
$('#designerImage').onchange=()=>{const f=$('#designerImage').files[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)){toast('Use JPG, PNG or WebP');return}const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{state.designerImage=img;renderDesigner()};img.src=String(r.result)};r.readAsDataURL(f)};
$('#designerHeadline').oninput=renderDesigner;$('#designerBrand').oninput=renderDesigner;$('#designerStyle').onchange=renderDesigner;$('#renderDesign').onclick=renderDesigner;
$('#useDesign').onclick=()=>{renderDesigner();const data=state.designerData,i=data.indexOf(',');state.fileData=data.slice(i+1);state.fileType='image/jpeg';state.remoteImage=null;$('#preview').style.backgroundImage='url("'+data+'")';$('#preview').textContent='';if(!$('#title').value.trim()){$('#title').value=$('#designerHeadline').value.trim().slice(0,100);$('#previewTitle').textContent=$('#title').value||'Your Pin title';$('#titleCount').textContent=$('#title').value.length+' / 100'}toast('Designer image loaded into the Pin creator')};
renderDesigner();

function formPayload(){
  const board=state.boards.find(b=>String(b.id)===$('#board').value);
  return {board_id:$('#board').value,board_name:board?.name||'',title:$('#title').value.trim(),description:$('#description').value.trim(),destination:$('#destination').value.trim(),alt_text:$('#altText').value.trim(),image_base64:state.fileData,image_data:state.fileData,image_url:state.remoteImage,content_type:state.fileType||'image/jpeg'};
}
function validatePin(p){if(!state.productionConnected)return 'Connect Pinterest first.';if(!p.board_id)return 'Choose a Board.';if(!p.title)return 'Enter a title.';if(!p.image_base64&&!p.image_url)return 'Choose or import an image.';return ''}
$('#publish').onclick=async()=>{
  const p=formPayload(),err=validatePin(p),n=$('#publishNotice');if(err){n.className='notice error';n.textContent=err;return}
  if(!confirm('Publish this one user-selected Pin to the connected Pinterest account now?'))return;
  n.className='notice';n.textContent='Publishing…';$('#publish').disabled=true;
  try{const d=await post('/api/pinterest?action=create',{sandbox:false,board_id:p.board_id,title:p.title,description:p.description,destination:p.destination,alt_text:p.alt_text,image_base64:p.image_base64,image_url:p.image_url,content_type:p.content_type});n.className='notice success';n.textContent='Published successfully. Pinterest Pin ID: '+d.pin.id;toast('Pin published')}
  catch(e){n.className='notice error';n.textContent=e.message}finally{$('#publish').disabled=!state.boards.length}
};
function setDefaultSchedule(){
  const d=new Date(Date.now()+60*60000);d.setMinutes(d.getMinutes()<30?30:0,0,0);if(d.getMinutes()===0&&d.getTime()<Date.now()+30*60000)d.setHours(d.getHours()+1);
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);$('#scheduleAt').value=local;
}
$('#schedulePin').onclick=async()=>{
  const p=formPayload(),err=validatePin(p),n=$('#publishNotice');if(err){n.className='notice error';n.textContent=err;return}
  if(!state.user){show('settings');toast('Create an account or sign in to schedule');return}
  if(!$('#approveSchedule').checked){n.className='notice error';n.textContent='Review this exact Pin and check the approval box before scheduling.';return}
  const when=new Date($('#scheduleAt').value);if(Number.isNaN(when.getTime())){n.className='notice error';n.textContent='Choose a future date and time.';return}
  if(!confirm('Schedule this exact reviewed Pin for '+when.toLocaleString()+'?'))return;
  n.className='notice';n.textContent='Adding the approved Pin to your queue…';$('#schedulePin').disabled=true;
  try{await post('/api/schedule',{board_id:p.board_id,board_name:p.board_name,title:p.title,description:p.description,destination:p.destination,alt_text:p.alt_text,image_data:p.image_data,image_url:p.image_url,content_type:p.content_type,scheduled_at:when.toISOString(),approved:true});n.className='notice success';n.textContent='Scheduled successfully. The 30-minute minimum gap is enforced automatically.';$('#approveSchedule').checked=false;await loadSchedule();toast('Pin scheduled')}
  catch(e){n.className='notice error';n.textContent=e.message}finally{$('#schedulePin').disabled=!state.boards.length}
};

async function loadSchedule(){
  $('#timezoneLabel').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local';
  try{
    const d=await api('/api/schedule');state.schedule=d.items||[];const active=state.schedule.filter(x=>x.status==='scheduled');
    $('#queueCount').textContent=$('#dashQueue').textContent=$('#heroScheduled').textContent=String(active.length);$('#queueLimit').textContent=active.length+' / '+d.limit;
    $('#schedulerNotice').className='notice success';$('#schedulerNotice').textContent='Persistent scheduler ready. Every queued Pin was individually approved, and a 30-minute minimum gap is enforced.';
    renderSchedule(state.schedule);renderDashboardQueue(active);
    return true;
  }catch(e){
    state.schedule=[];$('#queueCount').textContent=$('#dashQueue').textContent=$('#heroScheduled').textContent='0';$('#queueLimit').textContent='—';
    $('#schedulerNotice').className='notice';$('#schedulerNotice').textContent=e.status===401?'Create an account or sign in to use the persistent scheduler.':e.message;
    $('#scheduleList').innerHTML='<div class="empty-state">'+esc($('#schedulerNotice').textContent)+'</div>';renderDashboardQueue([]);return false;
  }
}
function renderDashboardQueue(items){
  const upcoming=items.slice().sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)).slice(0,4);
  $('#dashboardQueue').innerHTML=upcoming.map(x=>'<div class="queue-item"><div class="queue-thumb" '+(x.image_url?'style="background-image:url(&quot;'+esc(x.image_url)+'&quot;)"':'')+'></div><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.board_name||'Pinterest Board')+'</small></div><div class="queue-time">'+new Date(x.scheduled_at).toLocaleDateString([], {month:'short',day:'numeric'})+'<br>'+new Date(x.scheduled_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'</div></div>').join('')||'<div class="empty-state">No Pins scheduled yet.</div>';
}
function renderSchedule(items){
  const sorted=items.slice().sort((a,b)=>new Date(b.scheduled_at)-new Date(a.scheduled_at));
  $('#scheduleList').innerHTML=sorted.map(x=>{const d=new Date(x.scheduled_at);return '<div class="timeline-item"><div class="timeline-time">'+d.toLocaleDateString([], {month:'short',day:'numeric'})+'<br>'+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'</div><div class="timeline-line"></div><div class="timeline-card"><div class="thumb" '+(x.image_url?'style="background-image:url(&quot;'+esc(x.image_url)+'&quot;)"':'')+'></div><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.board_name||'Board')+(x.last_error?' · '+esc(x.last_error):'')+'</small></div><span class="status-mini '+esc(x.status)+'">'+esc(x.status)+'</span></div><div class="timeline-actions">'+(['scheduled','failed'].includes(x.status)?'<button class="secondary reschedule-pin" data-id="'+esc(x.id)+'">Move</button><button class="secondary cancel-pin" data-id="'+esc(x.id)+'">Cancel</button>':'')+'</div></div>'}).join('')||'<div class="empty-state">No scheduled Pins yet.</div>';
  $('.cancel-pin').forEach(b=>b.onclick=async()=>{if(!confirm('Cancel this scheduled Pin?'))return;try{await api('/api/schedule?id='+encodeURIComponent(b.dataset.id),{method:'DELETE'});await loadSchedule();toast('Scheduled Pin cancelled')}catch(e){toast(e.message)}});$('.reschedule-pin').forEach(b=>b.onclick=async()=>{const current=state.schedule.find(x=>x.id===b.dataset.id),seed=current?new Date(new Date(current.scheduled_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';const value=prompt('New local date/time (YYYY-MM-DDTHH:MM)',seed);if(!value)return;const when=new Date(value);if(Number.isNaN(when.getTime())){toast('Invalid date/time');return}try{await api('/api/schedule',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.id,scheduled_at:when.toISOString()})});await loadSchedule();toast('Scheduled time updated')}catch(e){toast(e.message)}})
}
$('#refreshSchedule').onclick=loadSchedule;

$('#importArticle').onclick=async()=>{
  const n=$('#importNotice'),url=$('#articleUrl').value.trim();if(!url){n.className='notice error';n.textContent='Paste a public article URL.';return}if(!$('#articleAuthorized').checked){n.className='notice error';n.textContent='Confirm that you own or are authorized to use this article.';return}
  n.className='notice';n.textContent='Importing public article metadata…';
  try{const d=await api('/api/blog?authorized=true&url='+encodeURIComponent(url));state.article=d.article;n.className='notice success';n.textContent='Article imported. Review the result before using it.';
    const a=d.article;$('#articleResult').innerHTML='<div class="article-card"><div class="article-image" '+(a.image?'style="background-image:url(&quot;'+esc(a.image)+'&quot;)"':'')+'></div><div class="article-copy"><span class="kicker">IMPORTED</span><h3>'+esc(a.title||'Untitled article')+'</h3><p>'+esc(a.description||'No description was found. Add your own in the creator.')+'</p><small>'+esc(a.url)+'</small><br><button class="primary" id="useArticle">Use in Pin creator</button></div></div>';
    $('#useArticle').onclick=useArticle;
  }catch(e){n.className='notice error';n.textContent=e.message}
};
function useArticle(){
  const a=state.article;if(!a)return;$('#title').value=a.title||'';$('#description').value=a.description||'';$('#destination').value=a.url||'';state.remoteImage=a.image||null;state.fileData=null;state.fileType='image/jpeg';
  if(a.image){$('#preview').style.backgroundImage='url("'+a.image.replace(/"/g,'%22')+'")';$('#preview').textContent=''}$('#previewTitle').textContent=a.title||'Your Pin title';$('#previewDescription').textContent=a.description||'';try{$('#previewDomain').textContent=new URL(a.url).hostname}catch{}$('#titleCount').textContent=($('#title').value.length)+' / 100';show('create');toast('Article loaded into creator');
}

async function loadBilling(){
  try{
    const d=await api('/api/billing');state.billing=d;$('#billingIntegration').textContent=d.stripeConfigured?'Connected':'Not connected';$('#billingIntegration').className='status-chip '+(d.stripeConfigured?'good':'warn');
    const plan=d.user?.plan||state.user?.plan||'free';renderPrices(d.prices||{});$('.checkout').forEach(b=>{b.disabled=!d.stripeConfigured||!state.user;b.textContent=b.dataset.plan===plan?'Current plan':'Choose '+b.dataset.plan[0].toUpperCase()+b.dataset.plan.slice(1)});
    $('#billingNotice').className='notice subtle';$('#billingNotice').textContent=!state.user?'Sign in to purchase a plan.':!d.stripeConfigured?'Billing code is ready; connect Stripe configuration to activate checkout.':'Billing is connected. Choose a plan to continue to secure checkout.';
    return d;
  }catch(e){$('#billingIntegration').textContent='Unavailable';return null}
}
function formatPlanPrice(p){if(!p||p.amount==null)return 'Set in Stripe';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:String(p.currency||'usd').toUpperCase(),maximumFractionDigits:2}).format(p.amount/100)+(p.interval?'<small>/'+esc(p.interval)+'</small>':'')}catch{return (p.amount/100).toFixed(2)}}function renderPrices(prices){if($('#priceStarter'))$('#priceStarter').innerHTML=formatPlanPrice(prices.starter);if($('#pricePro'))$('#pricePro').innerHTML=formatPlanPrice(prices.pro);if($('#priceAgency'))$('#priceAgency').innerHTML=formatPlanPrice(prices.agency)}
$('.checkout').forEach(b=>b.onclick=async()=>{if(!state.user){show('settings');toast('Sign in first');return}try{const d=await post('/api/billing?action=checkout',{plan:b.dataset.plan});location.href=d.url}catch(e){$('#billingNotice').className='notice error';$('#billingNotice').textContent=e.message}});
$('#manageBilling').onclick=async()=>{if(!state.user){show('settings');return}try{const d=await post('/api/billing?action=portal',{});location.href=d.url}catch(e){toast(e.message)}};

async function loadIntegrations(){await Promise.all([loadUser(),loadStatus(),loadBilling()])}
async function refreshSettings(){await loadUser();await loadStatus();await loadAnalytics(false)}
$('#disconnectPinterest').onclick=async()=>{if(!confirm('Disconnect Pinterest credentials stored in this browser?'))return;try{await post('/api/pinterest?action=disconnect',{});await loadStatus();toast('Browser Pinterest connection cleared')}catch(e){toast(e.message)}};$('#disconnectWorkspacePinterest').onclick=async()=>{if(!state.user){toast('Sign in first');return}if(!confirm('Disconnect Pinterest from this workspace and remove its stored OAuth record? Scheduled Pins will no longer publish until you reconnect.'))return;try{await post('/api/pinterest?action=disconnect-workspace',{});state.boardsLoaded=false;state.pinsLoaded=false;await loadStatus();toast('Pinterest disconnected from workspace')}catch(e){toast(e.message)}};

async function syncCheckout(){
  const q=new URLSearchParams(location.search),session=q.get('session_id');if(q.get('checkout')==='success'&&session){
    try{const d=await post('/api/billing?action=sync',{session_id:session});toast('Plan activated: '+d.plan);history.replaceState({},'',location.pathname);await loadUser();await loadBilling();show('plans')}catch(e){toast(e.message)}
  }
}
async function init(){
  setDefaultSchedule();await loadUser();await loadStatus();await loadAccount();await Promise.all([state.productionConnected?loadAnalytics(false):Promise.resolve(false),loadSchedule(),loadBilling()]);await syncCheckout();
  const q=new URLSearchParams(location.search);if(q.get('oauth')){show(q.get('oauth')==='sandbox-connected'?'integrations':'create');if(state.user&&q.get('oauth')==='connected')toast('Pinterest connected for this workspace')}
}
window.addEventListener('resize',()=>{if(state.analytics){renderPerformance($('#trendChart'),state.analytics,$('#trendEmpty'));renderPerformance($('#analyticsChart'),state.analytics,$('#analyticsTrendEmpty'))}});
init();
