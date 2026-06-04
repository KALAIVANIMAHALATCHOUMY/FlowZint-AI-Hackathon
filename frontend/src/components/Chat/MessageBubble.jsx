import { useState } from 'react';
import dayjs from 'dayjs';
import api from '../../api/axios';
import useChatStore from '../../store/chatStore';

const EMOTIONS = {
  happy: '😊', sad: '😢', angry: '😠',
  excited: '🤩', neutral: '', confused: '😕', urgent: '⚡',
};

export default function MessageBubble({ msg, isMe, dragHandleProps, isDragging }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transLang, setTransLang] = useState('english');
  const { updateTranscript, activeUser, user } = useChatStore();

  const isPending = msg.is_pending === 1;
  const isScheduled = msg.is_scheduled === 1;
  const emotion = EMOTIONS[msg.emotion] || '';
  const otherId = isMe ? msg.receiver_id : msg.sender_id;

  const handleTranscribe = () => {
    // Use browser Web Speech API for transcription demo
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser. Use Chrome.');
      return;
    }

    if (msg.transcript) {
      setShowTranscript((v) => !v);
      return;
    }

    setTranscribing(true);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    const langMap = { english: 'en-US', tamil: 'ta-IN', tanglish: 'en-IN' };
    recognition.lang = langMap[transLang] || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // For demo: if audio_url exists, try to play and transcribe
    // In real scenario, we'd send audio to Whisper backend
    // Here we show a demo transcript
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      await api.patch(`/messages/${msg.id}/transcript`, { transcript, language: transLang }).catch(() => {});
      updateTranscript(msg.id, transcript, otherId);
      setShowTranscript(true);
      setTranscribing(false);
    };

    recognition.onerror = () => {
      // Fallback demo transcript
      const demoTranscript = transLang === 'tamil'
        ? 'நான் உங்களுக்கு ஒரு குரல் செய்தி அனுப்பினேன்'
        : transLang === 'tanglish'
        ? 'Naan ungaluku oru voice message anupinen'
        : 'I sent you a voice message';
      updateTranscript(msg.id, demoTranscript, otherId);
      api.patch(`/messages/${msg.id}/transcript`, { transcript: demoTranscript }).catch(() => {});
      setShowTranscript(true);
      setTranscribing(false);
    };

    recognition.start();

    // For audio messages with a URL - we show the transcript directly after a delay (demo)
    if (msg.audio_url) {
      setTimeout(() => {
        recognition.stop();
      }, 3000);
    } else {
      setTimeout(() => recognition.stop(), 100);
    }
  };

  return (
    <div className={`msg-row ${isMe ? 'mine' : ''}`}>
      {!isMe && (
        <div className="avatar sm">
          {msg.sender_name?.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div className="bubble-wrap">
        <div
          className={`bubble ${isMe ? 'outgoing' : 'incoming'} ${isPending && !isScheduled ? 'pending' : ''} ${isScheduled ? 'scheduled' : ''}`}
          style={isDragging ? { boxShadow: '0 8px 24px rgba(0,0,0,0.4)' } : {}}
        >
          {/* Drag handle */}
          {dragHandleProps && (
            <span className="drag-handle" {...dragHandleProps} title="Drag to reorder">⠿</span>
          )}

          {/* Scheduled indicator */}
          {isScheduled && (
            <div className="schedule-info">
              ⏰ Scheduled: {dayjs(msg.scheduled_at).format('MMM D, HH:mm')}
            </div>
          )}

          {/* Text content */}
          {msg.type === 'text' && msg.content && (
            <span>{msg.content}</span>
          )}

          {/* Audio message */}
          {msg.type === 'audio' && (
            <div>
              <div className="audio-player">
                {msg.audio_url && <audio src={msg.audio_url} controls />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <select
                    className="transcript-lang-select"
                    value={transLang}
                    onChange={(e) => setTransLang(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'inherit', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', outline: 'none' }}
                  >
                    <option value="english">English</option>
                    <option value="tamil">Tamil</option>
                    <option value="tanglish">Tanglish</option>
                  </select>
                  <button
                    className="btn-transcribe"
                    onClick={handleTranscribe}
                    disabled={transcribing}
                  >
                    {transcribing ? '⏳ Reading...' : msg.transcript ? '📝 Read again' : '📝 Read as text'}
                  </button>
                </div>
              </div>
              {showTranscript && msg.transcript && (
                <div className="transcript-box">
                  <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>Transcript ({transLang}):</span>
                  <div style={{ marginTop: 3 }}>{msg.transcript}</div>
                </div>
              )}
            </div>
          )}

          {/* Emotion */}
          {emotion && !isScheduled && (
            <span style={{ float: isMe ? 'left' : 'right', fontSize: '0.9rem', marginLeft: 4 }}>{emotion}</span>
          )}
        </div>

        {/* Meta row */}
        <div className="msg-meta">
          <span>{dayjs(msg.created_at).format('HH:mm')}</span>
          {isPending && !isScheduled && <span className="pending-tag">⏱ pending</span>}
          {isMe && !isPending && <span title="Delivered">✓✓</span>}
        </div>
      </div>
    </div>
  );
}
