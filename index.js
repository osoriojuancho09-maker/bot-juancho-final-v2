const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
      let userText = msg.text || "Hola";
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        let prompt = `Eres el asistente de Juancho Sneakers, tienda de tenis en Pereira, Colombia. Eres amable, casual, usas emojis, respuestas cortas. Cliente dice: ${userText}`;
        const result = await model.generateContent(prompt);
        const reply = result.response.text();
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
          recipient: { id: psid }, message: { text: reply }
        });
      } catch (e) {
        console.error("Error bot:", e.message);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else res.sendStatus(404);
});

app.get('/', (req, res) => res.send('Bot corriendo'));
app.listen(process.env.PORT || 10000, () => console.log('Bot corriendo'));
