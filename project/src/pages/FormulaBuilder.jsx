import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calculator, Save, AlertCircle, CheckCircle, X, GripVertical,
  Info, Filter, TrendingUp, ScatterChart as ScatterIcon, Play
} from 'lucide-react';
import api, { formulaService, productService } from '../services/api';
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ── Fixed column data (mirrors backend formula_engine.py) ─────────────────────
const UNIT_EXPENSES_COLS = [
  { name: 'Date', type: 'date', eligible: false },
  { name: 'Unit ID', type: 'text', eligible: false },
  { name: 'Unit Name', type: 'text', eligible: false },
  { name: 'City', type: 'text', eligible: false },
  { name: 'Fuel Cost', type: 'number', eligible: true },
  { name: 'WAPDA Cost', type: 'number', eligible: true },
  { name: 'HR Cost', type: 'number', eligible: true },
  { name: 'Rent', type: 'number', eligible: true },
  { name: 'Other Costs', type: 'number', eligible: true },
  { name: 'Total Capacity (KW)', type: 'number', eligible: true },
  { name: 'KW Produced', type: 'number', eligible: true },
  { name: 'KW Sold', type: 'number', eligible: true },
  { name: 'Attached Customers', type: 'number', eligible: true },
  { name: 'Max Customers', type: 'number', eligible: true },
  { name: 'Total OPEX', type: 'number', eligible: true },
  { name: 'Daily Cost', type: 'number', eligible: true },
  { name: 'Monthly OPEX', type: 'number', eligible: true },
  { name: 'Capacity Utilization', type: 'number', eligible: true },
  { name: 'Idle Capacity (KW)', type: 'number', eligible: true },
  { name: 'Cost per KW', type: 'number', eligible: true },
  { name: 'Customer Utilization', type: 'number', eligible: true },
  { name: 'Total Revenue', type: 'number', eligible: true },
  { name: 'Profit', type: 'number', eligible: true },
  { name: 'Idle Capacity Value', type: 'number', eligible: true },
];

const UNIT_REVENUE_COLS = [
  { name: 'Date', type: 'date', eligible: false },
  { name: 'Customer Name', type: 'text', eligible: false },
  { name: 'Unit ID', type: 'text', eligible: false },
  { name: 'KW Sold', type: 'number', eligible: true },
  { name: 'Price per KW', type: 'number', eligible: true },
  { name: 'Daily Revenue', type: 'number', eligible: true },
  { name: 'Monthly Revenue', type: 'number', eligible: true },
];

const TEMPLATES = [
  { id: 'ratio',         label: 'Ratio',        pattern: 'A / B',             minCols: 2, outputType: 'number' },
  { id: 'percentage',    label: 'Percentage',    pattern: '(A / B) × 100',    minCols: 2, outputType: 'percentage' },
  { id: 'total',         label: 'Total (Sum)',   pattern: 'A + B + …',        minCols: 2, outputType: 'number' },
  { id: 'difference',    label: 'Difference',   pattern: 'A − B',             minCols: 2, outputType: 'number' },
  { id: 'product',       label: 'Product',      pattern: 'A × B',             minCols: 2, outputType: 'number' },
  { id: 'margin',        label: 'Margin %',     pattern: '(A − B) / A × 100', minCols: 2, outputType: 'percentage' },
  { id: 'average',       label: 'Average',      pattern: '(A + B + …) / Count', minCols: 2, outputType: 'number' },
];

// ── Sample row for live preview ────────────────────────────────────────────────
const SAMPLE = {
  'Fuel Cost': 50000, 'WAPDA Cost': 30000, 'HR Cost': 20000, 'Rent': 40000,
  'Other Costs': 10000, 'Total Capacity (KW)': 100, 'KW Produced': 80, 'KW Sold': 60,
  'Attached Customers': 3, 'Max Customers': 5, 'Total OPEX': 150000, 'Daily Cost': 5000,
  'Monthly OPEX': 150000, 'Capacity Utilization': 60, 'Idle Capacity (KW)': 40,
  'Cost per KW': 2500, 'Customer Utilization': 60, 'Total Revenue': 300000,
  'Profit': 150000, 'Idle Capacity Value': 20000, 'Price per KW': 500,
  'Daily Revenue': 10000, 'Monthly Revenue': 300000,
};

