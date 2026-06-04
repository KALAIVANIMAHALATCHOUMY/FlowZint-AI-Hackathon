import React, { useState } from 'react';
import { useStore } from '../store.js';

// Fix: datetime-local needs LOCAL time, not UTC
const toLocalISO = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export default function ScheduleModal({ inputValue, convId, onClose, onScheduled }) {
  const scheduleMessage = useStore(s => s.scheduleMessage);
  const [content,  setContent]  = useState(inputValue || '');
  const [dateTime, setDateTime] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Min = now + 1 minute in LOCAL time
  const minDateTime = toLocalISO(new Date(Date.now() + 60_000));

  const shortcuts = [
    { label: '5 min later',    getTime: () => new Date(Date.now() + 5  * 60_000) },
    { label: '15 min later',   getTime: () => new Date(Date.now() + 15 * 60_000) },
    { label: '30 min later',   getTime: () => new Date(Date.now() + 30 * 60_000) },
    { label: '1 hour later',   getTime: () => new Date(Date.now() + 60 * 60_000) },
    { label: '3 hours later',  getTime: () => new Date(Date.now() + 3 * 60 * 60_000) },
    { label: 'Tonight 9 PM',   getTime: () => { const d = new Date(); d.setHours(21,0,0,0); return d; }},
    { label: 'Tomorrow 8 AM',  getTime: () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(8,0,0,0);  return d; }},
    { label: 'Tomorrow 9 AM',  getTime: () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0);  return d; }},
    { label: 'Tomorrow noon',  getTime: () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(12,0,0,0); return d; }},
  ];

  const handleSchedule = async () => {
    if (!content.trim())  return setError('Please enter a message');
    if (!dateTime)        return setError('Please pick a date and time');

    // Convert local datetime string back to real Date
    const selectedDate = new Date(dateTime);
    if (selectedDate <= new Date()) return setError('Selected time must be in the future');

    setLoading(true);
    setError('');
    try {
      await scheduleMessage(convId, content.trim(), selectedDate.toISOString());
      onScheduled();
    } catch {
      setError('Failed to schedule. Is the backend running?');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>⏰ Schedule Message</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="form-label">Message</label>
          <textarea
            className="form-textarea"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Type your message…"
            rows={3}
            autoFocus
          />

          <label className="form-label" style={{ marginTop: '14px' }}>Send at (your local time)</label>
          <input
            className="form-input"
            type="datetime-local"
            value={dateTime}
            min={minDateTime}
            onChange={e => setDateTime(e.target.value)}
          />

          <div className="shortcuts-label">⚡ Quick options</div>
          <div className="shortcuts">
            {shortcuts.map(s => (
              <button key={s.label} className="shortcut-btn"
                onClick={() => {
                  const t = s.getTime();
                  // Skip if in the past (e.g. "Tonight 9PM" when it's already past 9)
                  if (t <= new Date()) return setError(`"${s.label}" is already in the past`);
                  setError('');
                  setDateTime(toLocalISO(t));
                }}>
                {s.label}
              </button>
            ))}
          </div>

          {error && <p className="form-error">{error}</p>}

          {dateTime && (
            <div className="schedule-preview">
              ✅ Will send at: <strong>{new Date(dateTime).toLocaleString()}</strong>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSchedule}
            disabled={loading || !content.trim() || !dateTime}>
            {loading ? 'Scheduling…' : '⏰ Schedule Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
