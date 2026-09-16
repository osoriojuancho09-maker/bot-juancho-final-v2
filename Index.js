require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const OpenAI = require('openai');
const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'juancho_token_123';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const BASE = fs.readFileSync('./META_BOT_INSTRUCTIONS.md','utf8');

const SYSTEM = BASE + `
CONTEXTO: Vendes en Marketplace Colombia. Proveedora Karo Tenis por WhatsApp. Si necesitas validar stock di "Estoy verificando con mi proveedora Karo Tenis" y marca [VALIDAR: modelo color talla]. Precios COP: 180k normal, 210k exclusivo y guayos (guayos sin descuento), botas min 190k. Tallas dama 36-39, caballero 40-44. Mensajes cortos, 1 pregunta por mensaje, estilo colombiano.
`;

const hist = new Map();

async function sendFB(id, text){
  const axios = require('axios');
  try{
    await axios.post(`https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_TOKEN}`, { recipient:{id}, message:{text} });
  }catch(e){ console.log('Error FB', e.response?.data || e.message); }
}

async function genResp(senderId, msgCliente, marketplaceInfo){
  const h = hist.get(senderId) || [];
  let ctx = marketplaceInfo ? `Marketplace producto: ${JSON.stringify(marketplaceInfo)}` : '';
  h.push({role:'user', content: `${ctx} Cliente: ${msgCliente}`});
  const comp = await openai.chat.completions.create({
    model: MODEL,
    messages: [{role:'system', content: SYSTEM}, ...h.slice(-10)],
    temperature: 0.6
  });
  let resp = comp.choices[0].message.content;
  let validar = null;
  const m = resp.match(/\[VALIDAR:(.*?)\]/i);
  if(m){ validar = m[1].trim(); resp = resp.replace(/\[VALIDAR:.*?\]/gi,'').trim(); }
  h.push({role:'assistant', content: resp});
  hist.set(senderId, h);
  return {resp, validar};
}

app.get('/webhook', (req,res)=>{
  if(req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===VERIFY_TOKEN){
    res.send(req.query['hub.challenge']);
  } else res.sendStatus(403);
});

app.post('/webhook', async (req,res)=>{
  if(req.body.object==='page'){
    for(const entry of req.body.entry){
      const market = entry.marketplace || null;
      for(const ev of (entry.messaging||[])){
        if(ev.message?.text){
          const sender = ev.sender.id;
          const txt = ev.message.text;
          console.log('Mensaje', sender, txt, market);
          try{
            const {resp, validar} = await genResp(sender, txt, market);
            await sendFB(sender, resp);
            if(validar){
              console.log('PENDIENTE KARO TENIS:', validar);
            }
          }catch(e){ console.error(e); await sendFB(sender, 'Dame un segundito que verifico el dato exacto contigo 🙏'); }
        }
      }
    }
    res.send('EVENT_RECEIVED');
  } else res.sendStatus(404);
});

app.get('/', (req,res)=>res.send('Bot Juancho Marketplace Activo'));

app.listen(process.env.PORT||3000, ()=>console.log('Bot corriendo'));
