import React, { useState, useEffect } from 'react';
import { FileText, Target, BookOpen, AlertCircle, CheckCircle, Sparkles, Lightbulb, ChevronRight, TrendingUp } from 'lucide-react';
import { agentService, productivityService, orgSettingsService } from '../services/api';
import axios from 'axios';

function formatMessage(text) {
  if (!text) return "";

  // If it's an object with a 'text' property, extract it
  if (typeof text !== "string") {
    if (text.text && typeof text.text === "string") {
      text = text.text;
    } else {
      // Fallback: convert object/array to JSON string
      text = JSON.stringify(text, null, 2);
    }
  }

  let formatted = text;

  // Headings
  formatted = formatted.replace(/^###### (.*$)/gim, '<h6 class="text-base font-semibold text-white mt-4 mb-2">$1</h6>');
  formatted = formatted.replace(/^##### (.*$)/gim, '<h5 class="text-lg font-semibold text-white mt-4 mb-2">$1</h5>');
  formatted = formatted.replace(/^#### (.*$)/gim, '<h4 class="text-xl font-semibold text-white mt-4 mb-2">$1</h4>');
  formatted = formatted.replace(/^### (.*$)/gim, '<h3 class="text-2xl font-bold text-white mt-5 mb-3">$1</h3>');
  formatted = formatted.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-white mt-5 mb-3">$1</h2>');
  formatted = formatted.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-white mt-6 mb-4">$1</h1>');

  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');

  // Italic
  formatted = formatted.replace(/(?<!\*)\*(?!\*)(.*?)\*(?<!\*)/g, '<em class="italic text-white/90">$1</em>');

  // Horizontal rule
  formatted = formatted.replace(/^\s*([-*_]){3,}\s*$/gm, '<hr class="my-4 border-white/10" />');

  // Bullet points
  formatted = formatted.replace(/^\s*[\*\-]\s+(.*)$/gm, '<li class="ml-4 text-white/80">$1</li>');
  formatted = formatted.replace(/(<li.*<\/li>)/gs, '<ul class="list-disc space-y-2 my-3">$1</ul>');

  // Numbered lists
  formatted = formatted.replace(/^\s*\d+\.\s+(.*)$/gm, '<li class="ml-4 text-white/80">$1</li>');
  formatted = formatted.replace(/(<li.*<\/li>)/gs, '<ol class="list-decimal space-y-2 my-3">$1</ol>');

  // Line breaks
  formatted = formatted.replace(/\n/g, '<br />');

  return formatted;
}

const Agent = () => {
  const [goal, setGoal] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [records, setRecords] = useState([]);
  const [goalSuggestions, setGoalSuggestions] = useState([
    'Increase overall productivity by 15% in the next quarter',
    'Identify and eliminate top 3 productivity bottlenecks',
    'Optimize workflow to reduce time waste by 20%',
    'Develop a personalized productivity improvement plan',
  ]);

  useEffect(() => {
    fetchRecords();
    fetchGoalSuggestions();
  }, []);

  const fetchGoalSuggestions = async () => {
    try {
      const res = await api.get('/users/me');
      if (res.data && res.data.analysis_goals) {
        let goals = res.data.analysis_goals;
        if (typeof goals === 'string') {
          try { goals = JSON.parse(goals); } catch { goals = []; }
        }
        if (goals.length > 0) {
          setGoalSuggestions(goals);
        }
      }
    } catch (err) {
      console.error("Error fetching analysis goals:", err);
    }
  };

  const fetchRecords = async () => {
    try {
      const data = await productivityService.getRecords();
      setRecords(data);

    } catch (error) {
      console.error('Error fetching records:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!goal.trim() || loading) return;

    setLoading(true);
    setError('');
    setResults(null);

    try {
      // Safety check: ensure records is a dictionary as required by the backend
      let processedRecords = records;
      if (Array.isArray(records)) {
        processedRecords = { "All Products": records };
      }

      const response = await agentService.generateReport({ records: processedRecords, goal });
      setResults(response);
    } catch (err) {
      console.error('Agent error:', err);
      const backendError = err.response?.data?.detail;
      const errorMsg = typeof backendError === 'string' 
        ? `Error: ${backendError}` 
        : 'Failed to generate report. Please try again.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };
  const handleDownload = async (reportId) => {
    try {
      const token = localStorage.getItem("access_token");
      

      const response = await fetch(`https://productix-backend-v1rk.onrender.com/agent/${reportId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Server response:", text);
        throw new Error(`Failed to download report: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AI_Report_${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("❌ Error downloading report:", err);
      alert("Failed to download report. Check console for details.");
    }
  };

  // Suggestions are now dynamic and stored in state.

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent flex items-center gap-3">
            <Sparkles className="w-10 h-10 text-purple-400" />
            AI Agent Reports
          </h1>
          <p className="text-white/40 text-sm">Generate comprehensive reports and action plans based on your productivity data</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Sidebar - Goal Input & Suggestions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Goal Input */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Target className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">Set Your Goal</h3>
              </div>

              <div className="space-y-4">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full h-32 resize-none bg-white/10 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 focus:bg-white/15 transition-all duration-300"
                  placeholder="e.g., 'Analyze my performance and create an improvement plan...'"
                />

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="text-red-400 flex-shrink-0" size={18} />
                    <span className="text-red-400 text-sm">{error}</span>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading || !goal.trim()}
                  className="w-full px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Generate AI Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Goal Suggestions */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Lightbulb className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Goal Suggestions</h3>
              </div>
              <div className="space-y-2">
                {goalSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setGoal(suggestion)}
                    className="w-full text-left p-3 flex items-center justify-between bg-white/5 hover:bg-white/10 border border-transparent hover:border-blue-500/20 rounded-lg text-white/70 hover:text-white text-sm transition-all duration-300 group"
                  >
                    <span className="flex-1">{suggestion}</span>
                    <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </div>

            {/* Data Source Info */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Data Source</h3>
              </div>
              <p className="text-white/60 text-sm mb-2">
                Analysis based on all records collected so far.
              </p>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 w-full" />
              </div>
            </div>
          </div>

          {/* Right Content - Results */}
          <div className="lg:col-span-3 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <BookOpen className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white">AI Agent Report</h3>
            </div>

            {results ? (
              <div className="space-y-6">

                {/* ✅ Download Button */}
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => handleDownload(results.id)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl text-white font-semibold text-sm shadow-lg hover:shadow-emerald-500/30 hover:scale-[1.03] transition-all duration-300"
                  >
                    <FileText size={16} />
                    Download Report
                  </button>

                </div>
                {/* Success Banner */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
                  <span className="text-green-400 font-medium text-sm">
                    Report generated successfully
                  </span>
                </div>

                {/* Action Plan */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/30 transition-all duration-300">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-purple-500/10">
                      <Target size={18} className="text-purple-400" />
                    </div>
                    <h4 className="font-semibold text-white text-lg">Action Plan</h4>
                  </div>
                  <div
                    className="text-white/80 text-sm leading-relaxed prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: formatMessage(results.plan) }}
                  />
                </div>

                {/* Detailed Analysis */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-blue-500/30 transition-all duration-300">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-blue-500/10">
                      <FileText size={18} className="text-blue-400" />
                    </div>
                    <h4 className="font-semibold text-white text-lg">Detailed Analysis</h4>
                  </div>
                  <div
                    className="text-white/80 text-sm leading-relaxed prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: formatMessage(results.report) }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                {loading ? (
                  <>
                    <div className="relative mb-6">
                      <BookOpen className="w-20 h-20 text-white/20" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-24 h-24 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                      </div>
                    </div>
                    <p className="text-white/60 font-medium mb-2">Analyzing your productivity data...</p>
                    <p className="text-white/40 text-sm max-w-md">
                      The AI agent is processing {records.length} records to generate your personalized report
                    </p>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-20 h-20 text-white/20 mb-6" />
                    <h4 className="text-white font-semibold text-lg mb-2">Ready to Generate Your Report</h4>
                    <p className="text-white/40 text-sm max-w-md">
                      Set your goal above and click "Generate AI Report" to receive a comprehensive analysis and action plan
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
          margin-top: 1.5em;
          margin-bottom: 0.75em;
        }
        .prose ul, .prose ol {
          margin-top: 0.75em;
          margin-bottom: 0.75em;
        }
        .prose li {
          margin-top: 0.25em;
          margin-bottom: 0.25em;
        }
        .prose strong {
          font-weight: 600;
        }
        .prose hr {
          margin-top: 1.5em;
          margin-bottom: 1.5em;
        }
      `}</style>
    </div>
  );
};

export default Agent;
