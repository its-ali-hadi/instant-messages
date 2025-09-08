document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    const typingText = document.getElementById('typingText');
    const clearChatBtn = document.getElementById('clearChat');
    const sendBtn = document.querySelector('.send-btn');
    
    // الحصول على معلمة المستخدم من URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentUser = urlParams.get('user');
    
    let typingTimer;
    const TYPING_TIMEOUT = 1000; // 1 ثانية
    
    // متغيرات للمؤقت بين الرسائل
    let lastMessageTime = 0;
    const MESSAGE_COOLDOWN = 1500; // 1 ثانية بين الرسائل
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
        } else {
            // عرض الوقت المتبقي
            const secondsLeft = Math.ceil(remaining / 1000);
            sendBtn.textContent = `انتظر ${secondsLeft}...`;
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
    
    // التعامل مع الرسائل الجديدة من Socket.io
    socket.on('newMessage', function(message) {
        addMessageToChat(message);
        scrollToBottom();
        
        // إذا كانت الرسالة من المستخدم الآخر، قم بتحديث حالة القراءة
        if (message.sender !== currentUser) {
            socket.emit('messageRead', { currentUser });
        }
    });
    
    // التعامل مع تحديثات حالة القراءة
    socket.on('messagesRead', function(data) {
        if (data.reader !== currentUser) {
            document.querySelectorAll('.message.sent').forEach(msg => {
                const messageId = msg.dataset.id;
                const messageContent = msg.querySelector('.message-content');
                
                if (messageContent && messageContent.classList.contains('unread')) {
                    // تغيير اللون إلى الأخضر للإشارة إلى أن الرسالة مقروءة
                    messageContent.classList.remove('unread');
                    messageContent.classList.add('read');
                    
                    // تحديث وقت القراءة إذا كان متوفراً في البيانات
                    const readStatus = msg.querySelector('.read-status');
                    if (readStatus) {
                        readStatus.textContent = `✓ ${new Date().toLocaleString('en-US')}`;
                    }
                }
            });
        }
    });
    
    // التعامل مع مؤشر الكتابة
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
    
    // التعامل مع مسح المحادثة
    socket.on('chatCleared', function() {
        chatMessages.innerHTML = '';
    });
    
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
});

// بعد تعريف المتغيرات في الأعلى، أضف:
const cooldownIndicator = document.getElementById('cooldownIndicator');
const cooldownSeconds = document.getElementById('cooldownSeconds');

// في دالة startCooldown، أضف:
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

// في دالة updateCooldown، عدل:
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