// ------------------------
// index.js (ปรับปรุง)
// ------------------------
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const { Configuration, OpenAIApi } = require('openai');
const { MongoClient } = require('mongodb');

// ใช้ Google Docs API
const { google } = require('googleapis');

// สร้าง Express App
const app = express();
const PORT = process.env.PORT || 3000;

// ตัวแปร Environment
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "XianTA1234";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

// ตัวแปรสำหรับ Google Docs
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GOOGLE_DOC_ID = process.env.GOOGLE_DOC_ID;

// สร้าง OpenAI Instance (ใช้ model gpt-4 ตามเดิม ไม่เปลี่ยน)
const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

/*
  แทนที่จะเปิด-ปิด MongoDB Client ในทุกฟังก์ชัน
  เราจะใช้ global client ตัวเดียว
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

// ใช้ bodyParser
app.use(bodyParser.json());

// ประกาศตัวแปรสำหรับเก็บคำสั่งจาก Google Docs
let systemInstructions = "ยังไม่ได้โหลด systemInstructions จาก Google Docs...";

/**
 * ฟังก์ชันดึงข้อความทั้งหมดจาก Google Docs 
 * แล้วต่อรวมเป็นสตริงเดียว พร้อมทำความสะอาดข้อความ
 */
async function fetchSystemInstructionsFromDoc() {
  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });

    const docs = google.docs({ version: 'v1', auth });
    const res = await docs.documents.get({ documentId: GOOGLE_DOC_ID });
    const docContent = res.data.body?.content || [];

    let fullText = '';
    docContent.forEach(block => {
      if (block.paragraph && block.paragraph.elements) {
        block.paragraph.elements.forEach(elem => {
          if (elem.textRun && elem.textRun.content) {
            fullText += elem.textRun.content;
          }
        });
      }
    });

    // ทำความสะอาดข้อความ: ตัด \n หรือช่องว่างซ้ำ
    fullText = fullText.replace(/\n+/g, ' ').trim();

    console.log("Fetched systemInstructions from Google Docs:", fullText);
    return fullText;
  } catch (error) {
    console.error("Error fetching systemInstructions from Google Doc:", error);
    return "";
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
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
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
        // ผู้ใช้ส่งข้อความตัวอักษร
        const messageText = webhookEvent.message.text;
        const history = await getChatHistory(senderId);
        const assistantResponse = await getAssistantResponse(history, messageText);
        await saveChatHistory(senderId, messageText, assistantResponse);
        sendTextMessage(senderId, assistantResponse);
      } else if (webhookEvent.message && webhookEvent.message.attachments) {
        // ผู้ใช้ส่งไฟล์แนบ
        const attachments = webhookEvent.message.attachments;
        const isImageFound = attachments.some(att => att.type === 'image');

        let userMessage = "**ลูกค้าส่งไฟล์แนบที่ไม่ใช่รูป**";
        if (isImageFound) {
          userMessage = "**ลูกค้าส่งรูปมา**";
        }

        const history = await getChatHistory(senderId);
        const assistantResponse = await getAssistantResponse(history, userMessage);
        await saveChatHistory(senderId, userMessage, assistantResponse);
        sendTextMessage(senderId, assistantResponse);
      } else {
        // กรณีอื่น ๆ เช่น สติกเกอร์ หรือไม่มี text/attachment
        const userMessage = "**ลูกค้าส่งข้อความพิเศษ (ไม่มี text/attachment)**";
        const history = await getChatHistory(senderId);
        const assistantResponse = await getAssistantResponse(history, userMessage);
        await saveChatHistory(senderId, userMessage, assistantResponse);
        sendTextMessage(senderId, assistantResponse);
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

// ------------------------
// ฟังก์ชัน: getChatHistory
// ------------------------
async function getChatHistory(senderId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const collection = db.collection("chat_history");

    // ดึงข้อมูลบทสนทนา 20 ข้อความล่าสุด
    const chats = await collection
      .find({ senderId })
      .sort({ timestamp: 1 })
      .limit(20)
      .toArray();

    // กรองเฉพาะเอกสารที่มี role และ content ถูกต้อง
    return chats
      .filter(chat => typeof chat.role === 'string' && typeof chat.content === 'string')
      .map(chat => ({
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
    // กรณี message เป็น null หรือว่าง => ตอบข้อความ fallback
    if (!message || !message.trim()) {
      return "สอบถามได้เลยนะครับ 😊";
    }

    // กันพลาด systemInstructions เผื่อยังไม่ได้โหลดหรือเป็นค่าว่าง
    if (!systemInstructions) {
      systemInstructions = "systemInstructions default";
    }

    // รวม message ทั้งหมด (System + ประวัติการสนทนา + user)
    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: message },
    ];

    console.log("Messages array before filtering:", messages);

    // กรอง message ที่ไม่ถูกต้องออก (เช่น null, ไม่ใช่ string)
    const safeMessages = messages.filter((msg, index) => {
      if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
        console.error(`Invalid message at index ${index}:`, msg);
        return false;
      }
      return true;
    });

    if (safeMessages.length !== messages.length) {
      console.warn("บาง messages ถูกกรองออกเนื่องจากไม่ถูกต้อง");
    }
    if (safeMessages.length === 0) {
      return "ขออภัย ฉันไม่สามารถช่วยคุณได้ในขณะนี้";
    }

    // เรียกใช้งาน OpenAI API (model gpt-4 ไม่เปลี่ยนแปลง)
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      messages: safeMessages,
    });

    // ตรวจสอบการตอบกลับ
    if (
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      return response.data.choices[0].message.content.trim();
    }
    return "ขออภัย ฉันไม่สามารถให้คำตอบได้ในขณะนี้";
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

    // บันทึกข้อมูลลงใน MongoDB
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
  // ตรวจสอบ pattern สำหรับส่งรูปภาพ
  const apricotRegex = /\[SEND_IMAGE_APRICOT:(https?:\/\/[^\s]+)\]/g;
  const paymentRegex = /\[SEND_IMAGE_PAYMENT:(https?:\/\/[^\s]+)\]/g;

  // ค้นหา match ของคำสั่งส่งรูปภาพ
  const apricotMatches = [...response.matchAll(apricotRegex)];
  const paymentMatches = [...response.matchAll(paymentRegex)];

  // ตัดคำสั่งออกจาก response ตัวสุดท้ายที่จะส่งเป็น text
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

  // ส่งรูปช่องทางการโอน
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

  request(
    {
      uri: 'https://graph.facebook.com/v12.0/me/messages',
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: 'POST',
      json: requestBody,
    },
    (err) => {
      if (!err) {
        console.log('ข้อความถูกส่งสำเร็จ!');
      } else {
        console.error('ไม่สามารถส่งข้อความ:', err);
      }
    }
  );
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

  request(
    {
      uri: 'https://graph.facebook.com/v12.0/me/messages',
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: 'POST',
      json: requestBody,
    },
    (err) => {
      if (!err) {
        console.log('รูปภาพถูกส่งสำเร็จ!');
      } else {
        console.error('ไม่สามารถส่งรูปภาพ:', err);
      }
    }
  );
}

// ------------------------
// Start Server
// ------------------------
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  // เชื่อม MongoDB ตอน start server
  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connect error at startup:", err);
  }

  // โหลดคำสั่งจาก Google Docs
  try {
    const docText = await fetchSystemInstructionsFromDoc();
    if (docText) {
      systemInstructions = docText;
      console.log("systemInstructions loaded from Google Docs เรียบร้อย");
    } else {
      console.log("ไม่พบข้อความใน Google Docs หรือโหลดไม่สำเร็จ (ใช้ข้อความเริ่มต้นแทน)");
    }
    console.log("systemInstructions:", systemInstructions);
  } catch (error) {
    console.error("Error loading systemInstructions:", error);
  }
});
