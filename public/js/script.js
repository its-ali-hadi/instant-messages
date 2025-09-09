document.addEventListener('DOMContentLoaded', function() {
    // إدارة اتصال Socket.io مع إعادة الاتصال التلقائي
    let socket;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    
    function initSocket() {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        setupSocketEvents();
    }
    
    function setupSocketEvents() {
        // التعامل مع الاتصال
        socket.on('connect', function() {
            console.log('متصل بالخادم');
            reconnectAttempts = 0;
            hideConnectionStatus();
            
            // إعادة تحميل الرسائل عند الاتصال
            loadMessages();
        });
        
        socket.on('disconnect', function(reason) {
            console.log('انقطع الاتصال: ', reason);
            showConnectionStatus('انقطع الاتصال، جاري إعادة المحاولة...');
        });
        
        socket.on('reconnect_attempt', function(attempt) {
            reconnectAttempts = attempt;
            console.log('محاولة إعادة الاتصال: ', attempt);
            showConnectionStatus(`محاولة إعادة الاتصال (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`);
        });
        
        socket.on('reconnect', function() {
            console.log('أعيد الاتصال بنجاح');
            hideConnectionStatus();
        });
        
        socket.on('reconnect_failed', function() {
            console.log('فشلت جميع محاولات إعادة الاتصال');
            showConnectionStatus('فشل الاتصال، يرجى تحديث الصفحة', true);
        });
        
        // بقية الأحداث
        socket.on('newMessage', function(message) {
            addMessageToChat(message);
            scrollToBottom();
            
            if (message.sender !== currentUser) {
                socket.emit('messageRead', { currentUser });
            }
        });
        
        socket.on('messagesRead', function(data) {
            if (data.reader !== currentUser) {
                updateReadStatus();
            }
        });
        
        socket.on('userTyping', function(data) {
            if (data.user !== currentUser) {
                if (data.isTyping) {
                    typingText.textContent = `${data.user} يكتب الآن...`;
                    typingIndicator.style.display = 'block';
                } else {
                    typingIndicator.style.display = 'none';
                }
            }
        });
        
        socket.on('chatCleared', function() {
            chatMessages.innerHTML = '';
        });
    }
    
    // إظهار حالة الاتصال
    function showConnectionStatus(message, isError = false) {
        let statusElement = document.getElementById('connectionStatus');
        
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'connectionStatus';
            statusElement.style.cssText = `
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                padding: 10px 15px;
                border-radius: 5px;
                z-index: 1000;
                font-size: 14px;
                text-align: center;
                max-width: 80%;
            `;
            document.body.appendChild(statusElement);
        }
        
        statusElement.textContent = message;
        statusElement.style.backgroundColor = isError ? '#e74c3c' : '#f39c12';
        statusElement.style.color = 'white';
        statusElement.style.display = 'block';
    }
    
    function hideConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }
    
    // تحميل الرسائل من الخادم
    function loadMessages() {
        fetch('/get-messages?_=' + new Date().getTime()) // منع التخزين المؤقت
            .then(response => response.json())
            .then(messages => {
                chatMessages.innerHTML = '';
                messages.forEach(message => {
                    addMessageToChat(message);
                });
                scrollToBottom();
                
                // تحديث حالة القراءة للرسائل القديمة
                const otherUserMessages = document.querySelectorAll('.message.received');
                if (otherUserMessages.length > 0) {
                    socket.emit('messageRead', { currentUser });
                }
            })
            .catch(error => {
                console.error('Error loading messages:', error);
            });
    }
    
    // تحديث حالة القراءة
    function updateReadStatus() {
        document.querySelectorAll('.message.sent').forEach(msg => {
            const messageId = msg.dataset.id;
            const messageContent = msg.querySelector('.message-content');
            
            if (messageContent && messageContent.classList.contains('unread')) {
                messageContent.classList.remove('unread');
                messageContent.classList.add('read');
                
                const readStatus = msg.querySelector('.read-status');
                if (readStatus) {
                    readStatus.textContent = `✓ ${new Date().toLocaleString('en-US')}`;
                }
            }
        });
    }
    
    // بدء الاتصال
    initSocket();
    
    // البقاء مستيقظاً على الجوال (منع الشاشة من النوم)
    let wakeLock = null;
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock نشط');
                
                wakeLock.addEventListener('release', () => {
                    console.log('Wake Lock تم إطلاقه');
                });
            }
        } catch (err) {
            console.error('فشل في تفعيل Wake Lock:', err);
        }
    }
    
    // طلب Wake Lock عند التفاعل مع الصفحة
    document.addEventListener('click', function() {
        if (!wakeLock) {
            requestWakeLock();
        }
    });
    
    // إدارة visibility change لإعادة الاتصال عند العودة للتبويب
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && socket && !socket.connected) {
            // إعادة الاتصال إذا كان التبويب مرئياً وغير متصل
            socket.connect();
        }
    });
    
    // البقية كما كانت...
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    const typingText = document.getElementById('typingText');
    const clearChatBtn = document.getElementById('clearChat');
    const sendBtn = document.querySelector('.send-btn');
    const cooldownIndicator = document.getElementById('cooldownIndicator');
    const cooldownSeconds = document.getElementById('cooldownSeconds');
    
    // الحصول على معلمة المستخدم من URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentUser = urlParams.get('user');
    
    let typingTimer;
    const TYPING_TIMEOUT = 1000;
    
    // متغيرات للمؤقت بين الرسائل
    let lastMessageTime = 0;
    const MESSAGE_COOLDOWN = 1000;
    let isOnCooldown = false;
    let cooldownTimer = null;
    
    // معاينة الملف قبل الرفع
    fileInput.addEventListener('change', function(e) {
        filePreview.innerHTML = '';
        
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const fileItem = document.createElement('div');
            fileItem.className = 'file-preview-item';
            
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.maxWidth = '100px';
                    img.style.maxHeight = '100px';
                    fileItem.appendChild(img);
                }
                reader.readAsDataURL(file);
            } else {
                fileItem.textContent = file.name;
            }
            
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '✕';
            removeBtn.onclick = function() {
                fileInput.value = '';
                filePreview.innerHTML = '';
            };
            
            fileItem.prepend(removeBtn);
            filePreview.appendChild(fileItem);
        }
    });
    
    // إدارة المؤقت بين الرسائل
    function startCooldown() {
        isOnCooldown = true;
        lastMessageTime = Date.now();
        
        // تعطيل زر الإرسال
        sendBtn.disabled = true;
        sendBtn.textContent = 'انتظر...';
        sendBtn.style.opacity = '0.7';
        
        // إظهار مؤشر العد التنازلي
        cooldownIndicator.style.display = 'block';
        
        // تحديث العد التنازلي
        updateCooldown();
        
        cooldownTimer = setInterval(updateCooldown, 100);
    }
    
    function updateCooldown() {
        const elapsed = Date.now() - lastMessageTime;
        const remaining = MESSAGE_COOLDOWN - elapsed;
        
        if (remaining <= 0) {
            clearInterval(cooldownTimer);
            isOnCooldown = false;
            
            // تمكين زر الإرسال مرة أخرى
            sendBtn.disabled = false;
            sendBtn.textContent = 'إرسال';
            sendBtn.style.opacity = '1';
            
            // إخفاء مؤشر العد التنازلي
            cooldownIndicator.style.display = 'none';
        } else {
            // عرض الوقت المتبقي
            const secondsLeft = Math.ceil(remaining / 1000);
            sendBtn.textContent = `انتظر ${secondsLeft}...`;
            cooldownSeconds.textContent = secondsLeft;
        }
    }
    
    // التحقق مما إذا كان يمكن إرسال رسالة
    function canSendMessage() {
        if (isOnCooldown) {
            const elapsed = Date.now() - lastMessageTime;
            return elapsed >= MESSAGE_COOLDOWN;
        }
        return true;
    }
    
    // إرسال الرسالة
    messageForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // التحقق من المؤقت
        if (!canSendMessage()) {
            const elapsed = Date.now() - lastMessageTime;
            const remaining = Math.ceil((MESSAGE_COOLDOWN - elapsed) / 1000);
            alert(`يرجى الانتظار ${remaining} ثانية قبل إرسال رسالة جديدة`);
            return;
        }
        
        // التحقق من وجود محتوى للرسالة
        const messageText = messageInput.value.trim();
        const hasFile = fileInput.files.length > 0;
        
        if (!messageText && !hasFile) {
            alert('يرجى إدخال رسالة أو اختيار ملف للإرسال');
            return;
        }
        
        const formData = new FormData(this);
        formData.append('sender', currentUser);
        
        fetch('/send-message', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                messageInput.value = '';
                fileInput.value = '';
                filePreview.innerHTML = '';
                
                // بدء المؤقت بعد إرسال الرسالة
                startCooldown();
                
                // إعلام الآخرين أنني توقفت عن الكتابة
                socket.emit('userTyping', { user: currentUser, isTyping: false });
            } else {
                alert('فشل في إرسال الرسالة: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('حدث خطأ أثناء إرسال الرسالة');
        });
    });
    
    // الكتابة في حقل الرسالة
    messageInput.addEventListener('input', function() {
        socket.emit('userTyping', { user: currentUser, isTyping: true });
        
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('userTyping', { user: currentUser, isTyping: false });
        }, TYPING_TIMEOUT);
    });
    
    // مسح المحادثة
    clearChatBtn.addEventListener('click', function() {
        if (confirm('هل أنت متأكد من أنك تريد مسح جميع الرسائل؟')) {
            fetch('/clear-chat', {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    chatMessages.innerHTML = '';
                } else {
                    alert('فشل في مسح المحادثة');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('حدث خطأ أثناء مسح المحادثة');
            });
        }
    });
    
    // تحديث حالة التمرير لأسفل عند وصول رسائل جديدة
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // إضافة رسالة إلى الدردشة
    function addMessageToChat(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === currentUser ? 'sent' : 'received'}`;
        messageElement.dataset.id = message.id;
        
        let messageContent = `
            <div class="message-content ${message.read ? 'read' : 'unread'}">
        `;
        
        if (message.file) {
            messageContent += `
                <div class="file-message">
            `;
            
            if (message.file.mimetype.startsWith('image/')) {
                messageContent += `
                    <img src="/download/${message.file.filename}" alt="صورة مرسلة" class="file-preview">
                `;
            } else {
                messageContent += `
                    <div class="file-icon">${message.file.originalname}</div>
                `;
            }
            
            messageContent += `
                    <a href="/download/${message.file.filename}" download="${message.file.originalname}" class="download-btn">تنزيل</a>
                </div>
            `;
        }
        
        if (message.text) {
            messageContent += `<p>${message.text}</p>`;
        }
        
        messageContent += `
                <div class="message-meta">
                    <span class="timestamp">${new Date(message.timestamp).toLocaleString('en-US')}</span>
        `;
        
        if (message.sender === currentUser) {
            messageContent += `
                    <span class="read-status">${message.read ? '✓ ' + new Date(message.readTimestamp).toLocaleString('en-US') : '✓'}</span>
            `;
        }
        
        messageContent += `
                </div>
            </div>
        `;
        
        messageElement.innerHTML = messageContent;
        chatMessages.appendChild(messageElement);
    }
    
    // عند تحميل الصفحة، التمرير لأسفل
    scrollToBottom();
    
    // عند فتح النافذة، تحديث حالة القراءة للرسائل القديمة
    window.addEventListener('load', function() {
        const otherUserMessages = document.querySelectorAll('.message.received');
        if (otherUserMessages.length > 0) {
            socket.emit('messageRead', { currentUser });
        }
        
        // تحديث ألوان الرسائل بناءً على حالة القراءة
        document.querySelectorAll('.message.sent .message-content').forEach(content => {
            const readStatus = content.querySelector('.read-status');
            if (readStatus && readStatus.textContent !== '✓') {
                content.classList.remove('unread');
                content.classList.add('read');
            }
        });
    });
    
    // تسجيل Service Worker لإدارة التخزين المؤقت
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/js/sw.js')
                .then(function(registration) {
                    console.log('ServiceWorker registered with scope: ', registration.scope);
                })
                .catch(function(error) {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });
    }
});