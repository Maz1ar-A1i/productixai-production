import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { authService } from '../services/api';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await authService.login(formData);
      console.log("Login response:", res);
      localStorage.setItem("access_token", res.access_token);

      if (res.access_token) {
        localStorage.setItem('token', res.access_token);

        if (res.expires_in) {
          const expirationTime = Date.now() + (res.expires_in * 1000);
          localStorage.setItem('token_expiration', expirationTime.toString());
        }

        // ✅ Save role if backend sends it
        if (res.role) {
          localStorage.setItem("role", res.role);
        }
      }

      // ✅ Refresh the license status in context before navigating!
      if (window.refreshLicenseStatus) {
        try {
          await window.refreshLicenseStatus();
        } catch (refreshErr) {
          console.error("Failed to refresh license status after login:", refreshErr);
        }
      }

      // ✅ Decide redirect based on role
      const role = res.role || localStorage.getItem("role");

      if (role === "system_admin") {
        navigate("/system_admin", { replace: true });
      } else if (role === "org_admin") {
        navigate("/org_admin", { replace: true });
      } else {
        navigate("/kpi", { replace: true });
      }

    } catch (err) {
      console.error('Login error:', err);

      if (err.code === 'ERR_NETWORK') {
        setError('Unable to connect to the server. Please check your internet connection and ensure the backend is running.');
      } else if (err.response) {
        const backendMessage = err.response.data?.detail || err.response.data?.message;
        if (backendMessage) {
          setError(backendMessage);
        } else if (err.response.status === 401) {
          setError('Unauthorized. Please check your email and password.');
        } else if (err.response.status === 429) {
          setError('Too many login attempts. Please try again later.');
        } else if (err.response.status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError('Login failed. Please try again.');
        }
      } else {
        setError('Unexpected error occurred. Please try again.');
      }

      logError(err);
    } finally {
      setLoading(false);
    }
  };



  // Optional: Error logging utility
  const logError = (error) => {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
      data: error.response?.data
    };
    console.error('Login Error Details:', errorLog);

    // You could also send this to an error tracking service
    // trackError('login_error', errorLog);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="card p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="text-white" size={32} />
            </div>
            <h2 className="text-3xl font-bold text-white">Welcome</h2>
            <p className="text-white/70 mt-2">Sign in to your Productix AI account</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 flex items-center">
              <AlertCircle className="text-red-400 mr-2" size={20} />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="form-label">
                <Mail className="inline mr-2" size={16} />
                Username or Email
              </label>
              <input
                type="text"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input-field"
                placeholder="Enter your username or email"
                required
              />
            </div>

            <div>
              <label className="form-label">
                <Lock className="inline mr-2" size={16} />
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="input-field"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-white/50 text-xs">
              Contact support to request an account: 03214917181
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
