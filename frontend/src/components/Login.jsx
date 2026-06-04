import React, { useState } from 'react';
import { useStore } from '../store.js';

export default function Login() {
  const { login } = useStore();
  const [username, setUsername] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || username.trim().length < 2) return setError('Enter at least 2 characters');
    setLoading(true); setError('');
    try { await login(username.trim()); }
    catch { setError('Cannot connect to backend. Is it running?'); setLoading(false); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🖥️</div>
        <h1 className="login-title">IT Helpdesk AI</h1>
        <p className="login-subtitle">AI-powered IT support with smart ticket management, voice logging, multilingual support, and intelligent automation</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input className="login-input" type="text" placeholder="Enter your username or employee ID"
            value={username} onChange={e=>setUsername(e.target.value)} autoFocus maxLength={30} />
          {error && <p className="login-error">{error}</p>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Connecting…' : 'Access Helpdesk →'}
          </button>
        </form>
        <div style={{fontSize:11,color:'var(--color-text-tertiary)',marginBottom:14,textAlign:'center'}}>
          💡 Use prefix "agent" for agent role (e.g. agent_john)
        </div>
        <div className="login-features">
          <div className="login-feat">🎫 Raise & track tickets</div>
          <div className="login-feat">🔍 Instant KB answers</div>
          <div className="login-feat">🎤 Voice issue logging</div>
          <div className="login-feat">⏰ SLA countdown</div>
          <div className="login-feat">🚨 Auto-escalation</div>
          <div className="login-feat">✨ AI smart replies</div>
          <div className="login-feat">📝 Ticket summarizer</div>
          <div className="login-feat">📄 Export PDF report</div>
        </div>
      </div>
    </div>
  );
}
