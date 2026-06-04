import { useEffect, useState } from 'react';
import api from '../../api/axios';
import useChatStore from '../../store/chatStore';

export default function Sidebar() {
  const { user, users, setUsers, activeUser, setActiveUser, setLanguage, language, logout } = useChatStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get('/users');
        setUsers(data);
      } catch (err) {
        console.error('Failed to load users', err);
      }
    };
    fetchUsers();
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name) => name.slice(0, 2).toUpperCase();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div>
          <div className="sidebar-title">💬 SmartChat AI</div>
          <div className="sidebar-me">@{user?.username}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--border2)',
              color: 'var(--text2)', padding: '4px 8px', borderRadius: 6,
              fontSize: '0.75rem', outline: 'none', cursor: 'pointer',
            }}
            title="AI language"
          >
            <option value="english">EN</option>
            <option value="tamil">தமிழ்</option>
            <option value="tanglish">Tanglish</option>
          </select>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          type="text" placeholder="🔍 Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="sidebar-list">
        {filtered.length === 0 && (
          <div style={{ padding: '1rem', color: 'var(--text3)', fontSize: '0.82rem', textAlign: 'center' }}>
            No users found
          </div>
        )}
        {filtered.map((u) => (
          <div
            key={u.id}
            className={`sidebar-item ${activeUser?.id === u.id ? 'active' : ''}`}
            onClick={() => setActiveUser(u)}
          >
            <div className="avatar">{initials(u.username)}</div>
            <div className="sidebar-item-name">{u.username}</div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.8rem' }} onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
