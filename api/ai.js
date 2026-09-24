import OpenAI from 'openai';

function clean(v,n=3000){return String(v||'').trim().slice(0,n)}
function baseInput(b){
  return {keyword:clean(b.keyword,240),article_title:clean(b.article_title,240),article_summary:clean(b.article_summary,4000),article_url:clean(b.article_url,2000),brand:clean(b.brand,160),tone:clean(b.tone,80),audience:clean(b.audience,240)};
}
function fallback(input){
  const topic=input.keyword||input.article_title||'Fresh ideas',title=(input.article_title||topic).replace(/\s+/g,' ').trim(),base=(input.article_summary||('Practical inspiration and useful ideas about '+topic+'.')).slice(0,420);
  const starts=[title,'Best '+topic+' ideas to save',topic+': practical ideas worth trying','A simple guide to '+topic,'Fresh '+topic+' inspiration'];
  return {mode:'smart-fallback',variants:starts.map((t,i)=>({title:t.slice(0,100),description:(base+(i?(' Explore '+topic+' and save the ideas that fit your needs.'):'')).slice(0,500),alt_text:('Pinterest graphic about '+topic).slice(0,500)})),boards:[
    {name:(topic+' Ideas').slice(0,100),description:('Useful ideas, inspiration and resources about '+topic+'.').slice(0,500)},
    {name:(topic+' Inspiration').slice(0,100),description:('A curated collection of '+topic+' inspiration and practical tips.').slice(0,500)}
  ],image_prompt:'Vertical editorial Pinterest graphic about '+topic+', clean composition, useful visual storytelling, no logos, no watermarks, 2:3 aspect ratio'};
}
async function textWithOpenAI(input){
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const schema={type:'object',additionalProperties:false,properties:{
    variants:{type:'array',minItems:5,maxItems:5,items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},alt_text:{type:'string'}},required:['title','description','alt_text']}},
    boards:{type:'array',minItems:2,maxItems:3,items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},description:{type:'string'}},required:['name','description']}},
    image_prompt:{type:'string'}
  },required:['variants','boards','image_prompt']};
  const prompt='Create Pinterest-ready marketing copy from ONLY the user supplied content below. Do not use or infer Pinterest API data, competitor data, platform benchmarks, engagement predictions, or claims about likely performance. Titles max 100 characters, descriptions max 500, alt text factual and accessibility-oriented. Board suggestions are proposals only and must be based on the supplied topic/article, not on Pinterest account data. Produce diverse natural language without keyword stuffing.\n\nUSER CONTENT:\n'+JSON.stringify(input);
  const r=await client.responses.create({model:process.env.OPENAI_TEXT_MODEL||'gpt-5.6-luna',input:prompt,text:{format:{type:'json_schema',name:'pin_pack',strict:true,schema}}});
  const parsed=JSON.parse(r.output_text);return {mode:'ai',...parsed};
}
async function imageWithOpenAI(prompt){
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const r=await client.images.generate({model:process.env.OPENAI_IMAGE_MODEL||'gpt-image-2',prompt:clean(prompt,3000),size:'1024x1536',quality:'medium',output_format:'jpeg'});
  const item=r.data?.[0];if(!item?.b64_json)throw new Error('Image provider returned no image.');
  return {b64:item.b64_json,content_type:'image/jpeg'};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET')return res.status(200).json({ok:true,textAI:!!process.env.OPENAI_API_KEY,imageAI:!!process.env.OPENAI_API_KEY,provider:process.env.OPENAI_API_KEY?'OpenAI':'Smart fallback'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const action=String(req.query.action||'text'),b=req.body||{};
  try{
    if(action==='image'){
      if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI image generation is ready but no OPENAI_API_KEY is configured. Template generation still works without an AI provider.'});
      return res.status(200).json({ok:true,image:await imageWithOpenAI(b.prompt)});
    }
    const input=baseInput(b),empty=!input.keyword&&!input.article_title&&!input.article_summary;if(empty)return res.status(400).json({error:'Enter a keyword or import an article first.'});
    const result=process.env.OPENAI_API_KEY?await textWithOpenAI(input):fallback(input);return res.status(200).json({ok:true,...result});
  }catch(e){return res.status(500).json({error:String(e.message||e)})}
}
