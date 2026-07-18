import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, AlertTriangle, AlertCircle, Info, CheckCircle, Bell } from 'lucide-react';
import { alertService } from '../services/api';

/**
 * Alert Notification Component
 * Displays alerts to users with different severity levels
 * Supports dismissal and auto-hide functionality
 */
const AlertNotification = ({ 
  alert, 
  onDismiss, 
  autoHide = true, 
  duration = 5000,
  showDetails = false 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [expanded, setExpanded] = useState(showDetails);

  // Trigger fade-in on mount
  useEffect(() => {
    const enterTimer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (autoHide && alert.severity !== 'critical') {
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [autoHide, duration, alert.severity]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      if (onDismiss) onDismiss(alert.id);
    }, 300);
  };

  const getSeverityIcon = () => {
    switch (alert.severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
      default:
        return <CheckCircle className="w-5 h-5" />;
    }
  };

  const getSeverityStyles = () => {
    switch (alert.severity) {
      case 'critical':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: 'text-red-600',
          title: 'text-red-800',
          message: 'text-red-700',
          button: 'text-red-400 hover:text-red-600'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: 'text-yellow-600',
          title: 'text-yellow-800',
          message: 'text-yellow-700',
          button: 'text-yellow-400 hover:text-yellow-600'
        };
      case 'info':
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          title: 'text-blue-800',
          message: 'text-blue-700',
          button: 'text-blue-400 hover:text-blue-600'
        };
      default:
        return {
          bg: 'bg-green-50 border-green-200',
          icon: 'text-green-600',
          title: 'text-green-800',
          message: 'text-green-700',
          button: 'text-green-400 hover:text-green-600'
        };
    }
  };

  const styles = getSeverityStyles();

  return (
    <div
      className={`${styles.bg} border rounded-lg shadow-sm transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
      style={{ transitionProperty: 'opacity, transform' }}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className={`flex-shrink-0 ${styles.icon}`}>
            {getSeverityIcon()}
          </div>
          <div className="ml-3 flex-1">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-medium ${styles.title}`}>
                {alert.title}
              </h3>
              <button
                onClick={handleDismiss}
                className={`ml-2 ${styles.button} transition-colors`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`mt-1 text-sm ${styles.message}`}>
              {alert.message}
            </div>
            
            {alert.data_context && Object.keys(alert.data_context).length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs font-medium underline text-gray-600 hover:text-gray-800"
                >
                  {expanded ? 'Hide Details' : 'Show Details'}
                </button>
                {expanded && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <pre className="text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(alert.data_context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Alert Manager Component
 * Manages multiple alerts and provides a notification center
 */
const AlertManager = ({ 
  maxVisible = 3, 
  position = 'top-right',
  refreshInterval = 30000 
}) => {
  const [alerts, setAlerts] = useState([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [stats, setStats] = useState({ total_alerts: 0, active_alerts: 0, critical_alerts: 0, warning_alerts: 0 });

  // Tracks IDs dismissed this session — persists across re-fetches so they never re-appear
  const dismissedIds = useRef(new Set());

  const fetchAlerts = useCallback(async () => {
    try {
      const [alertsResponse, statsResponse] = await Promise.all([
        alertService.getAlerts({ dismissed: false, limit: 10 }),
        alertService.getStats()
      ]);
      // Filter out anything the user already dismissed this session
      const fresh = (alertsResponse.data || []).filter(a => !dismissedIds.current.has(a.id));
      setAlerts(fresh);
      setStats(statsResponse.data);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAlerts, refreshInterval]);

  const handleDismiss = async (alertId) => {
    // Mark as dismissed in session ref FIRST — prevents re-appearing on any future fetch
    dismissedIds.current.add(alertId);

    // Immediately remove from UI
    const dismissed = alerts.find(a => a.id === alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setStats(prev => ({
      ...prev,
      active_alerts: Math.max(0, prev.active_alerts - 1),
      critical_alerts: Math.max(0, prev.critical_alerts - (dismissed?.severity === 'critical' ? 1 : 0)),
      warning_alerts: Math.max(0, prev.warning_alerts - (dismissed?.severity === 'warning' ? 1 : 0))
    }));

    // Persist to backend (fire-and-forget — UI already updated)
    try {
      await alertService.dismissAlert(alertId);
    } catch (error) {
      console.error('Failed to persist alert dismissal on server:', error);
      // UI stays dismissed because dismissedIds ref still has the ID
    }
  };

  const getPositionStyles = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 right-4';
    }
  };

  const visibleAlerts = alerts.slice(0, maxVisible);

  return (
    <>
      {/* Notification Bell */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setShowNotificationCenter(!showNotificationCenter)}
          className="relative p-2 bg-white rounded-full shadow-lg hover:bg-gray-50 transition-colors"
        >
          <Bell className="w-6 h-6 text-gray-700" />
          {stats.active_alerts > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {stats.active_alerts}
            </span>
          )}
        </button>
      </div>

      {/* Alert Notifications */}
      <div className={`fixed ${getPositionStyles()} z-40 space-y-2 w-96`}>
        {visibleAlerts.map(alert => (
          <AlertNotification
            key={alert.id}
            alert={alert}
            onDismiss={handleDismiss}
            autoHide={alert.severity !== 'critical'}
          />
        ))}
      </div>

      {/* Notification Center */}
      {showNotificationCenter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Notification Center</h2>
              <button
                onClick={() => setShowNotificationCenter(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 border-b bg-gray-50">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{stats.total_alerts}</div>
                  <div className="text-xs text-gray-500">Total Alerts</div>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.active_alerts}</div>
                  <div className="text-xs text-gray-500">Active</div>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{stats.critical_alerts}</div>
                  <div className="text-xs text-gray-500">Critical</div>
                </div>
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{stats.warning_alerts}</div>
                  <div className="text-xs text-gray-500">Warnings</div>
                </div>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[50vh] space-y-2">
              {alerts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No active alerts</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <AlertNotification
                    key={alert.id}
                    alert={alert}
                    onDismiss={handleDismiss}
                    autoHide={false}
                    showDetails={true}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Validation Result Display Component
 * Shows validation results from data entry forms
 */
const ValidationResultDisplay = ({ validationResult, onProceed }) => {
  const { is_valid, alerts, warnings } = validationResult;

  if (is_valid && warnings.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
          <span className="text-green-800 font-medium">All data looks good!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!is_valid && alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <h3 className="text-red-800 font-semibold">Critical Issues Found</h3>
          </div>
          <ul className="space-y-2">
            {alerts.map((alert, index) => (
              <li key={index} className="text-red-700 text-sm flex items-start">
                <span className="mr-2">•</span>
                <span>{alert.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center mb-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
            <h3 className="text-yellow-800 font-semibold">Warnings</h3>
          </div>
          <ul className="space-y-2">
            {warnings.map((warning, index) => (
              <li key={index} className="text-yellow-700 text-sm flex items-start">
                <span className="mr-2">•</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!is_valid && (
        <div className="flex justify-end">
          <button
            onClick={onProceed}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            Save Anyway (Despite Issues)
          </button>
        </div>
      )}
    </div>
  );
};

export { AlertNotification, AlertManager, ValidationResultDisplay };