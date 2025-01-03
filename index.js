// ------------------------
// index.js
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

// ค่าเหล่านี้คือค่าคงที่ (hard-code) หรือนำไป .env ได้
const GOOGLE_CLIENT_EMAIL = "aitar-888@eminent-wares-446512-j8.iam.gserviceaccount.com";
const GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGhyeINArKZgaVitEcK+o89ilPYeRNTNZgJT7VNHB5hgNLLeAcFLJ7IlCIqTLMoJEnnoDQil6aKaz8ExVL83uSXRrzk4zQvtt3tIP31+9wOCb9D4ZGWfVP1tD0qdD4WJ1qqg1j1/8879pHUeQGEMuCnyVbcQ3GbYQjyYb3wEz/Qv7kMVggF+MIaGGw2NQwM0XcufSFtyxvvX2Sb8uGc1A8R+Dn/tmcgMODhbtEgcMg6yXI5Y26MPfDjVrEbk0lfCr7IGFJX4ASYeKl0jhm0RGb+aya2cb55auLN3VPO5MQ+cOp8gHBf5GiC/YgF1gbRgF5b7LgmENBxSfHb3WVQodLAgMBAAECggEACKB14M7LdekXZHyAQrZL0EitbzQknLv33Xyw2B3rvJ7Mr4HM/nC4eBj7y+ciUc8GZQ+CWc2GzTHTa66+mwAia1qdYbPp3LuhGM4Leq5zn/o+A3rJuG6PS4qyUMy89msPXW5fSj/oE535QREiFKYP2dtlia2GI4xoag+x9uZwfMUOWKEe7tiUoZQEiGhwtjLq9lyST4kGGmlhNee9OyhDJcw4uCt8Cepr++hMDleWUF6cX0nbGmoSS0sZ5Boy8ATMhw/3luaOAlTUEz/nVDvbbWlNL9etwLKiAVw+AQXsPHNWNWF7gyEIsEi0qSM3PtA1X7IdReRXHqmfiZs0J3qSQQKBgQD1+Yj37Yuqj8hGi5PY+M0ieMdGcbUOmJsM1yUmBMV4bfaTiqm504P6DIYAqfDDWeozcHwcdpG1AfFAihEih6lb0qRk8YaGbzvac8mWhwo/jDA5QB97fjFa6uwtlewZ0Er/U3QmOeVVnVC1y1b0rbJD5yjvI3ve+gpwAz0glpIMiwKBgQDOnpD7p7ylG4NQunqmzzdozrzZP0L6EZyE141st/Hsp9rtO9/ADuH6WhpirQ516l5LLv7mLPA8S9CF/cSdWF/7WlxBPjM8WRs9ACFNBJIwUfjzPnvECmtsayzRlKuyCAspnNSkzgtdtvf2xI82Z3BGov9goZfu+D4A36b1qXsIQQKBgQCO1CojhO0vyjPKOuxL9hTvqmBUWFyBMD4AU8F/dQ/RYVDn1YG+pMKi5Li/E+75EHH9EpkO0g7Do3AaQNG4UjwWVJcfAlxSHa8Mp2VsIdfilJ2/8KsXQ2yXVYh04/Rn/No/ro7oT4AKmcGu/nbstxuncEgFrH4WOOzspATPsn72BwKBgG5NBAT0NKbHm0B7bIKkWGYhB3vKY8zvnejk0WDaidHWge7nabkzuLtXYoKO9AtKxG/KdNUX5F+r8XO2V0HQLd0XDezecaejwgC8kwp0iD43ZHkmQBgVn+dPB6wSe94coSjjyjj4reSnipQ3tmRKsAtldIN3gI5YA3Gf85dtlHqBAoGAD5ePt7cmu3tDZhA3A8f9o8mNPvqz/WGs7H2Qgjyfc3jUxEGhVt1Su7J1j+TppfkKtJIDKji6rVA9oIjZtpZTgxnU6hcYuiwbLh3wGEFIjP1XeYYILudqfWOEbwnxD1RgMkCqfSHf/niWlfiH6p3FdnBsLY/qXdKfS/OXyezAm4M=-----END PRIVATE KEY-----";
const GOOGLE_DOC_ID = "1PF5GxEHCVaMAYyrwLCcX_6gmQm3beCz2Ss1pz2A-NHA";

