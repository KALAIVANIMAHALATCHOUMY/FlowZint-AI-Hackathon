import { create } from 'zustand';
import axios from 'axios';

const API = 'http://localhost:3001/api';

export const useStore = create((set, get) => ({

  // ── Auth ──────────────────────────────────────────────────────────────────
  currentUser: null,
  users: [],

  // ── Chat ──────────────────────────────────────────────────────────────────
  activeConversation: null,
  messages:    {},       // convId → message[]
  pendingIds:  {},       // convId → Set<msgId>
  typingUsers: {},       // convId → userId | null

  // ── AI / UI ───────────────────────────────────────────────────────────────
  smartReplies:   [],
  summary:        '',
  showSummary:    false,
  todos:          [],
  showTodos:      false,
  language:       'english',
  isTranscribing: {},    // msgId → bool

  // ── Tickets ───────────────────────────────────────────────────────────────
  myTickets:     [],     // user's own tickets
  activeTicket:  null,   // ticket linked to current conversation

  // ── Auth ──────────────────────────────────────────────────────────────────
  login: async (username) => {
    const { data } = await axios.post(`${API}/users`, { username });
    const user = { ...data, id: data._id };
    set({ currentUser: user });
    return user;
  },

  loadUsers: async () => {
    const { data } = await axios.get(`${API}/users`);
    set({ users: data.map(u => ({ ...u, id: u._id })) });
  },

  // ── Conversations ─────────────────────────────────────────────────────────
  openConversation: async (otherUserId) => {
    const { currentUser } = get();
    const { data: conv } = await axios.post(`${API}/conversations`, {
      user1Id: currentUser.id,
      user2Id: otherUserId
    });
    const convId = conv._id;
    const { data: msgs } = await axios.get(`${API}/messages/${convId}`);
    const normalised = msgs.map(m => ({ ...m, id: m._id }));
    const pendingSet = new Set(normalised.filter(m => m.status === 'pending').map(m => m.id));
    set(s => ({
      activeConversation: { id: convId, otherUserId },
      messages:   { ...s.messages,   [convId]: normalised },
      pendingIds: { ...s.pendingIds, [convId]: pendingSet },
      activeTicket: null,
    }));
    return { id: convId };
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  addMessage: (msg) => {
    const convId = msg.conversationId;
    const id     = msg._id || msg.id;
    const norm   = { ...msg, id };
    set(s => {
      const list    = s.messages[convId] || [];
      const idx     = list.findIndex(m => m.id === id);
      const updated = idx >= 0
        ? list.map(m => m.id === id ? { ...m, ...norm } : m)
        : [...list, norm];
      const pending = new Set(s.pendingIds[convId] || []);
      if (norm.status === 'pending') pending.add(id);
      return {
        messages:   { ...s.messages,   [convId]: updated },
        pendingIds: { ...s.pendingIds, [convId]: pending },
      };
    });
  },

  deliverMessage: (convId, msgId) => {
    set(s => {
      const pending = new Set(s.pendingIds[convId] || []);
      pending.delete(msgId);
      return {
        messages:   { ...s.messages, [convId]: (s.messages[convId]||[]).map(m => m.id===msgId ? { ...m, status:'delivered' } : m) },
        pendingIds: { ...s.pendingIds, [convId]: pending },
      };
    });
  },

  cancelMessage: (convId, msgId) => {
    set(s => {
      const pending = new Set(s.pendingIds[convId] || []);
      pending.delete(msgId);
      return {
        messages:   { ...s.messages, [convId]: (s.messages[convId]||[]).filter(m => m.id !== msgId) },
        pendingIds: { ...s.pendingIds, [convId]: pending },
      };
    });
  },

  updateMessageAnalysis: (convId, msgId, sentiment, todos) => {
    set(s => ({
      messages: {
        ...s.messages,
        [convId]: (s.messages[convId]||[]).map(m => m.id===msgId ? { ...m, sentiment } : m),
      },
    }));
    if (todos?.length) {
      set(s => ({ todos: [...todos.map(t => ({ ...t, id: t._id, done: false })), ...s.todos] }));
    }
  },

  reorderMessages: (convId, orderedIds) => {
    set(s => {
      const seqMap = {};
      orderedIds.forEach((id, i) => { seqMap[id] = i + 1; });
      const updated = (s.messages[convId] || [])
        .map(m => seqMap[m.id] !== undefined ? { ...m, sequenceNum: seqMap[m.id] } : m)
        .sort((a, b) => (a.sequenceNum||0) - (b.sequenceNum||0));
      return { messages: { ...s.messages, [convId]: updated } };
    });
  },

  setTranscript: (convId, msgId, transcript) => {
    set(s => ({
      messages: {
        ...s.messages,
        [convId]: (s.messages[convId]||[]).map(m => m.id===msgId ? { ...m, transcript } : m),
      },
      isTranscribing: { ...s.isTranscribing, [msgId]: false },
    }));
  },

  setTranscribing: (msgId, val) => set(s => ({ isTranscribing: { ...s.isTranscribing, [msgId]: val } })),

  // ── AI Actions ────────────────────────────────────────────────────────────
  fetchSmartReplies: async (convId) => {
    const { messages, language } = get();
    const recent = (messages[convId]||[]).slice(-5).filter(m => m.content && m.type==='text');
    try {
      const { data } = await axios.post(`${API}/smart-replies`, { recentMessages: recent, language });
      set({ smartReplies: data.replies || [] });
    } catch { set({ smartReplies: [] }); }
  },

  fetchSummary: async (convId) => {
    const { language } = get();
    try {
      const { data } = await axios.post(`${API}/summarize`, { conversationId: convId, language });
      set({ summary: data.summary, showSummary: true });
    } catch { set({ summary: 'Could not generate summary.', showSummary: true }); }
  },

  fetchTodos: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    try {
      const { data } = await axios.get(`${API}/todos/${currentUser.id}`);
      set({ todos: data.map(t => ({ ...t, id: t._id })), showTodos: true });
    } catch {}
  },

  toggleTodo: async (todoId, done) => {
    await axios.patch(`${API}/todos/${todoId}`, { done });
    set(s => ({ todos: s.todos.map(t => t.id===todoId ? { ...t, done } : t) }));
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  scheduleMessage: async (convId, content, scheduledAt) => {
    const { currentUser } = get();
    await axios.post(`${API}/schedule`, { conversationId: convId, senderId: currentUser.id, content, scheduledAt });
  },

  cancelScheduled: async (convId, msgId) => {
    await axios.delete(`${API}/schedule/${msgId}`);
    get().cancelMessage(convId, msgId);
  },

  // ── Tickets ───────────────────────────────────────────────────────────────
  loadMyTickets: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    try {
      const { data } = await axios.get(`${API}/tickets/user/${currentUser.id}`);
      set({ myTickets: data });
    } catch { set({ myTickets: [] }); }
  },

  createTicket: async (payload) => {
    const { data } = await axios.post(`${API}/tickets`, payload);
    set(s => ({ myTickets: [data, ...s.myTickets], activeTicket: data }));
    return data;
  },

  updateTicket: async (ticketId, update) => {
    const { data } = await axios.patch(`${API}/tickets/${ticketId}`, update);
    set(s => ({
      myTickets:   s.myTickets.map(t => t._id===ticketId ? data : t),
      activeTicket: s.activeTicket?._id===ticketId ? data : s.activeTicket,
    }));
    return data;
  },

  setActiveTicket: (ticket) => set({ activeTicket: ticket }),

  // ── Misc ──────────────────────────────────────────────────────────────────
  setTyping:         (convId, userId, isTyping) => set(s => ({ typingUsers: { ...s.typingUsers, [convId]: isTyping ? userId : null } })),
  setLanguage:       (lang) => set({ language: lang }),
  setShowTodos:      (val)  => set({ showTodos: val }),
  setShowSummary:    (val)  => set({ showSummary: val }),
  clearSmartReplies: ()     => set({ smartReplies: [] }),
}));
