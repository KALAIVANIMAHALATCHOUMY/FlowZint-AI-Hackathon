import { useState, useRef } from 'react';
import api from '../../api/axios';
import useChatStore from '../../store/chatStore';

export default function MessageInput({ activeUser }) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const { user } = useChatStore();

  const sendText = async () => {
    if (!text.trim() || !activeUser) return;
    setSending(true);
    try {
      await api.post('/messages/send', { receiverId: activeUser.id, content: text.trim() });
      setText('');
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        // Upload audio
        const formData = new FormData();
        formData.append('audio', blob, 'voice.webm');
        try {
          const { data: upload } = await api.post('/messages/upload-audio', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          await api.post('/messages/send', {
            receiverId: activeUser.id,
            content: '🎤 Voice message',
            type: 'audio',
            audioUrl: upload.audioUrl,
          });
        } catch (err) {
          alert('Failed to send voice message');
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied. Please allow microphone to record audio.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="chat-input-area">
      <div className="input-row">
        <textarea
          className="msg-input"
          rows={1}
          placeholder={`Message ${activeUser.username}...`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={`record-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          title={recording ? 'Stop recording' : 'Record voice message'}
        >
          {recording ? '⏹' : '🎤'}
        </button>
        <button
          className="send-btn"
          onClick={sendText}
          disabled={!text.trim() || sending}
          title="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
