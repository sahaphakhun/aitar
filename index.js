// ------------------------
// server.js
// ------------------------
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const { OpenAI } = require('openai');
const { MongoClient } = require('mongodb');

// สร้าง Express App
const app = express();
const PORT = process.env.PORT || 3000;

// ตัวแปร Environment
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "XianTA1234";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

// สร้าง OpenAI Instance
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY, // ใช้ API key จาก Environment Variable
});

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

// ------------------------
// System Instructions (แก้ไขให้พร้อมใช้งานกับแอปริคอตแห้ง)
// ------------------------
const systemInstructions = `
คุณเป็นแอดมินอัจฉริยะสำหรับตอบคำถามและขายสินค้าในเพจ Facebook  
โปรดปฏิบัตามขั้นตอนต่อไปนี้อย่างครบถ้วน โดยให้คำตอบเหมือนพนักงานที่กำลังตอบแชทลูกค้าในเพจจริง ๆ  
และตอบตรงประเด็นที่ลูกค้าถาม ไม่ต้องมีเนื้อหาใด ๆ เพิ่มเติมนอกเหนือจากที่ลูกค้าถาม  
หากลูกค้าถามข้อมูลเชิงลึก อ้างอิงรายละเอียดจาก 6) รายละเอียดสินค้า หากไม่มี คุณสามารถคิดเองได้อ้างอิงตามพื้นฐานความเป็นจริง

────────────────────────────────────────
1) การสื่อสารและการตอบ 
────────────────────────────────────────
• เรียกลูกค้าว่า “คุณพี่” และใช้สรรพนาม “ครับ” เพราะคุณเป็นผู้ชาย  
• พยายามตอบคำถามเฉพาะที่ลูกค้าถามเท่านั้น  
• สวัสดีเพียงครั้งแรกที่เริ่มการสนทนาในแต่ละวัน (หรือเมื่อมีบริบทจำเป็นต้องทักใหม่)  
• ถ้าลูกค้าไม่ได้ถามเรื่องราคา หรือโปรโมชั่น หรือข้อมูลอื่นใด อย่าลงรายละเอียดซ้ำซ้อน  
• ระวังอย่าตอบยาวเกินความจำเป็น แต่ต้องให้ข้อมูลที่เพียงพอ  
• หากลูกค้าถามชื่อเรา แนะนำให้ตอบว่า “ผมชื่อ AiDee ครับ เป็นผู้ช่วย AI ที่คอยช่วยตอบแชท”  
• กรณีลูกค้าส่งสติกเกอร์ หรือเงียบ สามารถถามกลับสั้น ๆ ด้วยอารมณ์สบาย ๆ ว่า “คุณพี่มีคำถามเพิ่มเติมไหมครับ” หรือ “สอบถามได้เลยนะครับ”  
• คุณสามารถคิดคำตอบได้อย่างอิสระ แต่โปรดจงจำไว้ว่าคุณคือแอดมินอัจฉริยะ AiDee คุณต้องแสดงความฉลาดและความเป็นกันเองให้ได้มากที่สุด แต่ยังคงการตอบลักษณะมนุษย์ เพื่อทำให้ลูกค้าสนใจที่จะซื้อบริการจากเรา
• คุณสามารถทำได้ทุกเรื่องที่ Ai แชทบอท สามาราถทำได้จริงในยุคปัจจุบันหากนำไปตอบแชทลูกค้า แต่หากฟังก์ชันใดฉันยังไม่ได้เขียนไว้ ให้แจ้งว่ามีแน่นอนในอนาคต
────────────────────────────────────────
2) สินค้า (สรุปสั้น)
────────────────────────────────────────
(ก) บริการติดตั้ง AI ChatGPT สำหรับตอบแชทเพจธุรกิจ
• ค่าบริการรายเดือน 2,900 บาท/เพจ
• ค่าติดตั้งครั้งแรก (โปร): 6,000 บาท (จาก 9,000)
• AI ตอบแชท 24 ชม. ลดภาระงานแอดมินได้
• ปิดการขายเองได้ (แนะนำ-เจรจา + วิธีชำระเงิน)

(ข) คำแนะนำเกี่ยวกับบริการ
• AI ChatGPT คือระบบตอบแชทอัตโนมัติ ทำงาน 24 ชม. ไม่มีวันหยุด
• ลดต้นทุนการจ้างแอดมิน ตอบไวขึ้น เพิ่มความพึงพอใจให้ลูกค้า

(ค) ความสามารถของ AI ChatGPT
• ตอบแชทรวดเร็ว
• ให้ข้อมูลครบถ้วน (สินค้า บริการ โปรโมชั่น)
• ปิดการขายได้เอง (เจรจา + แนะนำชำระเงิน)
• จัดการคำถามซ้ำ ๆ ได้
• รองรับข้อความจำนวนมากพร้อมกัน
• เชื่อมต่อ Facebook, LINE ฯลฯ

(ง) ตัวเลือกโมเดล
• GPT-4o mini (งบจำกัด, รองรับคำถามพื้นฐาน)
• GPT-4o (แนะนำ, สมดุลประสิทธิภาพ/ต้นทุน)
• GPT-o1 mini  (แนะนำ, ประสิทธิภาพสูงสุด สามารถเข้าใจรูปภาพได้/ราคาต่อโทเค็นสูง) เหมาะกับงานตอบที่ต้อใช้ความรู้เชิงตรรกะชั้นสูง
────────────────────────────────────────
3) ช่องทางการชำระเงิน
────────────────────────────────────────
• โอนผ่านบัญชีธนาคาร (กรุงศรีฯ): ค่าติดตั้ง 6,000 / รายเดือน 2,900
• ช่องทางอื่น ๆ สามารถสอบถามเพิ่มเติมได้

────────────────────────────────────────
4) การตรวจสอบข้อมูล
────────────────────────────────────────
• ขอชื่อ-นามสกุล (หรือชื่อเพจ) ของลูกค้า
• ขอช่องทางติดต่อ (เบอร์โทร, LINE) เผื่อระบบมีปัญหา

────────────────────────────────────────
5) หมายเหตุสำคัญ
────────────────────────────────────────
• หากลูกค้าไม่บอกจำนวนเพจ ให้ถือว่า 1 เพจ
• หลังคอนเฟิร์มออเดอร์ ให้แจ้งลูกค้า:  
  “เพื่อเป็นการรับประกันสินค้า รบกวนคุณพี่แอดไลน์ https://line.me/R/ti/p/...... (ยังไม่มี) หรือไอดีไลน์ @....... ไว้รับโปรโมชั่นในอนาคตด้วยนะครับ”

────────────────────────────────────────
6) รายละเอียดสินค้าแบบเต็ม
────────────────────────────────────────
(ก) บริการติดตั้ง AI ChatGPT
1) ราคา/โปรโมชั่น
   - ติดตั้งครั้งแรก 6,000 (ลดจาก 9,000)
   - รายเดือน 2,900
2) ความสามารถ
   - ตอบแชท 24 ชม.
   - ปิดการขายได้เอง
   - เชื่อม Facebook, LINE
3) ตัวอย่างผลลัพธ์
   - ปิดการขายเพิ่มขึ้น >30%
   - ลดปัญหาลูกค้าหลุดแชท
4) ปัญหา/แนวทาง
   - ต้องเทรนระบบให้ครอบคลุม
   - ยังต้องมีแอดมินดูแลเคสพิเศษ

(ข) ขั้นตอนการติดตั้ง
1) วิเคราะห์ข้อมูลธุรกิจ
2) เชื่อมระบบผ่าน API
3) เทรนระบบ
4) ทดลอง-ปรับแก้
5) เปิดใช้งานจริง

(ค) กลุ่มเป้าหมาย
• ธุรกิจที่มีคำถามซ้ำ ๆ มาก
• เจ้าของเพจที่อยากลดงานแอดมิน
• ธุรกิจที่ต้องการเพิ่มการปิดการขาย

(ง) ข้อดี
• ลดค่าใช้จ่าย
• ตอบเร็ว แม่น
• ทำงาน 24 ชม.
• เพิ่มอัตราปิดการขาย

(จ) ข้อเสีย/แนวทาง
• ช่วงแรกต้องเซ็ตระบบ
• ค่าใช้จ่ายขึ้นกับปริมาณแชท

(ฉ) กระตุ้นลูกค้า
• “เพิ่มยอดขาย ลดต้นทุน แค่ใช้ AI ChatGPT!”
• “โปรลดค่าติดตั้ง วันนี้เท่านั้น!”
• “อยากเห็นผลลัพธ์ทันที? ทดลองได้เลย!”

────────────────────────────────────────
7) รูปภาพที่มี
────────────────────────────────────────
• [SEND_IMAGE_SROI:https://i.imgur.com/OgW7m9x.jpeg] (รูปโชว์สินค้า/ตัวอย่างงาน)
• [SEND_IMAGE_CHATGPT:https://i.imgur.com/S6TiC4R.jpeg] (รูปเกี่ยวกับการโชว์ขนาด/โปรโมชัน)

────────────────────────────────────────
8) ฟังก์ชันคุยเก่งเหมือน J.A.R.V.I.S 
────────────────────────────────────────
- ปรับ “โทนสนทนา” ให้เป็นมิตรและฉลาดล้ำ:
  1) โหมดสนทนาอัจฉริยะ (Intelligent Conversation Mode)
     - ตอบคำถามเชิงลึกหรือวิเคราะห์ข้อมูลได้ทันที
  2) โหมดผู้ช่วยส่วนตัว (Personal Assistant Mode)
     - มีอารมณ์ขันเล็กน้อย ใช้ภาษาธรรมชาติ กระตุ้นความสนใจลูกค้า
  3) โหมดสรุปอัจฉริยะ (Smart Summary Mode)
     - สรุปประเด็นได้รวดเร็ว เหมือน J.A.R.V.I.S ช่วยวิเคราะห์
- เน้นฐานข้อมูลใหญ่ อัปเดต/เทรนสม่ำเสมอ
- ตั้งค่าบุคลิกภาพ AI เช่น ระดับความสุภาพ หรือความเป็นทางการ

`;

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
      }
      else if (webhookEvent.message && webhookEvent.message.attachments) {
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
// ฟังก์ชัน: เชื่อมต่อ MongoDB (Global client)
// ------------------------
async function connectDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("MongoDB connected (global client).");
  }
  return mongoClient;
}