// ── Client-side expression builder ────────────────────────────────────────────
function buildExpression(templateId, cols) {
  const c = cols.map(n => `[${n}]`);
  switch (templateId) {
    case 'ratio':         return `${c[0]} / ${c[1]}`;
    case 'percentage':    return `(${c[0]} / ${c[1]}) * 100`;
    case 'total':         return c.join(' + ');
    case 'difference':    return `${c[0]} - ${c[1]}`;
    case 'product':       return `${c[0]} * ${c[1]}`;
    case 'margin':        return `(${c[0]} - ${c[1]}) / ${c[0]} * 100`;
    case 'average':       return `(${c.join(' + ')}) / ${cols.length}`;
    default: return '';
  }
}

// ── Client-side safe evaluator (mirrors backend logic) ─────────────────────────
function safeEval(expr) {
  try {
    const substituted = expr.replace(/\[([^\]]+)\]/g, (_, name) => {
      const v = SAMPLE[name];
      return v != null ? String(v) : 'null';
    });
    if (/null/.test(substituted)) return null;
    if (!/^[\d\s+\-*/().,]+$/.test(substituted)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${substituted})`)();
    return typeof result === 'number' && isFinite(result) ? Math.round(result * 100) / 100 : null;
  } catch { return null; }
}

function formatResult(value, outputType) {
  if (value == null) return 'N/A';
  if (outputType === 'percentage') return `${value.toFixed(1)}%`;
  if (outputType === 'currency') return `PKR ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
  return value.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

// ── Column Pill ────────────────────────────────────────────────────────────────
const SelectedPill = ({ name, colMap = {}, onRemove, index }) => {
  const displayName = colMap[name] || name;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      background: 'var(--accent-dim)', border: '1px solid var(--border-hover)',
      borderRadius: 999, fontSize: 12, color: 'var(--accent)', fontWeight: 600,
    }}>
      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{index + 1}</span>
      <GripVertical size={11} style={{ color: 'var(--text-muted)', cursor: 'grab' }} />
      {displayName}
      <button onClick={() => onRemove(name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}>
        <X size={12} />
      </button>
    </div>
  );
};

// ── Section wrapper ────────────────────────────────────────────────────────────
const Section = ({ num, title, children, disabled }) => (
  <div className="glass-card" style={{ padding: 20, opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-dim)',
        border: '1px solid var(--border-hover)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        fontFamily: 'var(--font-mono)', flexShrink: 0,
      }}>{num}</div>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>{num}. {title}</span>
    </div>
    {children}
  </div>
);

