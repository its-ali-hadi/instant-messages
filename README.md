# 🗨️ Realtime Secure Chat Application

A robust, realtime messaging platform built with Node.js and Socket.io. This application focuses on secure communication, enabling users to chat in private rooms with file sharing capabilities, role-based access control, and IP-based security monitoring.

## 🚀 Features

### Core Messaging
- **Realtime Chat:** Instant messaging using Socket.io (WebSockets).
- **Private Conversations:** Users can only chat with specifically allowed contacts (`allowed` list system).
- **File Sharing:** Support for images, PDFs, Word documents, and text files.
- **Read Receipts:** Realtime "Read" status indicators for messages.
- **Typing Indicators:** See when the other user is typing.

### Security & Auth
- **JWT Authentication:** Secure stateless session management using JSON Web Tokens.
- **Password Hashing:** Passwords are hashed using `bcrypt` before storage.
- **IP Blocking / Blacklisting:** Automatic IP banning after excessive failed login attempts (Brute-force protection).
- **Role-Based Access:** Special `admin` user capabilities (e.g., creating new users).
- **File Type Validation:** Strict mime-type checking for file uploads to prevent malicious executions.
- **Anti-Caching:** Headers configured to prevent browser caching of sensitive chat pages.
- **Data Persistence:** Lightweight, filesystem-based storage (JSON files) for portability and zero-db setup.

---

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Realtime Engine:** Socket.io
- **Security:** `bcrypt`, `jsonwebtoken`, `helmet` (implied practices), `cookie-parser`
- **File Handling:** `multer` (for uploads), `fs` (for data storage)

### Frontend
- **Template Engine:** EJS (Embedded JavaScript)
- **Styling:** Custom CSS (located in `public/css`)
- **Scripting:** Vanilla JavaScript with Socket.io Client
- **Icons:** FontAwesome (inferred) / Custom assets

### Database / Storage
- **JSON Files:**
  - `users.json`: User credentials and ACLs.
  - `messages.json`: Chat history.
  - `backlist.json`: Banned IP addresses.

---

## 🏗️ Architecture

The project follows a **Monolithic MVC** (Model-View-Controller) architecture, though the "Model" layer is a direct interface with the local filesystem (`./data/*.json`).

### Folder Structure
```
├── app.js               # Main application entry point (Server, Routes, Socket logic)
├── data/                # Data storage (JSON databases)
│   ├── users.json       # User data
│   ├── messages.json    # Chat history
│   └── backlist.json    # Security blacklist
├── public/              # Static assets
│   ├── css/             # Stylesheets
│   ├── js/              # Client-side scripts
│   └── uploads/         # Uploaded files (Images/Docs)
├── views/               # Frontend templates (EJS)
│   ├── index.ejs        # Login Page
│   ├── choose.ejs       # Recipient Selection
│   └── chat.ejs         # Main Chat Interface
└── .env                 # Environment Configuration
```

---

## ⚡ Installation & Setup

### Prerequisites
- Node.js (v14+ recommended)
- npm (Node Package Manager)

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/its-ali-hadi/instant-messages.git
   cd instant-messages
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory:
   ```env
   # .env
   JWT_SECRET=your_super_secret_key_here
   PORT=3000
   ```

4. **Initialize Data Directory:**
   Ensure the `data` folder exists. You can copy the example users file to start:
   ```bash
   mkdir -p data
   mkder -p uploads
   cp users.example.json data/users.json
   ```
   *(Note: The app automatically creates `data` and `uploads` folders on start if they don't exist)*

5. **Run the Application:**

   **Development (with auto-reload):**
   ```bash
   npm run dev
   ```

   **Production:**
   ```bash
   npm start
   ```

6. **Access the App:**
   Open your browser and navigate to `http://localhost:3000`.

---

## 📡 API Endpoints

### Authentication
- `POST /login`: Authenticate user using username/password.
- `GET /logout`: Clear session and redirect to login.

### Chat & Messaging
- `GET /chat`: Main chat interface (requires auth).
- `POST /send-message`: Send a text message and/or file.
- `GET /get-messages`: Retrieve conversation history with a specific recipient.
- `DELETE /clear-chat`: Admin/User functionality to wipe chat history.

### User Management
- `POST /create-user`: **(Admin Only)** Create a new user and define their allowed contacts.

### System
- `GET /health`: Health check endpoint.

---

## 🔒 Security Notes for Production

- **HTTPS:** This application is currently set up for HTTP. For production, **SSL/HTTPS is mandatory** to secure the JWT tokens transmitted in cookies.
- **Storage:** The JSON-based storage is excellent for portability but not designed for high concurrency or massive scaling. For >1000 concurrent users, migrate `loadUsers` and `saveUsers` to a database like MongoDB or PostgreSQL.
- **Secret Keys:** Ensure `JWT_SECRET` is complex and strictly kept secret.
- **Upload Directory:** Ensure the `uploads/` directory has proper write permissions but NO execute permissions to prevent remote code execution via file uploads.

---

## 👥 Usage Guide (Default Users)

If you used the `users.example.json`:

| Username | Password | Role | Allowed Contacts |
|----------|----------|------|------------------|
| **admin**| admin | Admin| None (Manager)   |
| **user1**| user1 | User | user2, user3, user4|
| **user2**| user2 | User | user1            |

*Note: You will need to reset passwords manually in `users.json` or use the `create-user` endpoint if you have a valid admin session, as the example file contains pre-hashed bcrypt strings that you might not know the plain text for.*