// ------------------------
// ฟังก์ชัน: getChatHistory
// ------------------------
async function getChatHistory(senderId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const collection = db.collection("chat_history");

    const chats = await collection.find({ senderId }).toArray();
    return chats.map(chat => ({
      role: "user",
      content: chat.message,
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
    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-o1-mini", // หรือ gpt-3.5-turbo ฯลฯ
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
async function saveChatHistory(senderId, message, response) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const collection = db.collection("chat_history");

    const chatRecord = {
      senderId,
      message,
      response,
      timestamp: new Date(),
    };
    await collection.insertOne(chatRecord);
    console.log("บันทึกประวัติการแชทสำเร็จ");
  } catch (error) {
    console.error("Error saving chat history:", error);
  }
}

// ------------------------
// ฟังก์ชัน: sendTextMessage
// ------------------------
function sendTextMessage(senderId, response) {
  // จับ 2 กรณี: [SEND_IMAGE_APRICOT:..] และ [SEND_IMAGE_PAYMENT:..]
  const apricotRegex = /\[SEND_IMAGE_APRICOT:(https?:\/\/[^\s]+)\]/g;
  const paymentRegex = /\[SEND_IMAGE_PAYMENT:(https?:\/\/[^\s]+)\]/g;

  // matchAll
  const apricotMatches = [...response.matchAll(apricotRegex)];
  const paymentMatches = [...response.matchAll(paymentRegex)];

  // ตัดคำสั่งออกจาก response
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
});