export default function FormulaBuilder() {
  const location = useLocation();
  const navigate = useNavigate();
  const editFormula = location.state?.formula || null;

  // ── Task 10 Tab state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('builder'); // 'builder' or 'correlation'

  // Builder States
  const [selectedCols, setSelectedCols] = useState(editFormula?.selected_columns || []);
  const [template, setTemplate]         = useState(editFormula?.formula_template || '');
  const [formulaName, setFormulaName]   = useState(editFormula?.formula_name || '');
  const [targetColumn, setTargetColumn] = useState(editFormula?.target_column || '');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [saveSuccess, setSaveSuccess]   = useState(false);
  const [nameError, setNameError]       = useState('');
  const [colMap, setColMap]             = useState({});

  // Unit filter state
  const [units, setUnits]               = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');

  // Correlation Analysis States (Task 10)
  const [var1, setVar1] = useState('');
  const [var2, setVar2] = useState('');
  const [correlationData, setCorrelationData] = useState([]);
  const [correlationStats, setCorrelationStats] = useState(null);
  const [loadingCorrData, setLoadingCorrData] = useState(false);
  const [corrError, setCorrError] = useState('');

  const loadOrgMappings = async () => {
    try {
      const res = await api.get("/organizations/me");
      if (res.data && res.data.column_mappings) {
        setColMap(res.data.column_mappings);
        localStorage.setItem("telco_unit_col_map", JSON.stringify(res.data.column_mappings));
      }
    } catch (err) {
      console.error("Failed to load organization mappings in FormulaBuilder:", err);
    }
  };

  useEffect(() => {
    try { setColMap(JSON.parse(localStorage.getItem("telco_unit_col_map") || "{}")); } catch {}
    loadOrgMappings();
    // Load units from API
    const loadUnits = async () => {
      try {
        const res = await productService.getProducts();
        const dbUnits = res.data.map(p => ({
          id: p.id,
          name: p.name,
          city: p.description || "",
          region: p.region || p.description || "",
          location: p.location || "Urban",
          customers: p.customers || [],
          unit_vars: p.unit_vars || [],
          customer_vars: p.customer_vars || [],
          created_at: p.created_at || new Date().toISOString()
        }));
        setUnits(dbUnits);
        localStorage.setItem("telco_units_v1", JSON.stringify(dbUnits));
      } catch (err) {
        console.error("Failed to load units in FormulaBuilder:", err);
        try {
          const stored = JSON.parse(localStorage.getItem("telco_units_v1") || "[]");
          setUnits(stored);
        } catch { setUnits([]); }
      }
    };
    loadUnits();
  }, []);

  // Derive columns that are active for the selected unit
  const selectedUnit = useMemo(() => {
    return units.find(u => String(u.id) === String(selectedUnitId)) || null;
  }, [units, selectedUnitId]);

  const unitActiveVarNames = useMemo(() => {
    return selectedUnit ? (selectedUnit.unit_vars || []) : null;
  }, [selectedUnit]);

  const customerActiveVarNames = useMemo(() => {
    return selectedUnit ? (selectedUnit.customer_vars || []) : null;
  }, [selectedUnit]);

  const filteredExpensesCols = useMemo(() => {
    return UNIT_EXPENSES_COLS.filter(c => {
      if (!unitActiveVarNames) return true; 
      if (!c.eligible) return false; 
      return unitActiveVarNames.includes(c.name);
    });
  }, [unitActiveVarNames]);

  const filteredRevenueCols = useMemo(() => {
    if (!customerActiveVarNames) return UNIT_REVENUE_COLS; 
    
    const seen = new Set();
    const cols = [];
    customerActiveVarNames.forEach(varName => {
      const matched = [...UNIT_EXPENSES_COLS, ...UNIT_REVENUE_COLS].find(v => v.name === varName);
      if (matched && !seen.has(varName)) {
        seen.add(varName);
        cols.push(matched);
      } else if (!seen.has(varName)) {
        seen.add(varName);
        cols.push({ name: varName, type: 'number', eligible: true });
      }
    });
    return cols;
  }, [customerActiveVarNames]);

  const eligibleVariables = useMemo(() => {
    const items = [];
    const seen = new Set();
    [...filteredExpensesCols, ...filteredRevenueCols].forEach(c => {
      const name = c.name === 'KW Sold' ? 'KW Sold (Revenue)' : c.name;
      if (c.eligible && !seen.has(name)) {
        seen.add(name);
        items.push({ name, display: colMap[name] || name });
      }
    });
    return items;
  }, [filteredExpensesCols, filteredRevenueCols, colMap]);

  const TARGET_COLUMNS = useMemo(() => {
    const seen = new Set();
    const cols = [];
    const normalizedSelected = new Set(selectedCols.map(c => c.replace(/\s*\(Revenue\)$/i, '')));
    
    [...filteredExpensesCols, ...filteredRevenueCols].forEach(c => {
      const canonical = c.name;
      if (c.eligible && !seen.has(canonical) && !normalizedSelected.has(canonical)) {
        seen.add(canonical);
        cols.push(c);
      }
    });
    return cols;
  }, [filteredExpensesCols, filteredRevenueCols, selectedCols]);

  const tmplObj   = useMemo(() => TEMPLATES.find(t => t.id === template), [template]);
  const canTemplate = selectedCols.length >= 2;
  const expression  = template && canTemplate ? buildExpression(template, selectedCols) : '';
  const sampleResult = expression ? safeEval(expression) : null;

  // Display expression: replace [internalName] with [userRenamedName] for live preview
  const displayExpression = useMemo(() => {
    if (!expression) return '';
    return expression.replace(/\[([^\]]+)\]/g, (_, name) => {
      const renamed = colMap[name];
      return renamed && renamed !== name ? `[${renamed}]` : `[${name}]`;
    });
  }, [expression, colMap]);

  const autoName = template && selectedCols.length >= 2
    ? `${tmplObj?.label || template}: ${selectedCols.slice(0, 2).map(c => colMap[c] || c).join(' & ')}`
    : '';

  const effectiveName = formulaName.trim() || autoName;
  const canSave  = selectedCols.length >= 2 && template && targetColumn !== '' && effectiveName.length > 0;
  const showColWarning = tmplObj && !['total', 'average'].includes(template) && selectedCols.length > 2;

  useEffect(() => {
    const allowedNames = new Set([
      ...filteredExpensesCols.map(c => c.name),
      ...filteredRevenueCols.map(c => c.name === 'KW Sold' ? 'KW Sold (Revenue)' : c.name),
    ]);
    setSelectedCols(prev => {
      const filtered = prev.filter(c => allowedNames.has(c));
      if (filtered.length === prev.length && filtered.every((val, index) => val === prev[index])) {
        return prev;
      }
      return filtered;
    });
  }, [filteredExpensesCols, filteredRevenueCols]);

  const toggleCol = (colName) => {
    setSelectedCols(prev =>
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };
  const removeCol = (colName) => setSelectedCols(prev => prev.filter(c => c !== colName));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setSaveError(''); setNameError('');
    try {
      const payload = {
        formula_name: effectiveName,
        formula_template: template,
        selected_columns: selectedCols,
        source_table: 'unit_expenses',
        expression_string: expression,
        output_type: tmplObj?.outputType || 'number',
        target_column: targetColumn || null,
        product_id: selectedUnitId ? parseInt(selectedUnitId, 10) : null,
      };
      if (editFormula) {
        await formulaService.update(editFormula.id, payload);
      } else {
        await formulaService.create(payload);
      }
      setSaveSuccess(true);
      setTimeout(() => navigate('/formula-library'), 1200);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to save formula.';
      if (msg.toLowerCase().includes('already exists') || msg.includes('taken')) {
        setNameError(msg);
      } else {
        setSaveError(msg);
      }
    } finally { setSaving(false); }
  };

  // ── Task 10: Run Correlation Analysis ─────────────────────────────────────────
  const runCorrelationAnalysis = async () => {
    if (!selectedUnitId) {
      setCorrError('Please select a unit to analyze correlation records.');
      return;
    }
    if (!var1 || !var2) {
      setCorrError('Please select two different variables.');
      return;
    }
    if (var1 === var2) {
      setCorrError('Variables must be different.');
      return;
    }

    setCorrError('');
    setLoadingCorrData(true);
    setCorrelationStats(null);
    setCorrelationData([]);

    try {
      // Fetch historical records of the selected unit
      const res = await api.get('/data-records/', { params: { product_id: selectedUnitId } });
      const recordsList = res.data || [];

      const points = [];
      recordsList.forEach(r => {
        const dataDict = r.data || {};
        
        const findVal = (key) => {
          const cleanKey = key.replace(/\s*\(Revenue\)$/i, '');
          if (dataDict[cleanKey] !== undefined) return Number(dataDict[cleanKey]);
          if (dataDict[key] !== undefined) return Number(dataDict[key]);
          
          if (dataDict.unit_data && dataDict.unit_data[cleanKey] !== undefined) {
            return Number(dataDict.unit_data[cleanKey]);
          }
          if (dataDict.customer_data && Array.isArray(dataDict.customer_data)) {
            let sum = 0;
            dataDict.customer_data.forEach(cust => {
              if (cust[cleanKey] !== undefined) sum += Number(cust[cleanKey]);
            });
            if (sum > 0) return sum;
          }
          if (dataDict.tenants && Array.isArray(dataDict.tenants)) {
            let sum = 0;
            dataDict.tenants.forEach(t => {
              const tInputs = t.inputs || {};
              const tOutputs = t.outputs || {};
              if (tInputs[cleanKey] !== undefined) sum += Number(tInputs[cleanKey]);
              if (tOutputs[cleanKey] !== undefined) sum += Number(tOutputs[cleanKey]);
            });
            if (sum > 0) return sum;
          }
          return null;
        };

        const val1 = findVal(var1);
        const val2 = findVal(var2);

        if (val1 !== null && val2 !== null && !isNaN(val1) && !isNaN(val2)) {
          points.push({ x: val1, y: val2, period: r.month });
        }
      });

      if (points.length < 3) {
        setCorrError(`Insufficient matching data points (found ${points.length}, need at least 3) for the selected variables.`);
        setLoadingCorrData(false);
        return;
      }

      // Stats calculation
      const n = points.length;
      const sumX = points.reduce((acc, p) => acc + p.x, 0);
      const sumY = points.reduce((acc, p) => acc + p.y, 0);
      const meanX = sumX / n;
      const meanY = sumY / n;

      let num = 0;
      let denX = 0;
      let denY = 0;

      points.forEach(p => {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      });

      const rVal = (denX * denY === 0) ? 0 : num / Math.sqrt(denX * denY);
      const r2 = rVal * rVal;

      // Linear regression line: y = mx + c
      const m = denX === 0 ? 0 : num / denX;
      const c = meanY - m * meanX;

      // Generate regression line points
      const chartData = points.map(p => ({
        ...p,
        line: Number((m * p.x + c).toFixed(4)),
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2))
      })).sort((a, b) => a.x - b.x);

      setCorrelationData(chartData);
      setCorrelationStats({
        r: Number(rVal.toFixed(4)),
        r2: Number(r2.toFixed(4)),
        m: Number(m.toFixed(4)),
        c: Number(c.toFixed(4)),
        count: n
      });

    } catch (err) {
      console.error("Correlation analysis failed:", err);
      setCorrError("An error occurred while loading or parsing record data.");
    } finally {
      setLoadingCorrData(false);
    }
  };

  const getCorrelationStrength = (r) => {
    const absR = Math.abs(r);
    if (absR >= 0.8) return { text: "Strong", color: "text-emerald-400" };
    if (absR >= 0.5) return { text: "Moderate", color: "text-amber-400" };
    if (absR >= 0.2) return { text: "Weak", color: "text-orange-400" };
    return { text: "Negligible", color: "text-red-400" };
  };

  const ColRow = ({ col }) => {
    const isSelected = selectedCols.includes(col.name);
    const displayName = colMap[col.name] || col.name;
    return (
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        borderRadius: 8, cursor: col.eligible ? 'pointer' : 'not-allowed',
        background: isSelected ? 'var(--accent-dim)' : 'transparent',
        opacity: col.eligible ? 1 : 0.4, transition: 'background 0.15s',
      }}>
        <input
          type="checkbox" checked={isSelected} onChange={() => col.eligible && toggleCol(col.name)}
          disabled={!col.eligible}
          style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
        />
        <span style={{ flex: 1, fontSize: 13, color: col.eligible ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isSelected ? 600 : 400 }}>
          {displayName}
        </span>
        {!col.eligible && <span title="Text column — cannot be used in formulas" style={{ fontSize: 10, color: 'var(--text-muted)' }}>⊘</span>}
      </label>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-dim)', border: '1px solid var(--border-hover)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
            <Calculator size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {editFormula ? 'Edit Formula' : 'Formula & Correlation Studio'}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Create metric formulas or analyze variable correlations with live graphs
            </p>
          </div>
        </div>
        
        {/* Navigation tabs */}
        <div style={{ display: 'flex', bg: 'rgba(255,255,255,0.05)', borderRadius: 10, border: '1px solid var(--border)', padding: 2, gap: 4 }}>
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'builder' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg' : 'text-white/40 hover:text-white/70'}`}
          >
            Formula Builder
          </button>
          <button
            onClick={() => setActiveTab('correlation')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'correlation' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg' : 'text-white/40 hover:text-white/70'}`}
          >
            Correlation Analysis (Task 10)
          </button>
        </div>
      </div>

      {/* ── Unit Selector (Global filter) ── */}
      <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
              {activeTab === 'correlation' ? 'SELECT TOWER/UNIT *' : 'FILTER BY UNIT'}
            </span>
          </div>
          <select
            id="unit-filter-select"
            value={selectedUnitId}
            onChange={e => { setSelectedUnitId(e.target.value); }}
            className="input-field"
            style={{ fontSize: 13, minWidth: 240, flex: 1, maxWidth: 360 }}
          >
            <option value="">{activeTab === 'correlation' ? '-- Choose unit to analyze --' : '— Show All Columns (No Unit Filter) —'}</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.city})</option>
            ))}
          </select>
          {selectedUnit && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-dim)', border: '1px solid var(--border-hover)', color: 'var(--accent)', fontWeight: 600 }}>
                {(selectedUnit.unit_vars || []).length} unit variables
              </span>
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warning)', fontWeight: 600 }}>
                {(selectedUnit.customer_vars || []).length} customer variables
              </span>
              <button
                onClick={() => setSelectedUnitId('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
              >
                <X size={12} /> Clear unit
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'builder' ? (
        /* ── BUILDER TAB ── */
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left column: Column Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Section num="1" title="Select Columns" disabled={false}>
              {selectedCols.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, padding: '10px 12px', background: 'rgba(0,212,170,0.05)', borderRadius: 10, border: '1px dashed var(--border-hover)' }}>
                  {selectedCols.map((c, i) => <SelectedPill key={c} name={c} colMap={colMap} index={i} onRemove={removeCol} />)}
                </div>
              )}

              {filteredExpensesCols.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Unit Expenses Columns
                  </div>
                  {filteredExpensesCols.map(c => <ColRow key={c.name} col={c} />)}
                </>
              )}

              {filteredRevenueCols.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '14px 0 10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Customer / Revenue Columns
                  </div>
                  {filteredRevenueCols.map(c => (
                    <ColRow key={`rev-${c.name}`} col={{ ...c, name: c.name === 'KW Sold' ? 'KW Sold (Revenue)' : c.name }} />
                  ))}
                </>
              )}

              {selectedUnit && filteredExpensesCols.length === 0 && filteredRevenueCols.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No columns linked to this unit yet.
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                {selectedCols.length} column{selectedCols.length !== 1 ? 's' : ''} selected
              </div>
            </Section>
          </div>

          {/* Right column: Template, Target, Preview, Save */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Section num="2" title="Choose Formula Template" disabled={!canTemplate}>
              {!canTemplate && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Select at least 2 columns first.</p>
              )}
              <select
                value={template}
                onChange={e => setTemplate(e.target.value)}
                className="input-field"
                style={{ fontSize: 14 }}
              >
                <option value="">-- Select template --</option>
                {TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label} — {t.pattern}</option>
                ))}
              </select>
              {showColWarning && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 12px', background: 'var(--warning-dim)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Info size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--warning)' }}>
                    This template uses only the first 2 selected columns.
                  </span>
                </div>
              )}
            </Section>

            <Section num="3" title="Which Column Does This Formula Fill?" disabled={!expression}>
              {!expression ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Complete steps 1 & 2 first.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Select the column in the Data Entry table that this formula will auto-fill.
                  </p>
                  <select
                    value={targetColumn}
                    onChange={e => setTargetColumn(e.target.value)}
                    className="input-field"
                    style={{ fontSize: 14 }}
                  >
                    <option value="">-- Select target column --</option>
                    {TARGET_COLUMNS.map(c => {
                      const display = colMap[c.name] || c.name;
                      return <option key={c.name} value={c.name}>{display}</option>;
                    })}
                  </select>
                </div>
              )}
            </Section>

            <Section num="4" title="Live Formula Preview" disabled={!expression}>
              {!expression ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select columns and a template to see the preview.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: '14px 16px', background: 'rgba(0,212,170,0.06)', borderRadius: 10, border: '1px solid var(--border-hover)', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', letterSpacing: '0.02em', lineHeight: 1.6, wordBreak: 'break-all' }}>
                    {displayExpression}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Output type:</span>
                    <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>{tmplObj?.outputType}</span>
                  </div>
                  <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Sample Value Calculation
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: sampleResult != null ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {formatResult(sampleResult, tmplObj?.outputType)}
                    </div>
                  </div>

                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {nameError && <div style={{ fontSize: 12, color: 'var(--danger)' }}><AlertCircle size={13} style={{ display: 'inline', marginRight: 4 }} />{nameError}</div>}
                    {saveError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs">{saveError}</div>}
                    {saveSuccess && <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-xs">Formula saved successfully!</div>}
                    <button
                      onClick={handleSave}
                      disabled={!canSave || saving || saveSuccess}
                      className="btn-primary"
                      style={{ justifyContent: 'center' }}
                    >
                      {saving ? 'Saving...' : editFormula ? 'Update Formula' : 'Save Formula'}
                    </button>
                  </div>
                </div>
              )}
            </Section>
          </div>
        </div>
      ) : (
        /* ── CORRELATION TAB (Task 10) ── */
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>
          
          {/* Controls */}
          <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} className="text-purple-400" />
              Analyze Correlation
            </h3>
            
            <div>
              <label className="text-xs text-white/50 block mb-1.5 font-bold uppercase">Variable X (Independent)</label>
              <select
                value={var1}
                onChange={e => setVar1(e.target.value)}
                className="input-field w-full"
                style={{ fontSize: 13 }}
              >
                <option value="">-- Choose first variable --</option>
                {eligibleVariables.map(v => (
                  <option key={v.name} value={v.name}>{v.display}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1.5 font-bold uppercase">Variable Y (Dependent)</label>
              <select
                value={var2}
                onChange={e => setVar2(e.target.value)}
                className="input-field w-full"
                style={{ fontSize: 13 }}
              >
                <option value="">-- Choose second variable --</option>
                {eligibleVariables.map(v => (
                  <option key={v.name} value={v.name}>{v.display}</option>
                ))}
              </select>
            </div>

            {corrError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex gap-2 items-start">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{corrError}</span>
              </div>
            )}

            <button
              onClick={runCorrelationAnalysis}
              disabled={loadingCorrData || !selectedUnitId || !var1 || !var2}
              className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold text-sm hover:scale-[1.01] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:scale-100"
            >
              {loadingCorrData ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {loadingCorrData ? 'Processing...' : 'Run Correlation'}
            </button>

            {correlationStats && (
              <div style={{ marginTop: 10, padding: 16, bg: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, color: 'var(--text-muted)', fontWeight: 800, margin: '0 0 12px' }}>
                  STATISTICAL INSIGHTS
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Pearson r</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{correlationStats.r}</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>R-squared (R²)</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{correlationStats.r2}</span>
                  </div>
                </div>

                <div style={{ marginTop: 14, fontSize: 12, color: '#fff/80', lineHeight: 1.5 }}>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Strength: </strong>
                    <span className={getCorrelationStrength(correlationStats.r).color}>
                      {getCorrelationStrength(correlationStats.r).text}
                    </span> 
                    {correlationStats.r >= 0 ? " Positive" : " Negative"}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                    Based on <strong>{correlationStats.count}</strong> matching historical data points.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Graph View */}
          <div className="glass-card" style={{ padding: 24, minHeight: 460 }}>
            {loadingCorrData ? (
              <div className="flex flex-col items-center justify-center h-full py-32">
                <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-white/60 font-semibold text-sm">Processing records and computing coefficients...</p>
              </div>
            ) : correlationData.length > 0 && correlationStats ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
                    Scatter Plot &amp; Regression Line
                  </h4>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    X-Axis: <strong>{colMap[var1] || var1}</strong> vs Y-Axis: <strong>{colMap[var2] || var2}</strong>
                  </p>
                </div>

                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={correlationData}
                      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                      <XAxis 
                        type="number" 
                        dataKey="x" 
                        name={colMap[var1] || var1} 
                        stroke="rgba(255, 255, 255, 0.4)" 
                        tick={{ fontSize: 10 }}
                        label={{ value: colMap[var1] || var1, position: 'bottom', offset: 0, fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                      />
                      <YAxis 
                        type="number" 
                        dataKey="y" 
                        name={colMap[var2] || var2} 
                        stroke="rgba(255, 255, 255, 0.4)" 
                        tick={{ fontSize: 10 }}
                        label={{ value: colMap[var2] || var2, angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                      />
                      <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                                <p style={{ margin: '0 0 4px', color: 'var(--accent)', fontWeight: 700 }}>Period: {data.period}</p>
                                <p style={{ margin: '0 0 2px', color: '#fff' }}>X: {data.x}</p>
                                <p style={{ margin: 0, color: '#fff' }}>Y: {data.y}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Scatter 
                        name="Actual Records" 
                        dataKey="y" 
                        fill="var(--accent)" 
                        shape="circle"
                      />
                      <Line 
                        name="Regression Line" 
                        dataKey="line" 
                        stroke="#ec4899" 
                        strokeWidth={2} 
                        dot={false}
                        activeDot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                    <TrendingUp size={20} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    <p style={{ margin: '0 0 2px', color: '#fff', fontWeight: 600 }}>Regression Equation</p>
                    Equation: <strong>y = {correlationStats.m}x {correlationStats.c >= 0 ? `+ ${correlationStats.c}` : `- ${Math.abs(correlationStats.c)}`}</strong>. 
                    This equation explains that for every 1 unit increase in <strong>{colMap[var1] || var1}</strong>, <strong>{colMap[var2] || var2}</strong> is predicted to change by <strong>{correlationStats.m}</strong> units.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-32 text-center">
                <ScatterIcon className="w-16 h-16 text-white/10 mb-4" />
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
                  No Analysis Results
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 360, margin: 0 }}>
                  {!selectedUnitId 
                    ? "Select a unit to load the variables list." 
                    : "Select two variables and click 'Run Correlation' to see the scatter plot, linear regression, and R² score."
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
