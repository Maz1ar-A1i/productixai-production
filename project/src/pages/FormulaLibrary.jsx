import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Search, Plus, Pencil, Trash2, Copy, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle, Filter, X,
} from 'lucide-react';
import { formulaService } from '../services/api';

const TEMPLATE_LABELS = {
  ratio: 'Ratio', percentage: 'Percentage', total: 'Total (Sum)',
  difference: 'Difference', product: 'Product',
  margin: 'Margin %', average: 'Average',
};

const OUTPUT_COLORS = {
  number: 'var(--info)', currency: 'var(--warning)', percentage: 'var(--accent)',
};

// ── Confirm Modal ──────────────────────────────────────────────────────────────
const ConfirmModal = ({ formula, onConfirm, onCancel }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
    <div className="glass-card" style={{ maxWidth: 420, width: '90%', padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Delete Formula</span>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
        Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>"{formula.formula_name}"</strong>?
        This action cannot be undone.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
        <button onClick={onConfirm} className="btn-danger" style={{ flex: 1 }}>Delete</button>
      </div>
    </div>
  </div>
);

// ── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onDismiss }) => {
  useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 200, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderRadius: 10, background: type === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)', border: `1px solid ${type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: type === 'success' ? 'var(--success)' : 'var(--danger)', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {msg}
    </div>
  );
};

// ── Translate expression tokens using colMap ─────────────────────────────────
// Replaces [OriginalName] with [RenamedName] in an expression string.
function applyColMapToExpression(expr, colMap) {
  if (!expr || !colMap || Object.keys(colMap).length === 0) return expr;
  let result = expr;
  Object.entries(colMap).forEach(([original, renamed]) => {
    if (original !== renamed) {
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\[${escaped}\\]`, 'g'), `[${renamed}]`);
    }
  });
  return result;
}

// ── Sort helper ────────────────────────────────────────────────────────────────
function sortFormulas(list, col, dir) {
  return [...list].sort((a, b) => {
    let av = a[col] ?? ''; let bv = b[col] ?? '';
    if (col === 'created_at') { av = new Date(av); bv = new Date(bv); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ── Sortable header ────────────────────────────────────────────────────────────
const SortTh = ({ col, label, active, dir, onSort }) => (
  <th onClick={() => onSort(col)} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '1px solid var(--border)' }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label}
      {active ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
    </span>
  </th>
);

// ── Main ───────────────────────────────────────────────────────────────────────
export default function FormulaLibrary() {
  const navigate = useNavigate();
  const [formulas, setFormulas]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterOutput, setFilterOutput] = useState('');
  const [sortCol, setSortCol]           = useState('created_at');
  const [sortDir, setSortDir]           = useState('desc');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast]               = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [colMap, setColMap]               = useState({});

  useEffect(() => {
    try { setColMap(JSON.parse(localStorage.getItem("telco_unit_col_map") || "{}")); } catch {}
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await formulaService.list();
      setFormulas(res.data);
    } catch { setFormulas([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const handleEdit = (f) => {
    navigate('/formula-builder', { state: { formula: f } });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await formulaService.delete(deleteTarget.id);
      setFormulas(prev => prev.filter(f => f.id !== deleteTarget.id));
      setToast({ msg: 'Formula deleted.', type: 'success' });
    } catch { setToast({ msg: 'Failed to delete formula.', type: 'error' }); }
    finally { setDeleteTarget(null); setActionLoading(null); }
  };

  const handleDuplicate = async (f) => {
    setActionLoading(f.id);
    try {
      const res = await formulaService.duplicate(f.id);
      setFormulas(prev => [res.data, ...prev]);
      setToast({ msg: `Duplicated as "${res.data.formula_name}"`, type: 'success' });
    } catch { setToast({ msg: 'Failed to duplicate.', type: 'error' }); }
    finally { setActionLoading(null); }
  };

  // Filter + sort
  const visible = sortFormulas(
    formulas.filter(f => {
      const q = search.toLowerCase();
      const matchQ = !q || f.formula_name.toLowerCase().includes(q) || f.expression_string.toLowerCase().includes(q);
      const matchT = !filterTemplate || f.formula_template === filterTemplate;
      const matchO = !filterOutput || f.output_type === filterOutput;
      return matchQ && matchT && matchO;
    }),
    sortCol, sortDir
  );

  const templateOptions = [...new Set(formulas.map(f => f.formula_template))];
  const outputOptions   = [...new Set(formulas.map(f => f.output_type))];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-dim)', border: '1px solid var(--border-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Formula Library</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {formulas.length} saved formula{formulas.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button id="new-formula-btn" onClick={() => navigate('/formula-builder')} className="btn-primary" style={{ gap: 8 }}>
          <Plus size={16} /> New Formula
        </button>
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            id="formula-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search formulas…"
            className="input-field" style={{ paddingLeft: 36, fontSize: 13 }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>}
        </div>
        <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)} className="input-field" style={{ width: 180, fontSize: 13 }}>
          <option value="">All Templates</option>
          {templateOptions.map(t => <option key={t} value={t}>{TEMPLATE_LABELS[t] || t}</option>)}
        </select>
        <select value={filterOutput} onChange={e => setFilterOutput(e.target.value)} className="input-field" style={{ width: 160, fontSize: 13 }}>
          <option value="">All Output Types</option>
          {outputOptions.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <div className="skeleton" style={{ width: '100%', height: 200 }} />
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📐</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>No formulas yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              {search || filterTemplate || filterOutput ? 'Try adjusting your filters.' : 'Create your first formula in the Formula Builder.'}
            </div>
            {!search && !filterTemplate && !filterOutput && (
              <button onClick={() => navigate('/formula-builder')} className="btn-primary" style={{ marginTop: 20 }}>
                <Plus size={16} /> Create Formula
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-elevated)' }}>
                <tr>
                  <SortTh col="formula_name"     label="Formula Name"   active={sortCol === 'formula_name'}     dir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Expression</th>
                  <SortTh col="formula_template"  label="Template"       active={sortCol === 'formula_template'} dir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Columns Used</th>
                  <SortTh col="output_type"       label="Output Type"    active={sortCol === 'output_type'}      dir={sortDir} onSort={handleSort} />
                  <SortTh col="created_at"        label="Created"        active={sortCol === 'created_at'}       dir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f, idx) => {
                  const isLoading = actionLoading === f.id;
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                    >
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{f.formula_name}</td>
                      <td style={{ padding: '12px 14px', maxWidth: 280 }}>
                        <span
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={applyColMapToExpression(f.expression_string, colMap)}
                        >
                          {applyColMapToExpression(f.expression_string, colMap)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className="badge badge-info" style={{ fontSize: 10 }}>{TEMPLATE_LABELS[f.formula_template] || f.formula_template}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {(f.selected_columns || []).map(c => colMap[c] || c).join(', ')}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: OUTPUT_COLORS[f.output_type] || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
                          {f.output_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEdit(f)} disabled={isLoading} title="Edit" style={{ padding: '6px 10px', background: 'var(--info-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, cursor: 'pointer', color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => handleDuplicate(f)} disabled={isLoading} title="Duplicate" style={{ padding: '6px 10px', background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                            <Copy size={12} /> {isLoading ? '…' : 'Copy'}
                          </button>
                          <button onClick={() => setDeleteTarget(f)} disabled={isLoading} title="Delete" style={{ padding: '6px 10px', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                            <Trash2 size={12} /> Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && <ConfirmModal formula={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
