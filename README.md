# 🖥️ IT Helpdesk AI — Hackathon Project

AI-powered IT Support Bot with smart ticket management, SLA tracking, knowledge base,
voice-to-text, message scheduling, drag-to-reorder, smart replies, and PDF export.

**Category:** Support Chat Bot + Open Innovation
**Build type covers:** AI Chatbot · Automation System · Smart AI Tool · Customer Support ·
Business Productivity · AI Workflow Platform · Intelligent Assistant System

---

## ✅ VERIFIED — Build Status
- Backend  : ✅ Starts (🎫 Ticket system enabled)
- Frontend : ✅ Builds (zero errors, 498+ modules)
- Database : ✅ nedb (pure JS, no setup)

---

## ⚡ HOW TO RUN

### Terminal 1 — Backend
```bash
cd smartchat-ai/backend
npm install
cp .env.example .env
node server.js
```
✅ See: `🖥️ IT Helpdesk AI → http://localhost:3001`

### Terminal 2 — Frontend
```bash
cd smartchat-ai/frontend
npm install
npm run dev
```
✅ See: `Local: http://localhost:5173`

### Open the App
Go to **http://localhost:5173** in your browser.

**To test:** Open 2 tabs
- Tab 1 → enter `alice` (user raising a ticket)
- Tab 2 → enter `agent_john` (IT agent handling tickets)
- In Tab 1 → click agent_john → start support chat

---

## 🔑 API Keys (Optional — runs in demo without them)

| Key | Where to get | Powers |
|-----|-------------|--------|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Real smart replies, AI summarize, emotion detection, auto to-dos, AI chat |
| `OPENAI_API_KEY` | platform.openai.com | Real voice transcription (Whisper) |

Add to `backend/.env` and restart backend.

---

## 🚀 ALL FEATURES

### 🎫 IT Helpdesk Features
| Feature | How to use |
|---------|-----------|
| **Raise Ticket** | Click 🎫 button in chat → describe issue → KB checks for instant fix → ticket created with TKT-XXXX |
| **Knowledge Base** | Type an issue → auto-checks 9 common IT problems → instant answer before creating ticket |
| **Auto Category** | AI detects: Hardware / Software / Network / Access / Email / Printer / Security / Performance |
| **Auto Priority** | AI detects: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low based on issue severity |
| **SLA Bar** | Live countdown bar in chat header — shows time remaining for resolution |
| **SLA Colors** | Green > 50% · Yellow 20-50% · Red < 20% · Flashing = SLA breached |
| **Auto Escalation** | If user sends angry/urgent messages, ticket priority auto-upgrades to Critical |
| **Resolve Ticket** | Click ✅ Resolve in header → add resolution note → ticket marked resolved |
| **Ticket Dashboard** | Click 🎫 in sidebar → see all tickets with status, SLA, category filters |
| **Agent Role** | Login with "agent_" prefix (e.g. agent_john) to show as 🎧 IT Agent |

### 💬 Smart Messaging Features (Innovation Layer)
| Feature | How to use |
|---------|-----------|
| **Scheduled Messages** | Click ⏰ → type message → pick time (5 min, 1 hr, tonight 9 PM, tomorrow 8 AM, etc.) |
| **Drag to Reorder** | Send messages → drag ⠿ handle → reorder within 5 minutes before locking |
| **Voice Ticket Logging** | Hold 🎤 → speak your issue → sends as audio message |
| **Voice Transcription** | Click "📝 Read as text" on audio → transcribes in EN/Tamil/Tanglish |
| **Smart Replies** | Auto-suggested replies appear after each message — tap to send |
| **Emotion Detection** | AI adds emoji badge: 😊😠🚨😢🎉 on messages based on mood |
| **Auto To-Do Extraction** | Commitments like "I'll fix by Friday" → auto-added to Action Items |
| **Conversation Summarizer** | Click "📝 Summarize" → 3 bullet points of full ticket thread |
| **IT AI Chat** | Click 🤖 in sidebar → ask any IT question → AI troubleshoots step by step |
| **PDF Export** | Click "📄 PDF" → downloads full ticket conversation with ticket ID, priority, timestamps |
| **Language Support** | Switch EN / தமிழ் / Tanglish — all AI features respond in chosen language |

---

## 📁 Project Structure
```
smartchat-ai/
├── backend/
│   ├── server.js       ← Express + Socket.io + all routes (tickets, KB, AI, schedule)
│   ├── data/           ← nedb files (auto-created): users, convs, msgs, todos, tickets
│   ├── uploads/        ← Voice message audio files
│   ├── .env            ← API keys
│   └── package.json
├── frontend/src/
│   ├── App.jsx         ← Root layout + socket events (inc. ticket events)
│   ├── App.css         ← All styles (dark theme + helpdesk styles)
│   ├── store.js        ← Zustand state (messages, tickets, AI, todos)
│   └── components/
│       ├── Login.jsx         ← IT Helpdesk branded login
│       ├── Sidebar.jsx       ← Tickets btn + AI Chat + To-Dos + Contacts
│       ├── ChatWindow.jsx    ← Main chat + SLA bar + ticket banner + all features
│       ├── TicketPanel.jsx   ← 3-step raise ticket (KB → form → success)
│       ├── TicketDashboard.jsx ← My tickets list with SLA countdown + status
│       ├── AIChat.jsx        ← IT AI assistant with 10 quick IT prompts
│       └── ScheduleModal.jsx ← Schedule with local timezone + shortcuts
├── docker-compose.yml
└── README.md
```

---

## 🛠 Tech Stack
| Layer | Tech | Purpose |
|-------|------|---------|
| Frontend | React + Vite | UI |
| State | Zustand | Global state |
| Drag & Drop | @dnd-kit | Message reorder |
| PDF | jsPDF | Ticket report export |
| Realtime | Socket.io | Instant messages + ticket events |
| Backend | Node.js + Express | REST + WebSocket |
| Database | nedb-promises | Zero-config file DB |
| Scheduling | node-schedule | Cron-based message delivery |
| AI (Replies/Summary/KB) | Claude API | Smart replies, summarize, AI chat |
| Voice | OpenAI Whisper | Voice → text |
| Tamil | Claude API | Tamil/Tanglish translation |

---

## 🐛 Troubleshooting
| Problem | Fix |
|---------|-----|
| Cannot connect | Run `node server.js` in backend/ first |
| npm install fails | Install Node.js 18+: `node --version` |
| AI features show demo | Add `ANTHROPIC_API_KEY` to `backend/.env`, restart |
| Voice shows demo text | Add `OPENAI_API_KEY` to `backend/.env`, restart |
| No contacts showing | Open 2nd tab at localhost:5173 with different username |
| Ticket not appearing | Refresh the page; check backend terminal for errors |

---

## 🏆 Hackathon
- **Category:** Support Chat Bot + Open Innovation
- **Unique:** First messaging app with drag-to-reorder + IT ticket system + Tamil AI support
