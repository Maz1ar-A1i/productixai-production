import React, { useState } from 'react';
import { User, Mail, Lock, Check, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '../services/api';

const ChangeCredentials = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setErrorMsg('');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim() || !formData.confirmPassword.trim()) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    if (formData.password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await api.put('/users/update-credentials', {
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password
      });

      setSuccessMsg('Credentials updated! Setting up your license key...');

      // Clear the temp password flag
      localStorage.removeItem('requires_password_change');

      // Set a flag so ProtectedRoute knows to show the license key entry next
      localStorage.setItem('pending_license_registration', 'true');

      // Navigate to trigger ProtectedRoute re-evaluation
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      const detail = err.response?.data?.detail || '';
      if (detail.toLowerCase().includes('signature') || detail.toLowerCase().includes('crypto')) {
        setErrorMsg('Server verification failed. Please check your internet connection and try again.');
      } else {
        setErrorMsg(detail || 'Failed to update credentials. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#09090b]"
      style={{
        backgroundImage: "radial-gradient(circle at center, rgba(13, 148, 136, 0.08) 0%, rgba(9, 9, 11, 1) 70%)"
      }}
    >
      <div
        className="w-full max-w-lg p-8 mx-4 backdrop-blur-xl bg-[#121215]/80 border border-white/10 rounded-3xl text-center shadow-2xl relative overflow-hidden group"
        style={{
          boxShadow: '0 0 50px -12px rgba(20, 184, 166, 0.2)'
        }}
      >
        {/* Decorative Top Accent Light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 blur-md bg-teal-500" />

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-black text-xs font-bold">1</div>
            <span className="text-xs text-teal-400 font-semibold">Credentials</span>
          </div>
          <div className="w-8 h-px bg-white/20" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-zinc-500 text-xs font-bold">2</div>
            <span className="text-xs text-zinc-500 font-semibold">License Key</span>
          </div>
        </div>

        {/* Shield Icon Container */}
        <div className="flex justify-center mb-6">
          <div
            className="p-5 rounded-2xl bg-white/5 border border-white/10 relative transition-transform duration-300 group-hover:scale-105 text-teal-500"
            style={{
              boxShadow: 'inset 0 0 20px 0 rgba(20, 184, 166, 0.15)'
            }}
          >
            <ShieldCheck size={40} className="animate-pulse" />
          </div>
        </div>

        {/* Typography */}
        <h2 className="text-2xl font-bold tracking-tight text-white mb-3 font-display">
          Set Up Your Account
        </h2>

        <p className="text-sm leading-relaxed text-zinc-400 font-medium px-4 mb-8">
          Your account was created by administration with a temporary password. Set your own credentials to secure your workspace.
        </p>

        {errorMsg && (
          <div className="flex items-center gap-2 text-xs font-semibold text-red-400 justify-center bg-red-500/10 py-2.5 px-3 rounded-lg border border-red-500/20 mb-6">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 justify-center bg-emerald-500/10 py-2.5 px-3 rounded-lg border border-emerald-500/20 mb-6">
            <Check size={14} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Update Form */}
        <form onSubmit={handleUpdate} className="space-y-4 px-4 text-left">
          <div>
            <label className="text-xs font-semibold text-zinc-400 ml-1">Full Name</label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                name="name"
                placeholder="Enter your name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading || !!successMsg}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-teal-500 focus:bg-white/[0.07] outline-none text-sm font-semibold transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 ml-1">Username / Email</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                name="email"
                placeholder="Enter your new username or email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading || !!successMsg}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-teal-500 focus:bg-white/[0.07] outline-none text-sm font-semibold transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 ml-1">New Password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="password"
                name="password"
                placeholder="Minimum 8 characters"
                value={formData.password}
                onChange={handleChange}
                disabled={loading || !!successMsg}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-teal-500 focus:bg-white/[0.07] outline-none text-sm font-semibold transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 ml-1">Confirm Password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading || !!successMsg}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-teal-500 focus:bg-white/[0.07] outline-none text-sm font-semibold transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!successMsg}
            className="w-full py-3.5 mt-6 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-black font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Updating...</span>
              </>
            ) : successMsg ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Redirecting to License Setup...</span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>Continue to License Key →</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-[10px] mono text-zinc-600 font-semibold uppercase tracking-wider">
          Productix Security Architecture v1.4.2 · Step 1 of 2
        </div>
      </div>
    </div>
  );
};

export default ChangeCredentials;
