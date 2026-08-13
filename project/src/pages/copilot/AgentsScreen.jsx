import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Zap, AlertCircle, Clock,
  ChevronRight, Activity, BarChart3, Package, DollarSign,
  Users, Sparkles
} from 'lucide-react';

const AGENTS = [
  {
    id: 'sales',
    name: 'Sales Agent',
    emoji: '🧑‍💼',
    description: 'Hot leads, follow-ups & revenue',
    status: 'active',
    statusColor: 'var(--accent)',
    lastAction: 'Identified 5 hot leads in Region B',
    topInsight: 'Revenue down 14% — 3 actions queued',
    insightColor: 'var(--danger)',
    insightIcon: TrendingDown,
    metrics: [
      { label: 'Open Leads', value: '23', trend: '+3', up: true },
      { label: 'Conv Rate', value: '18%', trend: '+2%', up: true },
      { label: 'Forecast', value: '₨2.1M', trend: '+8%', up: true },
    ],
    actions: ['Review hot leads', 'Update pipeline', 'Call 5 prospects'],
    path: '/feed',
  },
  {
    id: 'inventory',
    name: 'Inventory Agent',
    emoji: '📦',
    description: 'Stock alerts & reorder triggers',
    status: 'alert',
    statusColor: 'var(--warning)',
    lastAction: 'Flagged Product A for stockout risk',
    topInsight: 'Stockout in 1.2 days — reorder needed',
    insightColor: 'var(--warning)',
    insightIcon: AlertCircle,
    metrics: [
      { label: 'Low Stock', value: '4 items', trend: '+2', up: false },
      { label: 'Reorders', value: '2 pending', trend: '', up: null },
      { label: 'Turnover', value: '4.2x', trend: '+0.3x', up: true },
    ],
    actions: ['Approve reorder', 'Check supplier', 'Update safety stock'],
    path: '/feed',
  },
  {
    id: 'production',
    name: 'Production Agent',
    emoji: '🏭',
    description: 'Machine efficiency & batch scoring',
    status: 'warning',
    statusColor: 'var(--warning)',
    lastAction: 'Machine C efficiency dropped to 67%',
    topInsight: '120 units gap — operator reassign suggested',
    insightColor: 'var(--warning)',
    insightIcon: Activity,
    metrics: [
      { label: 'Avg Efficiency', value: '79%', trend: '-3%', up: false },
      { label: 'Units Today', value: '1,840', trend: '-120', up: false },
      { label: 'Target Gap', value: '120 units', trend: '', up: null },
    ],
    actions: ['Reassign operator', 'Check Machine C', 'Review shift log'],
    path: '/productivity/reports',
  },
  {
    id: 'finance',
    name: 'Finance Agent',
    emoji: '💰',
    description: 'Cost analysis & profit gaps',
    status: 'warning',
    statusColor: 'var(--warning)',
    lastAction: 'OPEX exceeded monthly budget by 9%',
    topInsight: 'Month-end overrun projected ₨180k',
    insightColor: 'var(--danger)',
    insightIcon: TrendingUp,
    metrics: [
      { label: 'Revenue', value: '₨284k', trend: '-14%', up: false },
      { label: 'OPEX', value: '₨1.24M', trend: '+9%', up: false },
      { label: 'Margin', value: '22.4%', trend: '-3.6%', up: false },
    ],
    actions: ['Review OPEX', 'Optimize energy', 'Check vendor SLAs'],
    path: '/reports',
  },
  {
    id: 'growth',
    name: 'Growth Agent',
    emoji: '📈',
    description: 'Opportunity detection & trends',
    status: 'idle',
    statusColor: 'var(--text-muted)',
    lastAction: 'Detected Segment B growth trend',
    topInsight: 'Segment B up 34% — expansion opportunity',
    insightColor: 'var(--accent)',
    insightIcon: TrendingUp,
    metrics: [
      { label: 'Opportunities', value: '3 new', trend: '', up: null },
      { label: 'Seg B Growth', value: '+34%', trend: 'QoQ', up: true },
      { label: 'Market Risk', value: 'Low', trend: '', up: null },
    ],
    actions: ['Review opportunities', 'Increase Seg B budget', 'Competitor analysis'],
    path: '/feed',
  },
];

const StatusDot = ({ color }) => (
  <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
);

