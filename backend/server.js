require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const Datastore  = require('nedb-promises');
const multer     = require('multer');
const schedule   = require('node-schedule');
const Anthropic  = require('@anthropic-ai/sdk');
const OpenAI     = require('openai');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','DELETE','PATCH'] } });

// ── DATABASE ─────────────────────────────────────────────────────────────────
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = {
  users:   Datastore.create({ filename: path.join(dbDir,'users.db'),   autoload: true }),
  convs:   Datastore.create({ filename: path.join(dbDir,'convs.db'),   autoload: true }),
  msgs:    Datastore.create({ filename: path.join(dbDir,'msgs.db'),    autoload: true }),
  todos:   Datastore.create({ filename: path.join(dbDir,'todos.db'),   autoload: true }),
  tickets: Datastore.create({ filename: path.join(dbDir,'tickets.db'), autoload: true }),
};

// ── AI CLIENTS ────────────────────────────────────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai    = process.env.OPENAI_API_KEY    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })       : null;

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_,__,cb) => cb(null, uploadDir),
    filename:    (_,f,cb)  => cb(null, `${uuidv4()}${path.extname(f.originalname||'.webm')}`)
  }),
  limits: { fileSize: 25*1024*1024 }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadDir));

// ── HELPERS ───────────────────────────────────────────────────────────────────
const genId       = () => uuidv4();
const scheduledJobs = {};
const pendingMsgs   = {};

const SLA_HOURS = { critical: 1, high: 4, medium: 8, low: 24 };
const PRIORITY_COLOR = { critical:'🔴', high:'🟠', medium:'🟡', low:'🟢' };

async function getUserMap() {
  const users = await db.users.find({});
  return Object.fromEntries(users.map(u => [u._id, u]));
}

// Generate ticket number TKT-0001
async function genTicketNo() {
  const all = await db.tickets.find({});
  return `TKT-${String(all.length + 1).padStart(4, '0')}`;
}

function markDelivered(convId, msgId) {
  db.msgs.update({ _id: msgId }, { $set: { status: 'delivered' } }).catch(()=>{});
  pendingMsgs[convId]?.delete(msgId);
  io.to(convId).emit('message-delivered', { msgId });
}

// ── IT HELPDESK: KNOWLEDGE BASE ───────────────────────────────────────────────
const KNOWLEDGE_BASE = [
  { keywords: ['password','forgot','reset','locked','login','cant login'], category: 'Access/Password',
    answer: '🔐 **Password Reset**: Visit the IT Portal at company.com/it-portal and click "Reset Password". You\'ll receive a reset link via your registered mobile number. If still locked, call IT Helpdesk: Ext. 1234.' },
  { keywords: ['wifi','internet','network','cannot connect','no connection','offline'],  category: 'Network',
    answer: '🌐 **Network Issue**: 1) Turn airplane mode OFF and back ON. 2) Forget the WiFi network and reconnect. 3) Restart your device. If issue persists, check if others are affected — it may be an outage. We\'ll create a ticket for you.' },
  { keywords: ['slow','hang','freeze','performance','lagging','not responding'], category: 'Performance',
    answer: '💻 **Slow Performance**: 1) Restart your computer. 2) Close unused applications. 3) Clear browser cache (Ctrl+Shift+Delete). 4) Run Disk Cleanup. If still slow after restart, we\'ll escalate to hardware diagnostics.' },
  { keywords: ['install','software','application','app','download'], category: 'Software',
    answer: '📦 **Software Installation**: Raise a Software Request through IT Portal → Software Requests. Standard software is approved within 4 business hours. For urgent needs, contact your manager to approve priority install.' },
  { keywords: ['email','outlook','gmail','mail','inbox'], category: 'Email',
    answer: '📧 **Email Issue**: 1) Check your internet connection. 2) Restart Outlook/Gmail app. 3) Check mailbox size — delete old emails if full. 4) If sending fails, check SMTP settings. Need help? We\'ll raise a ticket.' },
  { keywords: ['printer','print','scan','scanner','xerox'], category: 'Printer',
    answer: '🖨️ **Printer Issue**: 1) Check printer is ON and paper is loaded. 2) Clear print queue (Control Panel → Devices → Printer → See what\'s printing → Cancel all). 3) Restart the printer. 4) Reinstall printer driver if needed.' },
  { keywords: ['vpn','remote','access','connect from home'], category: 'Network',
    answer: '🔗 **VPN Access**: Download the company VPN client from IT Portal. Use your company credentials. If connection fails, check your internet first, then contact IT with your employee ID.' },
  { keywords: ['virus','malware','hacked','suspicious','phishing'], category: 'Security',
    answer: '🚨 **SECURITY ALERT — HIGH PRIORITY**: Do NOT click any suspicious links. Disconnect from the network immediately. Call IT Security: Ext. 9999 (24/7). Do not restart your computer — preserve evidence.' },
  { keywords: ['laptop','battery','charger','power','screen','display','keyboard','mouse'], category: 'Hardware',
    answer: '🖥️ **Hardware Issue**: For physical damage or device failure, we\'ll dispatch a hardware technician. Expected response: 2-4 hours for Critical, 1 business day for others. Please describe the exact issue.' },
];

