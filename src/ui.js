import React from 'react';

export const C = {
  bg: '#09090f', card: '#171728', card2: '#10101c', purple: '#7c4dff',
  green: '#00c853', red: '#ff1744', orange: '#ff9800', cyan: '#00bcd4',
  white: '#fff', grey: '#9696aa', line: '#292940',
};

export const card = (extra = {}) => ({
  background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
  padding: 14, ...extra,
});

export const btn = (background = C.purple, extra = {}) => ({
  border: 0, borderRadius: 10, padding: '10px 13px', background,
  color: C.white, fontWeight: 700, cursor: 'pointer', ...extra,
});

export const inp = (extra = {}) => ({
  width: '100%', boxSizing: 'border-box', background: C.card2,
  border: `1px solid ${C.line}`, color: C.white, borderRadius: 10,
  padding: 11, outline: 'none', ...extra,
});

export function Modal({ children, onClose, bottom = false }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.84)', display: 'flex', alignItems: bottom ? 'flex-end' : 'center', justifyContent: 'center', padding: bottom ? 0 : 18 }}
      onMouseDown={e => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{ background: C.bg, width: '100%', maxWidth: 520, borderRadius: bottom ? '18px 18px 0 0' : 18, border: `1px solid ${C.line}`, padding: 16, maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, close }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}><b>{title}</b><button aria-label="Close" style={{ background: 'none', border: 0, color: C.white, fontSize: 22, cursor: 'pointer' }} onClick={close}>×</button></div>;
}

export function Field({ label, children }) {
  return <div style={{ marginBottom: 11 }}><div style={{ color: C.grey, fontSize: 10, marginBottom: 5 }}>{label}</div>{children}</div>;
}

export function SectionTitle({ title, action, onAction }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '15px 1px 8px' }}><b style={{ fontSize: 14 }}>{title}</b>{action && <button style={btn(C.purple, { padding: '5px 9px', fontSize: 10 })} onClick={onAction}>{action}</button>}</div>;
}

export function Empty({ text }) {
  return <div style={card({ textAlign: 'center', color: C.grey, fontSize: 12, padding: 20, marginBottom: 10 })}>{text}</div>;
}

export function TxRow({ tx, fmt, onEdit, onDelete }) {
  const incoming = tx.type === 'income' || (tx.type === 'transfer' && tx.direction === 'in');
  const color = tx.type === 'refund' ? C.orange : tx.type === 'transfer' ? C.cyan : incoming ? C.green : C.red;
  const sign = tx.type === 'refund' ? '↩ ' : incoming ? '+' : '-';
  return (
    <div style={card({ marginBottom: 7, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 })}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <b style={{ fontSize: 12 }}>{tx.category || 'Uncategorized'}</b>
        <div style={{ color: C.grey, fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.date || ''} • {tx.type}{tx.note ? ` • ${tx.note}` : ''}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <b style={{ color, fontSize: 12, whiteSpace: 'nowrap' }}>{sign}{fmt(tx.amount)}</b>
        {tx.type !== 'transfer' && onEdit && <button aria-label="Edit" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={onEdit}>✏️</button>}
        {onDelete && <button aria-label="Delete" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={onDelete}>🗑️</button>}
      </div>
    </div>
  );
}

export function Loader({ text = 'Loading...' }) {
  return <div style={{ minHeight: '100vh', background: C.bg, color: C.white, display: 'grid', placeItems: 'center', fontFamily: 'Segoe UI, sans-serif' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 46 }}>💸</div><b style={{ color: C.purple, fontSize: 22 }}>SpendSmart</b><div style={{ color: C.grey, marginTop: 8, fontSize: 12 }}>{text}</div></div></div>;
}
