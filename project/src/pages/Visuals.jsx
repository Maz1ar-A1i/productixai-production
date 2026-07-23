import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Scatter
} from "recharts";
import {
  BarChart3, TrendingUp, TrendingDown, Users, Calendar,
  Filter, RefreshCw, ChevronDown, Activity, Zap,
  ArrowUpRight, ArrowDownRight, Minus, Eye, X, AlertCircle
} from "lucide-react";
import api, { authService, dataRecordService, productService } from "../services/api";

// ─── Prediction (Linear Regression) ─────────────────────────────────────────
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

function buildPrediction(data, key, steps = 4) {
  const reg = linearRegression(data, key);
  if (!reg) return [];
  const { slope, intercept, n } = reg;
  return Array.from({ length: steps }, (_, i) => ({
    _predicted: true,
    _index: n + i,
    [`${key}_pred`]: Math.max(0, slope * (n + i) + intercept),
  }));
}

// ─── Colour palette ──────────────────────────────────────────────────────────
const PALETTE = [
  "#00d4aa", "#3b82f6", "#f59e0b", "#ec4899",
  "#a78bfa", "#34d399", "#fb923c", "#60a5fa",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return d; }
};

const fmtNum = (v) => {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
};

const pctChange = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(10,10,20,0.97)",
      border: "1px solid rgba(0,212,170,0.2)",
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 12,
      minWidth: 140,
    }}>
      <p style={{ color: "var(--text-secondary)", marginBottom: 6, fontWeight: 600 }}>
        {fmtDate(label) || label}
      </p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.color || "#fff", opacity: p.name?.includes("pred") ? 0.7 : 1 }}>
            {p.name?.replace("_pred", " (pred)").replace(/_/g, " ")}
          </span>
          <span style={{ color: "#fff", fontWeight: 700, fontFamily: "monospace" }}>
            {fmtNum(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KPICard = ({ label, value, prev, icon: Icon, color }) => {
  const chg = pctChange(value, prev);
  const up = chg > 0;
  const neutral = chg === null || chg === 0;
  return (
    <div className="glass-card p-5 flex flex-col gap-2 relative overflow-hidden">
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 80, height: 80, borderRadius: "50%",
        background: `${color}18`, filter: "blur(20px)",
      }} />
      <div className="flex items-center justify-between">
        <div className="p-2 rounded-lg" style={{ background: `${color}18`, color }}>
          <Icon size={18} />
        </div>
        {!neutral && (
          <div className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
            style={{
              background: up ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              color: up ? "#10b981" : "#ef4444",
            }}>
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(chg).toFixed(1)}%
          </div>
        )}
        {neutral && chg === 0 && (
          <div className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
            <Minus size={12} /> 0%
          </div>
        )}
      </div>
      <div className="text-2xl font-black" style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>
        {fmtNum(value)}
      </div>
      <div className="text-xs font-semibold truncate" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
    </div>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const Skeleton = ({ h = 220 }) => (
  <div style={{
    height: h, borderRadius: 16,
    background: "linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.03) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite",
  }} />
);

// ─── Main Visuals Component ──────────────────────────────────────────────────
const Visuals = () => {
  const role = authService.getRole();

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
  const [chartType, setChartType] = useState("area"); // area | bar | line

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
    if (role !== "org_admin") return;
    api.get("/users/")
      .then(res => setUsers(res.data?.filter(u => u.role === "org_user") || []))
      .catch(() => {});
  }, [role]);

  // Fetch units
  useEffect(() => {
    productService.getProducts()
      .then(res => setUnits(res.data || []))
      .catch(() => {});
  }, []);

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        start_date: dateRange.start,
        end_date: dateRange.end,
      };
      if (selectedUnitId !== "all") params.product_id = selectedUnitId;
      if (selectedUserId !== "all") params.user_id = selectedUserId;

      const res = await api.get("/data-records/", { params });
      const data = res.data || [];
      setRecords(data);

      // Auto-select first 2 numeric metrics if none chosen
      if (data.length > 0 && selectedMetrics.length === 0) {
        const numeric = getNumericKeys(data[0]);
        setSelectedMetrics(numeric.slice(0, 2));
      }
    } catch (err) {
      setError("Failed to load data records. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedUserId, selectedUnitId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Derive numeric field keys from records
  const numericKeys = useMemo(() => {
    if (!records.length) return [];
    return getNumericKeys(records[0]);
  }, [records]);

  // Group + aggregate records by date
  const chartData = useMemo(() => {
    if (!records.length) return [];
    const byDate = {};
    records.forEach(r => {
      const d = r.date || r.record_date || r.created_at?.slice(0, 10) || "unknown";
      if (!byDate[d]) byDate[d] = { date: d, _count: 0 };
      byDate[d]._count++;
      numericKeys.forEach(k => {
        const val = parseFloat(r[k]);
        if (!isNaN(val)) byDate[d][k] = (byDate[d][k] || 0) + val;
      });
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [records, numericKeys]);

  // Build prediction data
  const predData = useMemo(() => {
    if (!showPrediction || !chartData.length || !selectedMetrics.length) return [];
    const key = selectedMetrics[0];
    return buildPrediction(chartData, key, 5).map(p => ({
      date: `+${p._index - chartData.length + 1}`,
      ...Object.fromEntries(
        Object.entries(p).filter(([k]) => k !== "_predicted" && k !== "_index")
      ),
      _isPred: true,
    }));
  }, [chartData, selectedMetrics, showPrediction]);

  const fullData = useMemo(() => [
    ...chartData,
    ...predData,
  ], [chartData, predData]);

  // KPI summary
  const kpiSummary = useMemo(() => {
    if (!chartData.length || !selectedMetrics.length) return [];
    return selectedMetrics.slice(0, 4).map((key, i) => {
      const vals = chartData.map(d => d[key]).filter(v => v !== undefined);
      const latest = vals[vals.length - 1] ?? 0;
      const prev = vals[vals.length - 2] ?? 0;
      return { label: key.replace(/_/g, " "), value: latest, prev, color: PALETTE[i] };
    });
  }, [chartData, selectedMetrics]);

  // Per-unit breakdown (latest values)
  const unitBreakdown = useMemo(() => {
    if (!records.length || !selectedMetrics.length) return [];
    const key = selectedMetrics[0];
    const byUnit = {};
    records.forEach(r => {
      const name = r.product_name || r.unit_name || `Unit ${r.product_id}`;
      if (!byUnit[name]) byUnit[name] = { name, total: 0, count: 0 };
      const v = parseFloat(r[key]);
      if (!isNaN(v)) { byUnit[name].total += v; byUnit[name].count++; }
    });
    return Object.values(byUnit).map(b => ({
      name: b.name,
      [key]: b.count ? b.total / b.count : 0,
    })).sort((a, b) => b[key] - a[key]).slice(0, 10);
  }, [records, selectedMetrics]);

  const ICONS = [Activity, TrendingUp, Zap, BarChart3];

  const isEmpty = !loading && !error && chartData.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)", padding: "28px 32px" }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .vis-btn { transition: all 0.2s; cursor: pointer; border: none; outline: none; }
        .vis-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .metric-chip { transition: all 0.2s; cursor: pointer; }
        .metric-chip:hover { opacity: 0.85; }
        .chart-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 18px; padding: 22px; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3" style={{ color: "var(--text-primary)" }}>
            <div className="p-2 rounded-xl" style={{ background: "rgba(0,212,170,0.12)", color: "var(--accent)" }}>
              <BarChart3 size={26} />
            </div>
            Visuals
          </h1>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Growth trends · Predictive analytics · Per-user insights
          </p>
        </div>
        <button
          onClick={fetchRecords}
          className="vis-btn flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm"
          style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.2)" }}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="glass-card p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">

          {/* User filter — admin only */}
          {role === "org_admin" && (
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                <Users size={10} style={{ display: "inline", marginRight: 4 }} /> Operator
              </label>
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full appearance-none rounded-xl px-4 py-2.5 text-sm font-semibold pr-8"
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
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Unit
            </label>
            <div className="relative">
              <select
                value={selectedUnitId}
                onChange={e => setSelectedUnitId(e.target.value)}
                className="w-full appearance-none rounded-xl px-4 py-2.5 text-sm font-semibold pr-8"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }}
              >
                <option value="all">All Units</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            </div>
          </div>

          {/* Time presets */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              <Calendar size={10} style={{ display: "inline", marginRight: 4 }} /> Period
            </label>
            <div className="flex gap-1">
              {["7D", "1M", "3M", "6M", "1Y"].map(p => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setUseCustom(false); }}
                  className="vis-btn px-3 py-2 rounded-lg text-xs font-bold"
                  style={{
                    background: !useCustom && preset === p ? "var(--accent)" : "var(--bg-elevated)",
                    color: !useCustom && preset === p ? "#000" : "var(--text-secondary)",
                    border: "1px solid var(--border)",
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
                style={{ background: "var(--bg-elevated)", border: `1px solid ${useCustom ? "var(--accent)" : "var(--border)"}`, color: "var(--text-primary)", outline: "none" }}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>→</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => { setCustomEnd(e.target.value); setUseCustom(true); }}
                className="rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "var(--bg-elevated)", border: `1px solid ${useCustom ? "var(--accent)" : "var(--border)"}`, color: "var(--text-primary)", outline: "none" }}
              />
              {useCustom && (
                <button onClick={() => { setUseCustom(false); setCustomStart(""); setCustomEnd(""); }}
                  className="vis-btn p-1.5 rounded-lg" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)" }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Chart type */}
          <div className="flex flex-col gap-1.5 ml-auto">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>View</label>
            <div className="flex gap-1">
              {[{ id: "area", label: "Area" }, { id: "bar", label: "Bar" }, { id: "line", label: "Line" }].map(ct => (
                <button key={ct.id} onClick={() => setChartType(ct.id)}
                  className="vis-btn px-3 py-2 rounded-lg text-xs font-bold"
                  style={{
                    background: chartType === ct.id ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)",
                    color: chartType === ct.id ? "#60a5fa" : "var(--text-secondary)",
                    border: `1px solid ${chartType === ct.id ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
                  }}
                >{ct.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Metric selector chips */}
        {numericKeys.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="text-[10px] font-black uppercase tracking-widest self-center mr-1" style={{ color: "var(--text-muted)" }}>
              <Filter size={10} style={{ display: "inline", marginRight: 4 }} /> Metrics:
            </span>
            {numericKeys.map((k, i) => {
              const active = selectedMetrics.includes(k);
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
                    background: active ? `${PALETTE[i % PALETTE.length]}18` : "var(--bg-elevated)",
                    color: active ? PALETTE[i % PALETTE.length] : "var(--text-secondary)",
                    border: `1px solid ${active ? `${PALETTE[i % PALETTE.length]}40` : "var(--border)"}`,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: active ? PALETTE[i % PALETTE.length] : "rgba(255,255,255,0.15)",
                    display: "inline-block"
                  }} />
                  {k.replace(/_/g, " ")}
                </button>
              );
            })}
            <button
              onClick={() => setShowPrediction(p => !p)}
              className="metric-chip px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ml-auto"
              style={{
                background: showPrediction ? "rgba(168,139,250,0.12)" : "var(--bg-elevated)",
                color: showPrediction ? "#a78bfa" : "var(--text-secondary)",
                border: `1px solid ${showPrediction ? "rgba(168,139,250,0.3)" : "var(--border)"}`,
              }}
            >
              <TrendingUp size={12} />
              Prediction {showPrediction ? "ON" : "OFF"}
            </button>
          </div>
        )}
      </div>

      {/* ── Error State ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-6"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
          <AlertCircle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} h={100} />)}
        </div>
      ) : !isEmpty && kpiSummary.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {kpiSummary.map((k, i) => (
            <KPICard key={k.label} label={k.label} value={k.value} prev={k.prev}
              icon={ICONS[i % ICONS.length]} color={k.color} />
          ))}
        </div>
      ) : null}

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} h={280} />)}
        </div>
      ) : isEmpty ? (
        <EmptyState dateRange={dateRange} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Chart 1 — Growth Trend */}
          <div className="chart-panel lg:col-span-2">
            <SectionHeader
              title="Growth Trend"
              subtitle={`${fmtDate(dateRange.start)} → ${fmtDate(dateRange.end)}`}
              icon={TrendingUp}
              color="#00d4aa"
            />
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={fullData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  {selectedMetrics.map((k, i) => (
                    <linearGradient key={k} id={`grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} tickFormatter={fmtDate} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={58} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} />
                {chartData.length > 0 && <ReferenceLine x={chartData[chartData.length - 1].date} stroke="rgba(168,139,250,0.4)" strokeDasharray="6 3" label={{ value: "Now", fill: "#a78bfa", fontSize: 10 }} />}
                {selectedMetrics.map((k, i) =>
                  chartType === "bar" ? (
                    <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.7} radius={[4, 4, 0, 0]} name={k.replace(/_/g, " ")} />
                  ) : chartType === "line" ? (
                    <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5} dot={false} name={k.replace(/_/g, " ")} />
                  ) : (
                    <Area key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.5} fill={`url(#grad_${i})`} dot={false} name={k.replace(/_/g, " ")} />
                  )
                )}
                {showPrediction && selectedMetrics[0] && (
                  <Line
                    type="monotone"
                    dataKey={`${selectedMetrics[0]}_pred`}
                    stroke="#a78bfa"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ fill: "#a78bfa", r: 3 }}
                    name={`${selectedMetrics[0].replace(/_/g, " ")} (prediction)`}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — Per-Unit Breakdown */}
          <div className="chart-panel">
            <SectionHeader title="Per-Unit Breakdown" subtitle={selectedMetrics[0]?.replace(/_/g, " ") || ""} icon={BarChart3} color="#3b82f6" />
            {unitBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={unitBreakdown} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} tickFormatter={fmtNum} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickLine={false} width={90} />
                  <Tooltip content={<CustomTooltip />} />
                  {selectedMetrics[0] && (
                    <Bar dataKey={selectedMetrics[0]} fill="#3b82f6" fillOpacity={0.75} radius={[0, 6, 6, 0]}
                      background={{ fill: "rgba(255,255,255,0.02)", radius: [0, 6, 6, 0] }} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="No unit data to compare" />
            )}
          </div>

          {/* Chart 3 — Prediction Forecast */}
          <div className="chart-panel">
            <SectionHeader title="AI Prediction Forecast" subtitle="Linear regression projection" icon={Activity} color="#a78bfa" />
            {predData.length > 0 && chartData.length > 0 && selectedMetrics[0] ? (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={[
                    ...chartData.slice(-10).map(d => ({ ...d, _type: "actual" })),
                    ...predData,
                  ]}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickFormatter={fmtDate} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={58} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey={selectedMetrics[0]} stroke="#00d4aa" strokeWidth={2.5} fill="transparent" dot={false} name="Actual" />
                  <Area type="monotone" dataKey={`${selectedMetrics[0]}_pred`} stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 4" fill="url(#predGrad)" dot={{ fill: "#a78bfa", r: 4 }} name="Forecast" />
                  {chartData.length > 0 && <ReferenceLine x={chartData[chartData.length - 1].date} stroke="rgba(168,139,250,0.5)" strokeDasharray="5 3" />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="Need at least 2 data points for prediction" />
            )}
          </div>

          {/* Chart 4 — Multi-Metric Comparison */}
          <div className="chart-panel lg:col-span-2">
            <SectionHeader title="Multi-Metric Comparison" subtitle="All selected metrics side-by-side" icon={Zap} color="#f59e0b" />
            {chartData.length > 0 && selectedMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickFormatter={fmtDate} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={58} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} />
                  {selectedMetrics.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={i === 0 ? 2.5 : 2} dot={false} name={k.replace(/_/g, " ")}
                      strokeDasharray={i > 0 ? `${4 + i * 2} 3` : undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <MiniEmpty text="Select at least one metric above" />
            )}
          </div>

          {/* Data Info Strip */}
          <div className="lg:col-span-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              {records.length} record{records.length !== 1 ? "s" : ""} · {chartData.length} data point{chartData.length !== 1 ? "s" : ""} · {numericKeys.length} metric{numericKeys.length !== 1 ? "s" : ""}
              {selectedUserId !== "all" && ` · Operator: ${users.find(u => String(u.id) === String(selectedUserId))?.name || selectedUserId}`}
              {selectedUnitId !== "all" && ` · Unit: ${units.find(u => String(u.id) === String(selectedUnitId))?.name || selectedUnitId}`}
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              {useCustom ? `${customStart} → ${customEnd}` : preset}
            </span>
          </div>

        </div>
      )}
    </div>
  );
};

// ─── Utility sub-components ──────────────────────────────────────────────────
function getNumericKeys(record) {
  if (!record) return [];
  const skip = new Set(["id", "product_id", "organization_id", "user_id", "created_by", "created_at", "updated_at"]);
  return Object.entries(record)
    .filter(([k, v]) => !skip.has(k) && !k.endsWith("_id") && !k.includes("date") && !k.includes("name") && v !== null && !isNaN(parseFloat(v)))
    .map(([k]) => k);
}

const SectionHeader = ({ title, subtitle, icon: Icon, color }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 rounded-lg" style={{ background: `${color}15`, color }}>
      <Icon size={16} />
    </div>
    <div>
      <h3 className="font-black text-sm" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {subtitle && <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
    </div>
  </div>
);

const MiniEmpty = ({ text }) => (
  <div className="flex flex-col items-center justify-center h-[180px] gap-3" style={{ color: "var(--text-muted)" }}>
    <Eye size={28} strokeWidth={1.5} />
    <p className="text-xs font-semibold text-center">{text}</p>
  </div>
);

const EmptyState = ({ dateRange }) => (
  <div className="glass-card p-16 flex flex-col items-center justify-center gap-5 text-center">
    <div className="p-5 rounded-2xl" style={{ background: "rgba(0,212,170,0.05)", border: "1px dashed rgba(0,212,170,0.2)" }}>
      <BarChart3 size={48} style={{ color: "var(--accent)", opacity: 0.4 }} />
    </div>
    <div>
      <h3 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>No data in this range</h3>
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        No records found between <strong>{fmtDate(dateRange.start)}</strong> and <strong>{fmtDate(dateRange.end)}</strong>.
      </p>
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Try a wider time range, a different operator, or ensure data has been entered via Unit Data Entry.
      </p>
    </div>
  </div>
);

export default Visuals;
