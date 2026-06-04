import React, { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:3001/api';

const CATS = ['Hardware','Software','Network','Access','Email','Printer','Security','Other'];
const PRIS = [
  { v:'P1', l:'🔴 P1 — Critical (System down, security breach)' },
  { v:'P2', l:'🟠 P2 — High (Major feature broken)' },
  { v:'P3', l:'🟡 P3 — Medium (Partial issue, workaround available)' },
  { v:'P4', l:'🟢 P4 — Low (Minor issue / query)' },
];

export default function CreateTicketModal({ currentUser, prefillDescription='', onClose, onCreated }) {
  const [desc,     setDesc]     = useState(prefillDescription);
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState('Software');
  const [priority, setPriority] = useState('P3');
  const [loading,  setLoading]  = useState(false);
  const [aiLoading,setAiLoading]= useState(false);
  const [error,    setError]    = useState('');

  const autoClassify = async () => {
    if (!desc.trim()) return setError('Enter a description first');
    setAiLoading(true); setError('');
    try {
      const { data } = await axios.post(`${API}/tickets/classify`, { description: desc });
      if (data.title)    setTitle(data.title);
      if (data.category) setCategory(data.category);
      if (data.priority) setPriority(data.priority);
    } catch { setError('Auto-classify failed. Fill in manually.'); }
    finally { setAiLoading(false); }
  };

  const submit = async () => {
    if (!desc.trim() || !title.trim()) return setError('Please fill in title and description');
    setLoading(true); setError('');
    try {
      await axios.post(`${API}/tickets`, {
        title: title.trim(),
        description: desc.trim(),
        category, priority,
        reportedBy: currentUser?.username || 'Unknown'
      });
      onCreated();
    } catch { setError('Failed to create ticket. Is backend running?'); setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{width:500,maxWidth:'95vw'}}>
        <div className="modal-header">
          <h3>🎫 Create Support Ticket</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <label className="form-label">Describe your issue</label>
          <textarea className="form-textarea" rows={4} placeholder="Describe your IT problem in detail…" value={desc} onChange={e=>setDesc(e.target.value)} autoFocus />

          <button className="hd-ai-classify-btn" onClick={autoClassify} disabled={aiLoading||!desc.trim()}>
            {aiLoading ? '⏳ AI is classifying…' : '✨ AI Auto-Classify (fills Title, Category & Priority)'}
          </button>

          <label className="form-label" style={{marginTop:12}}>Title</label>
          <input className="form-input" placeholder="Short summary of the issue" value={title} onChange={e=>setTitle(e.target.value)} />

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
            <div>
              <label className="form-label">Category</label>
              <select className="form-input" value={category} onChange={e=>setCategory(e.target.value)}>
                {CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-input" value={priority} onChange={e=>setPriority(e.target.value)}>
                {PRIS.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </div>
          </div>

          <div className="hd-sla-info">
            ⏱ SLA: { {P1:'Response within 1 hour',P2:'Response within 4 hours',P3:'Response within 8 hours',P4:'Response within 24 hours'}[priority] }
          </div>

          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={loading||!title.trim()||!desc.trim()}>
            {loading ? 'Creating…' : '🎫 Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
