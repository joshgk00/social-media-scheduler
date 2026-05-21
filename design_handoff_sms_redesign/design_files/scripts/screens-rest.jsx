/* Calendar + Profiles + Notifications + Settings + Admin */

/* ============================================================
   Calendar — month/week/day with proper empty state on month
   ============================================================ */
const Calendar = ({ go }) => {
  const [view, setView] = React.useState("month");
  const [filter, setFilter] = React.useState("both");
  const [date, setDate] = React.useState(new Date(2026, 4, 21));

  // Some fake post times for the calendar
  const events = [
    { date: new Date(2026, 4, 22, 9), profile: "p2", text: "Built another local restaurant a site this week…", platform: "twitter" },
    { date: new Date(2026, 4, 22, 12), profile: "p2", text: "Daily tip #14: cash flow", platform: "twitter", queue: true },
    { date: new Date(2026, 4, 22, 15), profile: "p2", text: "Daily tip #15: design", platform: "twitter", queue: true },
    { date: new Date(2026, 4, 23, 9), profile: "p2", text: "Weekend round-up", platform: "twitter" },
    { date: new Date(2026, 4, 24, 12), profile: "p3", text: "We're now MMSDC certified", platform: "linkedin" },
    { date: new Date(2026, 4, 26, 8), profile: "p2", text: "Daily tip #16", platform: "twitter", queue: true },
    { date: new Date(2026, 4, 27, 12), profile: "p2", text: "Daily tip #17", platform: "twitter", queue: true },
    { date: new Date(2026, 4, 27, 15), profile: "p2", text: "Daily tip #18", platform: "twitter", queue: true },
    { date: new Date(2026, 4, 29, 12), profile: "p3", text: "Weekly promo", platform: "linkedin" },
  ];

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Scheduled posts and queue runs across all profiles."
        action={<Button variant="primary" icon="plus" onClick={() => go("compose")}>New post</Button>}
      />

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div className="h-stack" style={{ gap: 6 }}>
          <IconButton icon="chevronLeft" />
          <Button variant="outline" size="sm">Today</Button>
          <IconButton icon="chevronRight" />
          <span className="fw-semibold text-lg" style={{ marginLeft: 8, minWidth: 120 }}>
            {view === "month" && date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            {view === "week" && `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            {view === "day" && date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Filter: scheduled/queued/both — labeled, distinct from view switcher */}
        <div className="h-stack" style={{ gap: 6 }}>
          <span className="muted text-xs" style={{ fontWeight: 500 }}>Show:</span>
          <Segmented
            options={[{ value: "scheduled", label: "Scheduled" }, { value: "queued", label: "Queued" }, { value: "both", label: "Both" }]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <Select options={["All profiles", "Personal Twitter", "Clicks & Mortar", "CMW LinkedIn"]} style={{ width: 160 }} />
        {/* View switcher — labeled, distinct */}
        <div className="h-stack" style={{ gap: 6 }}>
          <span className="muted text-xs" style={{ fontWeight: 500 }}>View:</span>
          <Segmented
            options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }]}
            value={view}
            onChange={setView}
          />
        </div>
      </div>

      {view === "month" && <MonthView date={date} events={events} go={go} />}
      {view === "week" && <WeekView date={date} events={events} go={go} />}
      {view === "day" && <DayView date={date} events={events} go={go} />}
    </>
  );
};

const MonthView = ({ date, events, go }) => {
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  // Previous month tail
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, faded: true, date: new Date(year, month - 1, prevDays - i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d), isToday: d === 21 });
  while (cells.length < 42) cells.push({ day: cells.length - daysInMonth - firstDay + 1, faded: true });

  const eventsByDay = {};
  events.forEach(e => {
    const key = e.date.toDateString();
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(e);
  });

  return (
    <Card padded={false}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border-subtle)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} style={{
            padding: "8px 10px",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            fontWeight: 600,
            borderRight: d !== "Sat" ? "1px solid var(--border-subtle)" : "none",
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(96px, auto)" }}>
        {cells.map((c, i) => {
          const events = c.date ? (eventsByDay[c.date.toDateString()] || []) : [];
          return (
            <div key={i} style={{
              padding: 6,
              borderRight: (i + 1) % 7 !== 0 ? "1px solid var(--border-subtle)" : "none",
              borderBottom: i < 35 ? "1px solid var(--border-subtle)" : "none",
              background: c.isToday ? "var(--brand-accent-soft)" : "transparent",
              opacity: c.faded ? 0.35 : 1,
              minHeight: 96,
              overflow: "hidden",
              cursor: "pointer",
              transition: "background 0.12s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 22, height: 22,
                  fontSize: 12,
                  fontWeight: c.isToday ? 700 : 500,
                  color: c.isToday ? "var(--brand-accent)" : "var(--text-secondary)",
                  borderRadius: "50%",
                }}>{c.day}</span>
                {events.length > 0 && <span className="muted text-xs">{events.length}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {events.slice(0, 3).map((e, ei) => (
                  <div key={ei} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 10,
                    background: e.queue ? "var(--bg-elevated)" : "var(--brand-accent-soft)",
                    color: e.queue ? "var(--text-secondary)" : "var(--brand-accent)",
                    padding: "2px 5px", borderRadius: 3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    <PlatformGlyph p={e.platform} size={9} />
                    <span className="mono" style={{ fontSize: 9 }}>{e.date.getHours()}:{String(e.date.getMinutes()).padStart(2, "0")}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{e.text}</span>
                  </div>
                ))}
                {events.length > 3 && <span className="muted text-xs">+{events.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const WeekView = ({ date, events, go }) => {
  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am to 7pm
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <Card padded={false}>
      <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        <div style={{ borderBottom: "1px solid var(--border-subtle)" }} />
        {days.map(d => (
          <div key={d.toString()} style={{
            padding: "10px 8px",
            borderLeft: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
            background: d.toDateString() === date.toDateString() ? "var(--brand-accent-soft)" : "transparent",
          }}>
            <div className="muted text-xs">{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</div>
            <div className="fw-semibold" style={{ fontSize: 16, color: d.toDateString() === date.toDateString() ? "var(--brand-accent)" : "var(--text-primary)" }}>{d.getDate()}</div>
          </div>
        ))}
        {hours.map(h => (
          <React.Fragment key={h}>
            <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "right", borderBottom: "1px solid var(--border-subtle)" }}>
              {h <= 12 ? h : h - 12}{h < 12 ? "a" : "p"}
            </div>
            {days.map((d, i) => {
              const evs = events.filter(e => e.date.toDateString() === d.toDateString() && e.date.getHours() === h);
              return (
                <div key={i} style={{
                  height: 44,
                  borderLeft: "1px solid var(--border-subtle)",
                  borderBottom: "1px solid var(--border-subtle)",
                  padding: 2,
                  position: "relative",
                }}>
                  {evs.map((e, ei) => (
                    <div key={ei} style={{
                      background: e.queue ? "var(--bg-elevated)" : "var(--brand-accent)",
                      color: e.queue ? "var(--text-secondary)" : "white",
                      padding: "3px 6px",
                      borderRadius: 3,
                      fontSize: 10,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}>
                      <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>{e.date.getHours()}:{String(e.date.getMinutes()).padStart(2, "0")}</span> {e.text}
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
};

const DayView = ({ date, events, go }) => {
  const todayEvents = events.filter(e => e.date.toDateString() === date.toDateString());
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <Card padded={false}>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr" }}>
        {hours.map(h => {
          const evs = todayEvents.filter(e => e.date.getHours() === h);
          return (
            <React.Fragment key={h}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)", textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>
                {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
              </div>
              <div style={{ minHeight: 36, padding: 6, borderBottom: "1px solid var(--border-subtle)" }}>
                {evs.map((e, ei) => (
                  <div key={ei} style={{
                    background: e.queue ? "var(--bg-elevated)" : "var(--brand-accent)",
                    color: e.queue ? "var(--text-secondary)" : "white",
                    padding: "5px 8px", borderRadius: 4, fontSize: 12,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <PlatformGlyph p={e.platform} size={11} />
                    <span>{e.text}</span>
                  </div>
                ))}
                {evs.length === 0 && h >= 8 && h <= 20 && (
                  <div style={{
                    height: 24, borderRadius: 4,
                    border: "1px dashed var(--border-subtle)",
                    cursor: "pointer",
                  }} />
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Card>
  );
};

/* ============================================================
   Profiles
   ============================================================ */
const Profiles = ({ go }) => {
  const [filter, setFilter] = React.useState("all");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [openMenu, setOpenMenu] = React.useState(null);
  const filtered = PROFILES.filter(p => filter === "all" || p.platform === filter);

  return (
    <>
      <PageHeader
        title="Profiles"
        subtitle="Connected social accounts. Self-hosted OAuth — you own the credentials."
        action={<Button variant="primary" icon="plus" onClick={() => setConnectOpen(true)}>Connect profile</Button>}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Segmented
          options={[
            { value: "all", label: `All (${PROFILES.length})` },
            { value: "twitter", label: `Twitter / X (${PROFILES.filter(p => p.platform === "twitter").length})` },
            { value: "linkedin", label: `LinkedIn (${PROFILES.filter(p => p.platform === "linkedin").length})` },
            { value: "facebook", label: `Facebook (${PROFILES.filter(p => p.platform === "facebook").length})` },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtered.map(p => (
          <ProfileCard key={p.id} profile={p} menuOpen={openMenu === p.id} onMenuToggle={() => setOpenMenu(openMenu === p.id ? null : p.id)} onMenuClose={() => setOpenMenu(null)} />
        ))}
      </div>

      <ConnectProfileModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </>
  );
};

const ProfileCard = ({ profile, menuOpen, onMenuToggle, onMenuClose }) => {
  const pct = profile.rateMax > 0 ? (profile.rateUsed / profile.rateMax) * 100 : 0;
  const rateTone = pct > 80 ? "danger" : pct > 60 ? "warning" : "success";

  return (
    <div className="card" style={{ padding: 14 }}>
      {/* Identity row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={profile.name} size="lg" platform={profile.platform} />
          <div>
            <div className="fw-semibold" style={{ fontSize: 14 }}>{profile.name}</div>
            <div className="muted text-xs mono">{profile.handle}</div>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <IconButton icon="more" onClick={onMenuToggle} />
          <Menu open={menuOpen} onClose={onMenuClose} style={{ right: 0 }}>
            <MenuItem icon="edit">Edit profile</MenuItem>
            <MenuItem icon="refresh">Reconnect</MenuItem>
            <MenuItem icon="sliders">Edit rate limit</MenuItem>
            <div className="menu-divider" />
            <MenuItem icon="trash" danger>Delete profile</MenuItem>
          </Menu>
        </div>
      </div>

      {/* Status: identity / health / activity differentiated */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {profile.deprecated ? <Pill tone="warning">Deprecated</Pill> : profile.active ? <Pill tone="success" dot>Active</Pill> : <Pill tone="neutral">Inactive</Pill>}
        <Pill tone="neutral">{profile.platform === "twitter" ? "Twitter / X" : profile.platform === "linkedin" ? "LinkedIn" : "Facebook"}</Pill>
      </div>

      {/* Rate limit (the actually useful info) */}
      {profile.rateMax > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span className="muted text-xs">Rate limit</span>
            <span className="mono text-xs tabular">{profile.rateUsed} / {profile.rateMax}</span>
          </div>
          <div className="progress">
            <div style={{ width: `${pct}%`, background: `var(--status-${rateTone})` }} />
          </div>
        </div>
      ) : profile.platform !== "twitter" ? (
        <div className="muted text-xs" style={{ marginBottom: 10 }}>No rate cap on {profile.platform === "linkedin" ? "LinkedIn" : "Facebook"} (org-level limits only)</div>
      ) : null}

      {/* History — only show what's useful */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
        <span>{profile.lastPublished ? `Last: ${profile.lastPublished}` : "No posts yet"}</span>
        <span>{profile.nextScheduled ? `Next: ${profile.nextScheduled}` : "Nothing scheduled"}</span>
      </div>
    </div>
  );
};

const ConnectProfileModal = ({ open, onClose }) => {
  const [tab, setTab] = React.useState("linkedin");
  const [show, setShow] = React.useState({});
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Connect a social profile" subtitle="Authorize publishing access for one platform." width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Maybe later</Button>
          <Button variant="primary">
            {tab === "twitter" ? "Connect Twitter / X" : tab === "linkedin" ? "Sign in with LinkedIn" : "Sign in with Facebook"}
          </Button>
        </>
      }
    >
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {["linkedin", "facebook", "twitter"].map(p => (
          <div key={p} className={`tab ${tab === p ? "active" : ""}`} onClick={() => setTab(p)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <PlatformGlyph p={p} size={14} />
              {p === "twitter" ? "Twitter / X" : p === "linkedin" ? "LinkedIn" : "Facebook"}
            </span>
          </div>
        ))}
      </div>

      {tab === "linkedin" && (
        <div>
          <Banner tone="info" icon="info" title="One-click OAuth">
            You'll be redirected to LinkedIn to sign in. After signing in, pick a Personal Profile or Company Page to post as.
          </Banner>
        </div>
      )}
      {tab === "facebook" && (
        <div>
          <Banner tone="info" icon="info" title="One-click OAuth">
            You'll be redirected to Facebook to sign in. After signing in, pick which Page you want to post to.
          </Banner>
        </div>
      )}
      {tab === "twitter" && (
        <div>
          <Banner tone="warning" icon="info" title="Developer App credentials required">
            Twitter / X doesn't offer one-click OAuth for self-hosted apps. Create a Developer App, then paste its credentials below.
          </Banner>
          <div style={{ height: 14 }} />
          <div className="v-stack" style={{ gap: 10 }}>
            {[
              { key: "ck", label: "Consumer Key (API Key)" },
              { key: "cs", label: "Consumer Secret (API Secret)" },
              { key: "at", label: "Access Token" },
              { key: "ats", label: "Access Token Secret" },
            ].map(f => (
              <div key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="input-group">
                  <input type={show[f.key] ? "text" : "password"} className="input" placeholder="••••••••••" />
                  <button onClick={() => setShow({ ...show, [f.key]: !show[f.key] })} style={{ color: "var(--text-muted)" }}>
                    <Icon name={show[f.key] ? "eyeOff" : "eye"} size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="muted text-xs" style={{ marginTop: 12 }}>
            Generated under "Authentication Tokens" in your Twitter Developer App settings. <a style={{ color: "var(--brand-accent)" }}>Setup guide →</a>
          </div>
        </div>
      )}
    </Modal>
  );
};

/* ============================================================
   Notifications
   ============================================================ */
const Notifications = ({ go }) => {
  const [filter, setFilter] = React.useState("all");
  const filtered = NOTIFICATIONS.filter(n =>
    filter === "all" ? true : filter === "unread" ? !n.read : n.read
  );
  const unreadCount = NOTIFICATIONS.filter(n => !n.read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Publishing errors, token health, and queue events."
        action={
          <div className="h-stack">
            <Button variant="outline" icon="check" disabled={unreadCount === 0}>Mark all read</Button>
            <Button variant="outline" icon="trash">Clear read</Button>
          </div>
        }
      />

      <div className="h-stack" style={{ marginBottom: 12, gap: 8 }}>
        <Segmented
          options={[
            { value: "all", label: `All (${NOTIFICATIONS.length})` },
            { value: "unread", label: `Unread (${unreadCount})` },
            { value: "read", label: "Read" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Select options={["All types", "Errors", "Warnings", "Info"]} style={{ width: 140 }} />
      </div>

      <Card padded={false}>
        {filtered.map((n, i) => (
          <div key={n.id} style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto auto",
            gap: 12,
            padding: "12px 16px",
            borderBottom: i < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none",
            background: n.read ? "transparent" : "var(--bg-surface)",
            alignItems: "flex-start",
          }}>
            {/* Severity is encoded ONCE: a single colored dot */}
            <div style={{ paddingTop: 5 }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: `var(--status-${n.severity === "error" ? "danger" : n.severity})`,
              }} />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</span>
                {!n.read && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-accent)" }} />}
              </div>
              <div className="muted text-xs" style={{ marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
            </div>

            <div className="muted text-xs" style={{ paddingTop: 3, whiteSpace: "nowrap" }}>{n.time}</div>

            <div style={{ paddingTop: 1 }}>
              {n.severity === "error" && <Button size="sm" variant="outline">View post</Button>}
              {n.severity === "warning" && <Button size="sm" variant="outline">Reconnect</Button>}
              {n.severity === "info" && <IconButton icon="x" />}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <EmptyState icon="bell" title="You're all caught up" body="No notifications matching this filter." />
        )}
      </Card>
    </>
  );
};

const BellFlyout = ({ open, onClose, go }) => {
  if (!open) return null;
  const recent = NOTIFICATIONS.slice(0, 4);
  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0,
      width: 380, background: "var(--bg-base)",
      border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)",
      boxShadow: "var(--shadow-lg)", zIndex: 50,
    }}>
      <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="fw-semibold text-base">Notifications</span>
        <button style={{ fontSize: 11, color: "var(--brand-accent)", fontWeight: 500, cursor: "pointer" }}>Mark all read</button>
      </div>
      <div>
        {recent.map(n => (
          <div key={n.id} style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            background: n.read ? "transparent" : "var(--bg-surface)",
            cursor: "pointer",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: `var(--status-${n.severity === "error" ? "danger" : n.severity})`, marginTop: 5 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                <div className="muted text-xs" style={{ marginTop: 2 }}>{n.time}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => { onClose(); go("notifications"); }} style={{
        width: "100%", padding: "10px 14px",
        textAlign: "center", fontSize: 12, fontWeight: 500,
        color: "var(--brand-accent)", cursor: "pointer",
        background: "var(--bg-surface)",
      }}>View all →</button>
    </div>
  );
};

/* ============================================================
   Settings
   ============================================================ */
const Settings = ({ go, initialTab = "profile" }) => {
  const [tab, setTab] = React.useState(initialTab);
  React.useEffect(() => { setTab(initialTab); }, [initialTab]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Account, preferences, security, snippets, advanced." />

      {/* Unified tab list — Snippets is a peer */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { id: "profile", label: "Profile", icon: "users" },
          { id: "preferences", label: "Preferences", icon: "sliders" },
          { id: "security", label: "Security", icon: "shield" },
          { id: "notifications", label: "Notifications", icon: "bell" },
          { id: "snippets", label: "Snippets", icon: "snippet" },
          { id: "storage", label: "Storage", icon: "storage" },
          { id: "advanced", label: "Advanced", icon: "cpu" },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="h-stack" style={{ gap: 6 }}><Icon name={t.icon} size={13} /> {t.label}</span>
          </div>
        ))}
      </div>

      {tab === "profile" && <SettingsProfile />}
      {tab === "preferences" && <SettingsPreferences />}
      {tab === "security" && <SettingsSecurity />}
      {tab === "notifications" && <SettingsNotifications />}
      {tab === "snippets" && <SettingsSnippets />}
      {tab === "storage" && <SettingsStorage />}
      {tab === "advanced" && <SettingsAdvanced go={go} />}
    </>
  );
};

const SettingsProfile = () => (
  <Card padded title="Profile">
    <div className="h-stack" style={{ gap: 18, marginBottom: 18 }}>
      <Avatar name="[name redacted]" size="lg" />
      <div>
        <Button variant="outline" size="sm">Upload avatar</Button>
        <div className="muted text-xs" style={{ marginTop: 4 }}>JPEG or PNG, square preferred.</div>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Input label="First name" defaultValue="Josh" />
      <Input label="Last name" defaultValue="Slaughter" />
      <Input label="Username" defaultValue="josh" />
      <Input label="Email" defaultValue="[email redacted]" />
    </div>
    <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
      <Button variant="primary">Save profile</Button>
    </div>
  </Card>
);

const SettingsPreferences = () => (
  <Card padded title="Preferences">
    <div className="v-stack" style={{ gap: 14 }}>
      <Select label="Timezone" defaultValue="America/Detroit" options={["America/Detroit", "America/New_York", "UTC", "Europe/London"]} />
      <Select label="Date format" defaultValue="YYYY-MM-DD" options={["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"]} />
      <Select label="Entries per page" defaultValue="25" options={["10", "25", "50", "100"]} />
      <Select label="Default landing page" defaultValue="Dashboard" options={["Dashboard", "Posts", "Calendar"]} />
    </div>
    <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
      <Button variant="primary">Save preferences</Button>
    </div>
  </Card>
);

const SettingsSecurity = () => (
  <Card padded title="Security">
    <div className="v-stack" style={{ gap: 16 }}>
      <div className="h-stack" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="fw-semibold text-base">Password</div>
          <div className="muted text-xs">Last changed 3 months ago</div>
        </div>
        <Button variant="outline">Change password</Button>
      </div>
      <div className="divider" />
      <div className="h-stack" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h-stack" style={{ gap: 8 }}>
            <span className="fw-semibold text-base">Two-factor authentication</span>
            <Pill tone="warning">Off</Pill>
          </div>
          <div className="muted text-xs">Add a second factor at sign in.</div>
        </div>
        <Button variant="outline">Set up 2FA</Button>
      </div>
      <div className="divider" />
      <div className="h-stack" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="fw-semibold text-base">Security questions</div>
          <div className="muted text-xs">Used for account recovery.</div>
        </div>
        <Button variant="outline">Configure</Button>
      </div>
      <div className="divider" />
      <div>
        <div className="fw-semibold text-base" style={{ marginBottom: 4 }}>Active sessions</div>
        {/* Fixed: show the actual useful count, not the raw 3470 */}
        <div className="muted text-xs" style={{ marginBottom: 10 }}>1 active session (last 7 days). 3 stale sessions cleaned up automatically each night.</div>
        <div style={{ padding: "10px 12px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-sm)" }}>
          <div className="h-stack" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="text-base fw-medium">This session</div>
              <div className="muted text-xs">Detroit, MI · Last active just now · Chrome on macOS</div>
            </div>
            <Pill tone="success" dot>Current</Pill>
          </div>
        </div>
        <Button variant="outline" size="sm" style={{ marginTop: 10 }}>Sign out everywhere else</Button>
      </div>
      <div className="divider" />
      <div>
        <div className="fw-semibold text-base">Last login</div>
        <div className="muted text-xs">Today, 9:45 AM · America/Detroit · Detroit, MI</div>
      </div>
    </div>
  </Card>
);

const SettingsNotifications = () => {
  const [events, setEvents] = React.useState({
    publishFailed: { inApp: true, email: false },
    tokenExpiring: { inApp: true, email: true },
    reauthRequired: { inApp: true, email: true, required: true },
    tokenRevoked: { inApp: true, email: true, required: true },
    rateLimit: { inApp: true, email: false },
    queueFinished: { inApp: true, email: false },
    importComplete: { inApp: false, email: false },
  });
  return (
    <>
      <Banner tone="warning" icon="warning" title="Email notifications are off">
        SMTP isn't configured. Add <code className="mono">SMTP_HOST</code>, <code className="mono">SMTP_USER</code>, <code className="mono">SMTP_PASS</code>, <code className="mono">SMTP_FROM</code> env vars to enable. In-app notifications still work.
      </Banner>
      <div style={{ height: 14 }} />
      <Card padded title="Notification events">
        <div className="muted text-xs" style={{ marginBottom: 14 }}>Choose what gets surfaced and where.</div>
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th style={{ width: 100, textAlign: "center" }}>In-app</th>
              <th style={{ width: 100, textAlign: "center" }}>Email</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["publishFailed", "Publish failed", "A scheduled post failed all retry attempts."],
              ["tokenExpiring", "Token expiring soon", "A profile's token expires within 7 days."],
              ["reauthRequired", "Re-authentication required", "A profile needs you to log in again."],
              ["tokenRevoked", "Token revoked", "A profile's token was revoked by the platform."],
              ["rateLimit", "Rate limit reached", "Publishing pauses on the affected profile."],
              ["queueFinished", "Queue finished", "A queue ran out of posts (and isn't recycling)."],
              ["importComplete", "Bulk import complete", "A CSV import finished processing."],
            ].map(([key, label, hint]) => (
              <tr key={key}>
                <td>
                  <div className="fw-medium text-base">{label}</div>
                  <div className="muted text-xs">{hint}</div>
                  {events[key].required && <div className="muted text-xs" style={{ marginTop: 2 }}>Required — cannot be disabled</div>}
                </td>
                <td style={{ textAlign: "center" }}>
                  <Switch on={events[key].inApp} onChange={v => setEvents({ ...events, [key]: { ...events[key], inApp: events[key].required ? true : v } })} />
                </td>
                <td style={{ textAlign: "center", opacity: 0.4 }}>
                  <Switch on={events[key].email} onChange={() => {}} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
};

const SettingsSnippets = () => (
  <>
    <div className="h-stack" style={{ justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <div className="text-lg fw-semibold">Snippets</div>
        <div className="muted text-xs" style={{ marginTop: 2 }}>Reusable text + hashtag sets to insert into any post.</div>
      </div>
      <Button variant="primary" icon="plus">New snippet</Button>
    </div>
    <div style={{ marginBottom: 12 }}>
      <Input icon="search" placeholder="Search snippets…" />
    </div>
    <Card padded={false}>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Preview</th>
            <th>Updated</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {SNIPPETS.map(s => (
            <tr key={s.id} className="row-clickable">
              <td className="mono fw-medium">{s.name}</td>
              <td><Pill tone="neutral">{s.category}</Pill></td>
              <td className="muted text-base">{s.body}</td>
              <td className="muted text-xs">{s.updated}</td>
              <td><IconButton icon="more" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  </>
);

const SettingsStorage = () => (
  <Card padded title="Storage usage">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div>
        <div className="text-2xl fw-semibold tabular">0 MB</div>
        <div className="muted text-xs">of {<span className="mono">∞</span>} (self-hosted, your disk)</div>
      </div>
      <Icon name="storage" size={32} color="var(--text-dim)" />
    </div>
    <EmptyState icon="image" title="No media uploaded yet" body="When you attach images, GIFs, or videos to posts, they'll appear here. Stored on your own infrastructure." />
  </Card>
);

const SettingsAdvanced = ({ go }) => (
  <div className="v-stack" style={{ gap: 16 }}>
    <Card padded title="Worker queue inspector">
      <Banner tone="info" icon="info">
        The worker queue admin uses <strong>Bull Board</strong>, a separate operator UI that ships with its own styling. Useful for debugging stuck or failed background jobs.
      </Banner>
      <div style={{ height: 14 }} />
      <div className="h-stack" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="fw-medium text-base">Open Bull Board</div>
          <div className="muted text-xs">3 worker queues: <code className="mono">publish</code>, <code className="mono">notification</code>, <code className="mono">bulk-ops</code></div>
        </div>
        <Button variant="outline" icon="link" iconRight="arrowRight" onClick={() => go("admin-queues")}>Open in new tab</Button>
      </div>
    </Card>

    <Card padded title="System">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
        <Row label="Version" value="2.4.1" />
        <Row label="Database" value="PostgreSQL 16.2" />
        <Row label="Worker process" value={<Pill tone="success" dot>healthy</Pill>} />
        <Row label="Redis" value={<Pill tone="success" dot>healthy</Pill>} />
        <Row label="SMTP" value={<Pill tone="warning">not configured</Pill>} />
        <Row label="Uptime" value="14d 8h 22m" />
      </div>
    </Card>

    <Card padded title="Danger zone">
      <div className="v-stack" style={{ gap: 12 }}>
        <DangerRow title="Export all data" hint="Posts, queues, profiles, snippets — as JSON." action={<Button variant="outline" icon="download">Export</Button>} />
        <DangerRow title="Reset application" hint="Clear all data and start fresh. This can't be undone." action={<Button variant="danger">Reset…</Button>} />
      </div>
    </Card>
  </div>
);

const Row = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--border-subtle)" }}>
    <span className="muted">{label}</span>
    <span className="mono fw-medium">{value}</span>
  </div>
);

const DangerRow = ({ title, hint, action }) => (
  <div className="h-stack" style={{ justifyContent: "space-between" }}>
    <div>
      <div className="fw-medium text-base">{title}</div>
      <div className="muted text-xs" style={{ marginTop: 2 }}>{hint}</div>
    </div>
    {action}
  </div>
);

/* ============================================================
   Bull Board entry — properly framed as an external tool
   ============================================================ */
const AdminQueues = ({ go }) => (
  <>
    <PageHeader
      breadcrumb={[{ label: "Settings", onClick: () => go("settings") }, { label: "Advanced", onClick: () => go("settings-advanced") }, { label: "Worker queue inspector" }]}
      title="Worker queue inspector"
      subtitle="Background-job admin powered by Bull Board (BullMQ)."
    />
    <Banner tone="info" icon="info" title="You're about to leave the Clicks & Mortar UI">
      Bull Board is a third-party operator dashboard with its own styling and conventions. Use it to inspect, retry, and clean background jobs (publish, notification, bulk-ops). Bookmark this entry point if you visit often.
    </Banner>
    <div style={{ height: 16 }} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
      <BullCard name="publish" jobs="6 active · 44 done · 12 failed" tone="warning" />
      <BullCard name="notification" jobs="0 active · 18 done · 8,297 failed" tone="danger" alert="Likely a stuck handler — 830 pages of queue-empty failures" />
      <BullCard name="bulk-ops" jobs="0 active · 6 done · 0 failed" tone="success" />
    </div>
    <Card padded={false}>
      <div style={{ padding: 14, background: "#f5f3f1", color: "#231f20", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="info" size={14} color="#640f0d" />
        <span style={{ fontSize: 12 }}>Embedded Bull Board — light theme, separate design language. Press <Kbd>Esc</Kbd> to return here.</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="outline" icon="link">Open in new tab</Button>
      </div>
      <div style={{ height: 360, background: "#fafafa", display: "grid", placeItems: "center", color: "#666" }}>
        <div style={{ textAlign: "center" }}>
          <Icon name="cpu" size={32} />
          <div style={{ marginTop: 8, fontSize: 13 }}>Bull Board UI renders here</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#999" }}>(Light-themed third-party UI — not styled by this redesign)</div>
        </div>
      </div>
    </Card>
  </>
);

const BullCard = ({ name, jobs, tone, alert }) => (
  <div className="card" style={{ padding: 12 }}>
    <div className="h-stack" style={{ justifyContent: "space-between", marginBottom: 6 }}>
      <span className="mono fw-medium text-base">{name}</span>
      <Pill tone={tone} dot>{tone === "success" ? "healthy" : tone === "warning" ? "watch" : "issue"}</Pill>
    </div>
    <div className="muted text-xs">{jobs}</div>
    {alert && (
      <div style={{ marginTop: 8, padding: "6px 8px", background: "var(--status-danger-soft)", borderRadius: 4, fontSize: 11, color: "var(--status-danger)" }}>
        {alert}
      </div>
    )}
  </div>
);

Object.assign(window, { Calendar, Profiles, ConnectProfileModal, Notifications, BellFlyout, Settings, AdminQueues });
