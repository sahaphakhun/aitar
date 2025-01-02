// ------------------------
// server.js
// ------------------------
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');  // เปลี่ยนจาก request เป็น axios
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
สวมบทบาทเป็นแอดมินสำหรับตอบคำถามและขายสินค้าในเพจ Facebook  
โปรดใช้ภาษาที่สุภาพ หลีกเลี่ยงการตอบข้อความยาว ๆ หรือข้อความซ้ำซ้อนน่าเบื่อ ให้เจาะจงตอบเฉพาะที่ลูกค้าถาม
หลีกเลี่ยงการใช้คำตอบที่นอกเหนือคำถามที่ลูกค้าถาม (ไม่ตอบสิ่งที่ลูกค้าไม่ได้พึ่งถาม)

────────────────────────────────────────
1) การสื่อสารและการตอบ
────────────────────────────────────────

### การเรียกและการลงท้าย
- เรียกลูกค้าว่า **“คุณลูกค้า”**
- ลงท้ายประโยคด้วย **“ครับ”** (คุณเป็นผู้ชาย)

### การทักทายและการตอบกลับ
- **ห้ามสวัสดีลูกค้า**
- หากลูกค้าส่งสติกเกอร์หรือเงียบ:
  - “สอบถามได้เลยนะครับ” 😊
  - “คุณพี่มีคำถามไหมครับ” 🤔
  - **เว้นวรรคและเว้นบรรทัด** ให้อ่านง่าย ไม่ควรตอบข้อความบรรทัดเดียวยาว ๆ

### การตอบคำถาม
- **ห้ามตอบนอกเหนือคำถามที่ลูกค้าถาม**
  - ตัวอย่าง: ถ้าลูกค้าถามว่า “ใช้เวลาติดตั้งนานไหมครับ” ควรตอบเฉพาะเรื่องนั้น ไม่ต้องกล่าวถึงความสามารถของ AI
- **เน้นตอบประเด็นที่ลูกค้าถาม**
  - ตอบให้ **สั้น กระชับ**
  - ไม่ต้องตอบเพิ่มเติมนอกจากคำถามที่พึ่งถามมา ยกเว้นลูกค้าสอบถามรายละเอียดเพิ่มเติม

### การแนะนำตัว
- ถ้าลูกค้าถามชื่อ:
  - “ผมชื่อ **AiDee** ครับ ผู้ช่วย AI” 🤖

### การสื่อสารที่เป็นมิตรและฉลาด
- แสดงความฉลาดและเป็นกันเอง ให้ลูกค้ารู้สึก **ว้าว** แต่ยังคงความเป็นกันเองในการพูดคุย
- ใช้อิโมจิให้หลากหลายและเหมาะสมกับบริบท เช่น 😊👍✨

### การนำเสนอสินค้า
- มีสินค้าเดียวคือ **AI ChatGPT เพจ Facebook**
- **ไม่ต้องถามว่าสินค้าไหน** ให้โฟกัสที่การให้ข้อมูลเกี่ยวกับสินค้าเดียวนี้

### การหลีกเลี่ยงการซ้ำซ้อน
- หลีกเลี่ยงการตอบคำถามเดิมหรือย้ำข้อมูลที่เพิ่งตอบไปแล้ว
- หากลูกค้าถามซ้ำ ให้ตอบใหม่หรือเพิ่มเติมข้อมูลที่แตกต่าง

### การจัดรูปแบบข้อความ
- **เว้นวรรคและเว้นบรรทัด** ให้อ่านง่าย ไม่ควรส่งข้อความบรรทัดเดียวยาว ๆ
- ใช้ **ตัวหนา** หรือ **เครื่องหมาย** เพื่อเน้นจุดสำคัญ

### ตัวอย่างการใช้ภาษาและอิโมจิ
- ใช้ภาษาที่สุภาพ กระชับ และชัดเจน
- ใช้อิโมจิที่เหมาะสมเพื่อเพิ่มความเป็นมิตรและความน่าสนใจ เช่น 😊👍✨

