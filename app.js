const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// إعداد Express مع منع التخزين المؤقت للصفحات
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// إعداد Socket.io مع تحسينات للجوال
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// تحسين إدارة اتصالات Socket.io
io.engine.on("initial_headers", (headers, req) => {
  headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private";
  headers["Pragma"] = "no-cache";
  headers["Expires"] = "0";
});

io.engine.on("headers", (headers, req) => {
  headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private";
  headers["Pragma"] = "no-cache";
  headers["Expires"] = "0";
});

// التأكد من وجود المجلدات اللازمة
const dataDir = './data';
const uploadsDir = './uploads';

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// إعداد Multer لرفع الملفات
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/msword' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة أو ملف PDF أو Word فقط.'), false);
    }
  }
});

// إعداد Express
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// مسار الصفحة الرئيسية
app.get('/', (req, res) => {
  res.render('index');
});

// مسار نافذة المحادثة
app.get('/chat', (req, res) => {
  const user = req.query.user;
  if (user !== 'user1' && user !== 'user2') {
    return res.redirect('/');
  }
  
  // تحميل الرسائل السابقة
  let messages = [];
  try {
    if (fs.existsSync('./data/messages.json')) {
      const data = fs.readFileSync('./data/messages.json', 'utf8');
      messages = JSON.parse(data);
    }
  } catch (err) {
    console.error('خطأ في تحميل الرسائل:', err);
  }
  
  res.render('chat', { user, messages });
});

// مسار للحصول على الرسائل
app.get('/get-messages', (req, res) => {
  let messages = [];
  try {
    if (fs.existsSync('./data/messages.json')) {
      const data = fs.readFileSync('./data/messages.json', 'utf8');
      messages = JSON.parse(data);
    }
  } catch (err) {
    console.error('خطأ في تحميل الرسائل:', err);
    return res.status(500).json({ error: 'فشل في تحميل الرسائل' });
  }
  
  res.json(messages);
});

// مسار إرسال الرسائل
app.post('/send-message', upload.single('file'), (req, res) => {
  const { sender, text } = req.body;
  const file = req.file;
  
  const message = {
    id: Date.now(),
    sender,
    text: text || '',
    timestamp: new Date().toISOString(),
    read: false,
    readTimestamp: null
  };
  
  if (file) {
    message.file = {
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    };
  }
  
  // حفظ الرسالة في ملف JSON
  let messages = [];
  try {
    if (fs.existsSync('./data/messages.json')) {
      const data = fs.readFileSync('./data/messages.json', 'utf8');
      messages = JSON.parse(data);
    }
  } catch (err) {
    console.error('خطأ في تحميل الرسائل:', err);
  }
  
  messages.push(message);
  
  try {
    fs.writeFileSync('./data/messages.json', JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error('خطأ في حفظ الرسالة:', err);
    return res.status(500).json({ error: 'فشل في حفظ الرسالة' });
  }
  
  // بث الرسالة الجديدة لجميع العملاء
  io.emit('newMessage', message);
  
  res.json({ success: true, message });
});

// مسار حذف المحادثة
app.delete('/clear-chat', (req, res) => {
  try {
    // حذف جميع الرسائل
    fs.writeFileSync('./data/messages.json', JSON.stringify([], null, 2));
    
    // حذف جميع الملفات المرفوعة
    const files = fs.readdirSync('./uploads');
    for (const file of files) {
      fs.unlinkSync(path.join('./uploads', file));
    }
    
    // إرسال حدث لحذف المحادثة للجميع
    io.emit('chatCleared');
    
    res.json({ success: true });
  } catch (err) {
    console.error('خطأ في مسح المحادثة:', err);
    res.status(500).json({ error: 'فشل في مسح المحادثة' });
  }
});

// مسار تحميل الملفات
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('الملف غير موجود');
  }
});

// مسار لفحص حالة الخادم
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// إعداد Socket.io للاتصال في الوقت الحقيقي
io.on('connection', (socket) => {
  console.log('مستخدم متصل');
  
  socket.on('userTyping', (data) => {
    socket.broadcast.emit('userTyping', data);
  });
  
  socket.on('messageRead', (data) => {
    // تحديث حالة الرسالة كمقروءة
    let messages = [];
    try {
      if (fs.existsSync('./data/messages.json')) {
        const data = fs.readFileSync('./data/messages.json', 'utf8');
        messages = JSON.parse(data);
      }
    } catch (err) {
      console.error('خطأ في تحميل الرسائل:', err);
    }
    
    const updatedMessages = messages.map(msg => {
      if (msg.sender !== data.currentUser && !msg.read) {
        return {
          ...msg,
          read: true,
          readTimestamp: new Date().toISOString()
        };
      }
      return msg;
    });
    
    try {
      fs.writeFileSync('./data/messages.json', JSON.stringify(updatedMessages, null, 2));
    } catch (err) {
      console.error('خطأ في تحديث حالة القراءة:', err);
    }
    
    // بث تحديث حالة القراءة للجميع
    io.emit('messagesRead', { reader: data.currentUser });
  });
  
  socket.on('disconnect', (reason) => {
    console.log('مستخدم غير متصل:', reason);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});