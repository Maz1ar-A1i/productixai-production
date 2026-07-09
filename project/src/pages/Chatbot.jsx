import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageCircle, Send, Bot, User, Sparkles, Lightbulb, ChevronRight, Zap, Users, Cpu, Activity, Globe } from 'lucide-react';
import { chatbotService, productivityService, productService, dataRecordService, orgSettingsService, customChatbotService } from '../services/api';

const botConfigs = {
  productivity: {
    title: 'Productivity AI Assistant',
    description: 'Chat with AI about your unit productivity and get personalized insights.',
    icon: MessageCircle,
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500',
    welcomeMessage: "Hello! I'm your productivity AI assistant. I can help you analyze your Tower/Unit performance, cost efficiency, and operations. What would you like to know?",
    quickQuestions: [
      'Which Unit has the highest capacity utilization?',
      'Show me the cost efficiency trends (Cost per KW) across all units.',
      'Which unit has the highest opex vs revenue?',
      'Compare the capacity utilization of different cities.',
      'Show me worst performing units based on idle capacity.',
    ]
  },
  energy: {
    title: 'Energy AI Specialist',
    description: 'Analyze your energy consumption and identify optimization opportunities.',
    icon: Zap,
    color: 'yellow',
    gradient: 'from-yellow-400 to-orange-500',
    welcomeMessage: "Welcome! I'm your Energy Specialist. I can help you understand your power production efficiency and fuel/electricity opex. Ask me about your units' capacity, KW Produced, or power sold.",
    quickQuestions: [
      'Which unit has the highest Fuel Cost and WAPDA Cost?',
      'What was the total KW Produced vs KW Sold last month?',
      'Which unit has the largest gap between capacity and actual production?',
      'How does Fuel Cost correlate with KW Produced?',
      'Give me tips to optimize fuel opex at low utilization units.'
    ]
  },
  hr: {
    title: 'HR Analytics Assistant',
    description: 'Insights into workforce performance and personnel management.',
    icon: Users,
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    welcomeMessage: "Greetings! I'm your HR Analytics assistant. I can provide insights into team performance, shift efficiency, and personnel metrics. How can I help you today?",
    quickQuestions: [
      'Which unit has the highest HR Cost relative to KW Produced?',
      'Analyze the HR Cost vs Monthly OPEX trend.',
      'How does customer attachment correlate with personnel support cost?',
      'Compare workforce/HR expenditure across Karachi and Lahore.',
      'What is the average HR Cost per customer served?'
    ]
  },
  process: {
    title: 'Process Optimization Bot',
    description: 'Deep dive into your operational processes and workflows.',
    icon: Activity,
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500',
    welcomeMessage: "Hello! I'm here to help you optimize your operational workflows. Let's look at your capacity utilization, customer attachment rates, and cost efficiencies.",
    quickQuestions: [
      'Which unit has the highest customer utilization rate?',
      'Identify units with attached customers close to their maximum capacity.',
      'How can we minimize Idle Capacity Value?',
      'Compare average capacity utilization across different regions.',
      'Identify any units showing abnormal opex patterns.'
    ]
  }
};

const colorClasses = {
  purple: {
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    hoverBorder: 'hover:border-purple-500/20',
    accentText: 'text-purple-300'
  },
  yellow: {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    hoverBorder: 'hover:border-yellow-500/20',
    accentText: 'text-yellow-300'
  },
  blue: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    hoverBorder: 'hover:border-blue-500/20',
    accentText: 'text-blue-300'
  },
  emerald: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/20',
    accentText: 'text-emerald-300'
  }
};

