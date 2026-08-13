import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { productService } from "../../services/api";
import {
  FileText,
  Download,
  Printer,
  Search,
  Calendar,
  Boxes,
  Database,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Layers,
  Building2,
  CheckCircle2,
  Activity
} from "lucide-react";

// ─── Formatters ───────────────────────────────────────────────────────────
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

const fmtDate = (d) => {
  if (!d || d === "unknown") return "—";
  try {
    const dStr = String(d).trim();
    const dt = new Date(dStr.length === 7 ? `${dStr}-01` : dStr);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(d);
  }
};

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
  if (kLower.endsWith("_id") || (kLower.endsWith("id") && kLower.length <= 4)) return true;
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
        metrics[k] = num;
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
        metrics[k] = num;
      }
    }
  });

  return metrics;
}

const Reports = () => {
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedProductId, setSelectedProductId] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [timePreset, setTimePreset] = useState("all"); // 'all', '30d', '90d', '1y'

  // Fetch products and records
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, recRes] = await Promise.all([
        productService.getProducts().catch(() => ({ data: [] })),
        api.get("/data-records/").catch(() => ({ data: [] })),
      ]);

      setProducts(prodRes.data || []);
      setRecords(recRes.data || []);
    } catch (err) {
      console.error("Failed to load report summary data:", err);
      setError("Unable to retrieve account data. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Metric Display Name Mapping derived from units/products
  const metricNameMap = useMemo(() => {
    const map = {};
    products.forEach(u => {
      const allVars = [
        ...(u.unit_vars || []),
        ...(u.customer_vars || []),
        ...(u.input_fields || []),
        ...(u.output_fields || [])
      ];
      allVars.forEach(v => {
        if (!v) return;
        if (typeof v === "object") {
          const key = v.key || v.name;
          const name = v.name || v.key;
          if (key && name) {
            map[key] = name;
            map[key.toLowerCase()] = name;
            map[key.replace(/_/g, " ")] = name;
            map[key.replace(/\s+/g, "_")] = name;
          }
        } else if (typeof v === "string") {
          map[v] = v;
          map[v.toLowerCase()] = v;
          map[v.replace(/_/g, " ")] = v;
        }
      });
    });
    return map;
  }, [products]);

  const getMetricName = useCallback((key) => {
    if (!key) return "";
    const k = String(key).trim();
    if (metricNameMap[k]) return metricNameMap[k];
    if (metricNameMap[k.toLowerCase()]) return metricNameMap[k.toLowerCase()];
    if (metricNameMap[k.replace(/_/g, " ")]) return metricNameMap[k.replace(/_/g, " ")];
    if (metricNameMap[k.replace(/\s+/g, "_")]) return metricNameMap[k.replace(/\s+/g, "_")];
    return k.replace(/_/g, " ");
  }, [metricNameMap]);

  // Filtered records by unit and time preset
  const filteredRecords = useMemo(() => {
    let list = records;

    if (selectedProductId !== "all") {
      list = list.filter(r => String(r.product_id) === String(selectedProductId));
    }

    if (timePreset !== "all" && list.length > 0) {
      const daysMap = { "30d": 30, "90d": 90, "1y": 365 };
      const days = daysMap[timePreset] || 30;

      // Find max record date
      let maxTime = 0;
      list.forEach(r => {
        const dStr = r.date || r.record_date || r.month || r.data?.parameters?.date || r.created_at?.slice(0, 10);
        if (dStr && dStr !== "unknown") {
          const dt = new Date(dStr.length === 7 ? `${dStr}-28` : dStr);
          if (!isNaN(dt.getTime()) && dt.getTime() > maxTime) maxTime = dt.getTime();
        }
      });

      const anchor = maxTime > 0 ? maxTime : Date.now();
      const cutoff = anchor - days * 86400000;

      list = list.filter(r => {
        const dStr = r.date || r.record_date || r.month || r.data?.parameters?.date || r.created_at?.slice(0, 10);
        if (!dStr || dStr === "unknown") return true;
        const dt = new Date(dStr.length === 7 ? `${dStr}-15` : dStr);
        return isNaN(dt.getTime()) || dt.getTime() >= cutoff;
      });
    }

    return list;
  }, [records, selectedProductId, timePreset]);

  // Account level summary statistics
  const summaryStats = useMemo(() => {
    const totalRecords = filteredRecords.length;
    const activeUnitIds = new Set(filteredRecords.map(r => r.product_id).filter(Boolean));

    let earliestDate = null;
    let latestDate = null;
    const allMetricKeys = new Set();

    filteredRecords.forEach(r => {
      const dStr = r.date || r.record_date || r.month || r.data?.parameters?.date || r.created_at?.slice(0, 10);
      if (dStr && dStr !== "unknown") {
        const dateVal = dStr.slice(0, 10);
        if (!earliestDate || dateVal < earliestDate) earliestDate = dateVal;
        if (!latestDate || dateVal > latestDate) latestDate = dateVal;
      }

      const flat = flattenRecordMetrics(r);
      Object.keys(flat).forEach(k => allMetricKeys.add(k));
    });

    return {
      totalRecords,
      activeUnitsCount: activeUnitIds.size,
      totalMetricsCount: allMetricKeys.size,
      earliestDate: earliestDate || "—",
      latestDate: latestDate || "—",
    };
  }, [filteredRecords]);

  // Breakdown by Unit / Table
  const unitSummaries = useMemo(() => {
    const map = {};

    // First map all assigned products
    products.forEach(p => {
      map[p.id] = {
        id: p.id,
        name: p.name,
        description: p.description || p.region || "Operational Unit",
        recordCount: 0,
        latestEntry: null,
        metricsList: [],
      };
    });

    // Populate with actual records
    filteredRecords.forEach(r => {
      const pid = r.product_id || "unassigned";
      if (!map[pid]) {
        map[pid] = {
          id: pid,
          name: r.product?.name || `Unit ${pid}`,
          description: r.product?.description || "Operational Unit",
          recordCount: 0,
          latestEntry: null,
          metricsList: [],
        };
      }

      map[pid].recordCount += 1;
      const dStr = r.date || r.record_date || r.month || r.data?.parameters?.date || r.created_at?.slice(0, 10);
      if (dStr && dStr !== "unknown") {
        if (!map[pid].latestEntry || dStr > map[pid].latestEntry) {
          map[pid].latestEntry = dStr;
        }
      }
    });

    return Object.values(map).filter(u => selectedProductId === "all" || String(u.id) === String(selectedProductId));
  }, [products, filteredRecords, selectedProductId]);

  // Detailed Variable Aggregation Table
  const variableSummaries = useMemo(() => {
    const map = {};

    filteredRecords.forEach(r => {
      const unitName = r.product?.name || `Unit ${r.product_id || 1}`;
      const flat = flattenRecordMetrics(r);

      Object.entries(flat).forEach(([key, val]) => {
        const compositeKey = `${unitName}___${key}`;
        if (!map[compositeKey]) {
          map[compositeKey] = {
            rawKey: key,
            displayName: getMetricName(key),
            unitName: unitName,
            count: 0,
            sum: 0,
            min: Infinity,
            max: -Infinity,
            latest: val,
          };
        }

        const item = map[compositeKey];
        item.count += 1;
        item.sum += val;
        if (val < item.min) item.min = val;
        if (val > item.max) item.max = val;
        item.latest = val;
      });
    });

    let list = Object.values(map).map(item => ({
      ...item,
      avg: item.count > 0 ? item.sum / item.count : 0,
      min: item.min === Infinity ? 0 : item.min,
      max: item.max === -Infinity ? 0 : item.max,
    }));

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(item =>
        item.displayName.toLowerCase().includes(term) ||
        item.unitName.toLowerCase().includes(term) ||
        item.rawKey.toLowerCase().includes(term)
      );
    }

    return list.sort((a, b) => b.count - a.count);
  }, [filteredRecords, getMetricName, searchTerm]);

  // Export to CSV
  const exportCSV = () => {
    if (!variableSummaries.length) return;
    const headers = ["Metric / Variable", "Unit Name", "Entries Count", "Average Value", "Min Value", "Max Value", "Latest Value"];
    const rows = variableSummaries.map(v => [
      `"${v.displayName.replace(/"/g, '""')}"`,
      `"${v.unitName.replace(/"/g, '""')}"`,
      v.count,
      v.avg.toFixed(2),
      v.min,
      v.max,
      v.latest
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Account_Data_Summary_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn text-white">
      {/* ── Header Strip ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <FileText size={22} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Account Data Summary Report
            </h1>
          </div>
          <p className="text-sm font-medium text-white/50 pl-1">
            Comprehensive overview and statistical summary of operational records added to your account.
          </p>
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all"
            title="Refresh Report"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportCSV}
            disabled={!variableSummaries.length}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 font-semibold text-xs transition-all disabled:opacity-40"
          >
            <Download size={15} />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-500/20 transition-all"
          >
            <Printer size={15} />
            Print Report
          </button>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold flex items-center gap-3">
          <Activity size={18} />
          {error}
        </div>
      )}

      {/* ── Key Summary Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-teal-400/10 group-hover:text-teal-400/20 transition-all">
            <Database size={48} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white/50 block mb-1">
            Total Records Added
          </span>
          <div className="text-3xl font-black text-white">
            {loading ? "..." : summaryStats.totalRecords}
          </div>
          <span className="text-[11px] text-teal-400 font-medium mt-1 flex items-center gap-1">
            <CheckCircle2 size={12} /> Data entries recorded
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-blue-400/10 group-hover:text-blue-400/20 transition-all">
            <Boxes size={48} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white/50 block mb-1">
            Assigned Units
          </span>
          <div className="text-3xl font-black text-white">
            {loading ? "..." : summaryStats.activeUnitsCount}
          </div>
          <span className="text-[11px] text-blue-400 font-medium mt-1 flex items-center gap-1">
            <Building2 size={12} /> Operational tables
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-purple-400/10 group-hover:text-purple-400/20 transition-all">
            <TrendingUp size={48} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white/50 block mb-1">
            Metrics Tracked
          </span>
          <div className="text-3xl font-black text-white">
            {loading ? "..." : summaryStats.totalMetricsCount}
          </div>
          <span className="text-[11px] text-purple-400 font-medium mt-1 flex items-center gap-1">
            <Layers size={12} /> Unique parameters
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-amber-400/10 group-hover:text-amber-400/20 transition-all">
            <Calendar size={48} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white/50 block mb-1">
            Activity Window
          </span>
          <div className="text-sm font-bold text-white mt-2 truncate">
            {loading ? "..." : `${fmtDate(summaryStats.earliestDate)}`}
          </div>
          <div className="text-xs text-white/50 font-medium truncate">
            to {loading ? "..." : fmtDate(summaryStats.latestDate)}
          </div>
        </div>
      </div>

      {/* ── Filters Strip ─────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {/* Unit Filter */}
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            <Building2 size={14} className="text-teal-400" />
            <span className="text-xs font-bold text-white/60">Unit:</span>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">All Units</option>
              {products.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white">{p.name}</option>
              ))}
            </select>
          </div>

          {/* Time Preset */}
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            <Calendar size={14} className="text-purple-400" />
            <span className="text-xs font-bold text-white/60">Period:</span>
            <select
              value={timePreset}
              onChange={e => setTimePreset(e.target.value)}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">All Time</option>
              <option value="30d" className="bg-slate-900 text-white">Last 30 Days</option>
              <option value="90d" className="bg-slate-900 text-white">Last 90 Days</option>
              <option value="1y" className="bg-slate-900 text-white">Last 1 Year</option>
            </select>
          </div>
        </div>

        {/* Search Metric */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search metric name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-white placeholder-white/40 outline-none focus:border-teal-500/50 transition-all"
          />
        </div>
      </div>

      {/* ── Unit Summary Breakdown Cards ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white/70 uppercase tracking-wider">
          <Building2 size={16} className="text-teal-400" />
          Unit-by-Unit Submission Summary
        </div>

        {loading ? (
          <div className="p-8 text-center text-white/40 text-sm font-semibold">
            Loading unit breakdown...
          </div>
        ) : unitSummaries.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900/40 border border-white/10 text-center text-white/40 text-sm">
            No units found for the selected scope.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unitSummaries.map(u => (
              <div key={u.id} className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3 hover:border-white/20 transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base text-white">{u.name}</h3>
                    <p className="text-xs text-white/50">{u.description}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    {u.recordCount} records
                  </span>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-white/60">
                  <span>Latest Submission:</span>
                  <span className="font-semibold text-white">{fmtDate(u.latestEntry)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Variable Statistics & Aggregation Summary Table ──────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white/70 uppercase tracking-wider">
            <BarChart3 size={16} className="text-purple-400" />
            Parameter & Variable Statistical Summary
          </div>
          <span className="text-xs text-white/40 font-mono">
            {variableSummaries.length} variables summarized
          </span>
        </div>

        <div className="rounded-2xl bg-slate-900/80 border border-white/10 overflow-hidden shadow-xl backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-white/60 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Variable / Parameter</th>
                  <th className="py-3.5 px-4">Unit Name</th>
                  <th className="py-3.5 px-4 text-center">Data Points</th>
                  <th className="py-3.5 px-4 text-right">Average Value</th>
                  <th className="py-3.5 px-4 text-right">Min Value</th>
                  <th className="py-3.5 px-4 text-right">Max Value</th>
                  <th className="py-3.5 px-4 text-right">Latest Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-white/40 font-semibold">
                      Generating parameter summary...
                    </td>
                  </tr>
                ) : variableSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-white/40 font-semibold">
                      No numeric data parameters found for this selection.
                    </td>
                  </tr>
                ) : (
                  variableSummaries.map((v, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-all">
                      <td className="py-3 px-4 font-bold text-white">
                        {v.displayName}
                      </td>
                      <td className="py-3 px-4 text-white/60">
                        {v.unitName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-teal-400">
                        {v.count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-purple-300">
                        {fmtNum(v.avg)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white/60">
                        {fmtNum(v.min)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white/60">
                        {fmtNum(v.max)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-teal-300">
                        {fmtNum(v.latest)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Recent Data Submissions Log ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white/70 uppercase tracking-wider">
          <Database size={16} className="text-blue-400" />
          Recent Account Data Entries Log
        </div>

        <div className="rounded-2xl bg-slate-900/80 border border-white/10 overflow-hidden shadow-xl backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-white/60 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Unit / Table</th>
                  <th className="py-3.5 px-4">Entered Inputs Summary</th>
                  <th className="py-3.5 px-4 text-right">Computed Metrics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-white/40 font-semibold">
                      Loading data entries...
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-white/40 font-semibold">
                      No data records found in account.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.slice(0, 15).map((r, idx) => {
                    const dateVal = r.date || r.record_date || r.month || r.data?.parameters?.date || r.created_at?.slice(0, 10);
                    const unitName = r.product?.name || `Unit ${r.product_id || 1}`;
                    const flat = flattenRecordMetrics(r);
                    const flatEntries = Object.entries(flat);

                    return (
                      <tr key={r.id || idx} className="hover:bg-white/[0.02] transition-all">
                        <td className="py-3 px-4 font-mono text-white/80 font-semibold">
                          {fmtDate(dateVal)}
                        </td>
                        <td className="py-3 px-4 font-bold text-teal-300">
                          {unitName}
                        </td>
                        <td className="py-3 px-4 text-white/70">
                          {flatEntries.length === 0 ? (
                            <span className="text-white/30">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {flatEntries.slice(0, 3).map(([k, val]) => (
                                <span key={k} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px]">
                                  <strong className="text-white/50">{getMetricName(k)}:</strong> {fmtNum(val)}
                                </span>
                              ))}
                              {flatEntries.length > 3 && (
                                <span className="text-[10px] text-white/40 align-center self-center">
                                  +{flatEntries.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-purple-300">
                          {r.data?.computed ? (
                            Object.entries(r.data.computed).map(([k, val]) => `${getMetricName(k)}: ${fmtNum(val)}`).join(", ") || "—"
                          ) : (
                            "Recorded"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
