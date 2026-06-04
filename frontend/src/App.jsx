import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useStore } from './store.js';
import Login    from './components/Login.jsx';
import Sidebar  from './components/Sidebar.jsx';
import ChatWindow from './components/ChatWindow.jsx';

const SOCKET_URL = 'http://localhost:3001';

export default function App() {
  const currentUser           = useStore(s => s.currentUser);
  const activeConversation    = useStore(s => s.activeConversation);
  const addMessage            = useStore(s => s.addMessage);
  const deliverMessage        = useStore(s => s.deliverMessage);
  const cancelMessage         = useStore(s => s.cancelMessage);
  const updateMessageAnalysis = useStore(s => s.updateMessageAnalysis);
  const reorderMessages       = useStore(s => s.reorderMessages);
  const setTyping             = useStore(s => s.setTyping);
  const setActiveTicket       = useStore(s => s.setActiveTicket);
  const activeTicket          = useStore(s => s.activeTicket);

  const socketRef    = useRef(null);
  const activeConvRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);

  useEffect(() => { activeConvRef.current = activeConversation; }, [activeConversation]);

  useEffect(() => {
    if (!currentUser) return;
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect',            () => setSocketReady(true));
    socket.on('disconnect',         () => setSocketReady(false));
    socket.on('message',            msg  => addMessage(msg));
    socket.on('message-delivered',  ({ msgId }) => {
      if (activeConvRef.current?.id) deliverMessage(activeConvRef.current.id, msgId);
    });
    socket.on('message-cancelled',  ({ msgId }) => {
      if (activeConvRef.current?.id) cancelMessage(activeConvRef.current.id, msgId);
    });
    socket.on('messages-reordered', ({ orderedIds }) => {
      if (activeConvRef.current?.id) reorderMessages(activeConvRef.current.id, orderedIds);
    });
    socket.on('message-analyzed',   ({ msgId, sentiment, todos }) => {
      if (activeConvRef.current?.id) updateMessageAnalysis(activeConvRef.current.id, msgId, sentiment, todos);
    });
    socket.on('typing',             ({ userId, isTyping }) => {
      if (activeConvRef.current?.id) setTyping(activeConvRef.current.id, userId, isTyping);
    });
    // Ticket events
    socket.on('ticket-created',   (ticket) => setActiveTicket(ticket));
    socket.on('ticket-updated',   (ticket) => {
      if (useStore.getState().activeTicket?._id === ticket._id) setActiveTicket(ticket);
    });
    socket.on('ticket-escalated', ({ priority }) => {
      const cur = useStore.getState().activeTicket;
      if (cur) setActiveTicket({ ...cur, priority, escalated: true });
    });

    return () => { socket.disconnect(); socketRef.current = null; setSocketReady(false); };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!socketRef.current || !socketReady || !activeConversation || !currentUser) return;
    socketRef.current.emit('join', { userId: currentUser.id, conversationId: activeConversation.id });
  }, [activeConversation?.id, socketReady]);

  if (!currentUser) return <Login />;

  return (
    <div className="app-layout">
      <Sidebar socket={socketRef} />
      {activeConversation
        ? <ChatWindow socket={socketRef} />
        : (
          <div className="empty-state">
            <div className="empty-icon">🖥️</div>
            <h2>IT Helpdesk AI</h2>
            <p>Select a contact from the sidebar to start a support conversation</p>
            <div className="feature-hints">
              <span>🎫 Smart ticket raising</span>
              <span>🔍 Instant KB answers</span>
              <span>⏰ SLA countdown</span>
              <span>🚨 Auto-escalation</span>
              <span>🔀 Reorder messages</span>
              <span>🎤 Voice-to-text</span>
              <span>✨ AI smart replies</span>
              <span>📄 PDF ticket report</span>
            </div>
            <p style={{fontSize:12,color:'var(--text3)',marginTop:16}}>
              💡 Tip: Use "agent_" prefix in username (e.g. agent_john) to login as IT agent
            </p>
          </div>
        )
      }
    </div>
  );
}
