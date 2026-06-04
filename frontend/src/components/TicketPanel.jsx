import React, { useState } from 'react';
import axios from 'axios';
import { useStore } from '../store.js';

const API = 'http://localhost:3001/api';

const CATEGORIES = ['Hardware','Software','Network','Access/Password','Email','Printer','Security','Performance','Other'];
const PRIORITIES  = [
  { value:'critical', label:'🔴 Critical', desc:'System down / Security breach', sla:'1 hr' },
  { value:'high',     label:'🟠 High',     desc:'Major issue blocking work',     sla:'4 hrs' },
  { value:'medium',   label:'🟡 Medium',   desc:'Degraded but workaround exists',sla:'8 hrs' },
  { value:'low',      label:'🟢 Low',      desc:'Minor / cosmetic issue',        sla:'24 hrs' },
];

export default function TicketPanel({ convId, onClose, onCreated }) {
  const currentUser = useStore(s => s.currentUser);

  const [step,        setStep]        = useState(1);  // 1=KB, 2=form, 3=done
  const [query,       setQuery]       = useState('');
  const [kbAnswer,    setKbAnswer]    = useState('');
  const [checking,    setChecking]    = useState(false);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState('');
  const [priority,    setPriority]    = useState('');
  const [detecting,   setDetecting]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [ticket,      setTicket]      = useState(null);
  const [error,       setError]       = useState('');

  // Step 1 — check knowledge base first
  const checkKB = async () => {
    if (!query.trim()) return setError('Please describe your issue');
    setChecking(true); setError('');
    try {
      const { data } = await axios.post(`${API}/knowledge-base`, { query });
      if (data.found) {
        setKbAnswer(data.answer);
      } else {
        goToForm();
      }
    } catch { goToForm(); }
    finally { setChecking(false); }
  };

  const goToForm = async () => {
    setTitle(query.slice(0, 70));
    setDescription(query);
    setStep(2);
    // AI auto-detect category + priority
    setDetecting(true);
    try {
      const { data } = await axios.post(`${API}/knowledge-base`, { query });
      if (data.category) setCategory(data.category);
    } catch {}
    // Simple keyword-based priority hint
    const lower = query.toLowerCase();
    if (lower.includes('urgent')||lower.includes('crash')||lower.includes('down')||lower.includes('security')||lower.includes('virus')) setPriority('critical');
    else if (lower.includes('cannot')||lower.includes('error')||lower.includes('fail')||lower.includes('broke')) setPriority('high');
    else if (lower.includes('slow')||lower.includes('delay')||lower.includes('sometimes')) setPriority('medium');
    else setPriority('low');
    setDetecting(false);
  };

  const raiseTicket = async () => {
    if (!title.trim() || !description.trim()) return setError('Title and description are required');
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${API}/tickets`, {
        userId: currentUser.id,
        conversationId: convId,
        title: title.trim(),
        description: description.trim(),
        category: category || undefined,
        priority: priority || undefined,
      });
      setTicket(data);
      setStep(3);
      onCreated?.(data);
    } catch { setError('Failed to raise ticket. Is the backend running?'); }
    finally { setLoading(false); }
  };

  const priorityColor = { critical:'#E24B4A', high:'#E6954A', medium:'#EF9F27', low:'#1D9E75' };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{ width:500 }}>
        <div className="modal-header">
          <h3>🎫 {step===3 ? 'Ticket Raised!' : 'Raise Support Ticket'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* STEP 1 — KB check */}
        {step===1 && (
          <div className="modal-body">
            <div className="kb-intro">
              <span className="kb-icon">🔍</span>
              <span className="kb-text">Describe your issue — we'll check for an instant fix before creating a ticket.</span>
            </div>
            <label className="form-label">What's the problem?</label>
            <textarea className="form-textarea" rows={3} value={query} autoFocus
              onChange={e=>setQuery(e.target.value)}
              placeholder="e.g. My laptop screen went black and won't turn back on…" />

            {kbAnswer && (
              <div className="kb-answer">
                <div className="kb-answer-label">💡 Instant fix found — try this first:</div>
                <div className="kb-answer-text">{kbAnswer}</div>
                <div style={{display:'flex',gap:8,marginTop:12}}>
                  <button className="btn-secondary" style={{fontSize:12}} onClick={onClose}>✅ This solved it!</button>
                  <button className="btn-primary"   style={{fontSize:12}} onClick={goToForm}>Still need a ticket →</button>
                </div>
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            {!kbAnswer && (
              <div className="modal-footer" style={{borderTop:'none',paddingTop:0}}>
                <button className="btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn-primary" onClick={checkKB} disabled={checking||!query.trim()}>
                  {checking?'🔍 Checking KB…':'🔍 Check for instant fix →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Ticket form */}
        {step===2 && (
          <div className="modal-body">
            {detecting && <div className="detecting-bar">🤖 AI is detecting category and priority…</div>}
            <label className="form-label">Ticket title</label>
            <input className="form-input" value={title} onChange={e=>setTitle(e.target.value)}
              placeholder="Short summary of the issue" />

            <label className="form-label" style={{marginTop:10}}>Full description</label>
            <textarea className="form-textarea" rows={3} value={description}
              onChange={e=>setDescription(e.target.value)}
              placeholder="Error messages, steps to reproduce, when it started…" />

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}>
              <div>
                <label className="form-label">Category</label>
                <select className="form-input" value={category} onChange={e=>setCategory(e.target.value)}>
                  <option value="">-- Select --</option>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="form-input" value={priority} onChange={e=>setPriority(e.target.value)}>
                  <option value="">-- Select --</option>
                  {PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label} (SLA: {p.sla})</option>)}
                </select>
              </div>
            </div>

            {priority && (
              <div className="sla-preview">
                {PRIORITIES.find(p=>p.value===priority)?.label} — {PRIORITIES.find(p=>p.value===priority)?.desc}
                &nbsp;·&nbsp; <strong>SLA: {PRIORITIES.find(p=>p.value===priority)?.sla}</strong>
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <div className="modal-footer" style={{borderTop:'none',paddingTop:0}}>
              <button className="btn-secondary" onClick={()=>setStep(1)}>← Back</button>
              <button className="btn-primary" onClick={raiseTicket} disabled={loading||!title.trim()}>
                {loading?'Raising ticket…':'🎫 Raise Ticket'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Success */}
        {step===3 && ticket && (
          <div className="modal-body" style={{textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div className="ticket-success-no">{ticket.ticketNo}</div>
            <p style={{fontSize:13,color:'var(--color-text-secondary)',margin:'8px 0 16px'}}>
              Your ticket has been raised and is now being tracked
            </p>
            <div className="ticket-meta-grid">
              <div className="ticket-meta-item"><span>Category</span><strong>{ticket.category}</strong></div>
              <div className="ticket-meta-item"><span>Priority</span>
                <strong style={{color:priorityColor[ticket.priority]}}>{ticket.priority?.toUpperCase()}</strong>
              </div>
              <div className="ticket-meta-item"><span>SLA</span><strong>{ticket.slaHours} hours</strong></div>
              <div className="ticket-meta-item"><span>Status</span><strong>🆕 Open</strong></div>
            </div>
            <div className="sla-preview">
              ⏰ Expected resolution by: <strong>{new Date(ticket.slaDeadline).toLocaleString()}</strong>
            </div>
            <div className="modal-footer" style={{borderTop:'none',paddingTop:16}}>
              <button className="btn-primary" style={{width:'100%'}} onClick={onClose}>Done ✓</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
