import React, { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { authService, customChatbotService } from "../services/api";
import {
  Home, Zap, Mic, BarChart3, Settings, LogOut,
  ChevronRight, Package,
  MessageCircle, FileText, Users, Radio, ShoppingCart,
  Shirt, Car, ChevronDown, Cpu, Globe, Calculator, BookOpen, DollarSign, Activity,
  Target, TrendingUp
} from "lucide-react";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState("");
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [productivityOpen, setProductivityOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const [customBots, setCustomBots] = useState([]);

  useEffect(() => {
    setRole(authService.getRole());
    
    // Fetch custom bots linked to the current logged-in user
    const fetchUserBots = async () => {
      try {
        const res = await customChatbotService.myBots();
        setCustomBots(res.data || []);
      } catch (e) {
        console.error("Failed to load user custom chatbots in sidebar", e);
      }
    };
    fetchUserBots();
  }, []);

  const handleLogout = () => {
    authService.logout();
  };

  const NavItem = ({ to, icon: Icon, label, badge, exact = false }) => (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `nav-item ${isActive ? "active" : ""}`
      }
      onClick={() => setIsOpen(false)}
    >
      <Icon size={16} strokeWidth={2} />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="badge badge-danger text-xs px-1.5 py-0">{badge}</span>
      )}
    </NavLink>
  );

  const SectionLabel = ({ label }) => (
    <div className="section-title px-3 mt-5 mb-2">{label}</div>
  );

  const SubMenu = ({ icon: Icon, label, isOpen: open, onToggle, children }) => (
    <div>
      <button
        onClick={onToggle}
        className="nav-item w-full justify-between"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={16} strokeWidth={2} />
          <span>{label}</span>
        </div>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--text-muted)" }}
        />
      </button>
      {open && (
        <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg"
        style={{ background: "var(--accent)", color: "white" }}
      >
        {isOpen ? "✕" : "☰"}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-30"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`sidebar fixed top-0 left-0 h-screen w-60 flex flex-col z-40
          transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <Cpu size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Productix</div>
              <div className="text-xs" style={{ color: "var(--accent)" }}>AI Co-Pilot</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">



          {role !== "org_admin" && (
            <>
              <SectionLabel label="Sector Plugins" />
              <SubMenu
                icon={Globe}
                label="Plugins"
                isOpen={pluginsOpen}
                onToggle={() => setPluginsOpen(!pluginsOpen)}
              >
                <NavItem to="/plugins/telco" icon={Users} label="Hr Productivity" />
                <NavItem to="/plugins/energy" icon={Zap} label="Energy productivity" />
                <NavItem to="/plugins/revenue" icon={DollarSign} label="Revenue productivity" />
              </SubMenu>
            </>
          )}

          <SectionLabel label="Productivity" />
          <SubMenu
            icon={BarChart3}
            label="Operations"
            isOpen={productivityOpen}
            onToggle={() => setProductivityOpen(!productivityOpen)}
          >
            {role === "org_admin" && (
              <>
                <NavItem to="/unit-manager" icon={Radio} label="Unit Tables" />
                <NavItem to="/formula-builder" icon={Calculator} label="Formula Builder" />
                <NavItem to="/formula-library" icon={BookOpen} label="Formula Library" />
              </>
            )}
            <NavItem to="/unit-data" icon={Radio} label={role === "org_admin" ? "Monitor Unit Data" : "Unit Data Entry"} />
          </SubMenu>

          <NavItem to="/kpi" icon={Target} label="KPI Dashboard" />
          <NavItem to="/visuals" icon={TrendingUp} label="Visual Analytics" />

          {role !== "org_admin" && (
            <>
              <SectionLabel label="Reports" />
              <SubMenu
                icon={FileText}
                label="Reports"
                isOpen={reportsOpen}
                onToggle={() => setReportsOpen(!reportsOpen)}
              >
                <NavItem to="/productivity/reports" icon={FileText} label="report and analytics" />
                <NavItem to="/productivity/ai" icon={Cpu} label="Ai Insights" />
                <NavItem to="/agent" icon={FileText} label="ai report agent" />
              </SubMenu>
            </>
          )}

          {role !== "org_admin" && role !== "system_admin" && (
            <SubMenu
              icon={MessageCircle}
              label="AI Chatbots"
              isOpen={chatbotOpen || location.pathname.startsWith('/chatbot')}
              onToggle={() => setChatbotOpen(!chatbotOpen)}
            >
              {customBots.length > 0 ? (
                customBots.map((bot) => (
                  <NavItem
                    key={bot.id}
                    to={`/chatbot/${bot.id}`}
                    icon={MessageCircle}
                    label={bot.name}
                  />
                ))
              ) : (
                <>
                  <NavItem to="/chatbot/productivity" icon={MessageCircle} label="Productivity Bot" />
                  <NavItem to="/chatbot/energy" icon={Zap} label="Energy Bot" />
                  <NavItem to="/chatbot/hr" icon={Users} label="Hr Bot" />
                  <NavItem to="/chatbot/process" icon={Activity} label="Process Bot" />
                </>
              )}
            </SubMenu>
          )}

          {/* Productivity Calc removed - Task 9 */}

          {(role === "org_admin" || role === "system_admin") && (
            <>
              <SectionLabel label="Admin" />
              {role === "org_admin" && <NavItem to="/org_admin" icon={Users} label="Org Admin" />}
              {role === "system_admin" && <NavItem to="/system_admin" icon={Settings} label="System Admin" />}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button onClick={handleLogout} className="nav-item w-full text-left" style={{ color: "var(--danger)" }}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
