import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/api';
import { LicenseContext } from '../App';
import LockScreen from './LockScreen';
import ChangeCredentials from './ChangeCredentials';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const userRole = authService.getRole();
  const license = useContext(LicenseContext);

  const requiresPasswordChange = localStorage.getItem('requires_password_change') === 'true';
  const pendingLicenseRegistration = localStorage.getItem('pending_license_registration') === 'true';

  // 1. Must be authenticated
  if (!token) return <Navigate to="/login" replace />;

  // 2. System admin bypasses all checks
  if (userRole === 'system_admin') {
    return children;
  }

  // 3. First-time setup: user must update their temporary credentials
  if (requiresPasswordChange) {
    return <ChangeCredentials />;
  }

  // 4. After credential update, user must register their license key
  //    This step is mandatory for new accounts so that the key is bound to the account.
  if (pendingLicenseRegistration) {
    return (
      <LockScreen
        status={{
          valid: false,
          reason: 'UNLICENSED',
          machineId: license?.licenseStatus?.machineId || '...'
        }}
        onUnlock={() => {
          // Clear the pending flag and refresh the license context
          localStorage.removeItem('pending_license_registration');
          if (license?.refreshLicense) {
            license.refreshLicense();
          }
        }}
      />
    );
  }

  // 5. License must be valid for org users
  if (license && license.licenseStatus && !license.licenseStatus.valid) {
    return (
      <LockScreen
        status={license.licenseStatus}
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