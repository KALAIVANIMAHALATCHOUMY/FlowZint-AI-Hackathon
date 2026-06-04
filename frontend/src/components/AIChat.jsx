import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useStore } from '../store.js';

const API = 'http://localhost:3001/api';

const QUICK_PROMPTS = [
  '🔌 My VPN is not connecting — how to fix?',
  '🔑 I forgot my password / account is locked',
  '📧 Outlook is not receiving emails',
  '🖨️ Printer shows offline — how to reconnect?',
  '🐢 My laptop is very slow, what should I do?',
  '📶 WiFi / internet not working',
  '🚫 Access denied to a shared folder',
  '📹 Teams audio or video not working',
  '💻 I need a software installed',
  '🖥️ Monitor not displaying / black screen',
];

export default function AIChat({ onClose }) {
  const language    = useStore(s => s.language);
  const currentUser = useStore(s => s.currentUser);

  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hi ${currentUser?.username || 'there'}! 👋 I'm your IT Helpdesk AI.\n\nI can help you:\n• Troubleshoot technical issues step-by-step\n• Reset passwords or fix account access\n• Guide you through software/hardware problems\n• Raise a support ticket if the issue needs escalation\n\nWhat's the issue you're facing today?`
  }]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendToAI = async (text) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/ai-chat`, { messages: newMessages, language });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Cannot reach AI. Make sure ANTHROPIC_API_KEY is set in backend/.env and restart the backend.\n\nIn demo mode, I can still help you raise a ticket using the 🎫 button in the chat.'
      }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="ai-chat-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ai-chat-panel">
        <div className="ai-chat-header">
          <div className="ai-chat-title">
            <span className="ai-badge">🤖</span>
            <div>
              <div className="ai-chat-name">IT Helpdesk AI Assistant</div>
              <div className="ai-chat-sub">{loading ? '⏳ Thinking…' : '● Ready'} · Language: {language}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="header-btn" onClick={() => setMessages([{ role:'assistant', content:`Chat cleared! What IT issue can I help you with, ${currentUser?.username}?` }])}>🗑️ Clear</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="ai-chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`ai-msg-row ${msg.role}`}>
              {msg.role === 'assistant' && <div className="ai-avatar">🤖</div>}
              <div className={`ai-bubble ${msg.role}`}>
                <pre className="ai-bubble-text">{msg.content}</pre>
              </div>
              {msg.role === 'user' && (
                <div className="ai-avatar user-av" style={{ background: currentUser?.avatar || '#378ADD' }}>
                  {currentUser?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="ai-msg-row assistant">
              <div className="ai-avatar">🤖</div>
              <div className="ai-bubble assistant">
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="ai-quick-prompts">
          <div className="ai-quick-label">Common IT issues — tap to ask instantly</div>
          <div className="ai-quick-grid">
            {QUICK_PROMPTS.map((p, i) => (
              <button key={i} className="ai-quick-btn" onClick={() => sendToAI(p)}>{p}</button>
            ))}
          </div>
        </div>

        <div className="ai-chat-input-area">
          <textarea className="ai-chat-input"
            placeholder="Describe your IT issue… (Enter to send)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendToAI(); } }}
            rows={1}
            disabled={loading}
          />
          <button className="send-btn" onClick={() => sendToAI()} disabled={!input.trim() || loading}>
            {loading ? '…' : 'Ask →'}
          </button>
        </div>
      </div>
    </div>
  );
}
