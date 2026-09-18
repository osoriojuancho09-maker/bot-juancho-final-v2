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
      const event = entry.messaging[0];
      const psid = event.sender.id;
      if (event.message) {
        let text = event.message.text || "";
        let img = event.message.attachments?.[0]?.type === 'image'? event.message.attachments[0].payload.url : null;
        try {
          const model = img? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile";
          const messages = img? [
            { role: "system", content: "Eres asistente de Juancho Sneakers, tienda en Pereira. Amable, casual." },
            { role: "user", content: [{ type: "text", text: text || "Que tenis son?" }, { type: "image_url", image_url: { url: img } }] }
          ] : [
            { role: "system", content: "Eres asistente de Juancho Sneakers, tienda en Pereira. Respuestas cortas, amable." },
            { role: "user", content: text }
          ];
          const completion = await groq.chat.completions.create({ model, messages });
          const reply = completion.choices[0].message.content;
          await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid }, message: { text: reply }
          });
        } catch (e) {
          console.error("Error bot:", e.status, e.error?.error?.message || e.message);
          await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid }, message: { text: "Uy, tuve un error, ¿me mandas de nuevo porfa? 🙏" }
          });
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else res.sendStatus(404);
});

app.get('/', (req, res) => res.send('Bot corriendo'));
app.listen(process.env.PORT || 10000, () => console.log('Bot corriendo'));