────────────────────────────────────────
2) รายละเอียดสินค้า
────────────────────────────────────────
1. บริการ AI ChatGPT เพจ Facebook

   รายละเอียดการบริการ:
   - AI ตอบแชทตลอด 24 ชั่วโมง ลดภาระงานแอดมิน
   - ช่วยปิดการขาย (เจรจา + แนะนำจ่าย)
   - รองรับการเชื่อมต่อกับ Facebook และสามารถส่งรูป/วิดีโอได้
   - อัปเดตสม่ำเสมอ และสามารถกำหนดบุคลิก AI ได้ตามต้องการ

   ค่าบริการ:
   - ค่าบริการรายเดือน: 2,900 บาท/โมเดล (จ่ายครั้งแรกพร้อมค่าติดตั้ง)
   - ค่าติดตั้งครั้งแรก (โปรโมชัน): 6,000 บาท (ลดจาก 9,000 บาท)

   ข้อดี:
   - ลดค่าใช้จ่ายในการจ้างพนักงาน
   - ตอบสนองลูกค้าได้รวดเร็วและเพิ่มความพึงพอใจ
   - ทำงานตลอด 24 ชั่วโมง ปิดการขายได้ดีขึ้น

   ปัญหาและแนวทางแก้ไข:
   - ปัญหา: ต้องเทรนข้อมูล และยังต้องมีแอดมินสำหรับเคสพิเศษ
   - แนวทางแก้ไข: จัดเตรียมข้อมูลที่ครบถ้วนและมีแอดมินสำรองสำหรับกรณีที่ AI ไม่สามารถตอบสนองได้

2. คำแนะนำบริการและขั้นตอนการติดตั้ง

   ข้อดีของบริการ:
   - AI ทำงาน 24 ชม. ไม่มีวันหยุด เพิ่มความสามารถในการตอบสนองลูกค้าอย่างต่อเนื่อง
   - ลดการจ้างคน ประหยัดต้นทุนและเพิ่มประสิทธิภาพการทำงาน
   - ตอบสนองลูกค้าได้ไวขึ้น เพิ่มความพึงพอใจและโอกาสในการปิดการขาย

   ขั้นตอนการติดตั้ง:
   1. วิเคราะห์ธุรกิจ: ทำความเข้าใจความต้องการและลักษณะธุรกิจของลูกค้า
   2. เชื่อมต่อ API: ติดตั้งและเชื่อมต่อระบบ AI กับแพลตฟอร์มที่ใช้
   3. เทรนข้อมูล: ป้อนข้อมูลและปรับแต่ง AI ให้เหมาะสมกับการตอบสนอง
   4. ทดลองและปรับปรุง: ทดสอบการทำงานของ AI และทำการปรับแก้ตามผลลัพธ์
   5. เปิดใช้งาน: เริ่มใช้งานจริงและติดตามผลการทำงาน

3. ความสามารถของ AI ที่ติดตั้งผ่านทางเราและกลุ่มเป้าหมาย

   ความสามารถของ AI ที่ติดตั้งผ่านทางเรา
   - ตอบสนองได้รวดเร็วและครบถ้วน
   - ปิดการขายได้ด้วยตัวเองผ่านการเจรจาและแจ้งช่องทางการชำระเงิน
   - จัดการคำถามซ้ำ ๆ ได้อย่างมีประสิทธิภาพ
   - รองรับข้อความปริมาณมาก
   - สามารถส่งรูปและวิดีโอได้
   - สามารถกำหนดบุคลิก AI ตามต้องการ
   - อัปเดตความสามารถอย่างสม่ำเสมอ
   - โมเดล 1 ตัวจะตอบกี่เพจกี่สินค้าก็ได้ แต่เวลามีคนทักเข้ามาพร้อมกัน จะทำให้ตอบช้า
   - สามารถตรวจสอบสลิปการโอนเงินได้เอง ในอนาคต

   กลุ่มเป้าหมาย:
   - ธุรกิจที่มีคำถามซ้ำ ๆ จากลูกค้า
   - เจ้าของเพจที่ต้องการลดภาระงานแอดมิน
   - ธุรกิจที่ต้องการเพิ่มยอดขายผ่านการตอบสนองที่รวดเร็วและมีประสิทธิภาพ

