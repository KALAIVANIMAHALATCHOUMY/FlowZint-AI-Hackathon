import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useStore } from '../store.js';
import TicketModal from './TicketModal.jsx';

const API = 'http://localhost:3001/api';

const PRIORITY_COLORS = { Critical:'danger', High:'danger', Medium:'warning', Low:'success' };
const STATUS_COLORS   = { Open:'info', 'In Progress':'warning', Resolved:'success', Closed:'neutral' };
const STATUSES  = ['Open','In Progress','Resolved','Closed'];

function SLABadge({ deadline, status }) {
  if (!deadline || status === 'Resolved' || status === 'Closed') return null;
  const msLeft  = new Date(deadline) - new Date();
  const hrLeft  = Math.round(msLeft / 3600000);
  const breached = msLeft < 0;
  return (
    <span className={`t-badge ${breached ? 'danger' : hrLeft < 2 ? 'danger' : 'neutral'}`}
      title={new Date(deadline).toLocaleString()}>
      {breached ? `⚠ SLA breached` : `⏱ ${hrLeft}h left`}
    </span>
  );
}

export default function HelpdeskDashboard({ onClose }) {
  const currentUser = useStore(s => s.currentUser);
  const [tickets,    setTickets]   = useState([]);
  const [stats,      setStats]     = useState(null);
  const [filter,     setFilter]    = useState('all');
  const [selected,   setSelected]  = useState(null);
  const [resolution, setResolution]= useState('');
  const [suggestion, setSuggestion]= useState('');
  const [sugLoading, setSugLoading]= useState(false);
  const [showNew,    setShowNew]   = useState(false);
  const [ratingTick, setRatingTick]= useState(null);
  const [rating,     setRating]    = useState(0);

  const load = async () => {
    const [{ data: t }, { data: s }] = await Promise.all([
      axios.get(`${API}/tickets?userId=${currentUser.id}`),
      axios.get(`${API}/tickets/stats/summary?userId=${currentUser.id}`)
    ]);
    setTickets(t); setStats(s);
  };

  useEffect(() => { load(); }, []);

  const displayed = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  const updateStatus = async (id, status) => {
    await axios.patch(`${API}/tickets/${id}`, { status });
    load(); if (selected?._id === id) setSelected(s => ({ ...s, status }));
  };

  const submitResolution = async () => {
    if (!resolution.trim()) return;
    await axios.patch(`${API}/tickets/${selected._id}`, { status:'Resolved', resolution });
    load(); setSelected(s => ({ ...s, status:'Resolved', resolution })); setResolution('');
  };

  const getSuggestion = async () => {
    setSugLoading(true);
    const { data } = await axios.post(`${API}/tickets/${selected._id}/suggest-resolution`);
    setSuggestion(data.suggestion); setSugLoading(false);
  };

  const submitRating = async () => {
    await axios.post(`${API}/tickets/${ratingTick}/rate`, { rating });
    setRatingTick(null); setRating(0); load();
  };

  return (
    <div className="hd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hd-panel">

        {/* Header */}
        <div className="hd-header">
          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <span style={{fontSize:'22px'}}>🎫</span>
            <div>
              <div style={{fontWeight:500, fontSize:'15px'}}>HelpDesk AI Dashboard</div>
              <div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>IT Support Tickets</div>
            </div>
          </div>
          <div style={{display:'flex', gap:'8px'}}>
            <button className="btn-primary" style={{fontSize:'12px', padding:'6px 12px'}} onClick={() => setShowNew(true)}>
              + New Ticket
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="hd-stats">
            {[
              { label:'Total',      val: stats.total,      cls:'neutral' },
              { label:'Open',       val: stats.open,       cls:'info'    },
              { label:'In Progress',val: stats.inProgress, cls:'warning' },
              { label:'Resolved',   val: stats.resolved,   cls:'success' },
              { label:'Critical',   val: stats.critical,   cls:'danger'  },
              { label:'SLA Breach', val: stats.slaBreached,cls:'danger'  },
            ].map(s => (
              <div key={s.label} className="hd-stat">
                <div className={`hd-stat-num ${s.cls}`}>{s.val}</div>
                <div className="hd-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="hd-filters">
          {['all','Open','In Progress','Resolved','Closed'].map(f => (
            <button key={f} className={`hd-filter-btn ${filter===f?'active':''}`}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f}
              <span className="hd-filter-count">
                {f === 'all' ? tickets.length : tickets.filter(t=>t.status===f).length}
              </span>
            </button>
          ))}
        </div>

        <div className="hd-body">
          {/* Ticket list */}
          <div className="hd-list">
            {displayed.length === 0 && (
              <div className="hd-empty">No tickets yet. Click "+ New Ticket" to create one.</div>
            )}
            {displayed.map(t => (
              <div key={t._id}
                className={`hd-ticket-row ${selected?._id===t._id ? 'active':''}`}
                onClick={() => { setSelected(t); setSuggestion(''); }}>
                <div className="hd-ticket-top">
                  <span className="hd-ticket-num">{t.ticketNumber}</span>
                  <span className={`t-badge ${PRIORITY_COLORS[t.priority]||'neutral'}`}>{t.priority}</span>
                  <span className={`t-badge ${STATUS_COLORS[t.status]||'neutral'}`}>{t.status}</span>
                  <SLABadge deadline={t.slaDeadline} status={t.status} />
                </div>
                <div className="hd-ticket-title">{t.title}</div>
                <div className="hd-ticket-meta">
                  <span>{t.category}</span>
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  {t.rating && <span>⭐ {t.rating}/5</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Ticket detail */}
          {selected ? (
            <div className="hd-detail">
              <div className="hd-detail-num">{selected.ticketNumber}</div>
              <div className="hd-detail-title">{selected.title}</div>

              <div style={{display:'flex', gap:'6px', flexWrap:'wrap', margin:'10px 0'}}>
                <span className={`t-badge ${PRIORITY_COLORS[selected.priority]||'neutral'}`}>{selected.priority}</span>
                <span className={`t-badge ${STATUS_COLORS[selected.status]||'neutral'}`}>{selected.status}</span>
                <span className="t-badge neutral">{selected.category}</span>
              </div>

              <div className="hd-field">
                <div className="hd-field-label">Description</div>
                <div className="hd-field-val">{selected.description}</div>
              </div>

              <div className="hd-field">
                <div className="hd-field-label">SLA Deadline</div>
                <div className="hd-field-val">{new Date(selected.slaDeadline).toLocaleString()}</div>
              </div>

              {selected.resolution && (
                <div className="hd-field">
                  <div className="hd-field-label">Resolution</div>
                  <div className="hd-field-val" style={{color:'var(--color-text-success)'}}>{selected.resolution}</div>
                </div>
              )}

              {/* Status change */}
              {selected.status !== 'Closed' && (
                <div className="hd-field">
                  <div className="hd-field-label">Update Status</div>
                  <div style={{display:'flex', gap:'6px', flexWrap:'wrap'}}>
                    {STATUSES.filter(s => s !== selected.status).map(s => (
                      <button key={s} className="shortcut-btn" onClick={() => updateStatus(selected._id, s)}>
                        → {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Suggest resolution */}
              {selected.status !== 'Resolved' && selected.status !== 'Closed' && (
                <div className="hd-field">
                  <button className="btn-secondary" style={{width:'100%', fontSize:'12px'}} onClick={getSuggestion} disabled={sugLoading}>
                    {sugLoading ? '⏳ Getting AI suggestion…' : '🤖 AI Suggest Resolution'}
                  </button>
                  {suggestion && (
                    <div className="hd-suggestion">
                      <div className="hd-suggestion-label">🤖 AI Suggestion</div>
                      <pre className="hd-suggestion-text">{suggestion}</pre>
                      <button className="shortcut-btn" style={{marginTop:'6px'}}
                        onClick={() => setResolution(suggestion)}>
                        Use this as resolution
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Resolve */}
              {selected.status !== 'Resolved' && selected.status !== 'Closed' && (
                <div className="hd-field">
                  <div className="hd-field-label">Resolution Notes</div>
                  <textarea className="form-textarea" value={resolution}
                    onChange={e => setResolution(e.target.value)} rows={3}
                    placeholder="Describe how the issue was resolved…" />
                  <button className="btn-primary" style={{marginTop:'8px', width:'100%', fontSize:'12px'}}
                    onClick={submitResolution} disabled={!resolution.trim()}>
                    ✅ Mark Resolved
                  </button>
                </div>
              )}

              {/* Rating */}
              {selected.status === 'Resolved' && !selected.rating && (
                <div className="hd-field">
                  <div className="hd-field-label">Rate this resolution</div>
                  <div style={{display:'flex', gap:'8px', margin:'6px 0'}}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} className="star-btn"
                        style={{opacity: ratingTick===selected._id && rating>=n ? 1 : 0.35}}
                        onClick={() => { setRatingTick(selected._id); setRating(n); }}>
                        ⭐
                      </button>
                    ))}
                  </div>
                  {ratingTick === selected._id && rating > 0 && (
                    <button className="btn-primary" style={{fontSize:'12px'}} onClick={submitRating}>
                      Submit Rating
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="hd-detail-empty">Select a ticket to view details</div>
          )}
        </div>
      </div>

      {showNew && (
        <TicketModal
          convId={null}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}
