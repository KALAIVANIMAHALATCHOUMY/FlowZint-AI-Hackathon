import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('sc_user') || 'null'),
  token: localStorage.getItem('sc_token') || null,
  users: [],
  activeUser: null,
  messages: {},        // { userId: [msg, ...] }
  language: 'english', // smart reply / summary language

  setAuth: (user, token) => {
    localStorage.setItem('sc_user', JSON.stringify(user));
    localStorage.setItem('sc_token', token);
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('sc_user');
    localStorage.removeItem('sc_token');
    set({ user: null, token: null, activeUser: null, messages: {} });
  },

  setUsers: (users) => set({ users }),

  setActiveUser: (u) => set({ activeUser: u }),

  setLanguage: (lang) => set({ language: lang }),

  setMessages: (userId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [userId]: msgs } })),

  addMessage: (msg) => {
    const { messages, user, activeUser } = get();
    // Determine which conversation this belongs to
    const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
    const current = messages[otherId] || [];

    // Avoid duplicates
    if (current.find((m) => m.id === msg.id)) {
      // Update existing (e.g. emotion added)
      const updated = current.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
      set((s) => ({ messages: { ...s.messages, [otherId]: updated } }));
      return;
    }

    const updated = [...current, msg].sort((a, b) => a.seq_num - b.seq_num || new Date(a.created_at) - new Date(b.created_at));
    set((s) => ({ messages: { ...s.messages, [otherId]: updated } }));
  },

  reorderMessages: (messageIds, userId) => {
    const { messages } = get();
    const conv = messages[userId] || [];
    // Rebuild order based on messageIds, keeping non-reordered messages in place
    const reordered = [...conv];
    const idxMap = {};
    messageIds.forEach((id, i) => { idxMap[id] = i; });
    // Sort reordered messages by their new position
    const reorderedMsgs = messageIds.map((id) => conv.find((m) => m.id === id)).filter(Boolean);
    // Replace in conv at original positions
    const positions = messageIds.map((id) => conv.findIndex((m) => m.id === id)).filter((i) => i !== -1);
    positions.forEach((pos, i) => { if (reorderedMsgs[i]) reordered[pos] = reorderedMsgs[i]; });
    set((s) => ({ messages: { ...s.messages, [userId]: reordered } }));
  },

  updateTranscript: (msgId, transcript, userId) => {
    const { messages } = get();
    const conv = (messages[userId] || []).map((m) =>
      m.id === msgId ? { ...m, transcript } : m
    );
    set((s) => ({ messages: { ...s.messages, [userId]: conv } }));
  },
}));

export default useChatStore;