// สร้าง OpenAI Instance (ตัวอย่าง)
const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// ประกาศตัวแปรสำหรับเก็บข้อความที่ดึงมาจาก Google Docs
let systemInstructions = "ยังไม่ได้โหลด systemInstructions จาก Google Docs...";

// เชื่อมต่อ MongoDB (ถ้าคุณต้องการใช้งาน)
let mongoClient = null;
async function connectDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("MongoDB connected (global client).");
  }
  return mongoClient;
}

app.use(bodyParser.json());

// ------------------------
// ฟังก์ชัน: ดึงข้อความจาก Google Docs
// ------------------------
async function fetchDocumentContent() {
  try {
    // สร้าง JWT Auth
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });

    // สร้าง instance ของ Google Docs API
    const docs = google.docs({ version: 'v1', auth });

    // ดึงข้อมูลเอกสาร
    const res = await docs.documents.get({ documentId: GOOGLE_DOC_ID });
    const docContent = res.data.body?.content || [];

    // ดึงข้อความทั้งหมดจากเอกสาร
    let fullText = '';
    docContent.forEach((struct) => {
      if (struct.paragraph?.elements) {
        struct.paragraph.elements.forEach((elem) => {
          if (elem.textRun?.content) {
            fullText += elem.textRun.content;
          }
        });
      }
    });

    // ทำความสะอาดข้อความ เช่น ตัด \n ส่วนเกินออก
    fullText = fullText.replace(/\n+/g, ' ').trim();

    // บันทึกลงตัวแปร systemInstructions
    systemInstructions = fullText;
    console.log('---------- Document Content ----------');
    console.log(systemInstructions);
    console.log('--------------------------------------');

    return fullText; // ถ้าต้องการ return ค่าไปใช้งานต่อ
  } catch (error) {
    console.error('Failed to fetch document content:', error.message);
    return "";
  }
}

// ------------------------
// ตัวอย่างการใช้งานในฟังก์ชันอื่น
// ------------------------
async function getAssistantResponse(userMessage) {
  try {
    if (!systemInstructions || systemInstructions.trim().length === 0) {
      systemInstructions = "systemInstructions default";
    }
    if (!userMessage || userMessage.trim().length === 0) {
      return "สอบถามได้เลยนะครับ 😊";
    }

    const messages = [
      { role: "system", content: systemInstructions },
      { role: "user", content: userMessage }
    ];

    const response = await openai.createChatCompletion({
      model: "gpt-4o", // หรือ gpt-4o หรือ gpt-3.5-turbo ตามที่คุณต้องการ
      messages,
    });

    if (
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      return response.data.choices[0].message.content.trim();
    } else {
      return "ขออภัย ฉันไม่สามารถให้คำตอบได้ในขณะนี้";
    }
  } catch (error) {
    console.error('Error in getAssistantResponse:', error);
    return "เกิดข้อผิดพลาดในการเชื่อมต่อกับ Assistant";
  }
}

// ------------------------
// Facebook Webhook
// ------------------------
app.get('/webhook', (req, res) => {
  // ใช้โค้ดตามเว็บฮุคของเฟสบุ๊กที่คุณมีได้เลย
  // ...
});

app.post('/webhook', async (req, res) => {
  // ในจุดที่ต้องการ ส่งข้อความไปถาม getAssistantResponse(...)
  // ...
  res.status(200).send('EVENT_RECEIVED');
});

// ------------------------
// Start server
// ------------------------
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  // เชื่อมต่อ MongoDB หากจำเป็น
  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connect error at startup:", err);
  }

  // เรียกใช้ฟังก์ชันดึงข้อความจาก Google Docs ทันทีที่เซิร์ฟเวอร์สตาร์ท
  await fetchDocumentContent(); 
});
