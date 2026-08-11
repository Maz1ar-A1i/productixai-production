import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/api';
import { LicenseContext } from '../App';
import LockScreen from './LockScreen';
import ChangeCredentials from './ChangeCredentials';

// These reasons represent a definitive, persistent license problem that must be
// shown to the user even after the initial license-binding step is complete.
// "UNLICENSED" is intentionally excluded — it is only valid during first-time
// setup (when no license has been bound yet), not as a runtime blocking reason.
const BLOCKING_LICENSE_REASONS = new Set([
  'REVOKED',
  'EXPIRED',
  'OFFLINE_TIMEOUT',
  'SYSTEM_SUSPENDED',
  'TIME_TAMPERING',
  'MACHINE_MISMATCH',
  'SIGNATURE_SPOOFED',
]);

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const userRole = authService.getRole();
  const license = useContext(LicenseContext);

  const requiresPasswordChange = localStorage.getItem('requires_password_change') === 'true';

  // 1. Must be authenticated
  if (!token) return <Navigate to="/login" replace />;

  // 2. System admin bypasses all license checks
  if (userRole === 'system_admin') {
    // Still enforce role-based access for system_admin routes
    if (allowedRoles && !allowedRoles.includes(userRole)) {
      return <Navigate to="/system_admin" replace />;
    }
    return children;
  }

  // 3. First-time setup: user must update their temporary credentials
  if (requiresPasswordChange) {
    return <ChangeCredentials />;
  }

  // 4. License OTP gate — only shown once, on first account setup.
  //    The `license_bound` flag comes from the login response and is persisted to
  //    localStorage. It is `false` only when the server confirmed that no active
  //    license is yet associated with this organization.
  const licenseBound = authService.isLicenseBound();
  if (!licenseBound) {
    return (
      <LockScreen
        status={{
          valid: false,
          reason: 'UNLICENSED',
          machineId: license?.licenseStatus?.machineId || '...'
        }}
        onUnlock={() => {
          // Mark license as bound locally so we never ask again for this session.
          // The next login will re-validate from the server.
          localStorage.setItem('license_bound', 'true');
          if (license?.refreshLicense) {
            license.refreshLicense();
          }
        }}
      />
    );
  }

  // 5. Runtime license gate — only block on permanent, definitive failure reasons.
  //    We intentionally ignore transient 'UNLICENSED' and 'CONNECTION_ERROR' states
  //    that can appear briefly after a backend restart while the cache is being read.
  const licStatus = license?.licenseStatus;
  if (licStatus && !licStatus.valid && BLOCKING_LICENSE_REASONS.has(licStatus.reason)) {
    return (
      <LockScreen
        status={licStatus}
        onUnlock={() => {
          license.refreshLicense();
        }}
      />
    );
  }

  // 6. Role-based access control
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;