import { useEffect, useRef, useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../../api/axios';
import useChatStore from '../../store/chatStore';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import SmartReplies from './SmartReplies';
import ScheduleModal from './ScheduleModal';
import SummaryModal from '../Modals/SummaryModal';

export default function ChatWindow() {
  const { user, activeUser, messages, setMessages, addMessage, reorderMessages, language } = useChatStore();
  const [showSchedule, setShowSchedule] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [smartReplies, setSmartReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const bottomRef = useRef(null);

  const conv = activeUser ? (messages[activeUser.id] || []) : [];
  const pendingMsgs = conv.filter((m) => m.sender_id === user.id && m.is_pending && m.is_scheduled === 0);

  // Load conversation
  useEffect(() => {
    if (!activeUser) return;
    setSmartReplies([]);
    const load = async () => {
      try {
        const { data } = await api.get(`/messages/conversation/${activeUser.id}`);
        setMessages(activeUser.id, data);
      } catch (err) {
        console.error('Load messages error:', err);
      }
    };
    load();
  }, [activeUser]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.length]);

  // Fetch smart replies when conversation updates
  const fetchSmartReplies = useCallback(async () => {
    if (!activeUser || conv.length === 0) return;
    setLoadingReplies(true);
    try {
      const { data } = await api.post('/ai/smart-replies', {
        conversationUserId: activeUser.id,
        language,
      });
      setSmartReplies(data.replies || []);
    } catch {
      setSmartReplies([]);
    } finally {
      setLoadingReplies(false);
    }
  }, [activeUser, conv.length, language]);

  useEffect(() => {
    if (conv.length > 0) fetchSmartReplies();
  }, [conv.length, activeUser?.id]);

  // Drag end handler
  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const pendingIds = pendingMsgs.map((m) => m.id);
    const reordered = Array.from(pendingIds);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Optimistic update
    reorderMessages(reordered, activeUser.id);

    try {
      await api.patch('/messages/reorder', { messageIds: reordered, receiverId: activeUser.id });
    } catch (err) {
      alert(err.response?.data?.error || 'Reorder failed');
    }
  };

  const handleReplySelect = (reply) => {
    // Send the smart reply as a message
    sendMessage(reply);
  };

  const sendMessage = async (content) => {
    if (!content.trim() || !activeUser) return;
    try {
      await api.post('/messages/send', { receiverId: activeUser.id, content });
    } catch (err) {
      console.error('Send error:', err);
    }
  };

  const exportPDF = () => window.print();

  if (!activeUser) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="icon">💬</div>
          <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: 6 }}>SmartChat AI</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text3)', textAlign: 'center', maxWidth: 280 }}>
            Select a user from the sidebar to start chatting with AI-powered features
          </div>
        </div>
      </div>
    );
  }

  const initials = activeUser.username.slice(0, 2).toUpperCase();

  return (
    <div className="chat-area">
      {/* Header */}
      <div className="chat-header">
        <div className="avatar">{initials}</div>
        <div className="chat-header-info">
          <div className="chat-header-name">{activeUser.username}</div>
          <div className="chat-header-status">
            {pendingMsgs.length > 0 && `${pendingMsgs.length} pending (reorderable)`}
          </div>
        </div>
        <div className="chat-header-actions">
          <button
            className={`icon-btn ${reorderMode ? 'active' : ''}`}
            title="Reorder mode (drag pending messages)"
            onClick={() => setReorderMode((v) => !v)}
          >
            ↕
          </button>
          <button className="icon-btn" title="Schedule a message" onClick={() => setShowSchedule(true)}>
            ⏰
          </button>
          <button className="icon-btn" title="AI summary + todos" onClick={() => setShowSummary(true)}>
            ✨
          </button>
          <button className="icon-btn" title="Export chat as PDF" onClick={exportPDF}>
            📄
          </button>
        </div>
      </div>

      {/* Reorder banner */}
      {reorderMode && pendingMsgs.length > 0 && (
        <div style={{ padding: '6px 1rem', background: 'rgba(245,166,35,0.1)', borderBottom: '1px solid rgba(245,166,35,0.2)', fontSize: '0.78rem', color: 'var(--warning)' }}>
          ↕ Drag your pending messages below to reorder them before delivery (5-min window)
        </div>
      )}

      {/* Messages */}
      <div className="messages-wrap" id="chat-messages">
        {conv.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem', marginTop: '2rem' }}>
            No messages yet. Say hello! 👋
          </div>
        )}

        {/* Non-pending messages */}
        {conv.filter((m) => !m.is_pending || m.sender_id !== user.id).map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isMe={msg.sender_id === user.id} />
        ))}

        {/* Pending messages - draggable */}
        {reorderMode && pendingMsgs.length > 0 ? (
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', padding: '6px 0 4px', textAlign: 'center' }}>
              — Pending messages (drag to reorder) —
            </div>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="pending-messages">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {pendingMsgs.map((msg, idx) => (
                      <Draggable key={msg.id} draggableId={msg.id} index={idx}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.8 : 1,
                            }}
                          >
                            <MessageBubble
                              msg={msg}
                              isMe={true}
                              dragHandleProps={provided.dragHandleProps}
                              isDragging={snapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        ) : (
          pendingMsgs.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isMe={true} />
          ))
        )}

        <div ref={bottomRef} />
      </div>

      {/* Smart Replies */}
      <SmartReplies replies={smartReplies} loading={loadingReplies} onSelect={handleReplySelect} />

      {/* Input */}
      <MessageInput activeUser={activeUser} />

      {/* Modals */}
      {showSchedule && <ScheduleModal onClose={() => setShowSchedule(false)} activeUser={activeUser} />}
      {showSummary && <SummaryModal onClose={() => setShowSummary(false)} activeUser={activeUser} />}
    </div>
  );
}
