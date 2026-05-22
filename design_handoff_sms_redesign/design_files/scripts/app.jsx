/* App shell — sidebar + topbar + routing + tweaks wiring */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#ed474a",
  "primary": "#640f0d",
  "density": "regular",
  "theme": "dark"
}/*EDITMODE-END*/;

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "posts", label: "Posts", icon: "posts", badge: "1" },
  { id: "queues", label: "Queues", icon: "queues" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  null,
  { id: "compose", label: "New post", icon: "edit", primary: true },
  { id: "import", label: "Import CSV", icon: "upload" },
  null,
  { id: "profiles", label: "Profiles", icon: "users" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "settings", label: "Settings", icon: "settings" },
];

const Sidebar = ({ route, go, collapsed, onToggle }) => {
  const activeId = route.id?.startsWith("queue") ? "queues"
    : route.id?.startsWith("post") ? "posts"
    : route.id === "admin-queues" ? "settings"
    : route.id === "settings-advanced" ? "settings"
    : route.id;

  return (
    <div className="sidebar">
      {/* Brand + collapse */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px 14px", borderBottom: "1px solid var(--border-subtle)", marginBottom: 10 }}>
        {!collapsed && (
          <div className="h-stack" style={{ gap: 8 }}>
            <Brandmark size={26} />
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>Clicks &amp; Mortar</div>
              <div className="muted" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>Scheduler v2.4</div>
            </div>
          </div>
        )}
        <IconButton icon="panelLeft" onClick={onToggle} />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto" }}>
        {NAV.map((item, i) => {
          if (!item) return <div key={i} style={{ height: 1, background: "var(--border-subtle)", margin: "8px 0" }} />;
          const active = activeId === item.id;
          return (
            <div
              key={item.id}
              className={`nav-item ${active ? "active" : ""}`}
              onClick={() => go(item.id)}
              title={collapsed ? item.label : undefined}
              style={collapsed ? { justifyContent: "center", padding: "8px 0" } : {}}
            >
              <Icon name={item.icon} size={16} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      background: active ? "rgba(255,255,255,0.18)" : "var(--brand-accent-soft)",
                      color: active ? "white" : "var(--brand-accent)",
                      fontSize: 10, fontWeight: 600,
                      padding: "1px 6px", borderRadius: 999,
                      fontFamily: "var(--font-mono)",
                    }}>{item.badge}</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div style={{ padding: "12px 6px 0", borderTop: "1px solid var(--border-subtle)" }}>
          <div className="h-stack" style={{ gap: 10, padding: "6px" }}>
            <Avatar name="[name redacted]" size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>[name redacted]</div>
              <div className="muted" style={{ fontSize: 10, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>[email redacted]</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Topbar = ({ route, go }) => {
  const [bellOpen, setBellOpen] = React.useState(false);
  const titles = {
    dashboard: "Dashboard",
    posts: "Posts",
    "post-edit": "Edit post",
    compose: "New post",
    import: "Import CSV",
    queues: "Queues",
    "queue-create": "New queue",
    "queue-edit": "Edit queue",
    "queue-detail": "Queue",
    "queue-posts": "Queue posts",
    calendar: "Calendar",
    profiles: "Profiles",
    notifications: "Notifications",
    settings: "Settings",
    "settings-advanced": "Settings · Advanced",
    "admin-queues": "Worker queue inspector",
  };
  const unread = NOTIFICATIONS.filter(n => !n.read).length;

  return (
    <div className="topbar">
      {/* Global search */}
      <div style={{ flex: 1, maxWidth: 480 }}>
        <Input icon="search" placeholder="Search posts, queues, profiles… ⌘ K" />
      </div>
      <div style={{ flex: 1 }} />

      {/* Quick actions */}
      <Button variant="ghost" size="sm" icon="plus" onClick={() => go("compose")}>New post</Button>

      {/* Bell */}
      <div style={{ position: "relative" }}>
        <button
          className="btn-icon"
          onClick={() => setBellOpen(!bellOpen)}
          style={{ position: "relative" }}
        >
          <Icon name="bell" size={16} />
          {unread > 0 && (
            <span style={{
              position: "absolute", top: 2, right: 2,
              background: "var(--brand-accent)",
              minWidth: 14, height: 14,
              padding: "0 3px", borderRadius: 999,
              fontSize: 9, fontWeight: 700,
              color: "white",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--bg-base)",
            }}>{unread}</span>
          )}
        </button>
        <BellFlyout open={bellOpen} onClose={() => setBellOpen(false)} go={go} />
      </div>

      <Avatar name="[name redacted]" size="sm" />
    </div>
  );
};

/* ============================================================
   Router (state-based)
   ============================================================ */
const Router = ({ route, go }) => {
  const id = route.id;

  if (id === "dashboard") return <Dashboard go={go} />;
  if (id === "posts") return <PostsList go={go} />;
  if (id === "post-edit") return <Composer go={go} postId={route.payload} />;
  if (id === "compose") return <Composer go={go} />;
  if (id === "import") return <Import go={go} />;
  if (id === "queues") return <QueuesList go={go} />;
  if (id === "queue-create") return <QueueCreate go={go} />;
  if (id === "queue-edit") return <QueueCreate go={go} queueId={route.payload} />;
  if (id === "queue-detail") return <QueueDetail go={go} queueId={route.payload} />;
  if (id === "queue-posts") return <QueuePosts go={go} queueId={route.payload} />;
  if (id === "calendar") return <Calendar go={go} />;
  if (id === "profiles") return <Profiles go={go} />;
  if (id === "notifications") return <Notifications go={go} />;
  if (id === "settings") return <Settings go={go} />;
  if (id === "settings-advanced") return <Settings go={go} initialTab="advanced" />;
  if (id === "admin-queues") return <AdminQueues go={go} />;

  return <Dashboard go={go} />;
};

/* ============================================================
   App
   ============================================================ */
const App = () => {
  const [authed, setAuthed] = React.useState(true);
  const [authScreen, setAuthScreen] = React.useState("login");
  const [route, setRoute] = React.useState({ id: "dashboard" });
  const [collapsed, setCollapsed] = React.useState(false);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Apply CSS variables for accent + density + theme
  React.useEffect(() => {
    document.documentElement.style.setProperty("--brand-accent", tweaks.accent);
    document.documentElement.style.setProperty("--brand-accent-hover", lighten(tweaks.accent, 10));
    document.documentElement.style.setProperty("--brand-accent-soft", tweaks.accent + "26");
    document.documentElement.style.setProperty("--brand-primary", tweaks.primary);
    document.documentElement.style.setProperty("--brand-primary-hover", lighten(tweaks.primary, 10));
    document.documentElement.style.setProperty("--brand-primary-soft", tweaks.primary + "33");
    document.documentElement.style.setProperty("--status-danger", tweaks.accent);
    document.documentElement.style.setProperty("--status-danger-soft", tweaks.accent + "20");
    document.documentElement.setAttribute("data-density", tweaks.density);
    document.documentElement.setAttribute("data-theme", tweaks.theme);
  }, [tweaks]);

  // Edit-mode protocol
  React.useEffect(() => {
    const h = (e) => {
      if (e.data?.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", h);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", h);
  }, []);

  const go = (id, payload) => {
    setRoute({ id, payload });
    // Scroll content to top on route change
    setTimeout(() => {
      const c = document.querySelector(".content");
      if (c) c.scrollTop = 0;
    }, 0);
  };

  // Expose for screenshot scripting + Claude Code introspection.
  React.useEffect(() => {
    window.__go = go;
    window.__setAuthed = setAuthed;
    window.__setAuthScreen = setAuthScreen;
    window.__setTweak = setTweak;
  });

  // Auth screens — unauthenticated states
  if (!authed) {
    return (
      <>
        {authScreen === "login" && <Login onSignIn={() => setAuthed(true)} go={setAuthScreen} />}
        {authScreen === "recover" && <Recover go={setAuthScreen} />}
        {authScreen === "setup" && <Setup go={() => { setAuthed(true); setAuthScreen("login"); }} />}
        <AuthSwitcher current={authScreen} onChange={setAuthScreen} onEnterApp={() => setAuthed(true)} />
      </>
    );
  }

  return (
    <>
      <div className="app-shell" data-collapsed={collapsed}>
        <Sidebar route={route} go={go} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <div className="main" data-screen-label={titleFor(route)}>
          <Topbar route={route} go={go} />
          <div className="content">
            <Router route={route} go={go} />
          </div>
        </div>
      </div>

      {/* Sign-out shortcut (visible while authed) — tucked bottom-right so it doesn't overlap the sidebar footer */}
      <button
        onClick={() => setAuthed(false)}
        style={{
          position: "fixed", bottom: 12, right: 12,
          fontSize: 10, color: "var(--text-muted)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          padding: "4px 8px", borderRadius: 4,
          opacity: 0.5, cursor: "pointer",
          zIndex: 10,
        }}
        title="View the unauthenticated screens"
        data-screenshot-hide
      >View login screens</button>

      {/* Tweaks panel */}
      {tweaksOpen && (
        <window.TweaksPanel
          title="Tweaks"
          onClose={() => setTweaksOpen(false)}
        >
          <window.TweakSection title="Brand">
            <window.TweakColor
              label="Accent color"
              hint="Buttons, hover, danger, selection."
              value={tweaks.accent}
              onChange={(v) => setTweak("accent", v)}
              options={["#ed474a", "#640f0d", "#d97706", "#3b82f6", "#10b981"]}
            />
            <window.TweakColor
              label="Primary (sidebar)"
              hint="Selected nav + brand surfaces."
              value={tweaks.primary}
              onChange={(v) => setTweak("primary", v)}
              options={["#640f0d", "#231f20", "#1e293b", "#2c1810", "#0f172a"]}
            />
          </window.TweakSection>
          <window.TweakSection title="Layout">
            <window.TweakRadio
              label="Density"
              value={tweaks.density}
              onChange={(v) => setTweak("density", v)}
              options={[{ value: "compact", label: "Compact" }, { value: "regular", label: "Regular" }, { value: "comfortable", label: "Roomy" }]}
            />
            <window.TweakRadio
              label="Theme"
              value={tweaks.theme}
              onChange={(v) => setTweak("theme", v)}
              options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
            />
          </window.TweakSection>
          <window.TweakSection title="Jump to screen">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[
                ["dashboard", "Dashboard"],
                ["posts", "Posts"],
                ["compose", "Composer"],
                ["import", "Import"],
                ["queues", "Queues"],
                ["queue-create", "Queue create"],
                ["queue-detail", "Queue detail"],
                ["calendar", "Calendar"],
                ["profiles", "Profiles"],
                ["notifications", "Notifs"],
                ["settings", "Settings"],
                ["admin-queues", "Bull Board"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { go(id, id === "queue-detail" ? "q1" : undefined); }}
                  style={{
                    padding: "5px 8px", borderRadius: 4,
                    background: route.id === id ? "var(--brand-accent-soft)" : "var(--bg-elevated)",
                    color: route.id === id ? "var(--brand-accent)" : "var(--text-secondary)",
                    fontSize: 11, fontWeight: 500, textAlign: "left",
                    cursor: "pointer",
                  }}
                >{label}</button>
              ))}
            </div>
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </>
  );
};

/* When unauthed, show a small switcher to navigate Login / Recover / Setup */
const AuthSwitcher = ({ current, onChange, onEnterApp }) => (
  <div data-screenshot-hide style={{
    position: "fixed", bottom: 16, right: 16,
    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
    borderRadius: "var(--r-md)", padding: 6,
    display: "flex", gap: 4, alignItems: "center",
    boxShadow: "var(--shadow-md)",
    fontSize: 11,
  }}>
    <span className="muted" style={{ padding: "0 6px" }}>View:</span>
    {["login", "recover", "setup"].map(s => (
      <button
        key={s}
        onClick={() => onChange(s)}
        style={{
          padding: "4px 8px", borderRadius: 4,
          background: current === s ? "var(--brand-accent-soft)" : "transparent",
          color: current === s ? "var(--brand-accent)" : "var(--text-muted)",
          fontWeight: 500, cursor: "pointer",
        }}
      >{s}</button>
    ))}
    <span style={{ width: 1, height: 14, background: "var(--border-subtle)", margin: "0 4px" }} />
    <button onClick={onEnterApp} style={{ fontSize: 11, color: "var(--brand-accent)", padding: "4px 8px", fontWeight: 500, cursor: "pointer" }}>Skip → app</button>
  </div>
);

/* Title for screen-label (used by [data-screen-label]) */
const titleFor = (route) => {
  const map = {
    dashboard: "Dashboard",
    posts: "Posts",
    "post-edit": "Edit post",
    compose: "New post",
    import: "Import CSV",
    queues: "Queues",
    "queue-create": "New queue",
    "queue-edit": "Edit queue",
    "queue-detail": "Queue detail",
    "queue-posts": "Queue posts",
    calendar: "Calendar",
    profiles: "Profiles",
    notifications: "Notifications",
    settings: "Settings",
    "settings-advanced": "Settings advanced",
    "admin-queues": "Bull Board",
  };
  return map[route.id] || "App";
};

/* Lighten a hex color */
function lighten(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 255) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 255) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 255) + Math.round(255 * percent / 100));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

window.App = App;

/* Mount */
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
