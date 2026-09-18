const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Groq = require('groq-sdk');

const app = express();
app.use(bodyParser.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Verificación de Facebook
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Recibir mensajes
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
          const attachment = webhook_event.message.attachments[0];
          if (attachment.type === 'image') {
            imageUrl = attachment.payload.url;
            console.log(`Mensaje ${sender_psid}: [foto]`);
          }
        } else {
          console.log(`Mensaje ${sender_psid}: ${userMessage}`);
        }

        try {
          let groqResponse;

          if (imageUrl) {
            // Con foto - usa modelo con visión
            groqResponse = await groq.chat.completions.create({
              model: "meta-llama/llama-4-scout-17b-16e-instruct",
              messages: [
                { role: "system", content: "Eres el asistente de Juancho Sneakers, una tienda de zapatillas en Pereira, Colombia. Eres amable, casual, usas emojis. Ayudas a clientes a elegir tallas, modelos, precios. Si te mandan foto de un tenis, descríbelo y ofrece similares." },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userMessage || "Que zapatillas son estas? tienes disponibles?" },
                    { type: "image_url", image_url: { url: imageUrl } }
                  ]
                }
              ],
            });
          } else {
            // Solo texto
            groqResponse = await groq.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages: [
                { role: "system", content: "Eres el asistente de Juancho Sneakers, tienda de zapatillas en Pereira, Colombia. Eres amable, casual, usas emojis. Ayudas con tallas, modelos, precios, envíos. Respuestas cortas." },
                { role: "user", content: userMessage }
              ],
            });
          }

          const respuesta = groqResponse.choices[0].message.content;
          await sendMessage(sender_psid, respuesta);

        } catch (error) {
          console.error("Error bot:", error.status, error.error?.error?.message || error.message);
          await sendMessage(sender_psid, "Uy, tuve un error con la IA, ¿me mandas de nuevo porfa? 🙏");
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

async function sendMessage(sender_psid, response) {
  await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: sender_psid },
    message: { text: response }
  });
}

app.get('/', (req, res) => res.send('Bot corriendo VISION en puerto ' + (process.env.PORT || 10000)));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Bot corriendo VISION en puerto ${PORT}`));
