import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import { useStore } from '../store.js';
import ScheduleModal from './ScheduleModal.jsx';
import TicketPanel from './TicketPanel.jsx';

const API = 'http://localhost:3001/api';
const SENTIMENT = { happy:'😊', sad:'😢', angry:'😠', urgent:'🚨', confused:'😕', excited:'🎉' };
const PRIORITY_COLOR = { critical:'#E24B4A', high:'#E6954A', medium:'#EF9F27', low:'#1D9E75' };

function SLABar({ ticket }) {
  const [pct, setPct]   = useState(100);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!ticket||ticket.status==='resolved'||ticket.status==='closed') return;
    const update = () => {
      const total = ticket.slaHours * 3600000;
      const used  = Date.now() - new Date(ticket.createdAt).getTime();
      const left  = Math.max(0, total - used);
      const p     = Math.max(0, Math.round((left/total)*100));
      setPct(p);
      const h = Math.floor(left/3600000), m = Math.floor((left%3600000)/60000);
      setLabel(left<=0 ? '⚠ SLA Breached!' : h>0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [ticket]);

  if (!ticket||ticket.status==='resolved'||ticket.status==='closed') return null;
  const color = pct>50?'#1D9E75':pct>20?'#EF9F27':'#E24B4A';

  return (
    <div className="sla-bar-wrap">
      <div className="sla-bar-info">
        <span style={{color: PRIORITY_COLOR[ticket.priority]}}>
          {ticket.priority==='critical'?'🔴':ticket.priority==='high'?'🟠':ticket.priority==='medium'?'🟡':'🟢'}
          &nbsp;{ticket.ticketNo} — {ticket.priority?.toUpperCase()} · {ticket.category}
        </span>
        <span className={`sla-tag ${pct===0?'breached':''}`}>{label}</span>
      </div>
      <div className="sla-bar-track"><div className="sla-bar-fill" style={{width:`${pct}%`,background:color}} /></div>
    </div>
  );
}

