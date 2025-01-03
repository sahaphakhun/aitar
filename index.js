// ------------------------
// server.js
// ------------------------
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const { OpenAI } = require('openai');
const { MongoClient } = require('mongodb');

// เพิ่มมาเพื่อใช้ Google Docs API
const { google } = require('googleapis');

// เรียกใช้งาน Environment Variables
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "XianTA1234";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

// ส่วนที่เกี่ยวกับ Google Docs
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GOOGLE_DOC_ID = process.env.GOOGLE_DOC_ID;

// สร้าง Express App
const app = express();

// ใช้ bodyParser
app.use(bodyParser.json());

// สร้าง OpenAI Instance
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/*
  Global MongoDB Client
*/
let mongoClient = null;
async function connectDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("MongoDB connected (global client).");
  }
  return mongoClient;
}

// ------------------------
// ตัวแปรสำหรับเก็บ systemInstructions
// ------------------------
let systemInstructions = "ยังไม่ได้โหลด systemInstructions จาก Google Docs ...";

/**
 * ฟังก์ชันสำหรับอ่านข้อความจาก Google Docs
 * (ดึงทุก Text Element ต่อเป็นข้อความเดียว)
 */
async function fetchTextFromGoogleDoc() {
  try {
    // Auth ด้วย Service Account (JWT)
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });

    const docs = google.docs({ version: 'v1', auth });

    // เรียกดูข้อมูลเอกสาร
    const res = await docs.documents.get({
      documentId: GOOGLE_DOC_ID,
    });

    const docContent = res.data.body?.content || [];
    let fullText = '';

    docContent.forEach((struct) => {
      if (struct.paragraph && struct.paragraph.elements) {
        struct.paragraph.elements.forEach((elem) => {
          if (elem.textRun && elem.textRun.content) {
            fullText += elem.textRun.content;
          }
        });
      }
    });

    return fullText.trim();
  } catch (error) {
    console.error('Error fetching text from Google Doc:', error);
    return '';
  }
}

/**
 * ฟังก์ชันสำหรับโหลด systemInstructions จาก Google Docs
 */
async function loadSystemInstructions() {
  try {
    const text = await fetchTextFromGoogleDoc();
    if (text) {
      systemInstructions = text;
      console.log("Loaded systemInstructions from Google Docs สำเร็จ!");
    } else {
      console.log("ไม่พบข้อความใน Google Docs หรือโหลดไม่สำเร็จ");
    }
  } catch (error) {
    console.error("Error loading systemInstructions:", error);
  }
}

