import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import {
  BarChart3, TrendingUp, TrendingDown, Users, Calendar,
  Filter, RefreshCw, ChevronDown, Activity, Zap,
  ArrowUpRight, ArrowDownRight, Minus, Eye, X, AlertCircle,
  PieChart as PieIcon, Layers, ShieldCheck, Sparkles, Sliders
} from "lucide-react";
import api, { authService, dataRecordService, productService } from "../services/api";

// ─── Linear Regression & Forecast ──────────────────────────────────────────
function linearRegression(data, key) {
  const pts = data
    .map((d, i) => ({ x: i, y: parseFloat(d[key]) || 0 }))
    .filter(p => !isNaN(p.y));
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept, n };
}

function buildPrediction(data, key, steps = 5) {
  const reg = linearRegression(data, key);
  if (!reg) return [];
  const { slope, intercept, n } = reg;
  return Array.from({ length: steps }, (_, i) => {
    const val = Math.max(0, slope * (n + i) + intercept);
    const margin = val * 0.08 * (i + 1); // Confidence margin calculation
    return {
      _predicted: true,
      _index: n + i,
      [`${key}_pred`]: val,
      [`${key}_pred_upper`]: val + margin,
      [`${key}_pred_lower`]: Math.max(0, val - margin),
    };
  });
}

// ─── Palette Definition ───────────────────────────────────────────────────
const PALETTE = [
  "#00f2fe", "#a78bfa", "#f59e0b", "#ec4899",
  "#10b981", "#3b82f6", "#ff007f", "#34d399",
];

const GRADIENTS = [
  { start: "#00f2fe", stop: "#4facfe" },
  { start: "#a78bfa", stop: "#7c3aed" },
  { start: "#f59e0b", stop: "#d97706" },
  { start: "#ec4899", stop: "#be185d" },
  { start: "#10b981", stop: "#059669" },
  { start: "#3b82f6", stop: "#1d4ed8" },
];

// ─── Formatters ───────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return d;
  }
};

const fmtNum = (v) => {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : n % 1 === 0
    ? n.toFixed(0)
    : n.toFixed(2);
};

const pctChange = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