function searchKnowledgeBase(query) {
  const lower = query.toLowerCase();
  for (const item of KNOWLEDGE_BASE) {
    if (item.keywords.some(k => lower.includes(k))) return item;
  }
  return null;
}

// ── AI: AUTO DETECT CATEGORY + PRIORITY ──────────────────────────────────────
async function detectTicketMeta(description) {
  if (!anthropic) {
    const kb = searchKnowledgeBase(description);
    return { category: kb?.category || 'Other', priority: 'medium', confidence: 'demo' };
  }
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Analyze this IT support request: "${description}"
Return ONLY valid JSON:
{
  "category": "Hardware|Software|Network|Access/Password|Email|Printer|Security|Performance|Other",
  "priority": "critical|high|medium|low",
  "reason": "one sentence why"
}
Priority rules: critical=system down/security breach, high=major issue affecting work, medium=degraded, low=minor/cosmetic`
      }]
    });
    return JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
  } catch { return { category: 'Other', priority: 'medium', reason: 'Could not auto-detect' }; }
}

// ── AI: BACKGROUND MESSAGE ANALYSIS ──────────────────────────────────────────
async function analyzeMessage(msgId, content, convId, senderId) {
  if (!anthropic || !content || content.length < 3) return;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Analyze this IT support chat message: "${content}"
Return ONLY valid JSON:
{"sentiment":"happy|neutral|sad|angry|urgent|confused|excited","todos":[{"task":"string","deadline":"string or null"}]}
Only add todos for clear action items. Empty array otherwise.`
      }]
    });
    const result = JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
    await db.msgs.update({ _id: msgId }, { $set: { sentiment: result.sentiment || 'neutral' } });

    // Auto-escalate ticket if user is angry/urgent
    if (['angry','urgent'].includes(result.sentiment)) {
      const msg = await db.msgs.findOne({ _id: msgId });
      if (msg?.conversationId) {
        const ticket = await db.tickets.findOne({ conversationId: msg.conversationId, status: { $ne: 'closed' } });
        if (ticket && ticket.priority !== 'critical') {
          await db.tickets.update({ _id: ticket._id }, { $set: { priority: 'critical', escalated: true, updatedAt: new Date().toISOString() } });
          io.to(msg.conversationId).emit('ticket-escalated', { ticketId: ticket._id, priority: 'critical' });
        }
      }
    }

    const savedTodos = [];
    for (const todo of (result.todos||[])) {
      if (todo.task) {
        const t = { _id: genId(), messageId: msgId, userId: senderId, task: todo.task, deadline: todo.deadline||null, done: false, createdAt: new Date().toISOString() };
        await db.todos.insert(t);
        savedTodos.push(t);
      }
    }
    io.to(convId).emit('message-analyzed', { msgId, sentiment: result.sentiment||'neutral', todos: savedTodos });
  } catch(e) { console.error('Analysis error:', e.message); }
}

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('join', ({ userId, conversationId }) => {
    socket.join(conversationId);
    socket.data.userId = userId;
    socket.data.conversationId = conversationId;
  });

  socket.on('send-message', async ({ conversationId, senderId, content, type='text', audioUrl=null }) => {
    const all    = await db.msgs.find({ conversationId });
    const maxSeq = all.reduce((m,r) => Math.max(m, r.sequenceNum||0), 0);
    const msg = { _id: genId(), conversationId, senderId, content, type, audioUrl, sentiment:'neutral', sequenceNum: maxSeq+1, status:'pending', createdAt: new Date().toISOString() };
    await db.msgs.insert(msg);
    if (!pendingMsgs[conversationId]) pendingMsgs[conversationId] = new Set();
    pendingMsgs[conversationId].add(msg._id);
    const user = await db.users.findOne({ _id: senderId });
    io.to(conversationId).emit('message', { ...msg, username: user?.username, avatar: user?.avatar });
    setTimeout(() => markDelivered(conversationId, msg._id), 5*60*1000);
    if (type === 'text') analyzeMessage(msg._id, content, conversationId, senderId);
  });

  socket.on('reorder-messages', async ({ conversationId, orderedIds }) => {
    const pending = pendingMsgs[conversationId] || new Set();
    const valid   = orderedIds.filter(id => pending.has(id));
    if (!valid.length) return;
    for (let i = 0; i < valid.length; i++) await db.msgs.update({ _id: valid[i] }, { $set: { sequenceNum: i+1 } });
    io.to(conversationId).emit('messages-reordered', { orderedIds: valid });
  });

  socket.on('typing', ({ conversationId, userId, isTyping }) => socket.to(conversationId).emit('typing', { userId, isTyping }));
});

