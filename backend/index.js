require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDB } = require('./db/database');
const { authenticateSocket } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const aiRoutes = require('./routes/ai');
const { startScheduler } = require('./workers/scheduler');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io to app for use in routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);

// Messages routes need io - imported after io is set
const messageRoutes = require('./routes/messages')(io);
app.use('/api/messages', messageRoutes);

// Socket.io authentication middleware
io.use(authenticateSocket);

io.on('connection', (socket) => {
  const userId = socket.user.id;
  // Each user joins their own room for targeted events
  socket.join(`user_${userId}`);
  console.log(`✅ User connected: ${socket.user.username} (${userId})`);

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.user.username}`);
  });
});

// Initialize DB and start cron scheduler
initDB();
startScheduler(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 SmartChat AI Server running on http://localhost:${PORT}`);
});
