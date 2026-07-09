import React, { useState, useEffect } from "react";
import {
  Plus, Trash2, Eye, EyeOff, Users,
  CheckCircle2, AlertCircle, X, Edit2, Save,
  Bot, Target, Settings2
} from "lucide-react";
import api from "../services/api";
import { adminUserService, customChatbotService } from "../services/api";

const OrgAdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [showPassword, setShowPassword] = useState({});
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState({ type: "", text: "" });

  const [availableUnits, setAvailableUnits] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUserForAssign, setSelectedUserForAssign] = useState(null);
  const [assignedUnitIds, setAssignedUnitIds] = useState([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [userLimit, setUserLimit] = useState(5);

  // Operator Credentials Modal (Task 3)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Custom Chatbots Management States (Task 8 & 7)
  const [customBots, setCustomBots] = useState([]);
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState(null);
  const [isSavingBot, setIsSavingBot] = useState(false);
  const [botForm, setBotForm] = useState({
    user_id: "",
    name: "",
    description: "",
    goals: [""]
  });

  useEffect(() => {
    fetchUsers();
    fetchUnits();
    fetchOrgDetails();
    fetchCustomBots();
  }, []);

  const fetchOrgDetails = async () => {
    try {
      const res = await api.get("/organizations/me");
      if (res.data && res.data.user_limit !== undefined) {
        setUserLimit(res.data.user_limit);
      }
    } catch (err) {
      console.error("Fetch organization details failed", err);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await api.get("/products/");
      setAvailableUnits(res.data || []);
    } catch (err) { console.error("Fetch units failed", err); }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users/");
      const orgUsers = res.data.filter(user => user.role === "org_user");
      
      const enrichedUsers = await Promise.all(orgUsers.map(async (u) => {
        try {
          const assignRes = await api.get(`/users/${u.id}/assigned-units`);
          return { ...u, assignedUnits: assignRes.data || [] };
        } catch {
          return { ...u, assignedUnits: [] };
        }
      }));
      setUsers(enrichedUsers);
    } catch (err) { console.error("Fetch users failed", err); }
  };

  // Custom Chatbots Fetching
  const fetchCustomBots = async () => {
    try {
      const res = await customChatbotService.list();
      setCustomBots(res.data || []);
    } catch (err) {
      console.error("Failed to fetch custom chatbots:", err);
    }
  };

  // Create Bot Opening
  const handleOpenCreateBot = () => {
    setEditingBot(null);
    setBotForm({
      user_id: users.length > 0 ? users[0].id : "",
      name: "",
      description: "",
      goals: [""]
    });
    setShowBotModal(true);
  };

  // Edit Bot Opening
  const handleOpenEditBot = (bot) => {
    setEditingBot(bot);
    
    let parsedGoals = [];
    if (bot.goals) {
      if (typeof bot.goals === 'string') {
        try { parsedGoals = JSON.parse(bot.goals); } catch { parsedGoals = []; }
      } else {
        parsedGoals = bot.goals;
      }
    }

    setBotForm({
      user_id: bot.user_id,
      name: bot.name,
      description: bot.description || "",
      goals: parsedGoals.length > 0 ? parsedGoals : [""]
    });
    setShowBotModal(true);
  };

  // Save/Update Custom Chatbot
  const handleSaveBot = async (e) => {
    e.preventDefault();
    if (!botForm.user_id || !botForm.name.trim()) {
      showMsg("error", "Bot name and linked operator are required.");
      return;
    }

    setIsSavingBot(true);
    try {
      const payload = {
        user_id: parseInt(botForm.user_id, 10),
        name: botForm.name.trim(),
        description: botForm.description.trim(),
        goals: botForm.goals.filter(g => g.trim())
      };

      if (editingBot) {
        await customChatbotService.update(editingBot.id, payload);
        showMsg("success", "Custom chatbot updated successfully");
      } else {
        await customChatbotService.create(payload);
        showMsg("success", "Custom chatbot created successfully");
      }
      setShowBotModal(false);
      fetchCustomBots();
    } catch (err) {
      showMsg("error", err.response?.data?.detail || "Failed to save chatbot");
    } finally {
      setIsSavingBot(false);
    }
  };

  // Delete Custom Chatbot
  const handleDeleteBot = async (id) => {
    if (!confirm("Are you sure you want to delete this custom chatbot?")) return;
    try {
      await customChatbotService.delete(id);
      showMsg("success", "Custom chatbot deleted");
      fetchCustomBots();
    } catch (err) {
      showMsg("error", "Failed to delete custom chatbot");
    }
  };

  // Edit User modal handlers (Task 3 Credentials update)
  const handleOpenEditModal = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      password: ""
    });
    setShowEditModal(true);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    setIsSavingUser(true);
    try {
      const payload = {};
      if (editForm.name.trim()) payload.name = editForm.name.trim();
      if (editForm.email.trim()) payload.email = editForm.email.trim();
      if (editForm.password.trim()) payload.password = editForm.password.trim();

      await adminUserService.editUser(editingUser.id, payload);
      showMsg("success", `${editingUser.name}'s credentials updated`);
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      showMsg("error", err.response?.data?.detail || "Failed to update user");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleOpenAssignModal = async (user) => {
    setSelectedUserForAssign(user);
    setAssignedUnitIds([]);
    setShowAssignModal(true);
    try {
      const res = await api.get(`/users/${user.id}/assigned-units`);
      setAssignedUnitIds(res.data.map(p => p.id));
    } catch (err) {
      console.error("Failed to load assigned units", err);
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedUserForAssign) return;
    setIsAssigning(true);
    try {
      await api.post(`/users/${selectedUserForAssign.id}/assign-units`, {
        product_ids: assignedUnitIds
      });
      showMsg("success", `Units assigned successfully to ${selectedUserForAssign.name}`);
      setShowAssignModal(false);
      fetchUsers();
    } catch (err) {
      showMsg("error", "Failed to assign units");
    } finally {
      setIsAssigning(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return;
    try {
      await api.post("/users/", { ...newUser, role: "org_user" });
      setNewUser({ name: "", email: "", password: "" });
      fetchUsers();
      showMsg("success", "User added successfully");
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Failed to add user";
      showMsg("error", errMsg);
    }
  };

  const deleteUser = async (id) => {
    try {
      await api.delete(`/users/${id}`);
      fetchUsers();
      showMsg("success", "User deleted");
    } catch (err) { showMsg("error", "Failed to delete user"); }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 5000);
  };

  const TableHeader = ({ icon: Icon, title }) => (
    <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
      <Icon size={20} style={{ color: 'var(--accent)' }} />
      {title}
    </h3>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', padding: '32px' }}>
      {/* Alert Message */}
      {message.text && (
        <div className={`fixed top-8 right-8 z-[100] p-4 rounded-xl border flex items-center gap-3 animate-in slide-in-from-right duration-300 ${message.type === 'success' ? 'bg-teal-500/10 border-teal-500 text-teal-500' : 'bg-red-500/10 border-red-500 text-red-500'
          }`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-semibold">{message.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black mb-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Admin Control
          </h1>
          <p style={{ color: 'var(--text-secondary)' }} className="text-lg">
            Operational backbone of your enterprise AI
          </p>
        </div>
        <div className="glass-card px-5 py-3 flex items-center gap-3">
          <Users size={20} className="text-teal-400" />
          <div className="text-right">
            <div className="text-xs text-white/40 font-bold uppercase tracking-wider">Operator Accounts</div>
            <div className="text-sm font-black text-white">{users.length} / {userLimit}</div>
          </div>
        </div>
      </div>

      {/* ── Section 1: Users/Operators ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        <div className="glass-card p-8 h-fit">
          <TableHeader icon={Plus} title="Invite Member" />
          <form onSubmit={addUser} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Full Name</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                disabled={users.length >= userLimit}
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-teal-500 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Email Address</label>
              <input
                type="email"
                placeholder="name@company.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                disabled={users.length >= userLimit}
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-teal-500 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1 relative">
              <label className="text-xs font-bold text-white/40 uppercase ml-1">Initial Password</label>
              <input
                type={showPassword["new"] ? "text" : "password"}
                placeholder="••••••••"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                disabled={users.length >= userLimit}
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-teal-500 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword({ ...showPassword, new: !showPassword["new"] })}
                disabled={users.length >= userLimit}
                className="absolute right-4 top-[38px] text-white/20 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {showPassword["new"] ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {users.length >= userLimit && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>Limit reached ({users.length}/{userLimit}). Contact Super Admin to increase limit.</span>
              </div>
            )}
            <button 
              type="submit" 
              disabled={users.length >= userLimit}
              className="btn-primary w-full py-4 mt-4 font-black disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {users.length >= userLimit ? "LIMIT REACHED" : "CREATE OPERATOR"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {users.length === 0 && (
            <div className="glass-card p-12 text-center text-white/20 border-dashed">
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-xl font-bold">No operators found in this organization</p>
            </div>
          )}
          {users.map((user) => (
            <div key={user.id} className="glass-card p-6 flex justify-between items-center group hover:border-teal-500/50 transition-all hover:translate-x-1">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-teal-500/10 text-teal-500 font-black text-2xl border border-teal-500/20">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-black text-lg" style={{ color: 'var(--text-primary)' }}>{user.name}</h4>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-black tracking-widest text-white/40 border border-white/10">OPERATOR</span>
                    {user.assignedUnits && user.assignedUnits.length > 0 ? (
                      user.assignedUnits.map(unit => (
                        <span key={unit.id} className="px-2 py-0.5 rounded-md bg-teal-500/10 text-[10px] font-bold text-teal-400 border border-teal-500/20">
                          {unit.name}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-[10px] font-bold text-red-400 border border-red-500/20">
                        No Units Assigned
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleOpenEditModal(user)}
                  className="px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white font-black text-xs transition-all"
                  title="Edit credentials"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleOpenAssignModal(user)}
                  className="px-3.5 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 hover:bg-teal-500 hover:text-black font-black text-xs transition-all"
                >
                  Assign Units
                </button>
                <button
                  onClick={() => setShowPassword({ ...showPassword, [user.id]: !showPassword[user.id] })}
                  className="p-3 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {showPassword[user.id] ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                <button
                  onClick={() => deleteUser(user.id)}
                  className="p-3 rounded-xl bg-red-500/5 text-red-500/40 hover:bg-red-500 hover:text-white transition-all"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Custom Chatbots Management (User Specific) ─ */}
      <div className="glass-card p-8 mb-10">
        <div className="flex justify-between items-center mb-6">
          <TableHeader icon={Bot} title="Custom Chatbots Configuration" />
          <button
            onClick={handleOpenCreateBot}
            disabled={users.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-40"
          >
            <Plus size={16} /> Create Custom Chatbot
          </button>
        </div>
        <p className="text-white/40 text-sm mb-6">
          Create user-specific custom chatbots and link them to their operator accounts. Linked operators will only see chatbots configured for them.
        </p>

        {customBots.length === 0 ? (
          <div className="p-12 text-center text-white/20 border-dashed border border-white/10 rounded-2xl bg-white/[0.01]">
            <Bot size={48} className="mx-auto mb-4 opacity-35" />
            <p className="text-md font-bold">No custom chatbots linked yet.</p>
            <p className="text-xs text-white/40 mt-1">Click "Create Custom Chatbot" above to build user-specific assistants.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {customBots.map((bot) => {
              const operator = users.find(u => u.id === bot.user_id);
              let parsedGoals = [];
              if (bot.goals) {
                if (typeof bot.goals === 'string') {
                  try { parsedGoals = JSON.parse(bot.goals); } catch { parsedGoals = []; }
                } else {
                  parsedGoals = bot.goals;
                }
              }

              return (
                <div key={bot.id} className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                        <Bot size={20} />
                      </div>
                      <div className="truncate">
                        <h4 className="font-bold text-white text-md truncate">{bot.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase font-black tracking-wider">
                          Linked: {operator ? operator.name : `ID: ${bot.user_id}`}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-white/50 line-clamp-3 mb-4 min-h-[48px] leading-relaxed">
                      {bot.description || "No description provided."}
                    </p>
                    {parsedGoals.length > 0 && (
                      <div className="space-y-1 mb-4">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest block">Goal Suggestions ({parsedGoals.length})</span>
                        <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto pr-1">
                          {parsedGoals.map((g, i) => (
                            <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-white/5 border border-white/5 text-white/60 font-medium whitespace-nowrap truncate max-w-[120px]" title={g}>
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-4 border-t border-white/5">
                    <button
                      onClick={() => handleOpenEditBot(bot)}
                      className="flex-1 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <Edit2 size={12} /> Edit Bot
                    </button>
                    <button
                      onClick={() => handleDeleteBot(bot.id)}
                      className="p-2 bg-red-500/5 text-red-500/40 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Units Modal */}
      {showAssignModal && selectedUserForAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAssignModal(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Assign Units</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-white/40 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-white/60 text-sm mb-4">
              Select which units <strong>{selectedUserForAssign.name}</strong> is allowed to access and manage:
            </p>
            <div className="space-y-2 mb-6 max-h-[40vh] overflow-y-auto pr-1">
              {availableUnits.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-4">No units found. Add units in "Unit Tables" first.</p>
              ) : (
                availableUnits.map(unit => {
                  const isChecked = assignedUnitIds.includes(unit.id);
                  return (
                    <label
                      key={unit.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:bg-white/5 ${isChecked ? 'bg-teal-500/5 border-teal-500/30' : 'bg-white/5 border-white/10'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignedUnitIds([...assignedUnitIds, unit.id]);
                          } else {
                            setAssignedUnitIds(assignedUnitIds.filter(id => id !== unit.id));
                          }
                        }}
                        className="w-4 h-4 rounded accent-teal-500 bg-white/10 border-white/10 outline-none"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-bold text-white">{unit.name}</span>
                        {unit.description && (
                          <span className="text-xs text-white/40 block">{unit.description}</span>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <button
              onClick={handleSaveAssignments}
              disabled={isAssigning}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-black font-black text-sm hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {isAssigning ? 'Saving...' : 'Save Assignments'}
            </button>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Edit Operator</h2>
                <p className="text-white/40 text-sm">Update credentials for <strong>{editingUser.name}</strong></p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-white/40 hover:text-white">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-white/40 uppercase">Full Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-blue-500/50 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-white/40 uppercase">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Email"
                  className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-blue-500/50 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-white/40 uppercase">New Password <span className="text-white/20 normal-case font-normal">(leave blank to keep unchanged)</span></label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="New password (optional)"
                  className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-blue-500/50 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white font-semibold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditUser}
                disabled={isSavingUser}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-black text-sm hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {isSavingUser ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Custom Chatbot Modal */}
      {showBotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBotModal(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSaveBot}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-white">{editingBot ? "Edit Custom Chatbot" : "Create Custom Chatbot"}</h2>
                  <p className="text-white/40 text-sm">Configure a unique chatbot and assign it to an operator</p>
                </div>
                <button type="button" onClick={() => setShowBotModal(false)} className="text-white/40 hover:text-white">
                  <X size={22} />
                </button>
              </div>

              <div className="space-y-5">
                {/* User Linking Dropdown */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-white/40 uppercase">Assign to Operator *</label>
                  <select
                    value={botForm.user_id}
                    onChange={(e) => setBotForm({ ...botForm, user_id: e.target.value })}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500/50 outline-none text-sm"
                    required
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id} className="bg-slate-900">{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>

                {/* Bot Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-white/40 uppercase">Chatbot Name *</label>
                  <input
                    type="text"
                    value={botForm.name}
                    onChange={(e) => setBotForm({ ...botForm, name: e.target.value })}
                    placeholder="e.g. Opex Optimizer, Telecom Support..."
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500/50 outline-none text-sm"
                    required
                  />
                </div>

                {/* Persona Description */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-white/40 uppercase">Bot Persona / Expertise Description</label>
                  <textarea
                    value={botForm.description}
                    onChange={(e) => setBotForm({ ...botForm, description: e.target.value })}
                    placeholder="Describe how this assistant behaves and what it is expert in (e.g. telecom operations)..."
                    rows={4}
                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500/50 outline-none resize-none text-sm"
                  />
                </div>

                {/* Goals */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-white/40 uppercase block">Analysis Goal Suggestions (Max 8)</label>
                  {botForm.goals.map((goal, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-white/30 text-xs font-bold w-4 text-right shrink-0">{idx + 1}.</span>
                      <input
                        type="text"
                        value={goal}
                        onChange={(e) => {
                          const updated = [...botForm.goals];
                          updated[idx] = e.target.value;
                          setBotForm({ ...botForm, goals: updated });
                        }}
                        placeholder={`e.g. Suggest ways to reduce fuel cost`}
                        className="flex-1 p-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500/50 outline-none text-xs"
                      />
                      {botForm.goals.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = botForm.goals.filter((_, i) => i !== idx);
                            setBotForm({ ...botForm, goals: updated });
                          }}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {botForm.goals.length < 8 && (
                    <button
                      type="button"
                      onClick={() => setBotForm({ ...botForm, goals: [...botForm.goals, ""] })}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-xs font-semibold transition-all flex items-center gap-1.5 w-fit"
                    >
                      + Add Goal
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowBotModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white font-semibold text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBot}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-sm hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  {isSavingBot ? "Saving..." : editingBot ? "Save Changes" : "Create Chatbot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAdminDashboard;
