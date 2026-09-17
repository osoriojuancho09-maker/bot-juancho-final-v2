require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const OpenAI = require('openai');
const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'juancho_token_123';
const ADMIN_ID = process.env.ADMIN_ID;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const BASE = fs.readFileSync('./META_BOT_INSTRUCTIONS.md','utf8');

const CATALOGO_TENIS = `
CATALOGO EXACTO DE TENIS DISPONIBLES (Usa SOLO estos nombres):
- Nike Air Max 90 Negro
- Nike Air Max 90 Blanco
- Nike Air Force 1 Blanco
- Nike Air Force 1 Negro
- Adidas Campus Beige
- Adidas Campus Negro
- Adidas Forum 84 Low Blanco
- New Balance 550 Blanco Verde
- New Balance 550 Blanco
- New Balance 530 Negro
- Puma Suede Negro
- Puma RS-X Blanco
- Vans Knu Skool Negro
- Jordan 1 Retro High Negro
- Guayos Nike Mercurial
- Botas Timberland Amarillas
`;

const SYSTEM = BASE + `
${CATALOGO_TENIS}
CONTEXTO NUEVO:
- Flujo con fotos: 1) Pide foto si no la envían. 2) Si envían foto, IDENTIFICA el modelo EXACTO del catálogo usando visión. 3) NUNCA inventes modelo.
- Cuando identifiques, responde: "¡Perfecto! Es el [MODELO EXACTO]. ¿Qué talla necesitas? (36-44)"
- Cuando cliente diga talla + ciudad + nombre/dirección, considera VENTA CERRADA y marca [VENTA_CERRADA]
`;

const hist = new Map();
async function sendFB(id, text){
  try{
    await axios.post(`https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_TOKEN}`, { recipient:{id}, message:{text} });
  }catch(e){ console.log('Error FB', e.response?.data || e.message); }
}
async function genResp(senderId, userContent, isImage){
  const h = hist.get(senderId) || [];
  const newUserMsg = isImage? { role: 'user', content: userContent } : { role: 'user', content: userContent };
  h.push(newUserMsg);
  const comp = await openai.chat.completions.create({
    model: MODEL,
    messages: [{role:'system', content: SYSTEM},...h.slice(-12)],
    temperature: 0.4, max_tokens: 300
  });
  let resp = comp.choices[0].message.content;
  const ventaCerrada = resp.includes('[VENTA_CERRADA]');
  resp = resp.replace(/\[VENTA_CERRADA\]/gi,'').trim();
  h.push({role:'assistant', content: resp});
  hist.set(senderId, h);
  return {resp, ventaCerrada, historial: h};
}
app.get('/webhook', (req,res)=>{
  if(req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===VERIFY_TOKEN){
    res.send(req.query['hub.challenge']);
  } else res.sendStatus(403);
});
app.post('/webhook', async (req,res)=>{
  if(req.body.object==='page'){
    for(const entry of req.body.entry){
      for(const ev of (entry.messaging||[])){
        const sender = ev.sender.id;
        if(ev.message?.is_echo) continue;
        if(sender === ADMIN_ID) continue;
        let userContent; let isImage = false;
        if(ev.message?.attachments?.[0]?.type === 'image'){
          const imageUrl = ev.message.attachments[0].payload.url;
          console.log('📸 Foto recibida de', sender, imageUrl);
          userContent = [
            { type: "text", text: "El cliente envió esta foto. Identifica el modelo EXACTO de mi catálogo." },
            { type: "image_url", image_url: { url: imageUrl } }
          ];
          isImage = true;
        } else if(ev.message?.text){
          userContent = ev.message.text;
        } else continue;
        try{
          const {resp, ventaCerrada, historial} = await genResp(sender, userContent, isImage);
          await sendFB(sender, resp);
          if(ventaCerrada && ADMIN_ID){
            const resumen = historial.slice(-6).map(m=> `${m.role}: ${typeof m.content === 'string'? m.content : '[FOTO]'}`).join('\n');
            await sendFB(ADMIN_ID, `🔥 ¡VENTA CERRADA JUANCHO! 🔥\nCliente: https://www.facebook.com/messages/t/${sender}\n\n${resumen}`);
          }
        }catch(e){ await sendFB(sender, 'Dame un segundito que verifico el dato exacto 🙏'); }
      }
    }
    res.send('EVENT_RECEIVED');
  } else res.sendStatus(404);
});
app.get('/', (req,res)=>res.send('Bot Juancho Vision Activo'));
app.listen(process.env.PORT||3000, ()=>console.log('Bot corriendo VISION'));
