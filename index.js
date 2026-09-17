const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const OpenAI = require('openai');

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'juancho_token_123';
const ADMIN_ID = process.env.ADMIN_ID || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const hist = new Map(); // memoria por cliente

// --- PÁGINAS PARA QUE FACEBOOK TE DEJE PONERLO EN LIVE ---
app.get('/', (req, res) => res.send('Bot Juancho VISION funcionando'));

app.get('/privacy', (req, res) => {
  res.send(`
    <h1>Política de Privacidad - Bot Ventas Juancho</h1>
    <p>No guardamos datos personales. Solo usamos el ID de Messenger para responder consultas de productos.</p>
    <p>Contacto: osoriojuancho09@gmail.com</p>
  `);
});

app.get('/data-deletion', (req, res) => {
  res.send(`
    <h1>Eliminación de Datos</h1>
    <p>Si deseas eliminar tu historial, escribe la palabra DELETE al bot.</p>
    <p>O escríbenos a osoriojuancho09@gmail.com y eliminamos tu ID en 24h.</p>
  `);
});

// --- VERIFICACIÓN DEL WEBHOOK ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK VERIFICADO');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// --- RECEPCIÓN DE MENSAJES ---
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const event of entry.messaging) {
        const sender = event.sender.id;

        // Si es el ADMIN (tú) lo ignoramos para no hacer bucle, PERO ya tienes tu ID
        // Comenta la siguiente línea si quieres probarlo tú mismo
        if (ADMIN_ID && sender === ADMIN_ID) continue;

        if (event.message) {
          let text = event.message.text || '';
          const attachments = event.message.attachments || [];

          console.log(`💬 Mensaje ${sender}: ${text || '[foto]'}`);

          if (text.toUpperCase() === 'DELETE') {
            hist.delete(sender);
            await sendMessage(sender, 'Listo, tu historial fue borrado ✅');
            continue;
          }

          // Si hay foto, la mandamos a visión
          let imageUrl = null;
          if (attachments.length > 0 && attachments[0].type === 'image') {
            imageUrl = attachments[0].payload.url;
          }

          try {
            const resp = await genResp(sender, text, imageUrl);
            console.log(`🤖 Bot: ${resp}`);
            await sendMessage(sender, resp);
          } catch (e) {
            console.error('Error bot:', e.message);
            await sendMessage(sender, 'Uy, tuve un error, ¿me mandas de nuevo porfa? 🙏');
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

async function genResp(sender, userText, imageUrl) {
  if (!hist.has(sender)) hist.set(sender, []);
  const h = hist.get(sender);

  // Lee tus instrucciones de venta
  let systemPrompt = 'Eres Bot Ventas Juancho, vendes tenis réplicas premium. Eres amable, corto y cierras ventas.';
  try {
    if (fs.existsSync('./META_BOT_INSTRUCTIONS.md')) {
      systemPrompt = fs.readFileSync('./META_BOT_INSTRUCTIONS.md', 'utf8');
    }
  } catch {}

  h.push({ role: 'user', content: userText || 'Mira la foto' });
  if (h.length > 10) h.shift();

  let messages = [{ role: 'system', content: systemPrompt },...h];

  // Si hay imagen, usa visión
  if (imageUrl) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText || 'Qué modelo es este? Dame precio y tallas' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ];
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: messages,
    max_tokens: 500
  });

  const botText = completion.choices[0].message.content;
  h.push({ role: 'assistant', content: botText });
  return botText;
}

async function sendMessage(sender, text) {
  await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: sender },
    message: { text: text }
  });
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot corriendo VISION en puerto ${PORT}`));
