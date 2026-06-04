import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import AIChat from './AIChat.jsx';
import TicketDashboard from './TicketDashboard.jsx';

export default function Sidebar({ socket }) {
  const currentUser        = useStore(s => s.currentUser);
  const users              = useStore(s => s.users);
  const loadUsers          = useStore(s => s.loadUsers);
  const openConversation   = useStore(s => s.openConversation);
  const activeConversation = useStore(s => s.activeConversation);
  const fetchTodos         = useStore(s => s.fetchTodos);
  const todos              = useStore(s => s.todos);
  const showTodos          = useStore(s => s.showTodos);
  const setShowTodos       = useStore(s => s.setShowTodos);
  const toggleTodo         = useStore(s => s.toggleTodo);
  const language           = useStore(s => s.language);
  const setLanguage        = useStore(s => s.setLanguage);

  const [showAIChat,   setShowAIChat]   = useState(false);
  const [showTickets,  setShowTickets]  = useState(false);
  const [ticketCount,  setTicketCount]  = useState(0);

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { const t = setInterval(loadUsers, 8000); return () => clearInterval(t); }, []);

  // Load open ticket count
  useEffect(() => {
    const loadCount = async () => {
      if (!currentUser) return;
      try {
        const { default: axios } = await import('axios');
        const { data } = await axios.get(`http://localhost:3001/api/tickets/user/${currentUser.id}`);
        setTicketCount(data.filter(t => t.status==='open'||t.status==='in-progress').length);
      } catch {}
    };
    loadCount();
    const t = setInterval(loadCount, 15000);
    return () => clearInterval(t);
  }, [currentUser?.id]);

  const contacts     = users.filter(u => u.id !== currentUser?.id);
  const pendingTodos = todos.filter(t => !t.done).length;

  const handleOpenConv = async (userId) => {
    const conv = await openConversation(userId);
    if (socket?.current && conv) socket.current.emit('join', { userId: currentUser.id, conversationId: conv.id });
  };

  return (
    <>
      <aside className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-user">
            <div className="avatar" style={{ background: currentUser?.avatar||'#378ADD' }}>
              {currentUser?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="sidebar-username">{currentUser?.username}</div>
              <div className="sidebar-status">● IT Helpdesk</div>
            </div>
          </div>
          <select className="lang-select" value={language} onChange={e=>setLanguage(e.target.value)} title="AI language">
            <option value="english">EN</option>
            <option value="tamil">தமிழ்</option>
            <option value="tanglish">Tanglish</option>
          </select>
        </div>

        {/* Ticket Dashboard button */}
        <button className="ai-chat-btn ticket-btn" onClick={()=>setShowTickets(true)}>
          <span className="ai-chat-btn-icon">🎫</span>
          <div>
            <div className="ai-chat-btn-title">My Tickets</div>
            <div className="ai-chat-btn-sub">Track SLA · Update status · Resolve</div>
          </div>
          {ticketCount > 0 && <span className="todo-badge">{ticketCount}</span>}
        </button>

        {/* AI Chat button */}
        <button className="ai-chat-btn" onClick={()=>setShowAIChat(true)}>
          <span className="ai-chat-btn-icon">🤖</span>
          <div>
            <div className="ai-chat-btn-title">IT AI Assistant</div>
            <div className="ai-chat-btn-sub">Troubleshoot · Get instant fixes</div>
          </div>
          <span className="ai-chat-btn-arrow">→</span>
        </button>

        {/* To-Do toggle */}
        <button className={`todos-btn ${showTodos?'active':''}`}
          onClick={()=>{ fetchTodos(); setShowTodos(!showTodos); }}>
          ✅ Action Items
          {pendingTodos>0 && <span className="todo-badge">{pendingTodos}</span>}
        </button>

        {showTodos && (
          <div className="todo-panel">
            <div className="todo-panel-title">AI-extracted action items</div>
            {todos.length===0 ? (
              <div className="todo-empty">No action items yet. AI auto-detects commitments from support conversations.</div>
            ) : todos.map(todo => (
              <div key={todo.id} className={`todo-item ${todo.done?'done':''}`}>
                <input type="checkbox" checked={!!todo.done} onChange={e=>toggleTodo(todo.id, e.target.checked)} />
                <div className="todo-content">
                  <div className="todo-task">{todo.task}</div>
                  {todo.deadline && <div className="todo-deadline">📅 {todo.deadline}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contacts */}
        <div className="sidebar-section-label">Support Contacts ({contacts.length})</div>
        <div className="contacts-list">
          {contacts.length===0 ? (
            <div className="no-contacts">Open a second browser tab → localhost:5173 → enter another username (use "agent_" prefix for agent role)</div>
          ) : contacts.map(user => (
            <button key={user.id}
              className={`contact-item ${activeConversation?.otherUserId===user.id?'active':''}`}
              onClick={()=>handleOpenConv(user.id)}>
              <div className="avatar sm" style={{background:user.avatar||'#888'}}>{user.username?.[0]?.toUpperCase()}</div>
              <div>
                <div className="contact-name">{user.username}</div>
                <div style={{fontSize:10,color:'var(--color-text-tertiary)'}}>{user.username?.startsWith('agent')?'🎧 Agent':'👤 User'}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {showAIChat  && <AIChat onClose={()=>setShowAIChat(false)} />}
      {showTickets && <TicketDashboard onClose={()=>setShowTickets(false)} />}
    </>
  );
}
