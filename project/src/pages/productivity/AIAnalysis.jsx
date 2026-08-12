import React, { useState, useEffect } from "react";
import {
  Activity,
  Package,
  Layers,
  ChevronDown,
  AlertCircle,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

import api from "../../services/api";

const AIAnalysisPage = () => {
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedRecord, setSelectedRecord] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [timePeriodFilter, setTimePeriodFilter] = useState("all"); // Task 6: time period filter

  // Fetch all products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get("/products/");
        
        // Load localStorage units
        let lsUnits = [];
        try {
          lsUnits = JSON.parse(localStorage.getItem("telco_units_v1") || "[]");
        } catch (e) { console.error("LS load failed", e); }
        
        const mappedLS = lsUnits.map(t => ({
          id: `ls_${t.id}`,
          name: t.name,
          isLS: true
        }));

        const combined = [...res.data, ...mappedLS];
        const uniqueProducts = [];
        const seenNames = new Set();
        combined.forEach(p => {
          const lowerName = p.name ? p.name.trim().toLowerCase() : "";
          if (lowerName && !seenNames.has(lowerName)) {
            seenNames.add(lowerName);
            uniqueProducts.push(p);
          }
        });

        setProducts(uniqueProducts);
      } catch {
        setError("Failed to load products");
      }
    };
    fetchProducts();
  }, []);

  // Fetch records whenever a product is selected
  useEffect(() => {
    if (!selectedProduct) {
      setRecords([]);
      setSelectedRecord("");
      return;
    }

    const fetchRecords = async () => {
      const isLSProduct = typeof selectedProduct === 'string' && selectedProduct.startsWith('ls_');
      const unitId = String(selectedProduct || '').replace('ls_', '');

      // Load local records for this product
      let localRecords = [];
      try {
        const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
        const unitData = allData[unitId] || { unitRows: [], customerRows: [] };
        
        const dates = new Set();
        unitData.unitRows.forEach(r => r.Date && dates.add(r.Date));
        unitData.customerRows.forEach(r => r.Date && dates.add(r.Date));
        
        localRecords = Array.from(dates).sort((a,b) => new Date(b) - new Date(a)).map(date => ({
          id: `ls_rec_${date}`,
          month: date,
          isLS: true,
          date: date,
          unitId: unitId
        }));
      } catch (e) {
        console.error("LS data load failed", e);
      }

      if (isLSProduct) {
        setRecords(localRecords);
      } else {
        try {
          const res = await api.get('/data-records/', { params: { product_id: selectedProduct } });
          const backendRecords = res.data || [];
          if (backendRecords.length > 0) {
            setRecords(backendRecords);
          } else {
            setRecords(localRecords);
          }
        } catch {
          setError("Failed to load data records for this product");
          setRecords(localRecords);
        }
      }
    };

    fetchRecords();
  }, [selectedProduct]);

  // Run AI Analysis
  const handleAnalyze = async () => {
    if (!selectedRecord) {
      setError("Please select a record to analyze.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      if (typeof selectedRecord === 'string' && selectedRecord.startsWith('ls_rec_')) {
        // ── Handle LocalStorage Analysis ──
        const date = selectedRecord.replace('ls_rec_', '');
        const unitId = String(selectedProduct || '').replace('ls_', '');
        const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
        const unitData = allData[unitId] || { unitRows: [], customerRows: [] };
        
        const dayUnitRow = unitData.unitRows.find(r => r.Date === date) || {};
        const dayCustomerRows = unitData.customerRows.filter(r => r.Date === date);

        let inputs = {};
        let outputs = {};
        let total_output = 0;
        let total_input_cost = 0;

        const processVal = (k, v, isOutput) => {
          const val = Number(v) || 0;
          if (isOutput) {
            outputs[k] = (outputs[k] || 0) + val;
            total_output += val;
          } else {
            inputs[k] = (inputs[k] || 0) + val;
            total_input_cost += val;
          }
        };

        Object.entries(dayUnitRow).forEach(([k, v]) => {
          if (k === 'Date' || k === 'date' || k === 'id') return;
          const label = k.replace(/^unit_/, '');
          const isOut = label.toLowerCase().includes('revenue') || 
                        label.toLowerCase().includes('output') || 
                        label.toLowerCase().includes('hr_productivity') ||
                        label.toLowerCase().includes('efficiency') ||
                        label.toLowerCase().includes('sold') ||
                        label.toLowerCase().includes('produced');
          processVal(label, v, isOut);
        });

        dayCustomerRows.forEach(tr => {
          Object.entries(tr).forEach(([k, v]) => {
            if (k === 'Date' || k === 'date' || k === 'id' || k === 'name') return;
            const label = k.replace(/^customer_/, '');
            const isOut = label.toLowerCase().includes('revenue') || 
                          label.toLowerCase().includes('units') ||
                          label.toLowerCase().includes('hr_productivity') ||
                          label.toLowerCase().includes('efficiency') ||
                          label.toLowerCase().includes('sold') ||
                          label.toLowerCase().includes('produced');
            processVal(label, v, isOut);
          });
        });

        const payload = {
          inputs,
          outputs,
          combined_productivity: { overall: total_input_cost > 0 ? total_output / total_input_cost : 0 },
          single_productivity: {}
        };

        const res = await api.post('/ai/analyze', payload);
        // Map the structure to match expectations
        setResult({
          ...res.data,
          batch_no: date,
          predicted_output_next_shift: Number(res.data.ai_prediction?.match(/\d+/)?.[0]) || 0, // Heuristic
          top_3_inefficiencies: (res.data.top_inefficiencies || "").split('\n').filter(l => l.trim()).map(l => ({ source: l, explanation: "Detected from local data" })),
          ai_recommendations: (res.data.ai_prescriptions || "").split('\n').filter(l => l.trim()),
          top_inefficiency_scores: [25, 15, 10] // Mocked scores for LS
        });
      } else {
        // ── Handle Backend Analysis ──
        const res = await api.get(`/ai/analyze-record/${selectedRecord}`);
        if (res && res.data && res.data.analysis) {
          const analysisData = res.data.analysis;
          setResult({
            ...analysisData,
            batch_no: res.data.month,
            predicted_output_next_shift: Number(analysisData.predicted_output_next_period) || 0,
            top_inefficiency_scores: Array.isArray(analysisData.top_inefficiency_scores)
              ? analysisData.top_inefficiency_scores.map(s => Number(s) || 0)
              : []
          });
        } else {
          setError("No analysis data returned.");
        }
      }
    } catch (err) {
      console.error("AI Analysis Error:", err);
      setError("The AI analysis failed. Please ensure the backend is responsive.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 rounded-lg">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="w-10 h-10 text-purple-400" />
            AI-Powered Analysis
          </h1>
          <p className="text-white/40 text-sm">
            Get predictive insights and actionable recommendations for your production records
          </p>
        </div>
        {/* Task 6: Time Period Filter Pills */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-white/40 text-xs font-bold uppercase">Time Period:</span>
          {[
            ["all", "All"],
            ["daily", "Daily"],
            ["weekly", "Weekly"],
            ["monthly", "Monthly"],
            ["yearly", "Yearly"]
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTimePeriodFilter(val)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timePeriodFilter === val
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Selection Form */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product Selector */}
            {/* ... product selector remains same ... */}
            <div>
              <label className="block text-white/60 text-sm font-medium mb-2 flex items-center gap-2">
                <Package className="w-4 h-4" /> Product / Operational Table
              </label>
              <div className="relative">
                <select
                  className="w-full bg-gray-800 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white appearance-none"
                  value={selectedProduct}
                  onChange={(e) => {
                    setSelectedProduct(e.target.value);
                    setResult(null);
                    setError("");
                  }}
                >
                  <option value="">Select Product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute top-1/2 -translate-y-1/2 right-4 w-5 h-5 text-white/30 pointer-events-none" />
              </div>
            </div>

            {/* Record Selector */}
            <div>
              <label className="block text-white/60 text-sm font-medium mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Data Record
              </label>
              <div className="relative">
                <select
                  className="w-full bg-gray-800 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white appearance-none"
                  value={selectedRecord}
                  onChange={(e) => {
                    setSelectedRecord(e.target.value);
                    setResult(null);
                    setError("");
                  }}
                  disabled={!selectedProduct || records.length === 0}
                >
                  <option value="">
                    {!selectedProduct ? "Select a product first..." : "Select Record..."}
                  </option>
                  {(() => {
                    const filteredRecords = records.filter(r => {
                      if (timePeriodFilter === "all") return true;
                      const monthVal = (r.month || "").trim();
                      if (timePeriodFilter === "daily") {
                        // Daily format: YYYY-MM-DD or contains day pattern
                        return /^\d{4}-\d{2}-\d{2}$/.test(monthVal) || monthVal.includes("/") || monthVal.includes("-Day");
                      }
                      if (timePeriodFilter === "weekly") {
                        // Weekly format: 2026-W21
                        return /^\d{4}-W\d+$/i.test(monthVal) || monthVal.toLowerCase().includes("w");
                      }
                      if (timePeriodFilter === "monthly") {
                        // Monthly format: YYYY-MM or Month names
                        return /^\d{4}-\d{2}$/.test(monthVal) || /^[a-z]{3,9}$/i.test(monthVal) || monthVal.length === 7;
                      }
                      if (timePeriodFilter === "yearly") {
                        // Yearly format: YYYY
                        return /^\d{4}$/.test(monthVal);
                      }
                      return true;
                    });
                    
                    return filteredRecords.map((r) => (
                      <option key={r.id} value={r.id}>{r.month}</option>
                    ));
                  })()}
                </select>
                <ChevronDown className="absolute top-1/2 -translate-y-1/2 right-4 w-5 h-5 text-white/30 pointer-events-none" />
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}

          <button
            className="w-full mt-6 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
            onClick={handleAnalyze}
            disabled={loading || !selectedRecord}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing with AI...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Run AI Analysis
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {!loading && result && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Analysis Complete</h2>
                  <p className="text-white/60 text-sm">Data Record: {result.batch_no}</p>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp className="text-blue-400" size={20} />
                  <h4 className="text-white/80 font-medium">Predicted Output (Next Shift)</h4>
                </div>
                <p className="text-4xl font-bold text-blue-300 mb-2">
                  {typeof result.predicted_output_next_shift === 'number' 
                    ? result.predicted_output_next_shift.toLocaleString() 
                    : "Calculating..."}
                </p>
                <p className="text-blue-400/60 text-sm">Units</p>
              </div>

              <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle className="text-yellow-400" size={20} />
                  <h4 className="text-white/80 font-medium">Top Inefficiency Source</h4>
                </div>
                <p className="text-xl font-bold text-yellow-300 mb-2">
                  {result.top_3_inefficiencies?.[0]?.source || "No immediate issues detected"}
                </p>
                <p className="text-yellow-400/60 text-sm">
                  {result.top_inefficiency_scores?.[0] !== undefined ? result.top_inefficiency_scores[0] : 0}% impact
                </p>
              </div>
            </div>

            {/* Detailed Analysis */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top 3 Inefficiencies */}
              <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h4 className="text-white text-lg font-bold mb-6">Top 3 Inefficiencies</h4>
                {(!result.top_3_inefficiencies || result.top_3_inefficiencies.length === 0) ? (
                  <p className="text-white/40 text-sm italic">No significant inefficiencies identified.</p>
                ) : result.top_3_inefficiencies.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 mb-4 border border-white/20 rounded-xl hover:bg-white/5 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-yellow-400 font-bold text-sm px-2 py-1 rounded bg-yellow-500/10">
                        #{idx + 1}
                      </span>
                      <span className="text-yellow-400 font-semibold text-sm">
                        {result.top_inefficiency_scores?.[idx] || 0}%
                      </span>
                    </div>
                    <p className="text-white font-semibold text-md mb-1">{item.source}</p>
                    <p className="text-white/60 text-sm leading-relaxed">{item.explanation}</p>
                  </div>
                ))}
              </div>

              {/* AI Recommendations */}
              <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h4 className="text-white text-lg font-bold mb-6">AI Recommendations</h4>
                {(!result.ai_recommendations || result.ai_recommendations.length === 0) ? (
                  <p className="text-white/40 text-sm italic">Standard operating procedures recommended.</p>
                ) : result.ai_recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-4 mb-4 border border-white/20 rounded-xl hover:bg-white/5 transition-all duration-200"
                  >
                    <span className="text-blue-400 font-bold mr-2">#{idx + 1}</span>
                    <span className="text-white text-sm leading-relaxed">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !result && (
          <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-16 text-center">
            <BarChart3 className="w-20 h-20 text-white/20 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-white mb-2">Ready for AI Analysis</h3>
            <p className="text-white/40 text-sm">
              Select a product and data record above, then click "Run AI Analysis" to get intelligent insights and predictions
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisPage;
