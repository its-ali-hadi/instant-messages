require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB كحد أقصى
  fileFilter: function (req, file, cb) {
    // قبول الصور وملفات PDF وWord فقط
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
  
  socket.on('disconnect', () => {
    console.log('مستخدم غير متصل');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});