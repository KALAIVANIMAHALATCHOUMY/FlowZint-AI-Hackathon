import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useStore } from '../store.js';

const API = 'http://localhost:3001/api';
const PRIORITY_DOT = { critical:'🔴', high:'🟠', medium:'🟡', low:'🟢' };
const STATUS_LABEL  = { open:'🆕 Open', 'in-progress':'🔄 In Progress', resolved:'✅ Resolved', closed:'🔒 Closed' };

function SLACountdown({ deadline, status }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (status==='resolved'||status==='closed') { setLabel('Completed'); return; }
    const update = () => {
      const diff = new Date(deadline) - new Date();
      if (diff <= 0) { setLabel('⚠ SLA Breached!'); return; }
      const h = Math.floor(diff/3600000);
      const m = Math.floor((diff%3600000)/60000);
      setLabel(h>0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [deadline, status]);
  const isBreached = label.includes('Breached');
  return <span className={`sla-tag ${isBreached?'breached':''}`}>{label}</span>;
}

export default function TicketDashboard({ onClose }) {
  const currentUser = useStore(s => s.currentUser);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [updating, setUpdating] = useState(null);

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    try {
      const { data } = await axios.get(`${API}/tickets/user/${currentUser.id}`);
      setTickets(data);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  };

  const updateStatus = async (ticketId, status) => {
    setUpdating(ticketId);
    try {
      const { data } = await axios.patch(`${API}/tickets/${ticketId}`, { status });
      setTickets(prev => prev.map(t => t._id===ticketId ? data : t));
    } catch {}
    finally { setUpdating(null); }
  };

  const filtered = filter==='all' ? tickets : tickets.filter(t => t.status===filter);

  return (
    <div className="ai-chat-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="ai-chat-panel" style={{width:580}}>
        <div className="ai-chat-header">
          <div className="ai-chat-title">
            <span className="ai-badge">🎫</span>
            <div>
              <div className="ai-chat-name">My Support Tickets</div>
              <div className="ai-chat-sub">{tickets.length} total · {tickets.filter(t=>t.status==='open'||t.status==='in-progress').length} active</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="header-btn" onClick={loadTickets}>🔄 Refresh</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{display:'flex',gap:4,padding:'8px 14px',borderBottom:'.5px solid var(--color-border-tertiary)',background:'var(--color-background-secondary)'}}>
          {['all','open','in-progress','resolved','closed'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{padding:'4px 10px',fontSize:11,borderRadius:99,border:'.5px solid var(--color-border-tertiary)',cursor:'pointer',
                background: filter===f?'var(--color-background-info)':'transparent',
                color: filter===f?'var(--color-text-info)':'var(--color-text-secondary)'}}>
              {STATUS_LABEL[f]||'All'}
            </button>
          ))}
        </div>

        <div className="ai-chat-messages" style={{padding:'10px 14px',gap:8}}>
          {loading && <div style={{textAlign:'center',color:'var(--color-text-tertiary)',padding:'2rem'}}>Loading tickets…</div>}
          {!loading && filtered.length===0 && (
            <div style={{textAlign:'center',color:'var(--color-text-tertiary)',padding:'2rem'}}>
              <div style={{fontSize:32,marginBottom:8}}>🎫</div>
              No tickets yet. Raise one from the chat using the 🎫 button.
            </div>
          )}
          {filtered.map(ticket => (
            <div key={ticket._id} className="ticket-card">
              <div className="ticket-card-head">
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:500}}>{PRIORITY_DOT[ticket.priority]} {ticket.ticketNo}</span>
                  <span className={`ticket-status-badge ${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
                  {ticket.escalated && <span style={{fontSize:10,padding:'2px 6px',borderRadius:99,background:'var(--color-background-danger)',color:'var(--color-text-danger)'}}>🚨 Escalated</span>}
                </div>
                <SLACountdown deadline={ticket.slaDeadline} status={ticket.status} />
              </div>
              <div className="ticket-card-title">{ticket.title}</div>
              <div className="ticket-card-meta">
                <span>{ticket.category}</span>
                <span>·</span>
                <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                <span>·</span>
                <span>SLA: {ticket.slaHours}h</span>
              </div>
              {ticket.resolutionNote && (
                <div style={{fontSize:11,color:'var(--color-text-success)',marginTop:6,padding:'4px 8px',background:'var(--color-background-success)',borderRadius:4}}>
                  ✅ Resolution: {ticket.resolutionNote}
                </div>
              )}
              {(ticket.status==='open'||ticket.status==='in-progress') && (
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  {ticket.status==='open' && (
                    <button className="btn-secondary" style={{fontSize:11,padding:'3px 10px'}}
                      onClick={()=>updateStatus(ticket._id,'in-progress')} disabled={updating===ticket._id}>
                      🔄 Mark In Progress
                    </button>
                  )}
                  <button className="btn-secondary" style={{fontSize:11,padding:'3px 10px',color:'var(--color-text-success)',borderColor:'var(--color-border-success)'}}
                    onClick={()=>updateStatus(ticket._id,'resolved')} disabled={updating===ticket._id}>
                    ✅ Mark Resolved
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
