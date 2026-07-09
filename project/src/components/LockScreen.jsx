import React, { useState } from "react";
import api from "../services/api";
import { ShieldAlert, Key, RefreshCw, AlertCircle, WifiOff, Clock } from "lucide-react";

const LockScreen = ({ status, onUnlock }) => {
  const [keyInput, setKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setErrorMsg("Please enter a license key.");
      return;
    }
    
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await api.post("/api/license/register-local", {
        licenseKey: keyInput.trim()
      });
      
      if (response.data.valid) {
        onUnlock(response.data);
      } else {
        const reasons = {
          SYSTEM_SUSPENDED: "The product registry is currently suspended by global administration.",
          REVOKED: "This license key has been revoked by administration.",
          EXPIRED: "This license key has expired.",
          OFFLINE_TIMEOUT: "License registration failed. Central server is unreachable."
        };
        setErrorMsg(reasons[response.data.reason] || "Invalid or deactivated license key.");
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Network error. Central license registry is unreachable.");
    } finally {
      setLoading(false);
    }
  };

  const getReasonDetails = () => {
    switch (status.reason) {
      case "SYSTEM_SUSPENDED":
        return {
          title: "Service Temporarily Suspended",
          desc: "Our master service infrastructure is currently undergoing scheduled maintenance. General operations will resume shortly. We apologize for any inconvenience.",
          icon: ShieldAlert,
          iconColor: "#FF5E5E",
          showForm: false
        };
      case "REVOKED":
        return {
          title: "Registry Access Revoked",
          desc: "Access to this node has been remotely suspended by global registry administration. Please contact your Productix account representative or support at billing@productix.ai to resolve.",
          icon: ShieldAlert,
          iconColor: "#FF5E5E",
          showForm: true
        };
      case "EXPIRED":
        return {
          title: "License Term Expired",
          desc: "Your subscription period has ended. To resume database and analytical operations, please register a newly issued license key below.",
          icon: Clock,
          iconColor: "#FFA23A",
          showForm: true
        };
      case "OFFLINE_TIMEOUT":
        return {
          title: "Offline Validation Timeout",
          desc: "The client application has exceeded the maximum 24-hour offline grace period. Please connect this computer to the internet to perform mandatory licensing verification.",
          icon: WifiOff,
          iconColor: "#FFA23A",
          showForm: false
        };
      case "TIME_TAMPERING":
        return {
          title: "Security Violation Triggered",
          desc: "System clock manipulation has been detected on this workstation. To prevent registry corruption and locking, please synchronize your local computer clock with standard internet time (NTP).",
          icon: AlertCircle,
          iconColor: "#FF5E5E",
          showForm: false
        };
      case "CONNECTION_ERROR":
        return {
          title: "Local Registry Node Offline",
          desc: "The Productix backend service is currently unreachable. Please make sure the backend application is running and try again.",
          icon: WifiOff,
          iconColor: "#FF5E5E",
          showForm: false,
          isConnectionError: true
        };
      case "UNLICENSED":
        return {
          title: "Activate Your Workspace",
          desc: "Your account credentials are set. Now enter the license key provided by your administrator to bind and activate your workspace.",
          icon: Key,
          iconColor: "#00F0FF",
          showForm: true,
          isFirstTimeSetup: true
        };
      default:
        return {
          title: "License Registration Required",
          desc: "Welcome to Productix AI. A valid cryptographic license key is required to initialize the local registry nodes and load the analytical workspace.",
          icon: Key,
          iconColor: "#00F0FF",
          showForm: true
        };
    }
  };

  const details = getReasonDetails();
  const IconComponent = details.icon;

  const userRole = localStorage.getItem('role');
  const isAdmin = userRole === 'org_admin' || userRole === 'system_admin';
  const isPendingSetup = localStorage.getItem('pending_license_registration') === 'true';
  // During first-time setup (pending_license_registration), always show the form regardless of role
  const showForm = details.showForm && (isAdmin || isPendingSetup);
  const displayDesc = (details.showForm && !isAdmin && !isPendingSetup)
    ? "Access Locked. Your organization's license is currently inactive or has been suspended. Please contact your organization administrator to activate the workspace."
    : details.desc;

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
          boxShadow: `0 0 50px -12px ${details.iconColor}20`
        }}
      >
        {/* Decorative Top Accent Light */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 blur-md transition-colors duration-300"
          style={{ backgroundColor: details.iconColor }}
        />

        {/* Step indicator — only for first-time setup flow */}
        {isPendingSetup && (
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-zinc-500 text-xs font-bold">✓</div>
              <span className="text-xs text-zinc-500 font-semibold">Credentials</span>
            </div>
            <div className="w-8 h-px bg-white/20" />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-black text-xs font-bold">2</div>
              <span className="text-xs text-teal-400 font-semibold">License Key</span>
            </div>
          </div>
        )}

        {/* Pulsing Shield Icon Container */}
        <div className="flex justify-center mb-6">
          <div 
            className="p-5 rounded-2xl bg-white/5 border border-white/10 relative transition-transform duration-300 group-hover:scale-105"
            style={{ 
              color: details.iconColor,
              boxShadow: `inset 0 0 20px 0 ${details.iconColor}15`
            }}
          >
            <IconComponent size={40} className="animate-pulse" />
          </div>
        </div>

        {/* Lock Screen Typography */}
        <h2 className="text-2xl font-bold tracking-tight text-white mb-3 font-display">
          {details.title}
        </h2>
        
        <p className="text-sm leading-relaxed text-zinc-400 font-medium px-4 mb-8">
          {displayDesc}
        </p>

        {/* Dynamic Details / Machine ID Badge */}
        <div className="inline-flex flex-col gap-1 px-4 py-2 bg-white/5 border border-white/5 rounded-2xl mb-8">
          <span className="text-[10px] font-bold text-teal-500/50 uppercase tracking-widest">Workstation Fingerprint</span>
          <span className="text-xs font-semibold mono text-zinc-500">{status.machineId}</span>
        </div>

        {/* Registration Form */}
        {showForm && (
          <form onSubmit={handleRegister} className="space-y-4 px-4">
            <div className="relative">
              <input
                type="text"
                placeholder="PX-XXXX-XXXX-XXXX-XXXX"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                disabled={loading}
                className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-teal-500 focus:bg-white/[0.07] outline-none text-center mono text-sm tracking-wider font-semibold transition-all"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400 justify-center bg-red-500/10 py-2.5 px-3 rounded-lg border border-red-500/20">
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-black font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Validating Key...</span>
                </>
              ) : (
                <>
                  <Key size={18} />
                  <span>Activate Workspace</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Re-check Status Option for Revoked, Expired, or Offline Timeout licenses */}
        {(status.reason === "REVOKED" || status.reason === "EXPIRED" || status.reason === "OFFLINE_TIMEOUT") && (
          <div className="px-4 mb-4">
            <button
              onClick={async () => {
                setLoading(true);
                setErrorMsg("");
                try {
                  await onUnlock();
                } catch (err) {
                  setErrorMsg("Verification failed. Central license registry is unreachable.");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-black font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              <span>Check License Status</span>
            </button>
          </div>
        )}

        {/* Connection Error Retry Option */}
        {details.isConnectionError && (
          <div className="px-4">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-black font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all cursor-pointer"
            >
              <RefreshCw size={18} />
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {/* Log Out Option to Exit Locked State */}
        <div className="mt-6">
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/login';
            }}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-300 hover:underline transition-all cursor-pointer bg-transparent border-none outline-none"
          >
            Log Out / Switch Account
          </button>
        </div>

        {/* Footer Support Info */}
        <div className="mt-8 pt-6 border-t border-white/5 text-[10px] mono text-zinc-600 font-semibold uppercase tracking-wider">
          {isPendingSetup
            ? 'Productix Security Architecture v1.4.2 · Step 2 of 2'
            : 'Productix Security Architecture v1.4.2'
          }
        </div>
      </div>
    </div>
  );
};

export default LockScreen;