const AgentCard = ({ agent, onClick }) => {
  const InsightIcon = agent.insightIcon;
  return (
    <div
      onClick={() => onClick(agent)}
      className="glass-card p-5 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg group"
      style={{ '--hover-glow': agent.statusColor }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            {agent.emoji}
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {agent.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {agent.description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot color={agent.statusColor} />
          <span className="text-xs capitalize" style={{ color: agent.statusColor }}>
            {agent.status}
          </span>
        </div>
      </div>

      {/* Top Insight */}
      <div
        className="rounded-lg px-3 py-2 mb-4 flex items-center gap-2"
        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}
      >
        <InsightIcon size={13} style={{ color: agent.insightColor, flexShrink: 0 }} />
        <span className="text-xs" style={{ color: agent.insightColor }}>
          {agent.topInsight}
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {agent.metrics.map(m => (
          <div key={m.label} className="text-center">
            <div className="mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {m.value}
            </div>
            {m.trend && (
              <div
                className="text-xs mono"
                style={{ color: m.up === null ? 'var(--text-muted)' : m.up ? 'var(--success)' : 'var(--danger)' }}
              >
                {m.up === true ? '↑' : m.up === false ? '↓' : ''} {m.trend}
              </div>
            )}
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-1.5">
        {agent.actions.slice(0, 2).map(a => (
          <span
            key={a}
            className="text-xs px-2.5 py-1 rounded-full"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {a}
          </span>
        ))}
        <span
          className="text-xs px-2.5 py-1 rounded-full ml-auto flex items-center gap-1"
          style={{ color: 'var(--accent)' }}
        >
          View <ChevronRight size={10} />
        </span>
      </div>
    </div>
  );
};

// ── Agent Detail Drawer
const AgentDetail = ({ agent, onClose, onRun, running }) => {
  if (!agent) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-swipe-in"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '28px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 32 }}>{agent.emoji}</span>
            <div>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{agent.name}</div>
              <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: agent.statusColor }}>
                <StatusDot color={agent.statusColor} /> {agent.status}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="section-title mb-2 opacity-50 uppercase tracking-widest text-[10px]">Last Action</div>
        <div className="mb-5 text-sm p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          {agent.lastAction}
        </div>

        <div className="section-title mb-2 opacity-50 uppercase tracking-widest text-[10px]">Active Insights</div>
        <div 
          className="mb-6 p-4 rounded-xl border border-dashed" 
          style={{ borderColor: agent.insightColor, background: `${agent.insightColor}05` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <agent.insightIcon size={14} style={{ color: agent.insightColor }} />
            <span className="font-semibold text-xs" style={{ color: agent.insightColor }}>Current Observation</span>
          </div>
          <p className="text-sm italic" style={{ color: 'var(--text-primary)' }}>"{agent.topInsight}"</p>
        </div>

        <div className="flex gap-3">
          <button 
            className={`btn-primary flex-1 h-11 relative overflow-hidden ${running ? 'opacity-80 pointer-events-none' : ''}`}
            onClick={() => onRun(agent.id)}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing Data...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap size={14} /> Run Deep Analysis
              </span>
            )}
          </button>
          <button className="btn-ghost px-4 h-11" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default function AgentsScreen() {
  const [agents, setAgents] = useState(AGENTS);
  const [selected, setSelected] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const navigate = useNavigate();

  const activeCount = agents.filter(a => a.status === 'active').length;
  const alertCount = agents.filter(a => a.status === 'alert' || a.status === 'warning').length;

  const handleRunAgent = async (id) => {
    setRunningId(id);
    
    // Simulate complex AI processing
    await new Promise(resolve => setTimeout(resolve, 2500));

    setAgents(prev => prev.map(a => {
      if (a.id === id) {
        return {
          ...a,
          status: 'active',
          statusColor: 'var(--accent)',
          lastAction: `Analysis completed at ${new Date().toLocaleTimeString()}. Insights generated.`,
          topInsight: 'Data trending positive — no immediate intervention required.',
          insightColor: 'var(--success)',
          insightIcon: Activity
        };
      }
      return a;
    }));

    // Update selected agent if still open
    if (selected && selected.id === id) {
      setSelected(prev => ({
        ...prev,
        status: 'active',
        statusColor: 'var(--accent)',
        lastAction: `Analysis completed at ${new Date().toLocaleTimeString()}. Insights generated.`,
        topInsight: 'Data trending positive — no immediate intervention required.',
        insightColor: 'var(--success)',
        insightIcon: Activity
      }))
    }

    setRunningId(null);
    
    // Optional: show a toast or alert
    alert(`${id.charAt(0).toUpperCase() + id.slice(1)} Agent run completed successfully!`);
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', padding: '24px' }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>AI Agents</h1>
          <div className="live-dot" />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Your department agents are monitoring and acting 24/7
        </p>

        {/* Summary Pills */}
        <div className="flex gap-3 mt-3">
          <span className="badge badge-accent">
            <Sparkles size={10} /> {activeCount} Active
          </span>
          {alertCount > 0 && (
            <span className="badge badge-warning">
              <AlertCircle size={10} /> {alertCount} Need Attention
            </span>
          )}
          <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {agents.length} Total Agents
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} onClick={setSelected} />
        ))}
      </div>

      {/* Auto Mode CTA */}
      <div
        className="glass-card p-5 mt-6 flex items-center justify-between"
        style={{ borderColor: 'var(--accent)', borderWidth: 1 }}
      >
        <div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            🤖 Want agents to act automatically?
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Enable Auto Mode — agents recommend, assist, or fully automate per your settings.
          </div>
        </div>
        <button onClick={() => navigate('/auto-mode')} className="btn-primary ml-4 flex-shrink-0">
          Configure
        </button>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <AgentDetail 
          agent={selected} 
          onClose={() => setSelected(null)} 
          onRun={handleRunAgent}
          running={runningId === selected.id}
        />
      )}
    </div>
  );
}
