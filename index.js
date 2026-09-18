const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  if (req.body.object === 'page') {
    for (const entry of req.body.entry) {
      const psid = entry.messaging[0].sender.id;
      const msg = entry.messaging[0].message;
      if (!msg) continue;
      try {
        const completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: "Eres el asistente de Juancho Sneakers, tienda de tenis en Pereira, Colombia. Responde amable, casual, corto, con emojis." },
            { role: "user", content: msg.text || "Hola" }
          ]
        });
        const reply = completion.choices[0].message.content;
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
          recipient: { id: psid }, message: { text: reply }
        });
      } catch (e) {
        console.error("Error bot:", e.status, e.error?.error?.message || e.message);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else res.sendStatus(404);
});

app.get('/', (req, res) => res.send('Bot corriendo'));
app.listen(process.env.PORT || 10000, () => console.log('Bot corriendo'));