function SortableMessage({ msg, isPending, isMine, onTranscribe, onCancel, transcribing, convId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: msg.id, disabled: !isPending||!isMine });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.45:1 };
  const isScheduled = msg.status==='scheduled';
  const isAudio     = msg.type==='audio';
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';

  return (
    <div ref={setNodeRef} style={style} className={`msg-row ${isMine?'mine':'theirs'}`}>
      {isPending && isMine && (
        <button className="drag-handle" {...attributes} {...listeners} title="Drag to reorder (5 min window)">⠿</button>
      )}
      <div className={`msg-bubble ${isMine?'mine':'theirs'} ${isScheduled?'scheduled-bubble':''}`}>
        {SENTIMENT[msg.sentiment] && <span className="sentiment-badge" title={`Mood: ${msg.sentiment}`}>{SENTIMENT[msg.sentiment]}</span>}
        {isScheduled && (
          <div className="scheduled-label">
            ⏰ Scheduled: {msg.scheduledAt ? new Date(msg.scheduledAt).toLocaleString() : ''}
            {isMine && <button className="cancel-btn" onClick={()=>onCancel(convId, msg.id)}>✕ Cancel</button>}
          </div>
        )}
        {isAudio && msg.audioUrl ? (
          <div className="audio-msg">
            <audio controls src={msg.audioUrl} className="audio-player" preload="metadata" />
            {!msg.transcript ? (
              <button className="transcribe-btn" onClick={()=>onTranscribe(msg)} disabled={transcribing}>
                {transcribing?'⏳ Transcribing…':'📝 Read as text (silent)'}
              </button>
            ) : (
              <div className="transcript-box">
                <div className="transcript-label">📝 Transcript</div>
                <p className="transcript-text">{msg.transcript}</p>
              </div>
            )}
          </div>
        ) : msg.content && <p className="msg-text">{msg.content}</p>}
        <div className="msg-meta">
          <span className="msg-time">{time}</span>
          {isMine && <span className="msg-status">{isScheduled?'⏰':msg.status==='delivered'?'✓✓':'✓'}</span>}
          {isPending && isMine && <span className="pending-tag">reorderable</span>}
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({ socket }) {
  const currentUser        = useStore(s => s.currentUser);
  const activeConversation = useStore(s => s.activeConversation);
  const messages           = useStore(s => s.messages);
  const pendingIds         = useStore(s => s.pendingIds);
  const users              = useStore(s => s.users);
  const smartReplies       = useStore(s => s.smartReplies);
  const clearSmartReplies  = useStore(s => s.clearSmartReplies);
  const fetchSmartReplies  = useStore(s => s.fetchSmartReplies);
  const fetchSummary       = useStore(s => s.fetchSummary);
  const summary            = useStore(s => s.summary);
  const showSummary        = useStore(s => s.showSummary);
  const setShowSummary     = useStore(s => s.setShowSummary);
  const cancelScheduled    = useStore(s => s.cancelScheduled);
  const setTranscript      = useStore(s => s.setTranscript);
  const setTranscribing    = useStore(s => s.setTranscribing);
  const isTranscribing     = useStore(s => s.isTranscribing);
  const language           = useStore(s => s.language);
  const typingUsers        = useStore(s => s.typingUsers);
  const reorderMessages    = useStore(s => s.reorderMessages);

  const convId   = activeConversation?.id;
  const convMsgs = messages[convId] || [];
  const pending  = pendingIds[convId] || new Set();
  const otherUser = users.find(u => u.id === activeConversation?.otherUserId);
  const isOtherTyping = typingUsers[convId] && typingUsers[convId] !== currentUser?.id;

  const [input,          setInput]          = useState('');
  const [showSchedule,   setShowSchedule]   = useState(false);
  const [showTicket,     setShowTicket]     = useState(false);
  const [isRecording,    setIsRecording]    = useState(false);
  const [mediaRecorder,  setMediaRecorder]  = useState(null);
  const [activeTicket,   setActiveTicket]   = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const bottomRef   = useRef(null);
  const typingTimer = useRef(null);
  const sensors     = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [convMsgs.length]);
  useEffect(() => { if (convMsgs.length>0) fetchSmartReplies(convId); }, [convMsgs.length]);

  // Listen for ticket events
  useEffect(() => {
    if (!socket?.current) return;
    const s = socket.current;
    s.on('ticket-created', (t) => setActiveTicket(t));
    s.on('ticket-updated',  (t) => setActiveTicket(prev => prev?._id===t._id ? t : prev));
    s.on('ticket-escalated',({ priority }) => setActiveTicket(prev => prev ? {...prev, priority, escalated:true} : prev));
    return () => { s.off('ticket-created'); s.off('ticket-updated'); s.off('ticket-escalated'); };
  }, [socket?.current]);

  const sendMessage = useCallback((text) => {
    const content = (text||input).trim();
    if (!content||!socket?.current) return;
    socket.current.emit('send-message', { conversationId:convId, senderId:currentUser.id, content, type:'text' });
    setInput(''); clearSmartReplies();
  }, [input, convId, currentUser?.id]);

  const handleKeyDown = (e) => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); } };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if(!socket?.current) return;
    socket.current.emit('typing',{conversationId:convId,userId:currentUser.id,isTyping:true});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.current?.emit('typing',{conversationId:convId,userId:currentUser.id,isTyping:false}), 1500);
  };

  const startRecording = async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio:true });
      const recorder = new MediaRecorder(stream, { mimeType:'audio/webm' });
      const chunks   = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks,{type:'audio/webm'});
        stream.getTracks().forEach(t=>t.stop());
        const form = new FormData();
        form.append('audio', blob, 'voice.webm');
        try {
          const { data } = await axios.post(`${API}/audio`, form);
          socket.current?.emit('send-message',{ conversationId:convId, senderId:currentUser.id, content:'🎤 Voice message', type:'audio', audioUrl:data.audioUrl });
        } catch { alert('Audio upload failed.'); }
      };
      recorder.start(); setMediaRecorder(recorder); setIsRecording(true);
    } catch { alert('Allow microphone access to record voice messages.'); }
  };

  const stopRecording = () => { if(mediaRecorder&&isRecording){ mediaRecorder.stop(); setIsRecording(false); setMediaRecorder(null); } };

  const handleTranscribe = async (msg) => {
    setTranscribing(msg.id, true);
    try {
      const form = new FormData();
      form.append('msgId', msg.id); form.append('language', language);
      if (msg.audioUrl) { const r=await fetch(msg.audioUrl); form.append('audio',await r.blob(),'voice.webm'); }
      const { data } = await axios.post(`${API}/transcribe`, form);
      setTranscript(convId, msg.id, data.transcript);
    } catch { setTranscribing(msg.id, false); alert('Transcription failed.'); }
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over||active.id===over.id) return;
    const pendingList = convMsgs.filter(m => pending.has(m.id));
    const oi = pendingList.findIndex(m=>m.id===active.id);
    const ni = pendingList.findIndex(m=>m.id===over.id);
    if(oi<0||ni<0) return;
    const reordered  = arrayMove(pendingList, oi, ni);
    const orderedIds = reordered.map(m=>m.id);
    reorderMessages(convId, orderedIds);
    socket.current?.emit('reorder-messages',{conversationId:convId, orderedIds});
  };

  const exportPDF = () => {
    const doc      = new jsPDF({ unit:'mm', format:'a4' });
    const myName   = currentUser?.username;
    const otherName = otherUser?.username||'User';
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text('IT Helpdesk AI — Ticket Conversation Report', 14, 18);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`${myName} ↔ ${otherName}  |  ${new Date().toLocaleString()}`, 14, 26);
    if (activeTicket) {
      doc.setFontSize(9);
      doc.text(`Ticket: ${activeTicket.ticketNo} | Category: ${activeTicket.category} | Priority: ${activeTicket.priority?.toUpperCase()} | Status: ${activeTicket.status}`, 14, 32);
    }
    doc.setDrawColor(200); doc.line(14,36,196,36);
    let y=44; doc.setTextColor(0);
    convMsgs.forEach(msg => {
      if (!msg.content) return;
      if (y>270) { doc.addPage(); y=20; }
      const sender = (msg.senderId||msg.sender_id)===currentUser.id ? myName : otherName;
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text(`${sender}   ${msg.createdAt?new Date(msg.createdAt).toLocaleString():''}`, 14, y); y+=5;
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(20);
      const lines = doc.splitTextToSize(msg.type==='audio'?(msg.transcript?`[Voice]: ${msg.transcript}`:msg.content):msg.content, 180);
      lines.forEach(l => { if(y>275){doc.addPage();y=20;} doc.text(l,14,y); y+=6; }); y+=4;
    });
    doc.save(`Ticket_${activeTicket?.ticketNo||'chat'}_${Date.now()}.pdf`);
  };

  const handleSummarize = async () => { setSummaryLoading(true); await fetchSummary(convId); setSummaryLoading(false); };

  const resolveTicket = async () => {
    if (!activeTicket) return;
    const note = prompt('Add resolution note (optional):') || 'Issue resolved';
    try {
      const { data } = await axios.patch(`${API}/tickets/${activeTicket._id}`,{status:'resolved',resolutionNote:note});
      setActiveTicket(data);
      sendMessage(`✅ Ticket ${activeTicket.ticketNo} has been resolved. Resolution: ${note}`);
    } catch {}
  };

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-user">
          <div className="avatar" style={{background:otherUser?.avatar||'#888'}}>{otherUser?.username?.[0]?.toUpperCase()}</div>
          <div>
            <div className="chat-header-name">{otherUser?.username}</div>
            {isOtherTyping ? <div className="typing-indicator">typing…</div>
              : <div className="chat-header-sub">{otherUser?.username?.startsWith('agent')?'🎧 IT Agent':'👤 User'}</div>}
          </div>
        </div>
        <div className="chat-header-actions">
          {activeTicket && (activeTicket.status==='open'||activeTicket.status==='in-progress') && (
            <button className="header-btn resolve-btn" onClick={resolveTicket}>✅ Resolve</button>
          )}
          <button className="header-btn" onClick={handleSummarize} disabled={summaryLoading}>
            {summaryLoading?'⏳':'📝'} Summarize
          </button>
          <button className="header-btn" onClick={exportPDF}>📄 PDF</button>
        </div>
      </div>

      {/* SLA bar */}
      {activeTicket && <SLABar ticket={activeTicket} />}

      {/* Ticket info banner */}
      {activeTicket && (
        <div className={`ticket-banner priority-${activeTicket.priority}`}>
          <span>🎫 {activeTicket.ticketNo}</span>
          <span className="ticket-banner-title">{activeTicket.title}</span>
          <span className={`ticket-status-badge ${activeTicket.status}`}>
            {activeTicket.status==='open'?'🆕 Open':activeTicket.status==='in-progress'?'🔄 In Progress':activeTicket.status==='resolved'?'✅ Resolved':'🔒 Closed'}
          </span>
          {activeTicket.escalated && <span className="escalated-badge">🚨 Escalated</span>}
        </div>
      )}

      {/* Summary */}
      {showSummary && summary && (
        <div className="summary-panel">
          <div className="summary-header"><span>✨ Ticket Summary</span><button onClick={()=>setShowSummary(false)}>✕</button></div>
          <div className="summary-text">{summary}</div>
        </div>
      )}

      {/* Messages */}
      <div className="messages-area">
        {convMsgs.length===0 && (
          <div className="no-messages">
            Start the support conversation 💬<br/>
            <small>Click 🎫 Raise Ticket to log an issue, or just type your problem</small>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={convMsgs.map(m=>m.id)} strategy={verticalListSortingStrategy}>
            {convMsgs.map(msg => {
              const senderId = msg.senderId||msg.sender_id;
              return (
                <SortableMessage key={msg.id} msg={msg}
                  isPending={pending.has(msg.id)} isMine={senderId===currentUser?.id}
                  onTranscribe={handleTranscribe} onCancel={cancelScheduled}
                  transcribing={!!isTranscribing[msg.id]} convId={convId} />
              );
            })}
          </SortableContext>
        </DndContext>
        {isOtherTyping && (
          <div className="msg-row theirs"><div className="msg-bubble theirs typing-dots"><span/><span/><span/></div></div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Smart replies */}
      {smartReplies.length>0 && (
        <div className="smart-replies">
          <span className="smart-replies-label">✨ Smart replies:</span>
          {smartReplies.map((r,i)=><button key={i} className="smart-reply-chip" onClick={()=>sendMessage(r)}>{r}</button>)}
          <button className="smart-reply-dismiss" onClick={clearSmartReplies}>✕</button>
        </div>
      )}

      {/* Input area */}
      <div className="input-area">
        <button className={`icon-btn record-btn ${isRecording?'recording':''}`}
          onMouseDown={startRecording} onMouseUp={stopRecording}
          onTouchStart={startRecording} onTouchEnd={stopRecording}
          title="Hold to record voice issue">
          {isRecording?'🔴':'🎤'}
        </button>
        <textarea className="message-input"
          placeholder="Describe your IT issue… (Enter to send)"
          value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} rows={1} />
        <button className="icon-btn ticket-raise-btn" onClick={()=>setShowTicket(true)} title="Raise a support ticket">🎫</button>
        <button className="icon-btn schedule-btn" onClick={()=>setShowSchedule(true)} title="Schedule maintenance notification">⏰</button>
        <button className="send-btn" onClick={()=>sendMessage()} disabled={!input.trim()}>Send →</button>
      </div>

      {showSchedule && (
        <ScheduleModal inputValue={input} convId={convId}
          onClose={()=>setShowSchedule(false)} onScheduled={()=>{setInput('');setShowSchedule(false);}} />
      )}
      {showTicket && (
        <TicketPanel convId={convId}
          onClose={()=>setShowTicket(false)}
          onCreated={(t)=>{ setActiveTicket(t); setShowTicket(false); }} />
      )}
    </div>
  );
}