const Chatbot = () => {
  const { botType = 'productivity' } = useParams();
  const navigate = useNavigate();
  const [customBots, setCustomBots] = useState([]);
  
  // Find currently active bot (custom or fallback default)
  const activeCustomBot = customBots.find(b => String(b.id) === String(botType));
  const config = activeCustomBot ? {
    title: activeCustomBot.name,
    description: activeCustomBot.description || "Custom AI Assistant designed for operational data analysis.",
    icon: MessageCircle,
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500',
    welcomeMessage: `Welcome! I'm ${activeCustomBot.name} — ${activeCustomBot.description || 'your custom AI assistant'}. How can I assist you with your operations today?`,
    quickQuestions: (() => {
      let goals = [];
      if (activeCustomBot.goals) {
        if (typeof activeCustomBot.goals === 'string') {
          try { goals = JSON.parse(activeCustomBot.goals); } catch { goals = []; }
        } else {
          goals = activeCustomBot.goals;
        }
      }
      return goals.length > 0 ? goals : [
        'Which Unit has the highest capacity utilization?',
        'Show me worst performing units based on opex.',
      ];
    })()
  } : (botConfigs[botType] || botConfigs.productivity);

  const colors = colorClasses[config.color] || colorClasses.purple;

  const [messages, setMessages] = useState([]);
  
  // Initialize messages on boot or configuration change
  useEffect(() => {
    setMessages([
      {
        id: Date.now(),
        type: 'bot',
        content: config.welcomeMessage
      }
    ]);
  }, [botType, config.welcomeMessage]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState('all');
  
  // Filter panel states
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [regions, setRegions] = useState([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [recencyDays, setRecencyDays] = useState('all');
  const [recencyLimit, setRecencyLimit] = useState('');
  const [filteredCount, setFilteredCount] = useState(0);

  const [customBotName, setCustomBotName] = useState("");
  const [customBotPersona, setCustomBotPersona] = useState("");

  const messagesEndRef = useRef(null);

  // Removed legacy welcome message hook since it is now managed directly by the config hook above

  useEffect(() => {
    fetchTowers();
    fetchRegions();
    fetchUserCustomBots();
  }, []);

  const fetchUserCustomBots = async () => {
    try {
      const res = await customChatbotService.myBots();
      const bots = res.data || [];
      setCustomBots(bots);
      
      // Auto-redirect to first custom bot if route is generic and custom bots exist
      if (bots.length > 0 && !bots.some(b => String(b.id) === String(botType))) {
        navigate(`/chatbot/${bots[0].id}`, { replace: true });
      }
    } catch (e) {
      console.error("Failed to load user custom chatbots:", e);
    }
  };

  // Legacy Organization-level chatbot loader removed

  useEffect(() => {
    updateFilteredCount();
  }, [selectedTower, selectedRegion, dateStart, dateEnd, recencyDays, recencyLimit]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchRegions = async () => {
    try {
      const response = await productService.getRegions();
      setRegions(response.data || []);
    } catch (error) {
      console.error('Error fetching regions:', error);
    }
  };

  const updateFilteredCount = async () => {
    try {
      const activeFilters = {
        product_id: selectedTower !== 'all' ? selectedTower : undefined,
        region: selectedRegion !== 'all' ? selectedRegion : undefined,
        date_start: dateStart || undefined,
        date_end: date_end || undefined, // Wait, date_end state variable is dateEnd
      };
      if (dateEnd) {
        activeFilters.date_end = dateEnd;
      }
      
      const response = await dataRecordService.getFilteredRecords(activeFilters);
      const fetchedRecords = response.data || [];
      
      let count = fetchedRecords.length;
      if (recencyLimit && Number(recencyLimit) > 0) {
        count = Math.min(count, Number(recencyLimit));
      }
      setFilteredCount(count);
    } catch (e) {
      console.error("Error updating count:", e);
      setFilteredCount(0);
    }
  };

  const fetchTowers = async () => {
    try {
      // 1. Try fetching from API (Database)
      const response = await productService.getProducts();
      let dbTowers = response.data || [];

      // 2. Try fetching from localStorage (TowerManager local data)
      let localTowers = [];
      try {
        const stored = localStorage.getItem("telco_towers_v1");
        if (stored) localTowers = JSON.parse(stored);
      } catch (e) { console.error("Local storage error:", e); }

      // 3. Merge or prefer DB towers
      // If DB is empty, use local towers so the dropdown isn't empty
      if (dbTowers.length > 0) {
        setTowers(dbTowers);
      } else if (localTowers.length > 0) {
        // Map local towers to match DB tower schema
        setTowers(localTowers.map(t => ({
          id: t.id,
          name: t.name,
          city: t.city
        })));
      } else {
        setTowers([]);
      }
    } catch (error) {
      console.error('Error fetching towers:', error);
      // Fallback to local only on error
      try {
        const stored = localStorage.getItem("telco_towers_v1");
        if (stored) {
          const local = JSON.parse(stored);
          setTowers(local.map(t => ({ id: t.id, name: t.name })));
          return;
        }
      } catch (e) { }
      setTowers([]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage = { id: Date.now(), type: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const activeFilters = {
        tower_id: selectedTower !== 'all' ? selectedTower : undefined,
        region: selectedRegion !== 'all' ? selectedRegion : undefined,
        date_start: dateStart || undefined,
        date_end: dateEnd || undefined,
        recency_days: recencyDays !== 'all' ? Number(recencyDays) : undefined,
        recency_limit: recencyLimit ? Number(recencyLimit) : undefined
      };

      const response = await chatbotService.sendMessage({
        query: inputMessage,
        bot_type: botType,
        filters: activeFilters,
        history: messages.map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: typeof m.content === 'string' ? m.content : m.content?.text || ''
        }))
      });

      let botContent = '';
      if (typeof response.response === 'string') {
        botContent = response.response;
      } else if (response.response?.text) {
        botContent = response.response.text;
      } else {
        botContent = 'I could not process your request.';
      }

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: botContent
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chatbot error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error. Please try again later.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTowers = selectedRegion === 'all'
    ? towers
    : towers.filter(t => t.city === selectedRegion || t.region === selectedRegion);

  const handleQuickQuestion = (question) => {
    setInputMessage(question);
  };

  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 rounded-lg">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent flex items-center gap-3">
              <Icon className={`w-10 h-10 ${colors.text}`} />
              {botType === 'productivity' && customBotName ? customBotName : config.title}
            </h1>
            <p className="text-white/40 text-sm">
              {botType === 'productivity' && customBotPersona ? customBotPersona : config.description}
            </p>
          </div>

          {/* Bot Selector */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1 overflow-x-auto max-w-full">
            {customBots.length > 0 ? (
              customBots.map((bot) => (
                <button
                  key={bot.id}
                  onClick={() => navigate(`/chatbot/${bot.id}`)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-300 ${
                    String(botType) === String(bot.id)
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                >
                  {bot.name}
                </button>
              ))
            ) : (
              Object.keys(botConfigs).map((key) => (
                <button
                  key={key}
                  onClick={() => navigate(`/chatbot/${key}`)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                    botType === key
                      ? `bg-gradient-to-r ${botConfigs[key].gradient} text-white shadow-lg`
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Questions & Info Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Context Filters Panel */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                  <Globe className={`w-5 h-5 ${colors.text}`} />
                </div>
                <h3 className="text-xl font-semibold text-white">Context Filters</h3>
              </div>

              {/* Region Filter */}
              <div>
                <label className="text-white/60 text-xs font-bold block mb-1">Region</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedTower('all'); // Reset tower when region changes
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-white/20 transition-all duration-300"
                >
                  <option value="all" className="bg-slate-900">All Regions</option>
                  {regions.map(r => (
                    <option key={r} value={r} className="bg-slate-900">{r}</option>
                  ))}
                </select>
              </div>

              {/* Tower Selector */}
              <div>
                <label className="text-white/60 text-xs font-bold block mb-1">Tower / Unit</label>
                <select
                  value={selectedTower}
                  onChange={(e) => setSelectedTower(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-white/20 transition-all duration-300"
                >
                  <option value="all" className="bg-slate-900">All Towers</option>
                  {filteredTowers.map(tower => (
                    <option key={tower.id} value={tower.id} className="bg-slate-900">
                      {tower.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/60 text-xs font-bold block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-white/20 transition-all"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-xs font-bold block mb-1">End Date</label>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-white/20 transition-all"
                  />
                </div>
              </div>

              {/* Recency Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/60 text-xs font-bold block mb-1">Recency</label>
                  <select
                    value={recencyDays}
                    onChange={(e) => setRecencyDays(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-white text-xs focus:outline-none focus:border-white/20 transition-all"
                  >
                    <option value="all" className="bg-slate-900">All Time</option>
                    <option value="7" className="bg-slate-900">Last 7 Days</option>
                    <option value="30" className="bg-slate-900">Last 30 Days</option>
                    <option value="90" className="bg-slate-900">Last 90 Days</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-xs font-bold block mb-1">Record Limit</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Max records"
                    value={recencyLimit}
                    onChange={(e) => setRecencyLimit(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-white/20 transition-all"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedRegion('all');
                  setSelectedTower('all');
                  setDateStart('');
                  setDateEnd('');
                  setRecencyDays('all');
                  setRecencyLimit('');
                }}
                className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white text-xs font-semibold transition"
              >
                Clear Filters
              </button>
            </div>

            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                  <Lightbulb className={`w-5 h-5 ${colors.text}`} />
                </div>
                <h3 className="text-xl font-semibold text-white">Quick Questions</h3>
              </div>
              <div className="space-y-2">
                {config.quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickQuestion(question)}
                    className={`w-full text-left p-3 flex items-center justify-between bg-white/5 hover:bg-white/10 border border-transparent ${colors.hoverBorder} rounded-lg text-white/70 hover:text-white text-sm transition-all duration-300`}
                  >
                    <span>{question}</span>
                    <ChevronRight className="w-4 h-4 text-white/30" />
                  </button>
                ))}
              </div>
            </div>

            <div className={`bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border ${colors.border} p-5`}>
              <h4 className="font-semibold text-white flex items-center gap-2 mb-2"><Sparkles size={18} className={colors.text} />Data Context</h4>
              <p className={`${colors.accentText} text-sm`}>
                <strong>{filteredCount}</strong> productivity records available for analysis.
              </p>
              <p className="text-white/50 text-xs mt-1">
                The AI will only access data within this filtered scope.
              </p>
              {filteredCount === 0 && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-yellow-500 text-xs font-semibold">
                    No matching data found in database.
                    Try broadening your filters or add data in the "Data Entry" section.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-2 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 h-[75vh] flex flex-col overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.map((message) => (
                <div key={message.id} className={`flex items-start gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.type === 'user' ? 'bg-slate-700' : `bg-gradient-to-r ${config.gradient}`}`}>
                    {message.type === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                  </div>
                  <div className={`max-w-[80%] rounded-xl p-4 text-white ${message.type === 'user' ? `bg-gradient-to-r ${config.gradient}` : 'bg-white/5 border border-white/10'}`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {typeof message.content === 'string' ? message.content : message.content?.text || ''}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r ${config.gradient} flex items-center justify-center`}>
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-white/80 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-white/80 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-white/80 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/10 p-4">
              <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Ask ${config.title} anything...`}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/40 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all duration-300"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !inputMessage.trim()}
                  className={`flex-shrink-0 w-12 h-12 bg-gradient-to-r ${config.gradient} rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                >
                  <Send size={20} className="text-white" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default Chatbot;
