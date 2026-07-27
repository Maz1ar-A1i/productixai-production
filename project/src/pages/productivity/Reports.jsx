import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import api from "../../services/api";
import {
  BarChart3,
  ChevronDown,
  Download,
  Package,
  Boxes,
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
} from "lucide-react";

const Reports = () => {
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [dailyReport, setDailyReport] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timePeriod, setTimePeriod] = useState('all'); // Task 5: time period filter

  useEffect(() => {
    // 1. Fetch backend products
    api.get("/products/")
      .then((res) => {
        // 2. Load localStorage units (Operational Tables)
        let lsUnits = [];
        try {
          lsUnits = JSON.parse(localStorage.getItem("telco_units_v1") || "[]");
        } catch (e) { console.error("LS load failed", e); }
        
        // Map LS units to match backend product structure, prefix ID to distinguish
        const mappedLS = lsUnits.map(t => ({
          id: `ls_${t.id}`,
          name: t.name,
          isLS: true,
          unitData: t
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
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      const isLSProduct = typeof selectedProduct === 'string' && selectedProduct.startsWith('ls_');
      const unitId = String(selectedProduct).replace('ls_', '');

      // Load local records for this product
      let localRecords = [];
      try {
        const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
        const unitData = allData[unitId] || { unitRows: [], customerRows: [] };
        
        // Get unique dates as "records"
        const dates = new Set();
        unitData.unitRows.forEach(r => r.Date && dates.add(r.Date));
        unitData.customerRows.forEach(r => r.Date && dates.add(r.Date));
        
        localRecords = Array.from(dates).sort((a,b) => new Date(b) - new Date(a)).map(date => ({
          id: `ls_rec_${date}`,
          month: date, // Using date as the label
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
        // Handle backend records
        api.get('/data-records/', { params: { product_id: selectedProduct } })
          .then((res) => {
            const backendRecords = res.data || [];
            if (backendRecords.length > 0) {
              setRecords(backendRecords);
            } else {
              setRecords(localRecords);
            }
          })
          .catch((err) => {
            console.error(err);
            setRecords(localRecords);
          });
      }
    } else {
      setRecords([]);
    }
    setSelectedRecord(null);
  }, [selectedProduct]);

  useEffect(() => {
    if (selectedRecord) {
      setLoading(true);
      
      if (typeof selectedRecord === 'string' && selectedRecord.startsWith('ls_rec_')) {
        // Calculate report from localStorage data
        const date = selectedRecord.replace('ls_rec_', '');
        const unitId = String(selectedProduct || '').replace('ls_', '');
        
        try {
          const allData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
          const unitData = allData[unitId] || { unitRows: [], customerRows: [] };
          
          const dayUnitRow = unitData.unitRows.find(r => r.Date === date) || {};
          const dayCustomerRows = unitData.customerRows.filter(r => r.Date === date);
          
          // Flatten into totals
          let totals = {};
          let total_input_cost = 0;
          let total_output = 0;
          let per_input_stats = {};

          // Process unit vars
          Object.entries(dayUnitRow).forEach(([k, v]) => {
            if (k.startsWith('unit_')) {
              const label = k.replace('unit_', '');
              const val = Number(v) || 0;
              totals[label] = val;
              // Heuristic: if it looks like cost, add to input cost
              if (label.toLowerCase().includes('cost') || label.toLowerCase().includes('opex')) {
                total_input_cost += val;
              } else if (label.toLowerCase().includes('revenue') || label.toLowerCase().includes('output')) {
                total_output += val;
              }
            }
          });

          // Process customer vars
          dayCustomerRows.forEach(tr => {
            Object.entries(tr).forEach(([k, v]) => {
              if (k.startsWith('customer_')) {
                const label = k.replace('customer_', '');
                const val = Number(v) || 0;
                totals[label] = (totals[label] || 0) + val;
                if (label.toLowerCase().includes('cost')) total_input_cost += val;
                if (label.toLowerCase().includes('revenue') || label.toLowerCase().includes('units')) total_output += val;
              }
            });
          });

          const mockReport = {
            record_id: selectedRecord,
            product_name: products.find(p => String(p.id) === String(selectedProduct))?.name,
            month: date,
            totals: totals,
            total_input_cost,
            input_cost_per_unit: total_output > 0 ? total_input_cost / total_output : 0,
            Combined_productivity_ratio: total_input_cost > 0 ? total_output / total_input_cost : 0,
            daily_details: [{ date, totals }],
            trend_data: [{ shift: "Day", output_units: total_output, total_cost: total_input_cost, productivity_ratio: total_input_cost > 0 ? total_output / total_input_cost : 0 }]
          };
          
          setReportData(mockReport);
          setDailyReport(mockReport.daily_details);
          setTrendData(mockReport.trend_data);
        } catch (e) {
          console.error("LS report calculation failed", e);
        } finally {
          setLoading(false);
        }
      } else {
        // Fetch the unified report for the record from backend
        api.get(`/data-records/${selectedRecord}/report`)
          .then((res) => {
            setReportData(res.data);
            setDailyReport(res.data.daily_details || []); 
            setTrendData(res.data.trend_data || []);
          })
          .catch((err) => console.error(err))
          .finally(() => setLoading(false));
      }
    } else {
      setReportData(null);
      setDailyReport([]);
      setTrendData([]);
    }
  }, [selectedRecord]);

  const handleExport = async () => {
    if (!selectedRecord) return;
    try {
      const res = await api.get(`/data-records/${selectedRecord}/export`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const fileName = records.find(r => String(r.id) === String(selectedRecord))?.month || "report";
      link.setAttribute("download", `${fileName}_report.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800/80 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-sm shadow-lg">
          <p className="label text-white/80">{`${label}`}</p>
          {payload.map((pld, index) => (
            <p key={index} style={{ color: pld.color }}>
              {`${pld.name}: ${Number(pld.value).toLocaleString()}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 rounded-lg text-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <BarChart3 className="w-10 h-10 text-purple-400" />
            Data Reports & Analysis
          </h1>
          <p className="text-white/40 text-sm">
            Select a product and record to view detailed reports and trends.
          </p>
        </div>

        {/* Task 5: Time Period Filter Pills */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-white/40 text-xs font-bold uppercase">Time Period:</span>
          {[['all','All'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTimePeriod(val)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timePeriod === val
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Product Selector */}
            <div className="relative">
              <label className="block text-white/60 text-sm font-medium mb-2">
                Product / Operational Table
              </label>
              <Package className="absolute top-11 left-4 w-5 h-5 text-white/30" />
              <select
                value={selectedProduct || ""}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white appearance-none"
              >
                <option value="" disabled>
                  Select Product...
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute top-11 right-4 w-5 h-5 text-white/30" />
            </div>

            {/* Record Selector */}
            <div className="relative">
              <label className="block text-white/60 text-sm font-medium mb-2">
                Data Record
              </label>
              <Boxes className="absolute top-11 left-4 w-5 h-5 text-white/30" />
              <select
                value={selectedRecord || ""}
                onChange={(e) => setSelectedRecord(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white appearance-none"
                disabled={!records.length}
              >
                <option value="" disabled className="text-gray-400 bg-gray-800">
                  Select Record...
                </option>
                {records.map((r) => (
                  <option
                    key={r.id}
                    value={r.id}
                    className="text-white bg-gray-800"
                  >
                    {r.month}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute top-11 right-4 w-5 h-5 text-white/30" />
            </div>

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={!selectedRecord}
              className="w-full px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Export Excel
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-16 text-white/60">
            Loading report data...
          </div>
        )}

        {!loading && selectedRecord && reportData && (
          <div className="space-y-8">
            {/* KPI Summary */}
            <div>
              <h3 className="text-2xl font-semibold text-white mb-6">
                Record Summary
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Dynamic totals */}
                {Object.entries(reportData.totals || {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="bg-white/5 border border-white/10 rounded-xl p-4"
                  >
                    <p className="text-white/60 text-sm">{k}</p>
                    <p className="text-2xl font-bold text-white">
                      {Number(v ?? 0).toLocaleString()}
                    </p>
                  </div>
                ))}

                {/* Always present fields */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-sm">Total input Cost</p>
                  <p className="text-2xl font-bold text-white">
                    ${Number(reportData?.total_input_cost ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-sm">Input Cost per Unit</p>
                  <p className="text-2xl font-bold text-white">
                    ${Number(reportData?.input_cost_per_unit ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-sm">Combined Productivity Ratio</p>
                  <p className="text-2xl font-bold text-white">
                    {Number(reportData?.Combined_productivity_ratio ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            {/* Per-Input Productivity & Cost Summary */}
            {reportData?.per_input_stats && (
              <div>
                <h3 className="text-2xl font-semibold text-white mb-4">
                  Input-wise Breakdown
                </h3>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-white/60 text-sm">
                        <th className="px-4 py-2">Input</th>
                        <th className="px-4 py-2">Total Used</th>
                        <th className="px-4 py-2">Unit Price</th>
                        <th className="px-4 py-2">Total Cost</th>
                        <th className="px-4 py-2">Cost per Output Unit</th>
                        <th className="px-4 py-2">Productivity Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(reportData.per_input_stats).map(([key, stats]) => (
                        <tr
                          key={key}
                          className="bg-white/5 border border-white/10 text-white rounded-xl"
                        >
                          <td className="px-4 py-2 font-medium">{key}</td>
                          <td className="px-4 py-2">{stats.total_used}</td>
                          <td className="px-4 py-2">${stats.unit_price.toFixed(2)}</td>
                          <td className="px-4 py-2">${stats.total_cost.toFixed(2)}</td>
                          <td className="px-4 py-2">
                            ${stats.cost_per_output_unit.toFixed(2)}
                          </td>
                          <td className="px-4 py-2">
                            {stats.productivity_ratio.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}


            {/* Daily Report */}
            {dailyReport.length > 0 && (
              <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
                <h3 className="text-2xl font-semibold text-white mb-6">
                  Daily Production Summary
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-sm text-white/60">
                          Date
                        </th>
                        {Object.keys(dailyReport[0].totals || {}).map((k) => (

                          <th
                            key={k}
                            className="px-4 py-3 text-left text-sm text-white/60"
                          >
                            {k}
                          </th>
                        ))}

                      </tr>
                    </thead>
                    <tbody>
                      {dailyReport.map((d) => (
                        <tr key={d.date} className="border-b border-white/10">
                          <td className="px-4 py-4">{d.date}</td>
                          {Object.entries(d.totals || {}).map(([k, v]) => (
                            <td key={k} className="px-4 py-4">
                              {Number(v ?? 0).toLocaleString()}
                            </td>
                          ))}

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Trend Charts */}
            {trendData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Output & Cost */}
                <div className="bg-white/5 rounded-2xl border border-white/10 p-6 h-96">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    <BarChartIcon className="w-6 h-6 inline text-blue-400 mr-2" />
                    Output & Cost / Shift
                  </h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={trendData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="shift" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="output_units" name="Output Units" fill="#a855f7" />
                      <Bar dataKey="total_cost" name="Total Cost" fill="#34d399" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Productivity */}
                <div className="bg-white/5 rounded-2xl border border-white/10 p-6 h-96">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    <LineChartIcon className="w-6 h-6 inline text-yellow-400 mr-2" />
                    Productivity Ratio / Shift
                  </h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={trendData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="shift" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="productivity_ratio"
                        stroke="#facc15"
                        strokeWidth={2}
                        dot
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
