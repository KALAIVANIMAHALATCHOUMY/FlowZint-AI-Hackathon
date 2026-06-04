import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:3001/api';
const CAT_ICONS = { Hardware:'🖥️', Software:'💿', Network:'🌐', Access:'🔑', Other:'🔧' };

export default function KnowledgeBase({ onClose }) {
  const [articles, setArticles] = useState([]);
  const [query,    setQuery]    = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { axios.get(`${API}/kb`).then(r => setArticles(r.data)); }, []);

  const search = async (q) => {
    setQuery(q);
    const r = await axios.get(`${API}/kb/search?q=${encodeURIComponent(q)}`);
    setArticles(r.data);
  };

  return (
    <div className="hd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hd-panel" style={{maxWidth:'520px'}}>
        <div className="hd-header">
          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <span style={{fontSize:'22px'}}>📚</span>
            <div>
              <div style={{fontWeight:500, fontSize:'15px'}}>Knowledge Base</div>
              <div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Self-service IT solutions</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{padding:'12px 16px', borderBottom:'0.5px solid var(--color-border-tertiary)'}}>
          <input className="form-input" value={query}
            onChange={e => search(e.target.value)}
            placeholder="🔍 Search: password reset, VPN, printer, email…" />
        </div>

        <div style={{flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:'8px'}}>
          {articles.length === 0 && (
            <div style={{textAlign:'center', color:'var(--color-text-tertiary)', marginTop:'40px', fontSize:'13px'}}>
              No articles found for "{query}"
            </div>
          )}
          {articles.map(art => (
            <div key={art.id} className="kb-card" onClick={() => setExpanded(expanded===art.id ? null : art.id)}>
              <div className="kb-card-head">
                <span style={{fontSize:'18px'}}>{CAT_ICONS[art.category]||'🔧'}</span>
                <div style={{flex:1}}>
                  <div className="kb-card-title">{art.title}</div>
                  <div style={{display:'flex', gap:'6px', marginTop:'4px'}}>
                    <span className="t-badge neutral">{art.category}</span>
                    <span className="t-badge success">⏱ {art.eta}</span>
                  </div>
                </div>
                <span style={{color:'var(--color-text-tertiary)', fontSize:'14px'}}>
                  {expanded===art.id ? '▲' : '▼'}
                </span>
              </div>

              {expanded === art.id && (
                <div className="kb-steps">
                  {art.steps.map((step, i) => (
                    <div key={i} className="kb-step">
                      <div className="kb-step-num">{i+1}</div>
                      <div className="kb-step-text">{step.replace(/^\d+\.\s*/,'')}</div>
                    </div>
                  ))}
                  <div style={{marginTop:'8px', padding:'8px', background:'var(--color-background-info)',
                    borderRadius:'6px', fontSize:'12px', color:'var(--color-text-info)'}}>
                    💡 Still having issues? Create a support ticket and an agent will assist you.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