// ── USER ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/users', async (req, res) => {
  const username = (req.body.username||'').trim().toLowerCase();
  if (username.length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' });
  const COLORS = ['#378ADD','#1D9E75','#D85A30','#D4537E','#7F77DD','#E6954A'];
  let user = await db.users.findOne({ username });
  if (!user) {
    user = { _id: genId(), username, avatar: COLORS[Math.floor(Math.random()*COLORS.length)], role: username.startsWith('agent') ? 'agent' : 'user', createdAt: new Date().toISOString() };
    await db.users.insert(user);
  }
  res.json(user);
});
app.get('/api/users', async (_,res) => res.json(await db.users.find({})));

// ── CONVERSATION ROUTES ───────────────────────────────────────────────────────
app.post('/api/conversations', async (req, res) => {
  const { user1Id, user2Id } = req.body;
  let conv = await db.convs.findOne({ $or: [{ user1Id, user2Id },{ user1Id: user2Id, user2Id: user1Id }] });
  if (!conv) {
    conv = { _id: genId(), user1Id, user2Id, createdAt: new Date().toISOString() };
    await db.convs.insert(conv);
  }
  res.json(conv);
});
app.get('/api/messages/:conversationId', async (req, res) => {
  const msgs    = await db.msgs.find({ conversationId: req.params.conversationId });
  const userMap = await getUserMap();
  msgs.sort((a,b) => (a.sequenceNum||0)-(b.sequenceNum||0));
  res.json(msgs.map(m => ({ ...m, username: userMap[m.senderId]?.username||'user', avatar: userMap[m.senderId]?.avatar||'#888' })));
});

// ── SCHEDULE ROUTES ───────────────────────────────────────────────────────────
const toLocalISO = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
app.post('/api/schedule', async (req, res) => {
  const { conversationId, senderId, content, scheduledAt } = req.body;
  const sendTime = new Date(scheduledAt);
  if (sendTime <= new Date()) return res.status(400).json({ error: 'Time must be in the future' });
  const all    = await db.msgs.find({ conversationId });
  const maxSeq = all.reduce((m,r) => Math.max(m, r.sequenceNum||0), 0);
  const msg    = { _id: genId(), conversationId, senderId, content, type:'scheduled', sequenceNum: maxSeq+1, status:'scheduled', scheduledAt, createdAt: new Date().toISOString() };
  await db.msgs.insert(msg);
  const user = await db.users.findOne({ _id: senderId });
  io.to(conversationId).emit('message', { ...msg, username: user?.username, avatar: user?.avatar });
  const job = schedule.scheduleJob(sendTime, async () => {
    const now = new Date().toISOString();
    await db.msgs.update({ _id: msg._id }, { $set: { status:'delivered', type:'text', createdAt: now } });
    const u = await db.users.findOne({ _id: senderId });
    io.to(conversationId).emit('message', { ...msg, type:'text', status:'delivered', createdAt: now, username: u?.username, avatar: u?.avatar });
    io.to(conversationId).emit('message-delivered', { msgId: msg._id });
    delete scheduledJobs[msg._id];
  });
  scheduledJobs[msg._id] = job;
  res.json({ success: true, msgId: msg._id, scheduledAt });
});
app.delete('/api/schedule/:msgId', async (req, res) => {
  if (scheduledJobs[req.params.msgId]) { scheduledJobs[req.params.msgId].cancel(); delete scheduledJobs[req.params.msgId]; }
  await db.msgs.remove({ _id: req.params.msgId }, {});
  res.json({ success: true });
});