// ------------------------
// Facebook Webhook Verify
// ------------------------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ------------------------
// Facebook Webhook Receiver
// ------------------------
app.post('/webhook', async (req, res) => {
  if (req.body.object === 'page') {
    for (const entry of req.body.entry) {
      const webhookEvent = entry.messaging[0];
      const senderId = webhookEvent.sender.id;

      if (webhookEvent.message && webhookEvent.message.text) {
        const messageText = webhookEvent.message.text;
        const history = await getChatHistory(senderId);
        const assistantResponse = await getAssistantResponse(history, messageText);
        await saveChatHistory(senderId, messageText, assistantResponse);
        sendTextMessage(senderId, assistantResponse);

      } else if (webhookEvent.message && webhookEvent.message.attachments) {
        const attachments = webhookEvent.message.attachments;
        const isImageFound = attachments.some(att => att.type === 'image');

        if (isImageFound) {
          const userMessage = "**ลูกค้าส่งรูปมา**";
          const history = await getChatHistory(senderId);
          const assistantResponse = await getAssistantResponse(history, userMessage);
          await saveChatHistory(senderId, userMessage, assistantResponse);
          sendTextMessage(senderId, assistantResponse);
        } else {
          const userMessage = "**ลูกค้าส่งไฟล์แนบที่ไม่ใช่รูป**";
          const history = await getChatHistory(senderId);
          const assistantResponse = await getAssistantResponse(history, userMessage);
          await saveChatHistory(senderId, userMessage, assistantResponse);
          sendTextMessage(senderId, assistantResponse);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// ------------------------
// ฟังก์ชัน: getChatHistory
// ------------------------
async function getChatHistory(senderId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const collection = db.collection("chat_history");

    const chats = await collection.find({ senderId }).sort({ timestamp: 1 }).toArray();
    return chats.map(chat => ({
      role: chat.role,
      content: chat.content,
    }));
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return [];
  }
}

// ------------------------
// ฟังก์ชัน: getAssistantResponse
// ------------------------
async function getAssistantResponse(history, message) {
  try {
    // รวม systemInstructions และประวัติการสนทนา
    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: message },
    ];

    // เรียก OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // หรือ gpt-4 / gpt-4o ฯลฯ
      messages: messages,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error with ChatGPT Assistant:", error);
    return "เกิดข้อผิดพลาดในการเชื่อมต่อกับ Assistant";
  }
}

// ------------------------
// ฟังก์ชัน: saveChatHistory
// ------------------------
async function saveChatHistory(senderId, userMessage, assistantResponse) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const collection = db.collection("chat_history");

    const userChatRecord = {
      senderId,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    const assistantChatRecord = {
      senderId,
      role: "assistant",
      content: assistantResponse,
      timestamp: new Date(),
    };

    await collection.insertOne(userChatRecord);
    await collection.insertOne(assistantChatRecord);

    console.log("บันทึกประวัติการแชทสำเร็จ");
  } catch (error) {
    console.error("Error saving chat history:", error);
  }
}

// ------------------------
// ฟังก์ชัน: sendTextMessage
// ------------------------
function sendTextMessage(senderId, response) {
  const apricotRegex = /\[SEND_IMAGE_APRICOT:(https?:\/\/[^\s]+)\]/g;
  const paymentRegex = /\[SEND_IMAGE_PAYMENT:(https?:\/\/[^\s]+)\]/g;

  const apricotMatches = [...response.matchAll(apricotRegex)];
  const paymentMatches = [...response.matchAll(paymentRegex)];

  let textPart = response
    .replace(apricotRegex, '')
    .replace(paymentRegex, '')
    .trim();

  // ส่งข้อความปกติ
  if (textPart.length > 0) {
    sendSimpleTextMessage(senderId, textPart);
  }

  // ส่งรูปแอปริคอต
  apricotMatches.forEach(match => {
    const imageUrl = match[1];
    sendImageMessage(senderId, imageUrl);
  });

  // ส่งรูปช่องทางโอน
  paymentMatches.forEach(match => {
    const imageUrl = match[1];
    sendImageMessage(senderId, imageUrl);
  });
}

// ------------------------
// ฟังก์ชัน: sendSimpleTextMessage
// ------------------------
function sendSimpleTextMessage(senderId, text) {
  const requestBody = {
    recipient: { id: senderId },
    message: { text },
  };

  request({
    uri: 'https://graph.facebook.com/v12.0/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: requestBody,
  }, (err) => {
    if (!err) {
      console.log('ข้อความถูกส่งสำเร็จ!');
    } else {
      console.error('ไม่สามารถส่งข้อความ:', err);
    }
  });
}

// ------------------------
// ฟังก์ชัน: sendImageMessage
// ------------------------
function sendImageMessage(senderId, imageUrl) {
  const requestBody = {
    recipient: { id: senderId },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: imageUrl,
          is_reusable: true,
        },
      },
    },
  };

  request({
    uri: 'https://graph.facebook.com/v12.0/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: requestBody,
  }, (err) => {
    if (!err) {
      console.log('รูปภาพถูกส่งสำเร็จ!');
    } else {
      console.error('ไม่สามารถส่งรูปภาพ:', err);
    }
  });
}

// ------------------------
// เริ่มต้น Start Server
// ------------------------
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  // 1) เชื่อม MongoDB ตอน start server
  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connect error at startup:", err);
  }

  // 2) โหลด systemInstructions จาก Google Docs
  await loadSystemInstructions();
});
