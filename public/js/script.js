document.addEventListener('DOMContentLoaded', function () {
    let typingTimer;
    const TYPING_TIMEOUT = 1000;

    let lastMessageTime = 0;
    const MESSAGE_COOLDOWN = 1000;
    let isOnCooldown = false;
    let cooldownTimer = null;

    function canSendMessage() {
    if (isOnCooldown) {
        const elapsed = Date.now() - lastMessageTime;
        return elapsed >= MESSAGE_COOLDOWN;
    }
    return true;
    }
    // ===== إعداد الـ Cooldown =====


function startCooldown() {
    isOnCooldown = true;
    lastMessageTime = Date.now();
    sendBtn.disabled = true;
    if (cooldownIndicator) cooldownIndicator.style.display = 'flex';
    updateCooldown();
    cooldownTimer = setInterval(updateCooldown, 100);
}

function updateCooldown() {
    const elapsed = Date.now() - lastMessageTime;
    const remaining = MESSAGE_COOLDOWN - elapsed;
    if (remaining <= 0) {
        clearInterval(cooldownTimer);
        isOnCooldown = false;
        sendBtn.disabled = false;
        if (cooldownIndicator) cooldownIndicator.style.display = 'none';
    } else {
        if (cooldownSeconds) cooldownSeconds.textContent = Math.ceil(remaining / 1000);
    }
}


    
    // ===== إعداد Socket.io =====
    let socket;
    const MAX_RECONNECT_ATTEMPTS = 10;
    let reconnectAttempts = 0;

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
        socket.on('connect', () => {
            console.log('✅ متصل بالخادم');
            reconnectAttempts = 0;
            hideConnectionStatus();
        });

        socket.on('disconnect', reason => {
            console.log('❌ انقطع الاتصال:', reason);
            showConnectionStatus('انقطع الاتصال، جاري إعادة المحاولة...');
        });

        socket.on('reconnect_attempt', attempt => {
            reconnectAttempts = attempt;
            showConnectionStatus(`محاولة إعادة الاتصال (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`);
        });

        socket.on('reconnect', () => {
            console.log('🔄 أعيد الاتصال بنجاح');
            hideConnectionStatus();
        });

        socket.on('reconnect_failed', () => {
            showConnectionStatus('فشل الاتصال، يرجى تحديث الصفحة', true);
        });

        // استقبال رسالة جديدة
        socket.on('newMessage', message => {
            // إذا كانت الرسالة تخص المحادثة الحالية فقط
            if (
                (message.sender === currentUser && message.recipient === currentRecipient) ||
                (message.sender === currentRecipient && message.recipient === currentUser)
            ) {
                addMessageToChat(message);
                scrollToBottom();

                if (message.sender !== currentUser) {
                    socket.emit('messageRead', { currentUser });
                }
            }
        });

        // تحديث حالة القراءة
        socket.on('messagesRead', data => {
            if (data.reader !== currentUser) updateReadStatus();
        });

        // مؤشر الكتابة
        socket.on('userTyping', data => {
            if (data.user !== currentUser) {
                typingText.textContent = data.isTyping ? `${data.user} يكتب الآن...` : '';
                typingIndicator.style.display = data.isTyping ? 'block' : 'none';
            }
        });

        // مسح المحادثة
        socket.on('chatCleared', () => {
            chatMessages.innerHTML = '';
        });
    }

    // ===== عناصر DOM =====
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
    const recipientSelect = document.getElementById('recipient');
    const currentUser = document.querySelector('.current-user')?.textContent || '';

    // نقرأ المستلم الحالي من الرابط
    const urlParams = new URLSearchParams(window.location.search);
    const currentRecipient = urlParams.get('recipient');

    // ===== وظائف مساعدة =====
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
        if (statusElement) statusElement.style.display = 'none';
    }

    // تحديث حالة القراءة
    function updateReadStatus() {
        document.querySelectorAll('.message.sent').forEach(msg => {
            const messageContent = msg.querySelector('.message-content');
            if (messageContent && messageContent.classList.contains('unread')) {
                messageContent.classList.remove('unread');
                messageContent.classList.add('read');
                const readStatus = msg.querySelector('.read-status');
                if (readStatus) {
                    readStatus.textContent = `✓ ${new Date().toLocaleString('ar-EG')}`;
                }
            }
        });
    }

    // بدء الاتصال
    initSocket();

    // ===== تحميل الرسائل من السيرفر حسب الرابط =====
    function loadMessages() {
        chatMessages.innerHTML = '';
        if (!currentRecipient) return;

        fetch(`/get-messages?recipient=${currentRecipient}`)
            .then(res => res.json())
            .then(msgs => {
                msgs.forEach(m => addMessageToChat(m));
                scrollToBottom();
            })
            .catch(err => console.error('خطأ في تحميل الرسائل:', err));
    }

    loadMessages();
        // ===== التمرير لأسفل =====
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ===== إضافة رسالة إلى واجهة الدردشة =====
    function addMessageToChat(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === currentUser ? 'sent' : 'received'}`;
        messageElement.dataset.id = message.id;

        let messageContent = `<div class="message-content ${message.read ? 'read' : 'unread'}">`;

        if (message.file) {
            messageContent += `<div class="file-message">`;
            if (message.file.mimetype.startsWith('image/')) {
                messageContent += `<img src="/download/${message.file.filename}" alt="صورة مرسلة" class="file-preview">`;
            } else {
                messageContent += `<div class="file-icon">${message.file.originalname}</div>`;
            }
            messageContent += `<a href="/download/${message.file.filename}" download="${message.file.originalname}" class="download-btn">تنزيل</a>`;
            messageContent += `</div>`;
        }

        if (message.text) {
            messageContent += `<p>${message.text}</p>`;
        }

        messageContent += `
            <div class="message-meta">
                <span class="timestamp">${new Date(message.timestamp).toLocaleString('ar-EG')}</span>
        `;

        if (message.sender === currentUser) {
            messageContent += `
                <span class="read-status">
                    ${message.read ? '✓ ' + new Date(message.readTimestamp).toLocaleString('ar-EG') : '✓'}
                </span>
            `;
        }

        messageContent += `</div></div>`;
        messageElement.innerHTML = messageContent;
        chatMessages.appendChild(messageElement);
    }

    // ===== إرسال الرسالة =====
    messageForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!canSendMessage()) return;

        const messageText = messageInput.value.trim();
        const hasFile = fileInput.files.length > 0;
        if (!messageText && !hasFile) {
            alert('يرجى إدخال رسالة أو اختيار ملف للإرسال');
            return;
        }

        const formData = new FormData(this);
        formData.append('sender', currentUser);
        // formData.append('recipient', currentRecipient);

        fetch('/send-message', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    messageInput.value = '';
                    fileInput.value = '';
                    filePreview.innerHTML = '';
                    startCooldown();
                    socket.emit('userTyping', { user: currentUser, isTyping: false });
                    // addMessageToChat(data.message); // أضف الرسالة مباشرة
                    scrollToBottom();
                } else {
                    alert('فشل في إرسال الرسالة: ' + data.error);
                }
            })
            .catch(err => {
                console.error('Error:', err);
                alert('حدث خطأ أثناء إرسال الرسالة');
            });
    });

    // ===== مؤشر الكتابة =====
    messageInput.addEventListener('input', function () {
        socket.emit('userTyping', { user: currentUser, isTyping: true });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('userTyping', { user: currentUser, isTyping: false });
        }, TYPING_TIMEOUT);
    });

    // ===== مسح المحادثة =====
    clearChatBtn.addEventListener('click', function () {
        if (confirm('هل أنت متأكد من أنك تريد مسح جميع الرسائل؟')) {
            fetch(`/clear-chat?recipient=${currentRecipient}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        chatMessages.innerHTML = '';
                    } else {
                        alert('فشل في مسح المحادثة');
                    }
                })
                .catch(err => {
                    console.error('Error:', err);
                    alert('حدث خطأ أثناء مسح المحادثة');
                });
        }
    });

    // ===== عند تغيير المستلم من القائمة =====
    recipientSelect.addEventListener('change', function () {
        const selected = recipientSelect.value;
        const url = new URL(window.location.href);
        url.searchParams.set('recipient', selected);
        window.location.href = url.toString(); // إعادة تحميل الصفحة بالمحادثة الجديدة
    });

    // ===== عند تحميل الصفحة =====
    window.addEventListener('load', function () {
        scrollToBottom();

        const otherUserMessages = document.querySelectorAll('.message.received');
        if (otherUserMessages.length > 0) {
            socket.emit('messageRead', { currentUser });
        }

        document.querySelectorAll('.message.sent .message-content').forEach(content => {
            const readStatus = content.querySelector('.read-status');
            if (readStatus && readStatus.textContent !== '✓') {
                content.classList.remove('unread');
                content.classList.add('read');
            }
        });
    });
});