// ── AUDIO + TRANSCRIPTION ─────────────────────────────────────────────────────
app.post('/api/audio', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ audioUrl: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` });
});
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const { language='english', msgId } = req.body;
  if (!openai) {
    const demos = {
      english:  'My laptop screen went black and I cannot turn it on. I have an urgent presentation in 2 hours.',
      tamil:    'என் மடிக்கணினி திரை கறுப்பாகிவிட்டது, திரும்ப திறக்க முடியவில்லை. 2 மணி நேரத்தில் முக்கியமான presentation உள்ளது.',
      tanglish: 'En laptop screen black aagiduchi, tirumba on aagala. 2 manikku important presentation iruku da.'
    };
    const transcript = demos[language]||demos.english;
    if (msgId) await db.msgs.update({ _id: msgId }, { $set: { transcript } });
    if (req.file) fs.unlink(req.file.path, ()=>{});
    return res.json({ transcript });
  }
  try {
    const t = await openai.audio.transcriptions.create({ file: fs.createReadStream(req.file.path), model:'whisper-1', language: language==='tamil'?'ta':'en' });
    let transcript = t.text;
    if ((language==='tamil'||language==='tanglish') && anthropic) {
      const prompt = language==='tamil' ? `Translate to Tamil script: "${transcript}". Return only Tamil.` : `Transliterate to Tanglish: "${transcript}". Return only Tanglish.`;
      const r = await anthropic.messages.create({ model:'claude-sonnet-4-20250514', max_tokens:500, messages:[{role:'user',content:prompt}] });
      transcript = r.content[0].text.trim();
    }
    if (msgId) await db.msgs.update({ _id: msgId }, { $set: { transcript } });
    fs.unlink(req.file.path, ()=>{});
    res.json({ transcript });
  } catch(err) { if(req.file) fs.unlink(req.file.path,()=>{}); res.status(500).json({ error: err.message }); }
});

// ── SMART REPLIES ─────────────────────────────────────────────────────────────
app.post('/api/smart-replies', async (req, res) => {
  const { recentMessages=[], language='english' } = req.body;
  if (!anthropic) {
    const demos = {
      english:  ['I\'ll look into this right away.', 'Can you provide more details?', 'Your ticket has been escalated to priority.'],
      tamil:    ['நான் உடனே பார்க்கிறேன்.', 'கூடுதல் விவரங்கள் தரமுடியுமா?', 'உங்கள் சிக்கல் escalate செய்யப்பட்டது.'],
      tanglish: ['Naan ippove paakiren.', 'Kooda vivaram sollunga?', 'Ungal ticket escalate pannidrom.']
    };
    return res.json({ replies: demos[language]||demos.english });
  }
  try {
    const context  = recentMessages.map(m => `${m.username||'User'}: ${m.content}`).join('\n');
    const langNote = { tamil:'Reply in Tamil.', tanglish:'Reply in Tanglish.', english:'Reply in English.' }[language]||'';
    const response = await anthropic.messages.create({
      model:'claude-sonnet-4-20250514', max_tokens:200,
      messages:[{ role:'user', content:`IT support chat:\n${context}\n\nSuggest 3 short professional IT support reply options. ${langNote}\nReturn ONLY a JSON array: ["reply1","reply2","reply3"]` }]
    });
    res.json({ replies: JSON.parse(response.content[0].text.replace(/```json|```/g,'').trim()) });
  } catch { res.json({ replies:["I'll look into this right away.","Can you provide more details?","This has been escalated to our team."] }); }
});

// ── SUMMARIZE ─────────────────────────────────────────────────────────────────
app.post('/api/summarize', async (req, res) => {
  const { conversationId, language='english' } = req.body;
  const allMsgs = await db.msgs.find({ conversationId });
  const msgs    = allMsgs.filter(m => m.type==='text'||m.type==='scheduled').sort((a,b)=>(a.sequenceNum||0)-(b.sequenceNum||0));
  if (!msgs.length) return res.json({ summary: 'No messages to summarize yet.' });
  if (!anthropic) return res.json({ summary: '• User reported a technical issue requiring IT support\n• Troubleshooting steps were discussed\n• Ticket escalation may be required' });
  try {
    const userMap  = await getUserMap();
    const context  = msgs.map(m => `${userMap[m.senderId]?.username||'User'}: ${m.content}`).join('\n');
    const langNote = { tamil:'Write in Tamil.', tanglish:'Write in Tanglish.' }[language]||'';
    const response = await anthropic.messages.create({
      model:'claude-sonnet-4-20250514', max_tokens:400,
      messages:[{ role:'user', content:`Summarize this IT support conversation in 3 bullet points. Focus on: the issue reported, steps taken, and current status. ${langNote}\n\n${context}\n\nReturn exactly 3 bullet points starting with •` }]
    });
    res.json({ summary: response.content[0].text.trim() });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── AI CHAT ───────────────────────────────────────────────────────────────────
app.post('/api/ai-chat', async (req, res) => {
  const { messages:history=[], language='english' } = req.body;
  if (!anthropic) {
    const demos = {
      english:  "I'm your IT Helpdesk AI Assistant! I can help troubleshoot issues, guide you through solutions, and help you raise tickets. Add your ANTHROPIC_API_KEY to enable full AI responses.",
      tamil:    "நான் உங்கள் IT Helpdesk AI Assistant! ANTHROPIC_API_KEY சேர்த்து முழு AI பதில்கள் பெறுங்கள்.",
      tanglish: "Naan un IT Helpdesk AI! ANTHROPIC_API_KEY add panni full AI responses paarunga."
    };
    return res.json({ reply: demos[language]||demos.english });
  }
  try {
    const langNote = { tamil:'Always respond in Tamil script.', tanglish:'Always respond in Tanglish.', english:'Respond in clear English.' }[language]||'';
    const response = await anthropic.messages.create({
      model:'claude-sonnet-4-20250514', max_tokens:600,
      system: `You are an IT Helpdesk AI Assistant. You help users troubleshoot technical issues, guide through solutions, and raise support tickets. Be professional, concise, and helpful. Common areas: password reset, WiFi issues, software installation, hardware problems, email issues, VPN access, printer issues, performance problems, security incidents. ${langNote}`,
      messages: history.map(m => ({ role: m.role==='assistant'?'assistant':'user', content: m.content }))
    });
    res.json({ reply: response.content[0].text });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── KNOWLEDGE BASE LOOKUP ────────────────────────────────────────────────────
app.post('/api/knowledge-base', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });
  const kb = searchKnowledgeBase(query);
  if (kb) return res.json({ found: true, answer: kb.answer, category: kb.category });
  if (!anthropic) return res.json({ found: false, answer: null });
  try {
    const r = await anthropic.messages.create({
      model:'claude-sonnet-4-20250514', max_tokens:300,
      messages:[{ role:'user', content:`Is this a common IT issue with a standard fix? "${query}"\nIf yes, provide a brief first-level troubleshooting answer (under 80 words). If it needs a ticket, say "RAISE_TICKET".\nReturn JSON: {"found": bool, "answer": "string or null"}` }]
    });
    res.json(JSON.parse(r.content[0].text.replace(/```json|```/g,'').trim()));
  } catch { res.json({ found: false, answer: null }); }
});

// ── TICKET ROUTES ─────────────────────────────────────────────────────────────

// Create ticket
app.post('/api/tickets', async (req, res) => {
  const { userId, conversationId, title, description, category, priority } = req.body;
  if (!userId||!title||!description) return res.status(400).json({ error: 'userId, title, description required' });

  let finalCategory = category;
  let finalPriority = priority;
  if (!finalCategory || !finalPriority) {
    const meta = await detectTicketMeta(description);
    finalCategory = finalCategory || meta.category || 'Other';
    finalPriority = finalPriority || meta.priority || 'medium';
  }

  const slaHours    = SLA_HOURS[finalPriority] || 8;
  const slaDeadline = new Date(Date.now() + slaHours*60*60*1000).toISOString();
  const ticketNo    = await genTicketNo();

  const ticket = {
    _id: genId(), ticketNo, userId, conversationId: conversationId||null,
    title, description, category: finalCategory, priority: finalPriority,
    status: 'open', slaHours, slaDeadline, escalated: false,
    assignedAgent: null, resolutionNote: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), resolvedAt: null
  };
  await db.tickets.insert(ticket);

  // Notify conversation about ticket creation
  if (conversationId) {
    io.to(conversationId).emit('ticket-created', ticket);
  }

  res.json(ticket);
});

// Get user's tickets
app.get('/api/tickets/user/:userId', async (req, res) => {
  const tickets = await db.tickets.find({ userId: req.params.userId });
  tickets.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  res.json(tickets);
});

// Get all tickets (agent dashboard)
app.get('/api/tickets', async (_,res) => {
  const tickets = await db.tickets.find({});
  tickets.sort((a,b) => {
    const p = { critical:0, high:1, medium:2, low:3 };
    return (p[a.priority]||2) - (p[b.priority]||2);
  });
  res.json(tickets);
});

// Get single ticket
app.get('/api/tickets/:ticketId', async (req, res) => {
  const ticket = await db.tickets.findOne({ _id: req.params.ticketId });
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  res.json(ticket);
});

// Update ticket (status, priority, assign agent, resolve)
app.patch('/api/tickets/:ticketId', async (req, res) => {
  const { status, priority, assignedAgent, resolutionNote } = req.body;
  const update = { updatedAt: new Date().toISOString() };
  if (status)         { update.status = status; if (status==='resolved') update.resolvedAt = new Date().toISOString(); }
  if (priority)       update.priority = priority;
  if (assignedAgent)  update.assignedAgent = assignedAgent;
  if (resolutionNote) update.resolutionNote = resolutionNote;
  await db.tickets.update({ _id: req.params.ticketId }, { $set: update });
  const updated = await db.tickets.findOne({ _id: req.params.ticketId });
  if (updated?.conversationId) io.to(updated.conversationId).emit('ticket-updated', updated);
  res.json(updated);
});

// ── TODOS ─────────────────────────────────────────────────────────────────────
app.get('/api/todos/:userId', async (req,res) => {
  const todos = await db.todos.find({ userId: req.params.userId });
  todos.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  res.json(todos);
});
app.patch('/api/todos/:todoId', async (req,res) => {
  await db.todos.update({ _id: req.params.todoId }, { $set: { done: !!req.body.done } });
  res.json({ success: true });
});

// ── EXPORT ────────────────────────────────────────────────────────────────────
app.get('/api/export/:conversationId', async (req,res) => {
  const msgs    = await db.msgs.find({ conversationId: req.params.conversationId });
  const userMap = await getUserMap();
  msgs.sort((a,b) => (a.sequenceNum||0)-(b.sequenceNum||0));
  res.json(msgs.map(m => ({ ...m, username: userMap[m.senderId]?.username||'user', avatar: userMap[m.senderId]?.avatar||'#888' })));
});

app.get('/health', (_,res) => res.json({ status:'ok', ai:!!anthropic, whisper:!!openai, timestamp: new Date().toISOString() }));

const PORT = process.env.PORT||3001;
server.listen(PORT, () => {
  console.log(`\n🖥️  IT Helpdesk AI → http://localhost:${PORT}`);
  console.log(`🤖 Claude AI : ${anthropic?'✅ Active':'⚠️  Demo mode — add ANTHROPIC_API_KEY'}`);
  console.log(`🎤 Whisper   : ${openai?'✅ Active':'⚠️  Demo mode — add OPENAI_API_KEY'}`);
  console.log(`🎫 Tickets   : ✅ Enabled (nedb)\n`);
});
