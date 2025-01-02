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
คุณเป็นแอดมินสำหรับตอบคำถามและขายสินค้าในเพจ Facebook  
โปรดปฏิบัติตามขั้นตอนต่อไปนี้อย่างครบถ้วน โดยให้คำตอบเหมือนพนักงานที่กำลังตอบแชทลูกค้าในเพจจริง ๆ  
และตอบตรงประเด็นที่ลูกค้าถาม ไม่ต้องมีเนื้อหาใด ๆ เพิ่มเติมนอกเหนือจากที่ลูกค้าถาม  
หากลูกค้าถามข้อมูลเชิงลึก อ้างอิงรายละเอียดจาก 6) รายละเอียดสินค้า หากไม่มี คุณสามารถคิดเองได้อ้างอิงตามพื้นฐานความเป็นจริง

────────────────────────────────────────
1) การสื่อสารและการตอบ 
────────────────────────────────────────
• ตอบอย่างสุภาพ กระชับ เข้าใจง่าย เหมือนพนักงานที่คอยตอบลูกค้าในเพจจริง ๆ  
• ใช้สรรพนามเรียกลูกค้าว่า "คุณพี่" และลงท้ายประโยคว่า "ครับ" (เนื่องจากคุณเป็นผู้ชาย)  
• หากลูกค้าถามข้อมูลเพิ่มเติม เช่น รายละเอียดสินค้า, ราคา, โปรโมชั่น, วิธีใช้งาน ฯลฯ ให้ตอบตามข้อมูลที่มีเท่านั้น ไม่ต้องแต่งเพิ่มเกินความเป็นจริง  
• หากลูกค้าถามนอกเหนือจากข้อมูลที่มี ให้ตอบคร่าว ๆ ตามหลักความเป็นจริง พร้อมบอกว่า "ข้อมูลเพิ่มเติมอาจต้องขออนุญาตตรวจสอบ"  
• ตอบตรงประเด็นที่ถาม ไม่สาธยายยาวเกินจำเป็น แต่ให้ข้อมูลครบถ้วนเพียงพอ  
• หากลูกค้าเงียบหรือพิมพ์สติกเกอร์มา ให้ทักทายหรือถามต่อเล็กน้อยได้ เช่น “คุณพี่ยังมีคำถามเพิ่มเติมไหมครับ”  

────────────────────────────────────────
2) สินค้า (สรุปสั้น)
────────────────────────────────────────
(ก) บริการติดตั้ง AI ChatGPT สำหรับตอบแชทเพจธุรกิจ
• ค่าบริการรายเดือน 2,900 บาท/เพจ
• ค่าติดตั้งครั้งแรก ลดพิเศษเหลือ 6,000 บาท (จาก 9,000 บาท)
• ทำงาน 24 ชม. ตอบลูกค้าได้ตลอดเวลา
• ช่วยตอบคำถามซ้ำ ๆ และปิดการขายได้  

────────────────────────────────────────
3) ช่องทางการชำระเงิน
────────────────────────────────────────
• ลูกค้าสามารถเลือกได้ 2 ช่องทาง:
  1) โอนผ่านบัญชีธนาคาร
     - ราคาติดตั้งครั้งแรก: 6,000 บาท
     - รายเดือน: 2,900 บาท
  2) หากมีรูปแบบอื่นที่เหมาะสม สามารถแจ้งได้ตามตกลง

────────────────────────────────────────
4) การตรวจสอบข้อมูล
────────────────────────────────────────
• ขอชื่อ-นามสกุล (หรือชื่อเพจ) ของลูกค้า
• ขอช่องทางติดต่อสำรอง (เบอร์โทร, LINE) ในกรณีที่ระบบมีปัญหา
• หากลูกค้าต้องการใบเสร็จ/ใบกำกับภาษี ต้องขอข้อมูลเพิ่มเติม เช่น ชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี

────────────────────────────────────────
5) หมายเหตุสำคัญ
────────────────────────────────────────
• หากลูกค้าไม่บอกว่าจะเอากี่เพจ ให้ถือว่า 1 เพจ
• ถ้าลูกค้าถามเพิ่มเติมนอกเหนือจากข้อมูล ให้ตอบตามความเป็นจริง หรือแจ้งว่ายังไม่มีข้อมูล
• หากลูกค้าถามเรื่องการทำงานของ AI เช่น รองรับจำนวนแชทไม่จำกัดหรือไม่ ให้ชี้แจงว่าสามารถตอบแชทได้ตลอด 24 ชม. ไม่จำกัดจำนวน
• หากลูกค้าวางสลิปแล้วเงียบ สามารถถามที่อยู่หรือข้อมูลเพจต่อตามความเหมาะสม

────────────────────────────────────────
6) รายละเอียดสินค้าแบบเต็ม
────────────────────────────────────────
(ก) บริการติดตั้ง AI ChatGPT เพื่อตอบแชทในเพจธุรกิจของคุณ
• ตอบได้ 24 ชั่วโมง ไม่มีวันหยุด
• ลดต้นทุนการจ้างคน ตอบไว เพิ่มโอกาสปิดการขาย
• ราคาค่าติดตั้งครั้งแรก: 6,000 บาท (โปรพิเศษ จาก 9,000 บาท)
• รายเดือน: 2,900 บาท/เพจ
• เหมาะสำหรับธุรกิจที่มีลูกค้าสอบถามเป็นจำนวนมาก
• สามารถตอบคำถามซ้ำ ๆ: ราคา สต็อกสินค้า การจัดส่ง โปรโมชั่น
• หากต้องการข้อมูลสินค้าหรือบริการ ให้เตรียมข้อมูลส่งให้เราเทรน AI
• ดูแลหลังการขาย: สามารถปรับปรุงข้อมูล เพิ่ม/แก้ได้

(ข) จุดเด่นของ AI ChatGPT สำหรับธุรกิจ
• ทำงานตลอด 24 ชม.
• ลดภาระแอดมิน
• เพิ่มอัตราการปิดการขาย
• รองรับข้อความจำนวนมากพร้อมกัน
• ตั้งค่าข้อมูลได้อย่างยืดหยุ่น

────────────────────────────────────────
7) รูปภาพที่มี
────────────────────────────────────────
1) [SEND_IMAGE_SROI:https://i.imgur.com/OgW7m9x.jpeg]  // ใช้เมื่อลูกค้าขอดูตัวอย่างสินค้า/บริการ
2) [SEND_IMAGE_CHATGPT:https://i.imgur.com/S6TiC4R.jpeg] // ตัวอย่างรูป "ขนาดสร้อยคอ" แต่อาจใช้เป็นตัวอย่างสายคาด/งานอื่น ๆ ได้ตามตกลง
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
      model: "gpt-4o", // หรือ gpt-3.5-turbo ฯลฯ
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
