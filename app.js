require("dotenv").config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);

// إعداد Express
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(blockMiddleware);

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

['./data', './uploads'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.some(type => file.mimetype.startsWith(type) || file.mimetype === type)) cb(null, true);
    else cb(new Error('نوع الملف غير مدعوم'), false);
  }
});

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
  } catch {
    return [];
  }
}
function saveUsers(users) {
  fs.writeFileSync('./data/users.json', JSON.stringify(users, null, 2));
}

function authenticate(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/');
  }
}

const BACKLIST_FILE = path.join(__dirname, '/data/backlist.json');
let backlist = [];

if (fs.existsSync(BACKLIST_FILE)) {
  backlist = JSON.parse(fs.readFileSync(BACKLIST_FILE, 'utf8'));
}

function saveBacklist() {
  fs.writeFileSync(BACKLIST_FILE, JSON.stringify(backlist, null, 2), 'utf8');
}
const loginAttempts = {};

function isBlocked(ip) {
  return backlist.includes(ip);
}

function blockMiddleware(req, res, next) {
  const ip = req.ip;
  if (isBlocked(ip)) {
    return res.status(403).send('تم حظر هذا الـ IP بسبب محاولات تسجيل دخول فاشلة متكررة');
  }
  next();
}



app.get('/', (req, res) => {
  res.render('index', { error: null });
});
app.post('/login', (req, res) => {
  const ip = req.ip;
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    recordFailedAttempt(ip);
    return res.render('index', { error: 'بيانات الدخول غير صحيحة' });
  }
  const token = jwt.sign(
    { username: user.username, name: user.name, allowed: user.allowed },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
  loginAttempts[ip] = 0;
  res.cookie('token', token, { httpOnly: true });
  console.log(`✅ User Logged In: ${username} With IP: ${ip}`);
  res.redirect('/chat');
});

function recordFailedAttempt(ip) {
  if (!loginAttempts[ip]) loginAttempts[ip] = 0;
  loginAttempts[ip]++;

  if (loginAttempts[ip] > 5) {
    if (!backlist.includes(ip)) {
      backlist.push(ip);
      saveBacklist();
      console.log(`🚫 Done Bandee User With IP: ${ip}`);
    }
  }
}

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});
app.post('/create-user', authenticate, (req, res) => {
  if (req.user.username !== 'admin') return res.status(403).send('غير مصرح');

  const { name, username, password, allowed } = req.body;
  const users = loadUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).send('اسم المستخدم موجود مسبقًا');
  }

  const hashed = bcrypt.hashSync(password, 10);

  const allowedList = allowed ? allowed.split(',').map(u => u.trim()).filter(Boolean) : [];

  const newUser = { name, username, password: hashed, allowed: allowedList };

  users.push(newUser);

  allowedList.forEach(r => {
    const otherUser = users.find(u => u.username === r);
    if (otherUser) {
      if (!otherUser.allowed.includes(username)) {
        otherUser.allowed.push(username);
      }
    }
  });

  saveUsers(users);
  res.send('تم إنشاء المستخدم بنجاح');
});

app.get('/get-messages', authenticate, (req, res) => {
  const recipient = req.query.recipient;

  if (!recipient || !req.user.allowed.includes(recipient)) {
    return res.status(403).json({ error: 'غير مسموح لك بفتح هذه المحادثة' });
  }

  let messages = [];
  try {
    if (fs.existsSync('./data/messages.json')) {
      messages = JSON.parse(fs.readFileSync('./data/messages.json', 'utf8'));
    }
  } catch (err) {
    console.error('خطأ في قراءة الرسائل:', err);
    return res.status(500).json({ error: 'خطأ في قراءة الرسائل' });
  }

  const filtered = messages.filter(m =>
    (m.sender === req.user.username && m.recipient === recipient) ||
    (m.sender === recipient && m.recipient === req.user.username)
  );

  res.json(filtered);
});


app.get('/chat', authenticate, (req, res) => {
  let messages = [];
  try {
    if (fs.existsSync('./data/messages.json')) {
      messages = JSON.parse(fs.readFileSync('./data/messages.json', 'utf8'));
    }
  } catch (err) {
    console.error('خطأ في تحميل الرسائل:', err);
  }

  const recipient = req.query.recipient;

  if (!recipient || !req.user.allowed.includes(recipient)) {
    return res.render('choose', { user: req.user });
  }
  const filtered = messages.filter(m =>
    (m.sender === req.user.username && m.recipient === recipient) ||
    (m.sender === recipient && m.recipient === req.user.username)
  );
  console.log(`💬 Chat Opened Between ${req.user.username} and ${recipient}`);
  res.render('chat', { user: req.user, messages: filtered, currentRecipient: recipient });
});


app.post('/send-message', authenticate, upload.single('file'), (req, res) => {
  const { text, recipient } = req.body;
  const sender = req.user.username;
  if (!req.user.allowed.includes(recipient)) {
    return res.status(403).json({ error: 'غير مسموح بمراسلة هذا المستخدم' });
  }

  const message = {
    id: Date.now(),
    sender,
    recipient,
    text: text || '',
    timestamp: new Date().toISOString(),
    read: false,
    readTimestamp: null
  };

  if (req.file) {
    message.file = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    };
  }

  let messages = [];
  try {
    if (fs.existsSync('./data/messages.json')) {
      messages = JSON.parse(fs.readFileSync('./data/messages.json', 'utf8'));
    }
  } catch (err) {
    console.error('خطأ في تحميل الرسائل:', err);
  }

  messages.push(message);
  fs.writeFileSync('./data/messages.json', JSON.stringify(messages, null, 2));
  io.emit('newMessage', message);
  res.json({ success: true, message });
});

app.delete('/clear-chat', authenticate, (req, res) => {
  try {
    fs.writeFileSync('./data/messages.json', JSON.stringify([], null, 2));
    fs.readdirSync('./uploads').forEach(file => fs.unlinkSync(path.join('./uploads', file)));
    io.emit('chatCleared');
    res.json({ success: true });
  } catch (err) {
    console.error('خطأ في مسح المحادثة:', err);
    res.status(500).json({ error: 'فشل في مسح المحادثة' });
  }
});

app.get('/download/:filename', authenticate, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
    console.log(`📁 File Downloaded: ${req.params.filename} by ${req.user.username}`);
  } else {
    res.status(404).send('الملف غير موجود');
  }
});

app.get('/health', (_, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
io.on('connection', (socket) => {
  console.log('user connected:', socket.id);

  socket.on('userTyping', (data) => {
    socket.broadcast.emit('userTyping', data);
  });

  socket.on('messageRead', (data) => {
    let messages = [];
    try {
      if (fs.existsSync('./data/messages.json')) {
        messages = JSON.parse(fs.readFileSync('./data/messages.json', 'utf8'));
      }
    } catch (err) {
      console.error('خطأ في تحميل الرسائل:', err);
    }

    const updatedMessages = messages.map(msg => {
      if (msg.sender !== data.currentUser && !msg.read) {
        return { ...msg, read: true, readTimestamp: new Date().toISOString() };
      }
      return msg;
    });

    fs.writeFileSync('./data/messages.json', JSON.stringify(updatedMessages, null, 2));
    io.emit('messagesRead', { reader: data.currentUser });
  });

  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', reason);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Ready on port: ${PORT}`);
});