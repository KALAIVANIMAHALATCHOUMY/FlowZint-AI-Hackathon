import React, { useState } from 'react';
import axios from 'axios';
import { useStore } from '../store.js';

const API = 'http://localhost:3001/api';
const PRIORITIES = ['Low','Medium','High','Critical'];
const CATEGORIES = ['Hardware','Software','Network','Access','Other'];

const PRIORITY_COLOR = { Low:'success', Medium:'warning', High:'danger', Critical:'danger' };

export default function TicketModal({ prefillText='', messageId=null, convId=null, onClose, onCreated }) {
  const currentUser = useStore(s => s.currentUser);
  const [title,       setTitle]       = useState(prefillText.slice(0,80) || '');
  const [description, setDescription] = useState(prefillText || '');
  const [priority,    setPriority]    = useState('Medium');
  const [category,    setCategory]    = useState('Other');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [ticket,      setTicket]      = useState(null); // created ticket

  const handleSubmit = async () => {
    if (!title.trim())       return setError('Please enter a title');
    if (!description.trim()) return setError('Please describe the issue');
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${API}/tickets`, {
        title: title.trim(), description: description.trim(),
        priority, createdBy: currentUser.id,
        conversationId: convId, messageId
      });
      setTicket(data.ticket);
      onCreated?.(data.ticket);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create ticket');
      setLoading(false);
    }
  };

  // Success screen
  if (ticket) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>🎫 Ticket Created</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{textAlign:'center', padding:'24px 20px'}}>
          <div style={{fontSize:'40px', marginBottom:'12px'}}>✅</div>
          <div className="ticket-num">{ticket.ticketNumber}</div>
          <div style={{fontSize:'14px', fontWeight:500, margin:'8px 0 4px'}}>{ticket.title}</div>
          <div style={{display:'flex', gap:'8px', justifyContent:'center', margin:'12px 0', flexWrap:'wrap'}}>
            <span className={`t-badge ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
            <span className="t-badge neutral">{ticket.category}</span>
            <span className="t-badge open">Open</span>
          </div>
          <div className="sla-info">
            ⏱ SLA Deadline: <strong>{new Date(ticket.slaDeadline).toLocaleString()}</strong>
          </div>
          <p style={{fontSize:'12px', color:'var(--color-text-tertiary)', marginTop:'10px'}}>
            You will receive an SLA reminder alert before the deadline.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{width:'480px'}}>
        <div className="modal-header">
          <h3>🎫 Create Support Ticket</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label className="form-label">Issue Title</label>
          <input className="form-input" value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Cannot connect to VPN" autoFocus />

          <label className="form-label" style={{marginTop:'12px'}}>Description</label>
          <textarea className="form-textarea" value={description}
            onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Describe the issue in detail…" />

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginTop:'12px'}}>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-input" value={priority} onChange={e=>setPriority(e.target.value)}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Category</label>
              <select className="form-input" value={category} onChange={e=>setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="sla-preview">
            ⏱ SLA: {priority === 'Critical' ? '1 hour' : priority === 'High' ? '4 hours' : priority === 'Medium' ? '8 hours' : '24 hours'} response time
          </div>

          {error && <p className="form-error" style={{marginTop:'8px'}}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? '⏳ Creating…' : '🎫 Submit Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
