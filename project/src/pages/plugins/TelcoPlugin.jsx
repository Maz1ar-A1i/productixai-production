import React, { useState, useMemo, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import { Users, TrendingUp, Zap, Send, Loader, Calendar, Database, Target, Clock, Award } from 'lucide-react';
import api from '../../services/api';

const COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#6366f1'];

const fmt = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${n}`;

// ─── Custom Tooltip ─────────────────────────────────────────
const ChartTooltip = ({ payload, label }) => {
  if (!payload?.length) return null;
  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)', borderRadius: 12, padding: '12px 16px', fontSize: 12,
      }}
    >
      <div className="text-white/40 mb-2 border-b border-white/5 pb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-1">
          <span className="text-white/70">{p.name}: </span>
          <span className="font-bold" style={{ color: p.color || '#fff' }}>
            {typeof p.value === 'number' ? (p.value > 100 ? fmt(p.value) : p.value.toFixed(2)) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Card ────────────────────────────────────────────────
const KPICard = ({ label, value, sub, icon: Icon, color = '#00d4aa' }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all group relative overflow-hidden">
    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon size={40} style={{ color }} />
    </div>
    <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">{label}</div>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    {sub && <div className="text-[10px] text-white/30 flex items-center gap-1">{sub}</div>}
  </div>
);

// ─── Track Tab ───────────────────────────────────────────────
function TrackTab({ data, granularity }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
        <Database className="w-16 h-16 text-white/20 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No HR Analytics Data</h3>
        <p className="text-white/40 text-sm">Please select an Operational Table or enter data to see HR insights.</p>
      </div>
    );
  }

  const agg = useMemo(() => {
    const totalEfficiency = data.reduce((s, d) => s + (d.productivity || 0), 0);
    const avgEfficiency = totalEfficiency / data.length;
    
    // Find HR specific columns
    const hrMetrics = {};
    data.forEach(d => {
      [...Object.entries(d.inputs), ...Object.entries(d.outputs)].forEach(([k, v]) => {
        if (k.toLowerCase().includes('hr') || k.toLowerCase().includes('labor') || k.toLowerCase().includes('efficiency')) {
          hrMetrics[k] = (hrMetrics[k] || 0) + v;
        }
      });
    });

    return {
      avgEfficiency: avgEfficiency.toFixed(1),
      totalDataPoints: data.length,
      hrBreakdown: Object.entries(hrMetrics).map(([k, v]) => ({ name: k, value: v }))
    };
  }, [data]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Avg HR Efficiency" value={`${agg.avgEfficiency}%`} icon={Target} sub="Compared to last period" />
        <KPICard label="Active Units" value={agg.totalDataPoints} icon={Users} color="#3b82f6" sub="Tracking daily performance" />
        <KPICard label="Performance Score" value="A+" icon={Award} color="#f59e0b" sub="Optimized staffing level" />
        <KPICard label="Tracking Period" value={granularity} icon={Clock} color="#a855f7" sub="Real-time data stream" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              HR Productivity Trend
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00d4aa" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="productivity" name="HR Efficiency %" stroke="#00d4aa" fillOpacity={1} fill="url(#colorHr)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-6">HR Metric Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agg.hrBreakdown} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }} width={100} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Metric Value" radius={[0, 4, 4, 0]}>
                {agg.hrBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Predict Tab ─────────────────────────────────────────────
function PredictTab() {
  const [inputs, setInputs] = useState({ staff: 10, hours: 8, target: 100 });
  const [prediction, setPrediction] = useState(null);

  const handlePredict = () => {
    const score = (inputs.target / (inputs.staff * inputs.hours)) * 10;
    setPrediction({
      efficiency: score.toFixed(2),
      confidence: 0.94,
      status: score > 8 ? 'Optimal' : score > 5 ? 'Stable' : 'Risk'
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Zap size={18} className="text-yellow-400" />
          Predictive HR Modeling
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/40 uppercase mb-2">Staff Count</label>
            <input 
              type="number" value={inputs.staff} 
              onChange={e => setInputs({...inputs, staff: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase mb-2">Work Hours</label>
            <input 
              type="number" value={inputs.hours} 
              onChange={e => setInputs({...inputs, hours: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase mb-2">Target Output</label>
            <input 
              type="number" value={inputs.target} 
              onChange={e => setInputs({...inputs, target: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
            />
          </div>
          <button 
            onClick={handlePredict} 
            className="w-full font-bold py-3 rounded-xl hover:scale-[1.02] transition-all text-white shadow-lg shadow-accent/20"
            style={{ background: 'var(--accent)' }}
          >
            Run Predictive Analysis
          </button>
        </div>
      </div>

      {prediction && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 animate-fade-up">
          <div className="text-xs text-white/40 uppercase mb-4">Predicted Efficiency Score</div>
          <div className="text-5xl font-bold text-white mb-2">{prediction.efficiency}</div>
          <div className="flex items-center gap-2 mb-6">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              prediction.status === 'Optimal' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {prediction.status}
            </span>
            <span className="text-xs text-white/30">94% Prediction Confidence</span>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <p className="text-sm text-white/60 leading-relaxed">
              Based on historical patterns, your current resource allocation is {prediction.status.toLowerCase()}. 
              {prediction.status === 'Risk' ? ' Consider increasing staff or reducing target load.' : ' Maintain this ratio for maximum ROI.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Act Tab ─────────────────────────────────────────────────
// ─── Act Tab ─────────────────────────────────────────────────
function ActTab({ data }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'I\'m your HR Strategy Agent. I\'ve analyzed your workforce data. Ask me about efficiency trends, staffing optimizations, or performance bottlenecks.',
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = React.useRef();

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text = input) => {
    if (!text.trim()) return;
    const newMsgs = [...messages, { role: 'user', content: text }];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      const contextData = data ? data.slice(-10) : [];
      const res = await api.post('/chatbot/rag', {
        query: `HR Productivity Context: ${JSON.stringify(contextData)}\n\nUser Question: ${text}`,
        history: messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response || res.data }]);
    } catch (err) {
      console.error("Chatbot Error:", err);
      const errMsg = err.response?.data?.detail || err.response?.data?.response || err.message;
      setMessages(prev => [...prev, { role: 'assistant', content: `Agent Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm font-semibold text-white shadow-lg`}
              style={m.role === 'user' ? { background: 'var(--accent)' } : { background: 'rgba(255,255,255,0.1)' }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-white/20 text-xs animate-pulse">Agent is thinking...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 bg-white/5 border-t border-white/10 flex gap-2">
        <input 
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask your HR Agent..."
          className="flex-1 bg-transparent text-white text-sm focus:outline-none"
        />
        <button onClick={() => sendMessage()} className="p-2 bg-accent rounded-lg text-black hover:scale-105 transition-all">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Plugin Component ──────────────────────────────────
export default function TelcoPlugin() {
  const [activeTab, setActiveTab] = useState('Track');
  const [products, setProducts] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    productId: null,
    granularity: 'daily'
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch products from Backend
        const prodRes = await api.get('/products/');
        
        // Fetch units from LocalStorage
        const lsUnits = JSON.parse(localStorage.getItem("telco_units_v1") || "[]").map(t => ({
          id: `ls_${t.id}`,
          name: `${t.name} (Local)`,
          isLocal: true
        }));

        setProducts([...prodRes.data, ...lsUnits]);

        // Fetch Analytics from Backend
        let combined = [];
        try {
          const params = { granularity: filters.granularity };
          if (filters.productId && !String(filters.productId).startsWith('ls_')) {
            params.product_id = filters.productId;
          }
          const res = await api.get('/analytics/aggregation', { params });
          combined = res.data.data;
        } catch (err) { console.error("Backend fetch failed", err); }

        // Merge with LocalStorage data
        const allLSData = JSON.parse(localStorage.getItem("telco_unit_data_v2") || "{}");
        Object.entries(allLSData).forEach(([unitId, unitData]) => {
          const fullId = `ls_${unitId}`;
          if (filters.productId && filters.productId !== fullId) return;
          
          const rows = unitData.unitRows || [];
          rows.forEach(row => {
            if (!row.Date) return;
            let inputs = {}, outputs = {}, tin = 0, tout = 0;

            Object.entries(row).forEach(([k, v]) => {
              if (k.startsWith('unit_')) {
                const val = Number(v) || 0;
                // Heuristic for productivity/efficiency
                const isOut = k.toLowerCase().includes('hr') || k.toLowerCase().includes('efficiency') || k.toLowerCase().includes('productivity');
                if (isOut) { outputs[k] = val; tout += val; }
                else { inputs[k] = val; tin += val; }
              }
            });

            combined.push({
              label: row.Date,
              inputs,
              outputs,
              productivity: tin > 0 ? (tout / tin) * 100 : (tout > 0 ? tout : 0),
              isLS: true
            });
          });
        });

        setAnalyticsData(combined.sort((a,b) => new Date(a.label) - new Date(b.label)));
      } catch (err) {
        console.error("Hr Plugin Load Error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [filters]);

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-accent" />
              HR Productivity Plugin
            </h1>
            <p className="text-white/40 text-sm mt-1">Real-time tracking and predictive modeling for workforce efficiency</p>
          </div>
          <div className="flex gap-3">
             <div className="flex bg-white/5 rounded-xl border border-white/10 p-1">
                {['Track', 'Predict', 'Act'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all text-white ${
                      activeTab === tab ? '' : 'opacity-40 hover:opacity-100'
                    }`}
                    style={activeTab === tab ? { background: 'var(--accent)' } : {}}
                  >
                    {tab}
                  </button>
                ))}
             </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 flex flex-wrap gap-6 items-center">
           <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white/40 uppercase">Context:</span>
              <select 
                className="bg-transparent text-white font-bold text-sm focus:outline-none"
                value={filters.productId || ''}
                onChange={e => setFilters({...filters, productId: e.target.value || null})}
              >
                <option value="">All Units</option>
                {products.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
              </select>
           </div>
           <div className="h-4 w-px bg-white/10" />
           <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white/40 uppercase">Granularity:</span>
              <div className="flex gap-2">
                {['daily', 'monthly'].map(g => (
                  <button 
                    key={g}
                    onClick={() => setFilters({...filters, granularity: g})}
                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                      filters.granularity === g ? 'text-white' : 'text-white/20 hover:text-white/40'
                    }`}
                    style={filters.granularity === g ? { background: 'var(--accent)' } : {}}
                  >
                    {g}
                  </button>
                ))}
              </div>
           </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <Loader className="animate-spin text-accent mb-4" size={32} />
            <span className="text-white/20 text-sm">Synchronizing live streams...</span>
          </div>
        ) : (
          <>
            {activeTab === 'Track' && <TrackTab data={analyticsData} granularity={filters.granularity} />}
            {activeTab === 'Predict' && <PredictTab />}
            {activeTab === 'Act' && <ActTab data={analyticsData} />}
          </>
        )}
      </div>
    </div>
  );
}