// ─── Ultra-Glassy Tooltip ─────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="shadow-2xl border transition-all"
      style={{
        background: "rgba(13, 17, 28, 0.92)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 14,
        padding: "12px 16px",
        fontSize: 12,
        minWidth: 165,
        boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
        <span className="font-semibold text-white/70 text-xs">
          {fmtDate(label) || label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 uppercase font-mono">
          Data Point
        </span>
      </div>
      {payload.map((p, i) => {
        const isPred = p.name?.includes("pred");
        const cleanName = p.name?.replace("_pred", " (Forecast)").replace(/_/g, " ");
        return (
          <div key={i} className="flex items-center justify-between gap-4 my-1.5">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{
                  background: p.color || "#00f2fe",
                  boxShadow: `0 0 8px ${p.color || "#00f2fe"}`,
                }}
              />
              <span className="text-white/80 font-medium capitalize" style={{ opacity: isPred ? 0.75 : 1 }}>
                {cleanName}
              </span>
            </div>
            <span className="font-mono font-bold text-white tracking-wider">
              {fmtNum(p.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Enhanced KPI Card ────────────────────────────────────────────────────
const KPICard = ({ label, value, prev, icon: Icon, color, index }) => {
  const chg = pctChange(value, prev);
  const up = chg > 0;
  const neutral = chg === null || chg === 0;

  return (
    <div
      className="group relative rounded-2xl p-5 flex flex-col justify-between overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Ambient background glow halo */}
      <div
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}35 0%, rgba(0,0,0,0) 70%)`,
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      <div className="flex items-center justify-between z-10 mb-3">
        <div
          className="p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110"
          style={{
            background: `${color}18`,
            color: color,
            border: `1px solid ${color}30`,
            boxShadow: `0 0 12px ${color}20`,
          }}
        >
          <Icon size={20} />
        </div>
        {!neutral && (
          <div
            className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full border"
            style={{
              background: up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              color: up ? "#10b981" : "#ef4444",
              borderColor: up ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
            }}
          >
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(chg).toFixed(1)}%
          </div>
        )}
        {neutral && chg === 0 && (
          <div
            className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
          >
            <Minus size={12} /> 0%
          </div>
        )}
      </div>

      <div className="z-10 mt-1">
        <div
          className="text-3xl font-black tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "monospace",
            textShadow: `0 0 20px ${color}20`,
          }}
        >
          {fmtNum(value)}
        </div>
        <div className="text-xs font-semibold capitalize mt-1 truncate" style={{ color: "var(--text-secondary)" }}>
          {label}
        </div>
      </div>
    </div>
  );
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────
const Skeleton = ({ h = 220 }) => (
  <div
    style={{
      height: h,
      borderRadius: 18,
      background: "linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.6s infinite ease-in-out",
      border: "1px solid var(--border)",
    }}
  />
);

// ─── Main Visuals Page Component ──────────────────────────────────────────
const Visuals = () => {
  const role = authService.getRole();
  const isAdmin = role === "org_admin" || role === "system_admin";

  // State
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("all");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Time filter
  const [preset, setPreset] = useState("1M");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  // Chart controls
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [showPrediction, setShowPrediction] = useState(true);
  const [chartType, setChartType] = useState("area"); // area | bar | line | radial

  // Compute date range from preset
  const dateRange = useMemo(() => {
    if (useCustom && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const daysMap = { "7D": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };
    const days = daysMap[preset] || 30;
    const start = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
    return { start, end };
  }, [preset, useCustom, customStart, customEnd]);

  // Fetch org users (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/users/")
      .then(res => setUsers(res.data?.filter(u => u.role === "org_user") || []))
      .catch(() => {});
  }, [isAdmin]);

  // Fetch units
  useEffect(() => {
    productService.getProducts()
      .then(res => setUnits(res.data || []))
      .catch(() => {});
  }, []);

  // Date filter matcher — handles YYYY-MM-DD, YYYY-MM, and ISO timestamps
  const isDateInRange = useCallback((rawDate, start, end) => {
    if (!rawDate) return true;
    const dStr = String(rawDate).trim();
    if (!dStr || dStr === "unknown") return true;

    const match = dStr.match(/^(\d{4}-\d{2})(?:-(\d{2}))?/);
    if (!match) return true;

    const recMonth = match[1]; // e.g. "2026-08"
    const recFull = match[2] ? `${recMonth}-${match[2]}` : null; // e.g. "2026-08-12"

    if (start) {
      const startMonth = start.slice(0, 7);
      if (recMonth < startMonth) return false;
      if (recFull && recFull < start) return false;
    }
    if (end) {
      const endMonth = end.slice(0, 7);
      if (recMonth > endMonth) return false;
      if (recFull && recFull > end) return false;
    }
    return true;
  }, []);

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        date_start: dateRange.start,
        date_end: dateRange.end,
        start_date: dateRange.start,
        end_date: dateRange.end,
      };
      if (selectedUnitId !== "all") params.product_id = selectedUnitId;
      if (selectedUserId !== "all") params.user_id = selectedUserId;

      const res = await api.get("/data-records/", { params });
      const data = res.data || [];
      setRecords(data);
    } catch (err) {
      setError("Failed to load data records. Please verify your connection.");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedUserId, selectedUnitId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Derive active unit's defined variable keys
  const activeUnitDefinedKeys = useMemo(() => {
    const defined = new Set();
    const targetUnits = selectedUnitId !== "all"
      ? units.filter(u => String(u.id) === String(selectedUnitId))
      : units;

    targetUnits.forEach(u => {
      (u.unit_vars || []).forEach(v => defined.add(typeof v === 'object' ? (v.key || v.name) : v));
      (u.customer_vars || []).forEach(v => defined.add(typeof v === 'object' ? (v.key || v.name) : v));
      (u.input_fields || []).forEach(v => defined.add(v));
      (u.output_fields || []).forEach(v => defined.add(v));
    });
    return defined;
  }, [units, selectedUnitId]);

  // Derive numeric field keys — strictly filtered to valid unit variables
  const numericKeys = useMemo(() => {
    if (!records.length) return [];
    const extracted = getNumericKeys(records);
    if (activeUnitDefinedKeys.size > 0) {
      // Prioritize keys defined in the unit schema, followed by computed metrics
      const matched = extracted.filter(k => activeUnitDefinedKeys.has(k) || activeUnitDefinedKeys.has(k.replace(/_/g, " ")) || activeUnitDefinedKeys.has(k.replace(/\s+/g, "_")));
      if (matched.length > 0) return matched;
    }
    // Fallback: exclude legacy seed keys if not defined
    const legacySeed = new Set(["fuel cost", "fuel_cost", "diesel cost", "diesel_cost", "grid_kwh", "generator_hours"]);
    const cleaned = extracted.filter(k => !legacySeed.has(k.toLowerCase()));
    return cleaned.length > 0 ? cleaned : extracted;
  }, [records, activeUnitDefinedKeys]);

  // Sync selected metrics when numericKeys change
  useEffect(() => {
    if (numericKeys.length > 0) {
      setSelectedMetrics(prev => {
        const validPrev = prev.filter(m => numericKeys.includes(m));
        if (validPrev.length > 0) return validPrev;
        return numericKeys.slice(0, 3);
      });
    } else {
      setSelectedMetrics([]);
    }
  }, [numericKeys]);

  // Aggregate records by date with accurate period matching
  const chartData = useMemo(() => {
    if (!records.length) return [];
    const byDate = {};
    records.forEach(r => {
      const d = r.date || r.record_date || r.month || r.data?.parameters?.date || r.created_at?.slice(0, 10) || "unknown";
      if (!isDateInRange(d, dateRange.start, dateRange.end)) return;
      
      const normDate = d.length === 7 ? `${d}-01` : d;
      if (!byDate[normDate]) byDate[normDate] = { date: normDate, _count: 0 };
      byDate[normDate]._count++;
      const flat = flattenRecordMetrics(r);
      numericKeys.forEach(k => {
        const val = flat[k];
        if (val !== undefined) byDate[normDate][k] = (byDate[normDate][k] || 0) + val;
      });
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [records, numericKeys, dateRange, isDateInRange]);

  // Prediction data with confidence ribbons
  const predData = useMemo(() => {
    if (!showPrediction || !chartData.length || !selectedMetrics.length) return [];
    const key = selectedMetrics[0];
    return buildPrediction(chartData, key, 5).map(p => ({
      date: `+${p._index - chartData.length + 1}d`,
      ...Object.fromEntries(
        Object.entries(p).filter(([k]) => !k.startsWith("_"))
      ),
      _isPred: true,
    }));
  }, [chartData, selectedMetrics, showPrediction]);

  const fullData = useMemo(() => [...chartData, ...predData], [chartData, predData]);

  // KPI summary cards
  const kpiSummary = useMemo(() => {
    if (!chartData.length || !selectedMetrics.length) return [];
    return selectedMetrics.slice(0, 4).map((key, i) => {
      const vals = chartData.map(d => d[key]).filter(v => v !== undefined);
      const latest = vals[vals.length - 1] ?? 0;
      const prev = vals[vals.length - 2] ?? 0;
      return { label: key.replace(/_/g, " "), value: latest, prev, color: PALETTE[i % PALETTE.length] };
    });
  }, [chartData, selectedMetrics]);

  // Per-Unit Breakdown
  const unitBreakdown = useMemo(() => {
    if (!records.length || !selectedMetrics.length) return [];
    const key = selectedMetrics[0];
    const byUnit = {};
    records.forEach(r => {
      const name = r.product?.name || r.product_name || r.unit_name || r.data?.parameters?.towerName || `Unit ${r.product_id}`;
      if (!byUnit[name]) byUnit[name] = { name, total: 0, count: 0 };
      const flat = flattenRecordMetrics(r);
      const v = flat[key];
      if (v !== undefined) { byUnit[name].total += v; byUnit[name].count++; }
    });
    return Object.values(byUnit).map(b => ({
      name: b.name,
      [key]: b.count ? b.total / b.count : 0,
    })).sort((a, b) => b[key] - a[key]).slice(0, 8);
  }, [records, selectedMetrics]);

  // Radial / Pie share data
  const radialData = useMemo(() => {
    if (!unitBreakdown.length || !selectedMetrics[0]) return [];
    const key = selectedMetrics[0];
    return unitBreakdown.map((ub, i) => ({
      name: ub.name,
      value: ub[key],
      color: PALETTE[i % PALETTE.length],
    }));
  }, [unitBreakdown, selectedMetrics]);

  const ICONS = [Activity, TrendingUp, Zap, BarChart3];
  const isEmpty = !loading && !error && chartData.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)", padding: "28px 32px" }}>
      {/* ── Glow SVG Defs & CSS Keyframes ──────────────────────────────── */}
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .vis-btn { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; border: none; outline: none; }
        .vis-btn:hover { transform: translateY(-1.5px); opacity: 0.95; }
        .vis-btn:active { transform: translateY(0); }
        .metric-chip { transition: all 0.2s ease; cursor: pointer; }
        .metric-chip:hover { transform: scale(1.03); }
        .chart-card {
          background: rgba(16, 20, 32, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          transition: border-color 0.3s ease;
        }
        .chart-card:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
      `}</style>

      {/* SVG Neon Glow Filters */}
      <svg width="0" height="0" className="absolute pointer-events-none">
        <defs>
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-violet" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl" style={{ background: "rgba(0,242,254,0.12)", color: "#00f2fe", border: "1px solid rgba(0,242,254,0.25)", boxShadow: "0 0 15px rgba(0,242,254,0.2)" }}>
              <BarChart3 size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-black flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                {isAdmin ? "Org-Wide Visual Analytics" : "Personalized Visual Analytics"}
              </h1>
              <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {isAdmin
                  ? "Multi-unit performance · AI predictive analytics · Operator filtering"
                  : "Unit productivity trends · Performance forecasts · Real-time metrics"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981" }}>
              <ShieldCheck size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">User Account View</span>
            </div>
          )}
          <button
            onClick={fetchRecords}
            className="vis-btn flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs"
            style={{
              background: "rgba(0,242,254,0.1)",
              color: "#00f2fe",
              border: "1px solid rgba(0,242,254,0.25)",
              boxShadow: "0 0 12px rgba(0,242,254,0.1)",
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="chart-card mb-6">
        <div className="flex flex-wrap gap-4 items-end">

          {/* User filter — admin only */}
          {isAdmin && (
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Users size={10} /> Operator
              </label>
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full appearance-none rounded-xl px-4 py-2.5 text-xs font-semibold pr-8"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }}
                >
                  <option value="all">All Operators</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              </div>
            </div>
          )}

          {/* Unit filter */}
          <div className="flex flex-col gap-1.5 min-w-[170px]">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Unit / Product
            </label>
            <div className="relative">
              <select
                value={selectedUnitId}
                onChange={e => setSelectedUnitId(e.target.value)}
                className="w-full appearance-none rounded-xl px-4 py-2.5 text-xs font-semibold pr-8"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }}
              >
                <option value="all">All Assigned Units</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            </div>
          </div>

          {/* Time presets */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Calendar size={10} /> Period
            </label>
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
              {["7D", "1M", "3M", "6M", "1Y"].map(p => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setUseCustom(false); }}
                  className="vis-btn px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{
                    background: !useCustom && preset === p ? "#00f2fe" : "transparent",
                    color: !useCustom && preset === p ? "#000" : "var(--text-secondary)",
                    boxShadow: !useCustom && preset === p ? "0 0 12px rgba(0,242,254,0.4)" : "none",
                  }}
                >{p}</button>
              ))}
            </div>
          </div>

          {/* Custom date range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Custom Range
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customStart}
                onChange={e => { setCustomStart(e.target.value); setUseCustom(true); }}
                className="rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "var(--bg-elevated)", border: `1px solid ${useCustom ? "#00f2fe" : "var(--border)"}`, color: "var(--text-primary)", outline: "none" }}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>→</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => { setCustomEnd(e.target.value); setUseCustom(true); }}
                className="rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "var(--bg-elevated)", border: `1px solid ${useCustom ? "#00f2fe" : "var(--border)"}`, color: "var(--text-primary)", outline: "none" }}
              />
              {useCustom && (
                <button onClick={() => { setUseCustom(false); setCustomStart(""); setCustomEnd(""); }}
                  className="vis-btn p-1.5 rounded-lg" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.1)" }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Chart view modes */}
          <div className="flex flex-col gap-1.5 ml-auto">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Chart View
            </label>
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
              {[
                { id: "area", label: "Area" },
                { id: "bar", label: "Bar" },
                { id: "line", label: "Line" },
                { id: "radial", label: "Radial" }
              ].map(ct => (
                <button key={ct.id} onClick={() => setChartType(ct.id)}
                  className="vis-btn px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{
                    background: chartType === ct.id ? "rgba(167,139,250,0.25)" : "transparent",
                    color: chartType === ct.id ? "#a78bfa" : "var(--text-secondary)",
                    border: chartType === ct.id ? "1px solid rgba(167,139,250,0.4)" : "none",
                  }}
                >{ct.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Metric selector chips */}
        {numericKeys.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
            <span className="text-[10px] font-black uppercase tracking-widest self-center mr-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Filter size={10} /> Metrics:
            </span>
            {numericKeys.map((k, i) => {
              const active = selectedMetrics.includes(k);
              const chipColor = PALETTE[i % PALETTE.length];
              return (
                <button
                  key={k}
                  onClick={() => {
                    if (active) {
                      if (selectedMetrics.length > 1) setSelectedMetrics(m => m.filter(x => x !== k));
                    } else {
                      setSelectedMetrics(m => [...m.slice(0, 3), k]);
                    }
                  }}
                  className="metric-chip px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5"
                  style={{
                    background: active ? `${chipColor}20` : "var(--bg-elevated)",
                    color: active ? chipColor : "var(--text-secondary)",
                    border: `1px solid ${active ? `${chipColor}60` : "var(--border)"}`,
                    boxShadow: active ? `0 0 10px ${chipColor}20` : "none",
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: active ? chipColor : "rgba(255,255,255,0.2)",
                    boxShadow: active ? `0 0 6px ${chipColor}` : "none",
                    display: "inline-block"
                  }} />
                  {k.replace(/_/g, " ")}
                </button>
              );
            })}

            <button
              onClick={() => setShowPrediction(p => !p)}
              className="metric-chip px-3.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ml-auto"
              style={{
                background: showPrediction ? "rgba(167,139,250,0.18)" : "var(--bg-elevated)",
                color: showPrediction ? "#a78bfa" : "var(--text-secondary)",
                border: `1px solid ${showPrediction ? "rgba(167,139,250,0.5)" : "var(--border)"}`,
              }}
            >
              <Sparkles size={12} />
              AI Forecast {showPrediction ? "ON" : "OFF"}
            </button>
          </div>
        )}
      </div>

      {/* ── Error State ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl mb-6"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} h={110} />)}
        </div>
      ) : !isEmpty && kpiSummary.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {kpiSummary.map((k, i) => (
            <KPICard key={k.label} label={k.label} value={k.value} prev={k.prev}
              icon={ICONS[i % ICONS.length]} color={k.color} index={i} />
          ))}
        </div>
      ) : null}

      {/* ── Charts Grid ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} h={300} />)}
        </div>
      ) : isEmpty ? (
        <EmptyState dateRange={dateRange} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Chart 1 — Growth & Multi-Trend Composed Chart */}
          <div className="chart-card lg:col-span-2">
            <SectionHeader
              title="Productivity Growth & Performance Trends"
              subtitle={`${fmtDate(dateRange.start)} → ${fmtDate(dateRange.end)}`}
              icon={TrendingUp}
              color="#00f2fe"
            />
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={fullData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  {selectedMetrics.map((k, i) => {
                    const c = PALETTE[i % PALETTE.length];
                    return (
                      <linearGradient key={k} id={`grad_glow_${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={c} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={c} stopOpacity={0.0} />
                      </linearGradient>
                    );
                  })}
                  <linearGradient id="predGradRibbon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} tickFormatter={fmtDate} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)", paddingTop: 10 }} />
                {chartData.length > 0 && (
                  <ReferenceLine x={chartData[chartData.length - 1].date} stroke="rgba(167,139,250,0.5)" strokeDasharray="5 3" label={{ value: "Forecast Start", fill: "#a78bfa", fontSize: 10, position: "top" }} />
                )}

                {selectedMetrics.map((k, i) => {
                  const c = PALETTE[i % PALETTE.length];
                  return chartType === "bar" ? (
                    <Bar key={k} dataKey={k} fill={c} fillOpacity={0.8} radius={[6, 6, 0, 0]} name={k.replace(/_/g, " ")} />
                  ) : chartType === "line" ? (
                    <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={3} dot={{ r: 3, fill: c }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} name={k.replace(/_/g, " ")} filter="url(#glow-cyan)" />
                  ) : (
                    <Area key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2.5} fill={`url(#grad_glow_${i})`} dot={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} name={k.replace(/_/g, " ")} />
                  );
                })}

                {showPrediction && selectedMetrics[0] && (
                  <Line
                    type="monotone"
                    dataKey={`${selectedMetrics[0]}_pred`}
                    stroke="#a78bfa"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={{ fill: "#a78bfa", r: 4 }}
                    name={`${selectedMetrics[0].replace(/_/g, " ")} (AI Forecast)`}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — Per-Unit Breakdown (Horizontal Bar) */}
          <div className="chart-card">
            <SectionHeader
              title="Per-Unit Performance Breakdown"
              subtitle={selectedMetrics[0]?.replace(/_/g, " ") || "Primary Metric"}
              icon={BarChart3}
              color="#3b82f6"
            />
            {unitBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={unitBreakdown} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} tickFormatter={fmtNum} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} tickLine={false} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  {selectedMetrics[0] && (
                    <Bar
                      dataKey={selectedMetrics[0]}
                      fill="#3b82f6"
                      fillOpacity={0.85}
                      radius={[0, 8, 8, 0]}
                      background={{ fill: "rgba(255,255,255,0.02)", radius: [0, 8, 8, 0] }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="No per-unit data available in selected scope" />
            )}
          </div>

          {/* Chart 3 — AI Prediction Forecast Ribbon */}
          <div className="chart-card">
            <SectionHeader
              title="AI Linear Forecast & Range"
              subtitle="Regression projection with 8% confidence interval"
              icon={Activity}
              color="#a78bfa"
            />
            {predData.length > 0 && chartData.length > 0 && selectedMetrics[0] ? (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart
                  data={[
                    ...chartData.slice(-8).map(d => ({ ...d, _type: "actual" })),
                    ...predData,
                  ]}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickFormatter={fmtDate} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={60} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey={selectedMetrics[0]} stroke="#00f2fe" strokeWidth={2.5} fill="transparent" dot={{ fill: "#00f2fe", r: 3 }} name="Actual Data" />
                  <Area type="monotone" dataKey={`${selectedMetrics[0]}_pred`} stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 4" fill="url(#predGradRibbon)" dot={{ fill: "#a78bfa", r: 4 }} name="Forecast Target" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="Requires at least 2 data points for prediction modeling" />
            )}
          </div>

          {/* Chart 4 — Radial / Donut Distribution Share */}
          <div className="chart-card">
            <SectionHeader
              title="Unit Performance Distribution"
              subtitle="Relative share across assigned operational units"
              icon={PieIcon}
              color="#ec4899"
            />
            {radialData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={radialData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {radialData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="No categorical distribution data" />
            )}
          </div>

          {/* Chart 5 — Multi-Metric Side-by-Side Comparison */}
          <div className="chart-card">
            <SectionHeader
              title="Multi-Metric Comparative View"
              subtitle="Synchronized trends across selected indicators"
              icon={Zap}
              color="#f59e0b"
            />
            {chartData.length > 0 && selectedMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickFormatter={fmtDate} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={60} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  {selectedMetrics.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={2.5}
                      dot={false}
                      name={k.replace(/_/g, " ")}
                      strokeDasharray={i > 0 ? `${4 + i * 2} 3` : undefined}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="Select at least one metric above" />
            )}
          </div>

          {/* Footer Metadata Strip */}
          <div className="lg:col-span-2 flex flex-col sm:flex-row items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            <span>
              {records.length} record{records.length !== 1 ? "s" : ""} · {chartData.length} data point{chartData.length !== 1 ? "s" : ""} · {numericKeys.length} metric{numericKeys.length !== 1 ? "s" : ""}
              {selectedUserId !== "all" && ` · Operator: ${users.find(u => String(u.id) === String(selectedUserId))?.name || selectedUserId}`}
              {selectedUnitId !== "all" && ` · Unit: ${units.find(u => String(u.id) === String(selectedUnitId))?.name || selectedUnitId}`}
            </span>
            <span className="mt-1 sm:mt-0">
              Active Window: {useCustom ? `${customStart} → ${customEnd}` : preset}
            </span>
          </div>

        </div>
      )}
    </div>
  );
};

// ─── Utility Helpers ──────────────────────────────────────────────────────
const SYSTEM_METADATA_KEYS = new Set([
  "id", "product_id", "organization_id", "user_id", "created_by", "created_at",
  "updated_at", "data", "product", "parameters", "unit_data", "computed",
  "customer_data", "month", "year", "shift", "batch_id", "tower_id", "tower_name",
  "is_active", "status", "record_id", "is_verified", "accepted", "date", "name",
  "Date", "Name", "record_date", "region", "city", "_count", "_id"
]);

function isSystemKey(key) {
  if (!key || typeof key !== "string") return true;
  const k = key.trim();
  if (SYSTEM_METADATA_KEYS.has(k)) return true;
  const kLower = k.toLowerCase();
  if (SYSTEM_METADATA_KEYS.has(kLower)) return true;
  if (kLower.endsWith("_id") || kLower.endsWith("id") && kLower.length <= 4) return true;
  if (kLower.includes("date") || kLower.includes("time") || kLower.includes("created") || kLower.includes("updated")) return true;
  return false;
}

function flattenRecordMetrics(record) {
  if (!record) return {};
  const metrics = {};

  const processObject = (obj) => {
    if (!obj || typeof obj !== "object") return;
    Object.entries(obj).forEach(([k, v]) => {
      if (isSystemKey(k)) return;
      const num = parseFloat(v);
      if (!isNaN(num) && isFinite(num)) {
        metrics[k] = (metrics[k] || 0) + num;
      }
    });
  };

  const dataObj = record.data;
  if (dataObj && typeof dataObj === "object") {
    if (dataObj.unit_data && typeof dataObj.unit_data === "object") {
      processObject(dataObj.unit_data);
    }
    if (dataObj.computed && typeof dataObj.computed === "object") {
      processObject(dataObj.computed);
    }
    if (Array.isArray(dataObj.customer_data)) {
      dataObj.customer_data.forEach(c => processObject(c));
    }
    processObject(dataObj);
  }

  Object.entries(record).forEach(([k, v]) => {
    if (!isSystemKey(k)) {
      const num = parseFloat(v);
      if (!isNaN(num) && isFinite(num)) {
        metrics[k] = (metrics[k] || 0) + num;
      }
    }
  });

  return metrics;
}

function getNumericKeys(records) {
  if (!records) return [];
  const recList = Array.isArray(records) ? records : [records];
  const allKeys = new Set();
  recList.forEach(r => {
    const flat = flattenRecordMetrics(r);
    Object.keys(flat).forEach(k => {
      if (!isSystemKey(k)) allKeys.add(k);
    });
  });
  return Array.from(allKeys);
}

const SectionHeader = ({ title, subtitle, icon: Icon, color }) => (
  <div className="flex items-center gap-3 mb-5">
    <div
      className="p-2.5 rounded-xl"
      style={{
        background: `${color}18`,
        color: color,
        border: `1px solid ${color}30`,
        boxShadow: `0 0 12px ${color}15`,
      }}
    >
      <Icon size={18} />
    </div>
    <div>
      <h3 className="font-bold text-sm tracking-wide" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {subtitle && <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
    </div>
  </div>
);

const MiniEmpty = ({ text }) => (
  <div className="flex flex-col items-center justify-center h-[200px] gap-3" style={{ color: "var(--text-muted)" }}>
    <Eye size={30} strokeWidth={1.5} />
    <p className="text-xs font-semibold text-center">{text}</p>
  </div>
);

const EmptyState = ({ dateRange }) => (
  <div className="chart-card p-16 flex flex-col items-center justify-center gap-5 text-center">
    <div className="p-6 rounded-3xl" style={{ background: "rgba(0,242,254,0.06)", border: "1px dashed rgba(0,242,254,0.3)" }}>
      <BarChart3 size={52} style={{ color: "#00f2fe", opacity: 0.6 }} />
    </div>
    <div>
      <h3 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>No data records in this timeframe</h3>
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        No records found between <strong>{fmtDate(dateRange.start)}</strong> and <strong>{fmtDate(dateRange.end)}</strong>.
      </p>
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Try selecting a wider time preset, clearing operator filters, or submitting new data via <strong>Unit Data Entry</strong>.
      </p>
    </div>
  </div>
);

export default Visuals;