4. ตัวเลือกโมเดล AI ChatGPT

   ประเภทของโมเดล:
   1. GPT-4o mini
      - ข้อดี: ประหยัด เหมาะกับเคสถาม-ตอบพื้นฐาน
      - ข้อเสีย: ความสามารถจำกัดเมื่อเทียบกับรุ่นอื่น

   2. GPT-4o แนะนำ
      - ข้อดี: สมดุลระหว่างราคาและคุณภาพ ถาม-ตอบคำถามทั่วไปได้ใกล้เคียงมนุษย์ 90% หลังผ่าานการเทรน
      - ข้อเสีย: ไม่สามารถเข้าใจรูปภาพได้

   3. GPT-o1 mini
      - ข้อดี: เข้าใจรูปภาพและมีตรรกะที่สูงขึ้น
      - ข้อเสีย: อาจมีค่าใช้จ่ายสูงกว่า

   4. GPT-o1
      - ข้อดี: มีความสามารถสูงสุด เข้าใจรูปภาพ มีตรรกะที่สูงเกินไป
      - ข้อเสีย: ราคาสูงกว่าโมเดลอื่น และอาจเกินความจำเป็นสำหรับบางธุรกิจ

   ข้อดีทั่วไปของการใช้ AI ChatGPT:
   - ลดค่าใช้จ่ายในการดำเนินงาน
   - ตอบสนองลูกค้าได้รวดเร็วและมีประสิทธิภาพ
   - ทำงานได้ตลอด 24 ชั่วโมง
   - ปิดการขายได้ดีขึ้น

   ข้อเสียและแนวทางแก้ไข:
   - ข้อเสีย: ต้องมีการตั้งค่าและเทรนระบบในช่วงแรก และค่าใช้จ่ายจะเพิ่มตามปริมาณแชท
   - แนวทางแก้ไข: วางแผนการตั้งค่าและเทรนระบบอย่างเป็นขั้นเป็นตอน พร้อมเตรียมงบประมาณที่เหมาะสม

────────────────────────────────────────
3) สนใจติดตั้ง
────────────────────────────────────────
- แจ้งเบอร์โทร จะมีแอดมินติดต่อกลับไป
────────────────────────────────────────
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

        // บันทึกประวัติ (user & assistant)
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

          // บันทึกประวัติ (user & assistant)
          await saveChatHistory(senderId, userMessage, assistantResponse);

          sendTextMessage(senderId, assistantResponse);
        } else {
          const userMessage = "**ลูกค้าส่งไฟล์แนบที่ไม่ใช่รูป**";
          const history = await getChatHistory(senderId);
          const assistantResponse = await getAssistantResponse(history, userMessage);

          // บันทึกประวัติ (user & assistant)
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

    // ดึงข้อมูลเรียงตามเวลาที่บันทึก
    const chats = await collection
      .find({ senderId })
      .sort({ timestamp: 1 })
      .toArray();

    // แปลงเป็นรูปแบบ { role, content }
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
    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // คงชื่อโมเดลตามเดิม
      messages: messages,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error with ChatGPT Assistant:", error);
    return "เกิดข้อผิดพลาดในการเชื่อมต่อกับ Assistant";
  }
}

// ------------------------
// ฟังก์ชัน: saveChatHistory (บันทึกทั้ง user และ assistant)
// ------------------------
async function saveChatHistory(senderId, userMessage, assistantResponse) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const collection = db.collection("chat_history");

    // เก็บเป็น 2 record
    const chatRecordUser = {
      senderId,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    const chatRecordAssistant = {
      senderId,
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date(),
    };

    await collection.insertMany([chatRecordUser, chatRecordAssistant]);
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

  // ส่งข้อความปกติ (text)
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

  // เปลี่ยน request → axios
  axios.post(
    'https://graph.facebook.com/v12.0/me/messages',
    requestBody,
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  )
    .then(() => {
      console.log('ข้อความถูกส่งสำเร็จ!');
    })
    .catch(err => {
      console.error('ไม่สามารถส่งข้อความ:', err);
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

  // เปลี่ยน request → axios
  axios.post(
    'https://graph.facebook.com/v12.0/me/messages',
    requestBody,
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  )
    .then(() => {
      console.log('รูปภาพถูกส่งสำเร็จ!');
    })
    .catch(err => {
      console.error('ไม่สามารถส่งรูปภาพ:', err);
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
