import React, { useEffect, useState, useMemo } from 'react';
import {
  Target, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle2, XCircle, BarChart3, Plus, RefreshCw,
  ChevronDown, ChevronRight, Activity, DollarSign, Zap,
  Settings, Trash2, Edit3, Info, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { kpiService, formulaService, productService, authService } from '../services/api';

const STATUS_CONFIG = {
  on_track: { color: 'emerald', icon: CheckCircle2, label: 'On Track', bg: 'from-emerald-500/20 to-emerald-500/5', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  warning: { color: 'amber', icon: AlertTriangle, label: 'Warning', bg: 'from-amber-500/20 to-amber-500/5', border: 'border-amber-500/30', text: 'text-amber-400' },
  critical: { color: 'red', icon: XCircle, label: 'Critical', bg: 'from-red-500/20 to-red-500/5', border: 'border-red-500/30', text: 'text-red-400' },
  no_data: { color: 'slate', icon: Minus, label: 'No Data', bg: 'from-slate-500/20 to-slate-500/5', border: 'border-slate-500/30', text: 'text-slate-400' },
};

const CATEGORY_CONFIG = {
  operational: { icon: Activity, label: 'Operational', color: 'from-blue-500 to-cyan-500' },
  financial: { icon: DollarSign, label: 'Financial', color: 'from-emerald-500 to-teal-500' },
  trend: { icon: TrendingUp, label: 'Trend', color: 'from-purple-500 to-pink-500' },
  custom: { icon: Zap, label: 'Custom', color: 'from-amber-500 to-orange-500' },
};

// ── Mini Sparkline ───────────────────────────────────────────────────────────
const Sparkline = ({ data, color = '#8b5cf6', width = 80, height = 32 }) => {
  if (!data || data.length < 2) return null;
  const values = data.map(d => d.value).filter(v => v !== null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}40)` }}
      />
      {/* Dot on last value */}
      {values.length > 0 && (() => {
        const lastX = width;
        const lastY = height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;
        return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
      })()}
    </svg>
  );
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KPICard = ({ kpi, onViewHistory, isAdmin }) => {
  const status = STATUS_CONFIG[kpi.current_status] || STATUS_CONFIG.no_data;
  const StatusIcon = status.icon;
  const category = CATEGORY_CONFIG[kpi.category] || CATEGORY_CONFIG.operational;

  const formatValue = (val, unit) => {
    if (val === null || val === undefined) return '—';
    if (unit === '%') return `${val.toFixed(1)}%`;
    if (unit === 'PKR') return `PKR ${val.toLocaleString()}`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const trendIcon = kpi.current_trend === 'up'
    ? <ArrowUpRight size={14} className={kpi.higher_is_better ? 'text-emerald-400' : 'text-red-400'} />
    : kpi.current_trend === 'down'
      ? <ArrowDownRight size={14} className={kpi.higher_is_better ? 'text-red-400' : 'text-emerald-400'} />
      : <Minus size={14} className="text-slate-500" />;

  const sparklineColor = kpi.current_status === 'on_track' ? '#10b981'
    : kpi.current_status === 'warning' ? '#f59e0b'
      : kpi.current_status === 'critical' ? '#ef4444' : '#64748b';

  return (
    <div
      className={`group relative rounded-2xl p-5 border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-pointer bg-gradient-to-br ${status.bg} ${status.border}`}
      onClick={() => onViewHistory(kpi)}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${status.text}`}>
          <StatusIcon size={14} />
          <span>{status.label}</span>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r ${category.color} text-white`}>
          {category.label}
        </div>
      </div>

      {/* Name */}
      <h3 className="text-white font-semibold text-sm mb-1 truncate">{kpi.name}</h3>
      {kpi.description && (
        <p className="text-white/30 text-xs mb-3 line-clamp-1">{kpi.description}</p>
      )}

      {/* Value + Trend */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold text-white tracking-tight">
            {formatValue(kpi.current_value, kpi.unit)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {trendIcon}
            {kpi.change_pct !== null && kpi.change_pct !== undefined && (
              <span className={`text-xs ${kpi.change_pct >= 0 ? (kpi.higher_is_better ? 'text-emerald-400' : 'text-red-400') : (kpi.higher_is_better ? 'text-red-400' : 'text-emerald-400')}`}>
                {kpi.change_pct >= 0 ? '+' : ''}{kpi.change_pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Sparkline */}
        <div className="opacity-60 group-hover:opacity-100 transition-opacity">
          <Sparkline data={kpi.sparkline || []} color={sparklineColor} />
        </div>
      </div>

      {/* Target bar */}
      {kpi.target_value !== null && kpi.target_value !== undefined && kpi.current_value !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-white/40 mb-1">
            <span>Progress</span>
            <span>Target: {formatValue(kpi.target_value, kpi.unit)}</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${kpi.current_status === 'on_track' ? 'bg-emerald-500' : kpi.current_status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{
                width: `${Math.min(Math.max((kpi.current_value / kpi.target_value) * 100, 0), 100)}%`
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── History Modal ────────────────────────────────────────────────────────────
const HistoryModal = ({ kpi, history, onClose }) => {
  if (!kpi) return null;

  const formatValue = (val, unit) => {
    if (val === null || val === undefined) return '—';
    if (unit === '%') return `${Number(val).toFixed(1)}%`;
    if (unit === 'PKR') return `PKR ${Number(val).toLocaleString()}`;
    return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{kpi.name}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
        </div>

        {kpi.description && <p className="text-white/40 text-sm mb-4">{kpi.description}</p>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Current</p>
            <p className="text-lg font-bold text-white">{formatValue(kpi.current_value, kpi.unit)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Target</p>
            <p className="text-lg font-bold text-white">{formatValue(kpi.target_value, kpi.unit)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Trend</p>
            <p className="text-lg font-bold text-white capitalize">{kpi.current_trend || '—'}</p>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-white/60 mb-3">History</h3>
        {history.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-4">No history yet. Compute KPIs to generate snapshots.</p>
        ) : (
          <div className="space-y-2">
            {history.map((s, i) => {
              const st = STATUS_CONFIG[s.status] || STATUS_CONFIG.no_data;
              return (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-sm text-white/60 font-mono">{s.period}</span>
                  <span className="text-sm font-semibold text-white">{formatValue(s.value, kpi.unit)}</span>
                  <span className={`text-xs ${st.text} flex items-center gap-1`}>
                    <st.icon size={12} /> {st.label}
                  </span>
                  {s.change_pct !== null && s.change_pct !== undefined && (
                    <span className={`text-xs ${s.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {s.change_pct >= 0 ? '+' : ''}{Number(s.change_pct).toFixed(1)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Create KPI Modal ─────────────────────────────────────────────────────────
const CreateKPIModal = ({ onClose, onCreated }) => {
  const [formulas, setFormulas] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    formula_id: '',
    name: '',
    description: '',
    category: 'operational',
    unit: '',
    target_value: '',
    warning_threshold: '',
    critical_threshold: '',
    higher_is_better: true,
    granularity: 'monthly',
    product_id: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [formulasRes, unitsRes] = await Promise.all([
          formulaService.list(),
          productService.getProducts()
        ]);
        setFormulas(formulasRes.data || []);
        setUnits(unitsRes.data || []);
      } catch (err) {
        setError('Failed to load formulas or units.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleFormulaChange = (formulaId) => {
    const selected = formulas.find(f => String(f.id) === String(formulaId));
    if (!selected) {
      setForm(f => ({ ...f, formula_id: '', name: '', description: '', unit: '' }));
      return;
    }

    let defaultUnit = '';
    if (selected.output_type === 'percentage') defaultUnit = '%';
    else if (selected.output_type === 'currency') defaultUnit = 'PKR';

    setForm(f => ({
      ...f,
      formula_id: formulaId,
      name: selected.formula_name,
      description: `KPI based on formula: ${selected.formula_name}`,
      unit: defaultUnit,
    }));
  };

  const handleCreate = async () => {
    if (!form.formula_id || !form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await kpiService.createDefinition({
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        unit: form.unit.trim() || "",
        computation_type: 'formula',
        formula_id: parseInt(form.formula_id, 10),
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        warning_threshold: form.warning_threshold ? parseFloat(form.warning_threshold) : null,
        critical_threshold: form.critical_threshold ? parseFloat(form.critical_threshold) : null,
        higher_is_better: form.higher_is_better,
        granularity: form.granularity,
        product_id: form.product_id ? parseInt(form.product_id, 10) : null,
      });
      onCreated();
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create KPI');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">Create Custom KPI</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-white/50 text-xs mt-3">Loading custom formulas...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm text-center">
            {error}
          </div>
        ) : formulas.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/60 mb-5 text-sm">
              You don't have any custom formulas created yet. KPIs in Productix are defined based on formulas.
            </p>
            <button
              onClick={() => { onClose(); window.location.href = '/formula-builder'; }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold text-sm hover:opacity-90 transition-all"
            >
              Go to Formula Builder
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/50 block mb-1">Select Custom Formula <span className="text-red-500">*</span></label>
              <select
                value={form.formula_id}
                onChange={e => handleFormulaChange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="" className="bg-slate-900 text-white/50">-- Choose formula --</option>
                {formulas.map(f => (
                  <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                    {f.formula_name} ({f.target_column})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">KPI Name <span className="text-red-500">*</span></label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="E.g., Customer Profitability Index"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Enter description..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 block mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="operational" className="bg-slate-900">Operational</option>
                  <option value="financial" className="bg-slate-900">Financial</option>
                  <option value="trend" className="bg-slate-900">Trend</option>
                  <option value="custom" className="bg-slate-900">Custom</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-white/50 block mb-1">Unit (e.g. %, PKR, KW)</label>
                <input
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="E.g., %, PKR, KW"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 block mb-1">Scope to Unit (optional)</label>
                <select
                  value={form.product_id}
                  onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="" className="bg-slate-900 text-white/50">All Units (Global)</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                      {u.name} ({u.description || u.location || ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-white/50 block mb-1">Granularity</label>
                <select
                  value={form.granularity}
                  onChange={e => setForm(f => ({ ...f, granularity: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="monthly" className="bg-slate-900">Monthly</option>
                  <option value="weekly" className="bg-slate-900">Weekly</option>
                  <option value="daily" className="bg-slate-900">Daily</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-white/50 block mb-1">Target</label>
                <input
                  type="number"
                  placeholder="Target"
                  value={form.target_value}
                  onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-xs text-amber-400/80 block mb-1">⚠ Warning</label>
                <input
                  type="number"
                  placeholder="Warning"
                  value={form.warning_threshold}
                  onChange={e => setForm(f => ({ ...f, warning_threshold: e.target.value }))}
                  className="w-full bg-white/5 border border-amber-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-red-400/80 block mb-1">🔴 Critical</label>
                <input
                  type="number"
                  placeholder="Critical"
                  value={form.critical_threshold}
                  onChange={e => setForm(f => ({ ...f, critical_threshold: e.target.value }))}
                  className="w-full bg-white/5 border border-red-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id="higher_is_better"
                checked={form.higher_is_better}
                onChange={e => setForm(f => ({ ...f, higher_is_better: e.target.checked }))}
                className="w-4 h-4 rounded border-white/10 bg-white/5 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="higher_is_better" className="text-xs text-white/70 select-none cursor-pointer">
                Higher values are better (e.g. profit). Uncheck for cost metrics.
              </label>
            </div>

            <button
              onClick={handleCreate}
              disabled={!form.formula_id || !form.name.trim() || isSubmitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all mt-2"
            >
              {isSubmitting ? 'Creating...' : 'Create KPI'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


// ── Edit KPI Modal ───────────────────────────────────────────────────────────
const EditKPIModal = ({ kpi, onClose, onUpdated }) => {
  const [form, setForm] = useState({
    name: kpi.name || '',
    description: kpi.description || '',
    category: kpi.category || 'operational',
    unit: kpi.unit || '',
    target_value: kpi.target_value !== null && kpi.target_value !== undefined ? String(kpi.target_value) : '',
    warning_threshold: kpi.warning_threshold !== null && kpi.warning_threshold !== undefined ? String(kpi.warning_threshold) : '',
    critical_threshold: kpi.critical_threshold !== null && kpi.critical_threshold !== undefined ? String(kpi.critical_threshold) : '',
    higher_is_better: kpi.higher_is_better !== undefined ? kpi.higher_is_better : true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpdate = async () => {
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await kpiService.updateDefinition(kpi.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        unit: form.unit.trim() || "",
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        warning_threshold: form.warning_threshold ? parseFloat(form.warning_threshold) : null,
        critical_threshold: form.critical_threshold ? parseFloat(form.critical_threshold) : null,
        higher_is_better: form.higher_is_better,
      });
      onUpdated();
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update KPI');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">Edit KPI: {kpi.name}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 block mb-1">KPI Name <span className="text-red-500">*</span></label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="KPI Name"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Enter description..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="operational" className="bg-slate-900">Operational</option>
                <option value="financial" className="bg-slate-900">Financial</option>
                <option value="trend" className="bg-slate-900">Trend</option>
                <option value="custom" className="bg-slate-900">Custom</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">Unit</label>
              <input
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="E.g., %, PKR, KW"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">Target</label>
              <input
                type="number"
                placeholder="Target"
                value={form.target_value}
                onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-amber-400/80 block mb-1">⚠ Warning</label>
              <input
                type="number"
                placeholder="Warning"
                value={form.warning_threshold}
                onChange={e => setForm(f => ({ ...f, warning_threshold: e.target.value }))}
                className="w-full bg-white/5 border border-amber-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-red-400/80 block mb-1">🔴 Critical</label>
              <input
                type="number"
                placeholder="Critical"
                value={form.critical_threshold}
                onChange={e => setForm(f => ({ ...f, critical_threshold: e.target.value }))}
                className="w-full bg-white/5 border border-red-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="edit_higher_is_better"
              checked={form.higher_is_better}
              onChange={e => setForm(f => ({ ...f, higher_is_better: e.target.checked }))}
              className="w-4 h-4 rounded border-white/10 bg-white/5 text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="edit_higher_is_better" className="text-xs text-white/70 select-none cursor-pointer">
              Higher values are better (e.g. profit). Uncheck for cost metrics.
            </label>
          </div>

          <button
            onClick={handleUpdate}
            disabled={!form.name.trim() || isSubmitting}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all mt-2"
          >
            {isSubmitting ? 'Updating...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const KPIDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [granularityFilter, setGranularityFilter] = useState('all'); // Task 4
  const [selectedKPI, setSelectedKPI] = useState(null);
  const [history, setHistory] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingKPI, setEditingKPI] = useState(null);
  const [isComputing, setIsComputing] = useState(false);

  const role = authService.getRole();
  const isAdmin = role === 'system_admin' || role === 'org_admin' || role === 'admin';

  const fetchDashboard = async () => {
    try {
      setIsLoading(true);
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      const res = await kpiService.getDashboard(params);
      setDashboard(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load KPI dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [categoryFilter]);

  const handleViewHistory = async (kpi) => {
    setSelectedKPI(kpi);
    try {
      const res = await kpiService.getHistory(kpi.id);
      setHistory(res.data || []);
    } catch {
      setHistory([]);
    }
  };

  const handleCompute = async () => {
    setIsComputing(true);
    try {
      await kpiService.computeAll();
      await fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.detail || 'Computation failed');
    } finally {
      setIsComputing(false);
    }
  };

  const handleOpenCreate = () => {
    setShowCreateModal(true);
  };

  const handleDeleteKPI = async (kpiId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this KPI?')) return;
    try {
      await kpiService.deleteDefinition(kpiId);
      fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete KPI');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-purple-500/20 rounded-full"></div>
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin absolute top-0"></div>
          <p className="text-white/60 mt-6 text-center">Loading KPIs...</p>
        </div>
      </div>
    );
  }

  const summary = dashboard?.summary || {};
  const rawKpis = dashboard?.kpis || [];
  // Task 4: client-side granularity filter
  const kpis = granularityFilter === 'all'
    ? rawKpis
    : rawKpis.filter(k => (k.granularity || 'monthly').toLowerCase() === granularityFilter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 rounded-lg">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-1">
              KPI Dashboard
            </h1>
            <p className="text-white/40 text-sm">Track performance against your targets</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCompute}
              disabled={isComputing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all text-sm"
            >
              <RefreshCw size={14} className={isComputing ? 'animate-spin' : ''} />
              {isComputing ? 'Computing...' : 'Compute'}
            </button>

            {isAdmin && (
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold text-sm hover:opacity-90 transition-all"
              >
                <Plus size={14} /> Add KPI
              </button>
            )}
          </div>
        </div>

        {/* ── Summary Tiles ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total KPIs', value: summary.total || 0, color: 'from-blue-500 to-cyan-500' },
            { label: 'On Track', value: summary.on_track || 0, color: 'from-emerald-500 to-green-500' },
            { label: 'Warning', value: summary.warning || 0, color: 'from-amber-500 to-orange-500' },
            { label: 'Critical', value: summary.critical || 0, color: 'from-red-500 to-rose-500' },
          ].map((tile, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-white/40 mb-1">{tile.label}</p>
              <p className={`text-2xl font-bold bg-gradient-to-r ${tile.color} bg-clip-text text-transparent`}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Category Filter ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!categoryFilter ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}
          >
            All
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${categoryFilter === key ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}
              >
                <Icon size={12} /> {cfg.label}
              </button>
            );
          })}
        </div>

        {/* ── Task 4: Time Period Filter ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-white/30 text-xs font-bold uppercase mr-1">Period:</span>
          {[['all', 'All'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setGranularityFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                granularityFilter === val
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-black'
                  : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Error ───────────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── KPI Cards Grid ─────────────────────────────────────────────────── */}
        {kpis.length === 0 ? (
          <div className="text-center py-20">
            <Target size={48} className="text-white/10 mx-auto mb-4" />
            <h2 className="text-white/40 text-lg font-semibold mb-2">No KPIs configured yet</h2>
            <p className="text-white/25 text-sm mb-6">
              {isAdmin
                ? 'Click "Add KPI" to create your first performance indicator.'
                : 'Ask your admin to configure KPI targets for your organization.'}
            </p>
            {isAdmin && (
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold text-sm hover:opacity-90"
              >
                <Plus size={14} /> Create First KPI
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map(kpi => (
              <div key={kpi.id} className="relative group">
                <KPICard
                  kpi={kpi}
                  onViewHistory={handleViewHistory}
                  isAdmin={isAdmin}
                />
                {isAdmin && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-all duration-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingKPI(kpi);
                      }}
                      className="p-1.5 rounded-lg bg-purple-500/30 text-purple-200 border border-purple-500/30 hover:bg-purple-600 hover:text-white hover:border-purple-600 shadow-lg transition-all"
                      title="Edit KPI"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteKPI(kpi.id, e)}
                      className="p-1.5 rounded-lg bg-red-500/30 text-red-200 border border-red-500/30 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-lg transition-all"
                      title="Remove KPI"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {selectedKPI && (
        <HistoryModal
          kpi={selectedKPI}
          history={history}
          onClose={() => { setSelectedKPI(null); setHistory([]); }}
        />
      )}

      {showCreateModal && (
        <CreateKPIModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchDashboard}
        />
      )}

      {editingKPI && (
        <EditKPIModal
          kpi={editingKPI}
          onClose={() => setEditingKPI(null)}
          onUpdated={fetchDashboard}
        />
      )}
    </div>
  );
};

export default KPIDashboard;
