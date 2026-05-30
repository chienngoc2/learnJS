# 🚀 AI Sensei Server - Backend API Documentation

**AI Sensei Server** là một nền tảng học tập tiếng Anh được hỗ trợ bởi AI, cung cấp các tính năng như quản lý từ vựng, chatbot trò chuyện, trích xuất kiến thức (RAG), và quiz tạo bởi AI.

---

## 📋 Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [Cấu Trúc Dự Án](#cấu-trúc-dự-án)
3. [Cài Đặt & Chạy](#cài-đặt--chạy)
4. [Cấu Hình Biến Môi Trường](#cấu-hình-biến-môi-trường)
5. [API Endpoints](#api-endpoints)
6. [Các Dịch Vụ & Tích Hợp](#các-dịch-vụ--tích-hợp)
7. [Cơ Sở Dữ Liệu](#cơ-sở-dữ-liệu)
8. [Quy Trình Phát Triển](#quy-trình-phát-triển)

---

## 🎯 Tổng Quan

### Mục Đích Chính

- **Quản lý Từ Vựng**: Tạo, chỉnh sửa, xóa danh sách từ vựng và ngữ pháp
- **Chatbot AI**: Trò chuyện thông minh với AI để học tiếng Anh
- **Nhận Dạng Giọng Nói**: Chuyển đổi âm thanh thành văn bản (Transcription)
- **Trích Xuất Kiến Thức (RAG)**: Tạo quiz từ các chủ đề cụ thể bằng AI
- **Lưu Lịch Sử**: Lưu trữ lịch sử chat và tiến độ học tập

### Công Nghệ Chính

- **Backend**: Node.js + Express.js
- **Database**: MongoDB (NoSQL)
- **Vector Database**: Pinecone (cho RAG)
- **AI Models**:
  - Google Gemini (Text Generation)
  - Groq LLaMA (Fast Inference)
  - Google Text-to-Speech (TTS)
- **Web Search**: Tavily API
- **Microphone Input**: Multer (File Upload)

---

## 📁 Cấu Trúc Dự Án

```
AI_Sensei_Server/
├── config/
│   └── db.js                 # Cấu hình MongoDB
├── controllers/
│   ├── chatController.ts     # Xử lý chatbot & transcription
│   ├── vocabController.ts    # Xử lý từ vựng & ngữ pháp
│   └── ragController.ts      # Xử lý RAG (Tạo Quiz từ chủ đề)
├── models/
│   └── VocabList.ts          # Schema MongoDB cho danh sách từ vựng
├── routes/
│   ├── chatbot.js            # Routes cho chatbot
│   ├── vocab.js              # Routes cho quản lý từ vựng
│   └── ragRoutes.js          # Routes cho RAG quiz
├── middleware/               # (Middleware tùy chỉnh, nếu có)
├── utils/
│   └── upload.js             # Cấu hình Multer cho file upload
├── scripts/                  # (Scripts tự động, nếu có)
├── uploads/                  # Thư mục lưu audio files
├── chat_history/             # Lưu lịch sử chat
├── .env                      # Biến môi trường (API Keys)
├── .gitignore                # Git ignore file
├── server.js                 # Entry point của ứng dụng
├── package.json              # Dependencies & scripts
├── package-lock.json         # Lock file
└── vercel.json               # Cấu hình deployment Vercel
```

---

## 🛠️ Cài Đặt & Chạy

### Prerequisites

- **Node.js**: v24.x trở lên
- **npm** hoặc **yarn**
- **MongoDB**: Cloud instance hoặc local

### Các Bước Cài Đặt

#### 1. Clone Repository

```bash
git clone <repository-url>
cd AI_Sensei_Server
```

#### 2. Cài Đặt Dependencies

```bash
npm install
```

#### 3. Cấu Hình Biến Môi Trường

Tạo file `.env` ở thư mục gốc (chi tiết xem mục [Cấu Hình Biến Môi Trường](#cấu-hình-biến-môi-trường)):

```bash
cp .env.example .env
# Sau đó chỉnh sửa .env với các API keys của bạn
```

#### 4. Chạy Server

**Development Mode** (Local):

```bash
npm start
# Server sẽ chạy trên http://localhost:5000
```

**Production Mode**:

```bash
NODE_ENV=production npm start
```

---

## 🔐 Cấu Hình Biến Môi Trường

Tạo file `.env` ở thư mục gốc với các biến sau:

```env
# ========== AI & Language Models ==========
GROQ_API_KEY=<your-groq-api-key>                    # Fast LLM inference
GEMINI_API_KEY=<your-google-gemini-api-key>        # Text generation
ELEVENLABS_API_KEY=<your-elevenlabs-api-key>       # Text-to-Speech

# ========== Vector Database ==========
PINECONE_API_KEY=<your-pinecone-api-key>           # Vector database
PINECONE_INDEX_NAME=ai-sensei-knowledge            # Index name

# ========== Search & Web APIs ==========
TAVILY_API_KEY=<your-tavily-api-key>               # Web search
MXB_API_KEY=<your-mxb-api-key>                     # Backup API

# ========== Database ==========
MONGODB_URI=<your-mongodb-connection-string>       # MongoDB connection

# ========== Google OAuth (Optional) ==========
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# ========== Server Config ==========
PORT=5000                                           # Server port
NODE_ENV=development                                # development/production
```

### Cách Lấy API Keys

| Service           | Cách Lấy                    |
| ----------------- | --------------------------- |
| **Groq**          | https://console.groq.com    |
| **Google Gemini** | https://aistudio.google.com |
| **ElevenLabs**    | https://elevenlabs.io       |
| **Pinecone**      | https://pinecone.io         |
| **Tavily**        | https://tavily.com          |
| **MongoDB**       | https://cloud.mongodb.com   |

---

## 🔌 API Endpoints

### Base URL

```
http://localhost:5000/api
```

---

### 💬 Chatbot Routes (`/api/chat`)

#### 1. **Transcribe Audio** (Nhận dạng giọng nói)

```http
POST /api/chat/transcribe
```

**Request**:

- **Content-Type**: `multipart/form-data`
- **Body**: Audio file (`audio` field)

**Response**:

```json
{
  "transcript": "Hello, how are you?",
  "status": "success"
}
```

---

#### 2. **Send Chat Message** (Gửi tin nhắn)

```http
POST /api/chat/chat
```

**Request**:

```json
{
  "message": "How do I use the word 'therefore'?",
  "userId": "user123",
  "conversationId": "conv456"
}
```

**Response**:

```json
{
  "reply": "The word 'therefore' is used to show cause and effect...",
  "status": "success"
}
```

---

#### 3. **Save Chat History** (Lưu lịch sử)

```http
POST /api/chat/save-history
```

**Request**:

```json
{
  "userId": "user123",
  "conversationId": "conv456",
  "messages": [
    { "role": "user", "content": "What is grammar?" },
    { "role": "assistant", "content": "Grammar is..." }
  ]
}
```

**Response**:

```json
{
  "status": "success",
  "message": "Chat history saved"
}
```

---

#### 4. **Generate Grammar Quiz** (Tạo quiz ngữ pháp)

```http
POST /api/chat/generate-direct-grammar-quiz
```

**Request**:

```json
{
  "grammarTopic": "Present Perfect Tense",
  "userId": "user123"
}
```

**Response**:

```json
{
  "quiz": [
    {
      "question": "Which sentence uses Present Perfect correctly?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "B"
    }
  ],
  "status": "success"
}
```

---

### 📚 Vocabulary Routes (`/api/vocab`)

#### 1. **Get All Vocabulary Lists** (Lấy tất cả danh sách)

```http
GET /api/vocab/lists
```

**Response**:

```json
{
  "lists": [
    {
      "_id": "list1",
      "title": "Business English",
      "words": [],
      "createdAt": "2024-01-15"
    }
  ]
}
```

---

#### 2. **Get Vocabulary List by ID** (Lấy danh sách theo ID)

```http
GET /api/vocab/list/:id
```

**Response**:

```json
{
  "_id": "list1",
  "title": "Business English",
  "words": [
    {
      "word": "Negotiation",
      "definition": "Discussion to reach an agreement",
      "example": "The negotiation lasted three hours"
    }
  ]
}
```

---

#### 3. **Create New Vocabulary List** (Tạo danh sách mới)

```http
POST /api/vocab/save
```

**Request**:

```json
{
  "title": "IELTS Band 7 Vocabulary",
  "words": [
    {
      "word": "Ambiguous",
      "definition": "Having more than one meaning",
      "example": "The statement was ambiguous"
    }
  ]
}
```

**Response**:

```json
{
  "_id": "new-list-id",
  "status": "success",
  "message": "List created"
}
```

---

#### 4. **Update Vocabulary List** (Chỉnh sửa danh sách)

```http
PUT /api/vocab/update/:id
```

**Request**:

```json
{
  "title": "Updated Title",
  "words": [...]
}
```

**Response**:

```json
{
  "status": "success",
  "message": "List updated"
}
```

---

#### 5. **Delete Vocabulary List** (Xóa danh sách)

```http
DELETE /api/vocab/delete/:id
```

**Response**:

```json
{
  "status": "success",
  "message": "List deleted"
}
```

---

#### 6. **Save Review List** (Lưu danh sách ôn tập)

```http
POST /api/vocab/save-review
```

**Request**:

```json
{
  "userId": "user123",
  "reviewList": ["word1", "word2", "word3"]
}
```

**Response**:

```json
{
  "status": "success",
  "message": "Review list saved"
}
```

---

#### 7. **Add or Update Grammar Point** (Thêm/Cập nhật ngữ pháp)

```http
POST /api/vocab/add-grammar-upsert
```

**Request**:

```json
{
  "topicId": "topic1",
  "grammar": {
    "rule": "Present Simple Structure",
    "explanation": "Subject + Verb + Object",
    "examples": ["I go to school every day", "She plays tennis"]
  }
}
```

**Response**:

```json
{
  "status": "success",
  "grammarId": "grammar-123"
}
```

---

#### 8. **Update Single Grammar Point** (Cập nhật 1 điểm ngữ pháp)

```http
PUT /api/vocab/update-grammar/:topicId/:grammarId
```

**Response**:

```json
{
  "status": "success",
  "message": "Grammar updated"
}
```

---

#### 9. **Delete Single Grammar Point** (Xóa 1 điểm ngữ pháp)

```http
DELETE /api/vocab/delete-grammar/:topicId/:grammarId
```

**Response**:

```json
{
  "status": "success",
  "message": "Grammar deleted"
}
```

---

#### 10. **Get All Grammar Points** (Lấy tất cả ngữ pháp)

```http
GET /api/vocab/all-grammar-points
```

**Response**:

```json
{
  "grammarPoints": [
    {
      "_id": "grammar1",
      "topic": "Tense Fundamentals",
      "rule": "Present Simple"
    }
  ]
}
```

---

### 🎯 RAG Routes (`/api/rag`)

#### 1. **Generate Quiz by Topic** (Tạo quiz từ chủ đề)

```http
POST /api/rag/generate-quiz
```

**Request**:

```json
{
  "topicId": "topic-business-english",
  "message": "Create a quiz about business communication"
}
```

**Response**:

```json
{
  "quiz": [
    {
      "id": "q1",
      "question": "What is the best way to open a business email?",
      "options": ["A) Hi there", "B) Dear Sir/Madam", "C) Yo boss"],
      "correctAnswer": "B",
      "explanation": "Formal business communication requires proper greeting"
    }
  ],
  "status": "success"
}
```

---

## 🔧 Các Dịch Vụ & Tích Hợp

### 1. **Google Gemini** (Text Generation)

- Sử dụng cho tạo quiz, giải thích ngữ pháp, trò chuyện AI
- Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent

### 2. **Groq LLaMA** (Fast LLM)

- Sử dụng cho chat nhanh với latency thấp
- Hỗ trợ khoảng 8000 tokens/giây

### 3. **Google Text-to-Speech**

- Chuyển đổi văn bản thành âm thanh
- Hỗ trợ nhiều ngôn ngữ

### 4. **ElevenLabs** (Advanced TTS)

- Text-to-Speech chất lượng cao
- Có giọng nói tự nhiên

### 5. **Pinecone** (Vector Database)

- Lưu trữ vector embeddings của tài liệu
- Sử dụng cho RAG (Retrieval-Augmented Generation)

### 6. **Tavily API** (Web Search)

- Tìm kiếm web để lấy thông tin cập nhật
- Hỗ trợ cho quiz và ví dụ

### 7. **MongoDB**

- Lưu trữ danh sách từ vựng, lịch sử chat, bài quiz

---

## 💾 Cơ Sở Dữ Liệu

### MongoDB Collections

#### 1. **VocabList** (Danh sách từ vựng)

```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  userId: String,
  words: [
    {
      word: String,
      definition: String,
      example: String,
      pronunciation: String,
      partOfSpeech: String
    }
  ],
  grammarTopics: [
    {
      _id: ObjectId,
      topic: String,
      rules: [
        {
          rule: String,
          explanation: String,
          examples: [String]
        }
      ]
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

---

#### 2. **ChatHistory** (Lịch sử chat)

```javascript
{
  _id: ObjectId,
  userId: String,
  conversationId: String,
  messages: [
    {
      role: String, // "user" hoặc "assistant"
      content: String,
      timestamp: Date
    }
  ],
  createdAt: Date
}
```

---

#### 3. **Quiz** (Bài quiz)

```javascript
{
  _id: ObjectId,
  topicId: String,
  userId: String,
  questions: [
    {
      _id: ObjectId,
      question: String,
      options: [String],
      correctAnswer: String,
      explanation: String,
      difficulty: String // "easy", "medium", "hard"
    }
  ],
  score: Number,
  completedAt: Date
}
```

---

## 📝 Quy Trình Phát Triển

### Cấu Trúc Code

**Controller Pattern**:

- Controllers xử lý logic business
- Routes gọi controller functions
- Middleware xử lý cross-cutting concerns

**Example - chatController.ts**:

```typescript
export async function handleChat(req, res) {
  try {
    const { message, userId } = req.body;

    // Gọi AI model (Groq / Gemini)
    const response = await callAIModel(message);

    // Lưu vào database
    await saveToHistory(userId, message, response);

    res.json({ reply: response, status: "success" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

---

### Best Practices

1. **Error Handling**: Luôn wrap async functions trong try-catch

   ```typescript
   try {
     await someAsyncOperation();
   } catch (error) {
     console.error(error);
     res.status(500).json({ error: error.message });
   }
   ```

2. **Environment Variables**: Không hardcode API keys

   ```typescript
   const apiKey = process.env.GROQ_API_KEY;
   ```

3. **Request Validation**: Kiểm tra dữ liệu đầu vào

   ```typescript
   if (!message || !userId) {
     return res.status(400).json({ error: "Missing fields" });
   }
   ```

4. **Logging**: Log các sự kiện quan trọng
   ```typescript
   console.log(`✅ Chat saved for user: ${userId}`);
   console.error(`❌ Error: ${error.message}`);
   ```

---

### Common Development Tasks

#### Thêm Route Mới

1. Tạo function trong controller
2. Thêm route trong routes file
3. Test bằng Postman/cURL

#### Thêm Dịch Vụ AI Mới

1. Lấy API key
2. Thêm vào `.env`
3. Tạo helper function trong controller
4. Gọi từ route handler

#### Debug Issues

- Kiểm tra `.env` có đúng API keys không
- Xem MongoDB connection status
- Check Pinecone index
- Xem server logs

---

## 🚀 Deployment

### Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Thêm environment variables trên Vercel dashboard
4. Deploy

**Vercel Config** (`vercel.json`):

```json
{
  "buildCommand": "npm install",
  "outputDirectory": ".",
  "regions": ["sfo1"]
}
```

### Render (Alternative)

1. Tạo account trên render.com
2. Connect GitHub repository
3. Set environment variables
4. Deploy

---

## 📞 Support & Troubleshooting

### Lỗi Thường Gặp

| Lỗi                         | Nguyên Nhân                                      | Giải Pháp                            |
| --------------------------- | ------------------------------------------------ | ------------------------------------ |
| `Cannot connect to MongoDB` | Sai connection string hoặc network không kết nối | Kiểm tra `.env` và whitelist IP      |
| `API key invalid`           | API key sai hoặc hết hạn                         | Cấp lại API key                      |
| `Audio transcription fails` | Audio format không đúng                          | Dùng MP3/WAV                         |
| `CORS errors`               | Frontend và backend khác domain                  | Kiểm tra CORS config trong server.js |

---

## 📚 Tài Liệu Tham Khảo

- [Express.js Docs](https://expressjs.com/)
- [MongoDB Docs](https://docs.mongodb.com/)
- [Google Gemini API](https://ai.google.dev/)
- [Groq Docs](https://console.groq.com/docs)
- [Pinecone Docs](https://docs.pinecone.io/)

---

## 📄 License

ISC License - Author: Chien Pham

---

## 👨‍💻 Contributors

- **Chien Pham** - Main Developer

---

**Cập nhật lần cuối**: 2024-05-22
