import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { authService } from "../services/api";
import { 
  Users, Building, ToggleLeft, ToggleRight, 
  Trash2, Plus, LayoutDashboard, ShieldCheck,
  Activity, Globe, LogOut, ShieldAlert,
  Search, Mail, Key, Clock, X, Check
} from "lucide-react";

const SystemAdmin = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  const [newOrg, setNewOrg] = useState({ name: "", subscription_plan: "pro" });
  const [newUser, setNewUser] = useState({ email: "", password: "", org_id: "", role: "org_admin" });
  const [newLicense, setNewLicense] = useState({ organization_id: "", duration_days: 30 });
  const [search, setSearch] = useState("");
  const [timerModal, setTimerModal] = useState({ show: false, orgId: null });
  const [extendModal, setExtendModal] = useState({ show: false, licenseId: null });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [orgRes, userRes, licRes] = await Promise.all([
        api.get("/system-admin/organizations"),
        api.get("/system-admin/users"),
        api.get("/system-admin/licenses"),
      ]);
      setOrgs(orgRes.data.map(o => ({ ...o, status: o.status || 'active' })));
      setUsers(userRes.data);
      setLicenses(licRes.data);
    } catch (err) {
      console.error("Error loading system admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const createLicense = async (e) => {
    e.preventDefault();
    if (!newLicense.organization_id) {
      alert("Please select an organization first.");
      return;
    }
    try {
      await api.post("/system-admin/licenses", {
        organization_id: parseInt(newLicense.organization_id),
        duration_days: parseInt(newLicense.duration_days)
      });
      setNewLicense({ organization_id: "", duration_days: 30 });
      fetchData();
      alert("Cryptographic license key generated successfully.");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to generate license key.");
    }
  };

  const revokeLicense = async (id) => {
    if (window.confirm("Confirm remote revocation of this license? The client app will block access immediately on its next verification check.")) {
      try {
        await api.put(`/system-admin/licenses/${id}/revoke`);
        fetchData();
        alert("License revoked remotely.");
      } catch (err) {
        alert(err.response?.data?.detail || "Failed to revoke license.");
      }
    }
  };

  const reactivateLicense = async (id) => {
    if (window.confirm("Confirm remote reactivation of this license? The client app will regain access immediately on its next verification check.")) {
      try {
        await api.put(`/system-admin/licenses/${id}/reactivate`);
        fetchData();
        alert("License reactivated remotely.");
      } catch (err) {
        alert(err.response?.data?.detail || "Failed to reactivate license.");
      }
    }
  };

  const deleteLicense = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this license key from the registry? This cannot be undone.")) {
      try {
        await api.delete(`/system-admin/licenses/${id}`);
        fetchData();
        alert("License deleted successfully.");
      } catch (err) {
        alert(err.response?.data?.detail || "Failed to delete license.");
      }
    }
  };

  const extendLicense = async (days) => {
    try {
      await api.put(`/system-admin/licenses/${extendModal.licenseId}/extend`, { days });
      setExtendModal({ show: false, licenseId: null });
      fetchData();
      alert("License expiry extended successfully.");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to extend license.");
    }
  };

  useEffect(() => { fetchData(); }, []);

  const logout = () => {
    authService.logout();
  };

  const createOrganization = async (e) => {
    e.preventDefault();
    try {
      await api.post("/system-admin/organizations", newOrg);
      setNewOrg({ name: "", subscription_plan: "pro" });
      fetchData();
      alert("Organization provisioned successfully.");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to provision organization");
    }
  };

  const deleteOrg = async (id) => {
    if (window.confirm("Confirm deletion of this organization? All associated data will be purged.")) {
      try {
        await api.delete(`/system-admin/organizations/${id}`);
        fetchData();
        alert("Organization purged from registry.");
      } catch (err) {
        alert(err.response?.data?.detail || "Failed to delete organization. Ensure it has no dependencies.");
      }
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!newUser.org_id) {
      alert("Please select an organization first.");
      return;
    }
    try {
      await api.post(`/system-admin/organizations/${newUser.org_id}/users`, {
        email: newUser.email,
        password: newUser.password,
        role: newUser.role
      });
      setNewUser({ email: "", password: "", org_id: "", role: "org_admin" });
      fetchData();
      alert("Identity generated successfully!");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create identity");
    }
  };

  const deleteUser = async (id) => {
    if (window.confirm("Delete this identity?")) {
      try {
        await api.delete(`/system-admin/users/${id}`);
        fetchData();
        alert("Identity revoked.");
      } catch (err) {
        alert(err.response?.data?.detail || "Failed to remove identity");
      }
    }
  };

  const toggleOrgStatus = async (id) => {
    try {
      await api.put(`/system-admin/organizations/${id}/toggle-status`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to toggle organization status");
    }
  };

  const toggleUserStatus = async (id) => {
    try {
      await api.put(`/system-admin/users/${id}/toggle-status`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to toggle user status");
    }
  };

  const updateSubscriptionTimer = async (days) => {
    try {
      await api.put(`/system-admin/organizations/${timerModal.orgId}/subscription-timer`, { days });
      setTimerModal({ show: false, orgId: null });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to set subscription timer");
    }
  };

  const getDaysLeft = (endDate) => {
    if (!endDate) return null;
    const diff = new Date(endDate) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
        <span className="mono text-sm" style={{ color: 'var(--text-secondary)' }}>Initializing Core Registry...</span>
      </div>
    </div>
  );

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', padding: '32px' }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <ShieldCheck size={32} style={{ color: 'var(--accent)' }} />
            System Registry
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Global Infrastructure &amp; License Management</p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all font-semibold">
          <LogOut size={18} /> Exit Console
        </button>
      </div>

      <div className="flex gap-8">
        {/* Left Nav */}
        <div className="w-64 flex flex-col gap-2">
          {[
            { id: 'overview', label: 'Monitor', icon: LayoutDashboard },
            { id: 'orgs', label: 'Organizations', icon: Building },
            { id: 'users', label: 'Identity/Auth', icon: Users },
            { id: 'licenses', label: 'Licenses', icon: Key },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all duration-200"
              style={{
                background: tab === t.id ? 'var(--accent)' : 'var(--bg-elevated)',
                color: tab === t.id ? '#000' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}

          <div className="mt-8 p-4 glass-card">
            <h4 className="text-xs font-bold uppercase mb-4 opacity-40">Registry Health</h4>
            <div className="space-y-2 text-[10px] mono opacity-60">
              <div className="flex justify-between">
                <span>Nodes:</span>
                <span>{orgs.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Identities:</span>
                <span>{users.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 space-y-8">

          {/* Overview Tab */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Total Organizations', value: orgs.length, icon: Building, color: 'var(--accent)' },
                { label: 'Total Identities', value: users.length, icon: Users, color: 'var(--info)' },
                { label: 'System Uptime', value: '99.98%', icon: Activity, color: 'var(--success)' },
              ].map(stat => (
                <div key={stat.label} className="glass-card p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 rounded-xl bg-white/5" style={{ color: stat.color }}>
                      <stat.icon size={24} />
                    </div>
                  </div>
                  <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{stat.label}</div>
                </div>
              ))}

              <div className="md:col-span-3 glass-card p-8">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Globe size={20} style={{ color: 'var(--accent)' }} />
                  Recent Node Activity
                </h3>
                <div className="space-y-4">
                  {orgs.slice(0, 5).map(org => (
                    <div key={org.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-teal-500" />
                        <span className="font-bold">{org.name}</span>
                        <span className="badge badge-accent ml-2">{org.subscription_plan}</span>
                      </div>
                      <span className="mono text-xs opacity-40">Last sync: 2 mins ago</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Organizations Tab */}
          {tab === 'orgs' && (
            <div className="space-y-6">
              <div className="glass-card p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Plus size={20} style={{ color: 'var(--accent)' }} /> Provision New Organization
                </h3>
                <form onSubmit={createOrganization} className="flex gap-4">
                  <input
                    placeholder="Org Name"
                    value={newOrg.name}
                    onChange={e => setNewOrg({...newOrg, name: e.target.value})}
                    className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-teal-500 outline-none"
                  />
                  <select
                    value={newOrg.subscription_plan}
                    onChange={e => setNewOrg({...newOrg, subscription_plan: e.target.value})}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none"
                  >
                    <option value="free">Free Tier</option>
                    <option value="pro">Pro Tier</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                  <button type="submit" className="btn-primary px-8">Provision Node</button>
                </form>
              </div>

              <div className="glass-card overflow-hidden">
                <table className="w-full text-left">
                  <thead style={{ background: 'var(--bg-elevated)' }}>
                    <tr>
                      <th className="p-4 text-xs font-bold opacity-40">ID</th>
                      <th className="p-4 text-xs font-bold opacity-40">NAME</th>
                      <th className="p-4 text-xs font-bold opacity-40">LICENSE</th>
                      <th className="p-4 text-xs font-bold opacity-40">STATUS</th>
                      <th className="p-4 text-xs font-bold opacity-40 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map(org => (
                      <tr key={org.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 mono text-xs opacity-40">{org.id}</td>
                        <td className="p-4 font-bold">{org.name}</td>
                        <td className="p-4"><span className="badge badge-accent uppercase">{org.subscription_plan}</span></td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${org.status === 'active' ? 'bg-teal-500' : 'bg-red-500'}`} />
                            <span className="text-sm opacity-60 capitalize">{org.status}</span>
                            {org.subscription?.end_date && (
                              <span className="text-[10px] font-bold opacity-50">
                                ({getDaysLeft(org.subscription.end_date)}d left)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => toggleOrgStatus(org.id)}
                              className={`p-2 transition-colors ${org.status === 'active' ? 'text-teal-500 hover:text-teal-400' : 'text-gray-500 hover:text-gray-400'}`}
                              title={org.status === 'active' ? "Deactivate Organization" : "Activate Organization"}
                            >
                              {org.status === 'active' ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            </button>
                            <button
                              onClick={() => setTimerModal({ show: true, orgId: org.id })}
                              className="p-2 text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                              title="Set Subscription Timer"
                            >
                              <Clock size={18} />
                            </button>
                            <button onClick={() => deleteOrg(org.id)} className="p-2 text-red-500/40 hover:text-red-500 transition-colors">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {tab === 'users' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Create Identity Form */}
                <div className="glass-card p-6 h-fit">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <ShieldAlert size={20} style={{ color: 'var(--accent)' }} />
                    Create Identity
                  </h3>
                  <form onSubmit={createUser} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-40 uppercase ml-1">Assigned Node</label>
                      <select
                        value={newUser.org_id}
                        onChange={e => setNewUser({...newUser, org_id: e.target.value})}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                      >
                        <option value="">Select Organization...</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name} (ID: {o.id})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-40 uppercase ml-1">Email / ID</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                        <input
                          placeholder="user@org.com"
                          value={newUser.email}
                          onChange={e => setNewUser({...newUser, email: e.target.value})}
                          className="w-full pl-10 pr-3 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-40 uppercase ml-1">Temp Password</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={newUser.password}
                          onChange={e => setNewUser({...newUser, password: e.target.value})}
                          className="w-full pl-10 pr-3 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-40 uppercase ml-1">System Role</label>
                      <select
                        value={newUser.role}
                        onChange={e => setNewUser({...newUser, role: e.target.value})}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                      >
                        <option value="org_admin">Organization Admin (Manager)</option>
                        <option value="org_user">Organization User (Staff)</option>
                        <option value="system_admin">Global System Admin</option>
                      </select>
                    </div>
                    <button type="submit" className="btn-primary w-full py-3 mt-4">Generate Identity</button>
                  </form>
                </div>

                {/* User List */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex gap-4 mb-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                      <input
                        placeholder="Search identities by email or role..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-left">
                      <thead style={{ background: 'var(--bg-elevated)' }}>
                        <tr>
                          <th className="p-4 text-xs font-bold opacity-40">EMAIL</th>
                          <th className="p-4 text-xs font-bold opacity-40">ROLE</th>
                          <th className="p-4 text-xs font-bold opacity-40">ORG ID</th>
                          <th className="p-4 text-xs font-bold opacity-40">STATUS</th>
                          <th className="p-4 text-xs font-bold opacity-40 text-right">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(user => (
                          <tr key={user.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-4 font-bold flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-teal-500">
                                {user.email.charAt(0).toUpperCase()}
                              </div>
                              {user.email}
                            </td>
                            <td className="p-4 truncate">
                              <span className={`badge uppercase ${user.role === 'org_admin' ? 'badge-accent' : user.role === 'system_admin' ? 'badge-danger' : 'badge-warning'}`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="p-4 mono text-xs opacity-40">{user.organization_id || "SYSTEM"}</td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-teal-500' : 'bg-red-500'}`} />
                                <span className="text-sm opacity-60">{user.is_active ? "Active" : "Inactive"}</span>
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end items-center gap-2">
                                <button
                                  onClick={() => toggleUserStatus(user.id)}
                                  className={`p-2 transition-colors ${user.is_active ? 'text-teal-500 hover:text-teal-400' : 'text-gray-500 hover:text-gray-400'}`}
                                  title={user.is_active ? "Deactivate Identity" : "Activate Identity"}
                                >
                                  {user.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                </button>
                                <button onClick={() => deleteUser(user.id)} className="p-2 text-red-500/40 hover:text-red-500 transition-colors">
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Licenses Tab */}
          {tab === 'licenses' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Generate License Form */}
                <div className="glass-card p-6 h-fit bg-[#121212]/50 border border-white/10 backdrop-blur-md rounded-3xl">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Plus size={20} style={{ color: 'var(--accent)' }} /> Issue License Key
                  </h3>
                  <form onSubmit={createLicense} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-40 uppercase ml-1">Select Node (Organization)</label>
                      <select
                        value={newLicense.organization_id}
                        onChange={e => setNewLicense({...newLicense, organization_id: e.target.value})}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                      >
                        <option value="">Select Organization...</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name} (ID: {o.id})</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold opacity-40 uppercase ml-1">Duration (Validity)</label>
                      <select
                        value={newLicense.duration_days}
                        onChange={e => setNewLicense({...newLicense, duration_days: e.target.value})}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-teal-500"
                      >
                        <option value={7}>7 Days (Trial)</option>
                        <option value={30}>30 Days (Standard Monthly)</option>
                        <option value={90}>90 Days (Quarterly Plan)</option>
                        <option value={365}>365 Days (Annual License)</option>
                      </select>
                    </div>

                    <button type="submit" className="btn-primary w-full py-3 mt-4">Generate &amp; Register Key</button>
                  </form>
                </div>

                {/* Licenses List Table */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="glass-card overflow-hidden bg-[#121212]/50 border border-white/10 backdrop-blur-md rounded-3xl">
                    <table className="w-full text-left">
                      <thead style={{ background: 'var(--bg-elevated)' }}>
                        <tr>
                          <th className="p-4 text-xs font-bold opacity-40">LICENSE KEY</th>
                          <th className="p-4 text-xs font-bold opacity-40">ORGANIZATION</th>
                          <th className="p-4 text-xs font-bold opacity-40">STATUS</th>
                          <th className="p-4 text-xs font-bold opacity-40">EXPIRATION</th>
                          <th className="p-4 text-xs font-bold opacity-40 text-right">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {licenses.map(lic => (
                          <tr key={lic.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-4 font-bold flex items-center gap-2">
                              <Key className="text-teal-500" size={16} />
                              <span className="mono text-xs text-white selection:bg-teal-500 selection:text-black">{lic.license_key}</span>
                            </td>
                            <td className="p-4">
                              <span className="font-semibold text-sm">{lic.organization_name}</span>
                              <div className="text-[10px] opacity-40 uppercase tracking-wider">{lic.role}</div>
                            </td>
                            <td className="p-4">
                              <span className={`badge uppercase ${lic.status === 'active' ? 'badge-accent' : lic.status === 'expired' ? 'badge-warning' : 'badge-danger'}`}>
                                {lic.status}
                              </span>
                            </td>
                            <td className="p-4 truncate">
                              <span className="text-sm opacity-60">
                                {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : "Never Expires"}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end items-center gap-2">
                                {lic.expires_at && (
                                  <button
                                    onClick={() => setExtendModal({ show: true, licenseId: lic.id })}
                                    className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                                    title="Extend License Duration"
                                  >
                                    <Clock size={18} />
                                  </button>
                                )}
                                {lic.status === 'active' ? (
                                  <button
                                    onClick={() => revokeLicense(lic.id)}
                                    className="p-2 text-red-500 hover:text-red-400 transition-colors"
                                    title="Revoke License Key"
                                  >
                                    <X size={18} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => reactivateLicense(lic.id)}
                                    className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                                    title="Grant Access (Reactivate)"
                                  >
                                    <Check size={18} />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteLicense(lic.id)}
                                  className="p-2 text-red-500 hover:text-red-400 transition-colors"
                                  title="Delete License Key"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {licenses.length === 0 && (
                          <tr>
                            <td colSpan="5" className="p-8 text-center text-sm opacity-40">No licenses found in central registry.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* Subscription Timer Modal */}
      {timerModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-8 relative">
            <button
              onClick={() => setTimerModal({ show: false, orgId: null })}
              className="absolute right-4 top-4 p-2 text-white/40 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Clock size={24} className="text-teal-500" />
              Set Subscription Duration
            </h3>
            <p className="text-sm opacity-60 mb-8">
              Select the duration for this organization's active license. The account will automatically deactivate once the timer expires.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: '7 Days', value: 7, desc: 'Trial Period' },
                { label: '30 Days', value: 30, desc: 'Standard Monthly' },
                { label: '90 Days', value: 90, desc: 'Quarterly Plan' },
                { label: '1 Year', value: 365, desc: 'Annual License' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateSubscriptionTimer(opt.value)}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-teal-500 hover:bg-teal-500/10 transition-all text-left group"
                >
                  <div className="font-bold text-lg group-hover:text-teal-500">{opt.label}</div>
                  <div className="text-[10px] opacity-40 uppercase tracking-wider">{opt.desc}</div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setTimerModal({ show: false, orgId: null })}
              className="w-full mt-8 py-3 rounded-xl border border-white/10 font-bold hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Extend License Expiry Modal */}
      {extendModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-8 relative bg-[#121212]/90 border border-white/10 backdrop-blur-md rounded-3xl">
            <button
              onClick={() => setExtendModal({ show: false, licenseId: null })}
              className="absolute right-4 top-4 p-2 text-white/40 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Clock size={24} className="text-teal-500" />
              Extend License Expiration
            </h3>
            <p className="text-sm opacity-60 mb-8 font-medium">
              Extend the active validity of this node's cryptographic key by selecting one of the durations below:
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: '+30 Days', value: 30, desc: 'Standard Add-on' },
                { label: '+90 Days', value: 90, desc: 'Quarterly Extension' },
                { label: '+180 Days', value: 180, desc: 'Half-Year Renewal' },
                { label: '+1 Year', value: 365, desc: 'Full Year Renewal' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => extendLicense(opt.value)}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-teal-500 hover:bg-teal-500/10 transition-all text-left group"
                >
                  <div className="font-bold text-lg group-hover:text-teal-500">{opt.label}</div>
                  <div className="text-[10px] opacity-40 uppercase tracking-wider">{opt.desc}</div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setExtendModal({ show: false, licenseId: null })}
              className="w-full mt-8 py-3 rounded-xl border border-white/10 font-bold hover:bg-white/5 transition-all text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SystemAdmin;
