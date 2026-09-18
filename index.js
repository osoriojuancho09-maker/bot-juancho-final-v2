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
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;
      if (webhook_event.message) {
        let userMessage = webhook_event.message.text || "";
        let imageUrl = null;
        if (webhook_event.message.attachments) {
          if (webhook_event.message.attachments[0].type === 'image') {
            imageUrl = webhook_event.message.attachments[0].payload.url;
          }
        }
        try {
          let groqResponse;
          if (imageUrl) {
            groqResponse = await groq.chat.completions.create({
              model: "llama-3.2-11b-vision-preview",
              messages: [
                { role: "system", content: "Eres asistente de Juancho Sneakers, tienda de tenis en Pereira. Amable, casual." },
                { role: "user", content: [
                  { type: "text", text: userMessage || "Que tenis son?" },
                  { type: "image_url", image_url: { url: imageUrl } }
                ]}
              ],
            });
          } else {
            groqResponse = await groq.chat.completions.create({
              model: "llama3-8b-8192",
              messages: [
                { role: "system", content: "Eres asistente de Juancho Sneakers, tienda de tenis en Pereira. Amable, casual, respuestas cortas." },
                { role: "user", content: userMessage }
              ],
            });
          }
          const respuesta = groqResponse.choices[0].message.content;
          await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: sender_psid },
            message: { text: respuesta }
          });
        } catch (error) {
          console.error("Error bot:", error.status, error.error?.error?.message || error.message);
          await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: sender_psid },
            message: { text: "Uy, tuve un error, ¿me mandas de nuevo porfa? 🙏" }
          });
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.get('/', (req, res) => res.send('Bot corriendo'));
app.listen(process.env.PORT || 10000, () => console.log('Bot corriendo'));
