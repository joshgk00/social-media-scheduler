/* Auth screens: Login, Recover, Setup */

const Login = ({ onSignIn, go }) => {
  const [email, setEmail] = React.useState("[email redacted]");
  const [password, setPassword] = React.useState("••••••••");
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-canvas)", padding: 24 }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Brandmark size={56} />
          <div className="fw-semibold text-lg" style={{ marginTop: 14 }}>Clicks &amp; Mortar Scheduler</div>
          <div className="muted text-base" style={{ marginTop: 2 }}>Self-hosted on your infrastructure</div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <Input label="Email" value={email} onChange={e => setEmail(e.target.value)} icon="users" autoFocus />
          <div style={{ height: 14 }} />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} icon="shield" />
          <div style={{ height: 18 }} />
          <Button variant="primary" style={{ width: "100%", height: 36 }} onClick={onSignIn}>Sign in</Button>
          <div style={{
            marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-subtle)",
            display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12,
          }}>
            <span className="muted">Need help signing in?</span>
            <a onClick={() => go("recover")} style={{ cursor: "pointer", color: "var(--brand-accent)", fontWeight: 500 }}>Recover account →</a>
          </div>
        </div>
        <div className="muted text-xs" style={{ textAlign: "center", marginTop: 18 }}>
          v2.4.1 · Docker · self-hosted
        </div>
      </div>
    </div>
  );
};

const Recover = ({ go }) => {
  const [step, setStep] = React.useState(1);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-canvas)", padding: 24 }}>
      <div style={{ width: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Brandmark size={44} />
        </div>
        <div className="card" style={{ padding: 22 }}>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {[1, 2, 3].map(n => (
              <div key={n} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: n <= step ? "var(--brand-accent)" : "var(--bg-active)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
          <div className="muted text-xs" style={{ marginBottom: 4 }}>STEP {step} OF 3</div>
          <div className="text-lg fw-semibold">{
            step === 1 ? "Confirm your email" :
            step === 2 ? "Answer security questions" :
            "Set a new password"
          }</div>
          <div className="muted text-base" style={{ marginTop: 4, marginBottom: 18 }}>{
            step === 1 ? "We'll match this against your account." :
            step === 2 ? "Two of the three you set up." :
            "12+ characters. Choose something memorable."
          }</div>
          {step === 1 && <Input label="Email" placeholder="you@example.com" autoFocus />}
          {step === 2 && (
            <div className="v-stack">
              <Input label="What was your first pet's name?" autoFocus />
              <Input label="What city were you born in?" />
            </div>
          )}
          {step === 3 && (
            <div className="v-stack">
              <Input label="New password" type="password" hint="12 character minimum" autoFocus />
              <Input label="Confirm new password" type="password" />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "space-between" }}>
            <Button variant="ghost" onClick={() => step === 1 ? go("login") : setStep(step - 1)}>
              {step === 1 ? "Back to sign in" : "Back"}
            </Button>
            <Button variant="primary" onClick={() => step < 3 ? setStep(step + 1) : go("login")}>
              {step < 3 ? "Continue" : "Reset password"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Setup = ({ go }) => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-canvas)", padding: 24 }}>
    <div style={{ width: 460 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <Brandmark size={48} />
      </div>
      <div className="card" style={{ padding: 24 }}>
        <div className="text-xl fw-semibold">Welcome aboard</div>
        <div className="muted text-base" style={{ marginTop: 4, marginBottom: 22 }}>
          One-time setup. You own this deployment — no SaaS layer.
        </div>
        <div className="v-stack">
          <Input label="Email" placeholder="you@yourdomain.com" />
          <Input label="Password" type="password" hint="12 character minimum" />
          <Input label="Confirm password" type="password" />
          <Select label="Timezone" options={["America/Detroit", "America/New_York", "UTC", "Europe/London"]} />
        </div>
        <div style={{ height: 18 }} />
        <Button variant="primary" style={{ width: "100%", height: 36 }} onClick={() => go("app")}>Create account</Button>
      </div>
    </div>
  </div>
);

/* Reusable brand mark */
const Brandmark = ({ size = 40 }) => (
  <div style={{
    width: size, height: size, borderRadius: 10,
    background: "var(--brand-primary)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "white", fontWeight: 700,
    fontSize: size * 0.42,
    position: "relative",
    boxShadow: "inset 0 -8px 16px rgba(0,0,0,0.25)",
  }}>
    <span style={{
      position: "absolute",
      inset: 4,
      borderRadius: 7,
      background: "linear-gradient(135deg, #7a1612 0%, #4a0a08 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      C&amp;M
    </span>
  </div>
);

/* ============================================================
   Dashboard
   ============================================================ */
const Dashboard = ({ go }) => {
  const upcoming = POSTS
    .filter(p => p.status === "scheduled" || p.status === "queued")
    .slice(0, 6);

  // 24h timeline blocks (hours)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const scheduledHours = [9, 12, 14, 15, 17, 20];
  const failedHours = [3];
  const now = 10;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What's queued up, what needs attention, what's healthy."
        action={
          <div className="h-stack">
            <Button variant="outline" icon="calendar" onClick={() => go("calendar")}>Open calendar</Button>
            <Button variant="primary" icon="plus" onClick={() => go("compose")}>New post</Button>
          </div>
        }
      />

      {/* Status strip — 4 dense health cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Scheduled (24h)" value="14" sub="across 3 profiles" tone="info" trend="+3 vs yesterday" icon="clock" />
        <StatCard label="Active queues" value="2" sub="of 3 total · 1 paused" tone="success" icon="queues" />
        <StatCard label="Errors (7d)" value="1" sub="needs attention" tone="danger" trend="↗ from 0" icon="error" onClick={() => go("notifications")} />
        <StatCard label="Rate headroom" value="91%" sub="across 4 active profiles" tone="success" icon="activity" />
      </div>

      {/* Main grid: timeline + queues */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Next 24 hours timeline */}
        <Card title="Next 24 hours" action={
          <div className="h-stack" style={{ gap: 8 }}>
            <Segmented options={["24h", "7d", "30d"]} value="24h" onChange={() => {}} />
          </div>
        }>
          <div style={{ position: "relative", padding: "8px 0 14px" }}>
            {/* Hour axis */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", height: 80, gap: 1, position: "relative" }}>
              {hours.map(h => {
                const scheduled = scheduledHours.includes(h);
                const failed = failedHours.includes(h);
                const isPast = h < now;
                return (
                  <div key={h} style={{
                    position: "relative",
                    background: isPast ? "var(--bg-surface)" : "var(--bg-elevated)",
                    borderRadius: 2,
                    opacity: isPast ? 0.4 : 1,
                  }}>
                    {scheduled && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "var(--brand-accent)",
                        borderRadius: 2,
                        opacity: isPast ? 0.4 : 0.9,
                      }} />
                    )}
                    {failed && (
                      <div style={{
                        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                        background: "repeating-linear-gradient(45deg, var(--brand-accent) 0, var(--brand-accent) 2px, transparent 2px, transparent 5px)",
                        borderRadius: 2,
                      }} />
                    )}
                  </div>
                );
              })}
              {/* Now marker */}
              <div style={{
                position: "absolute", top: -6, bottom: -10,
                left: `${(now / 24) * 100}%`,
                width: 2, background: "var(--text-primary)",
                pointerEvents: "none",
              }}>
                <span style={{
                  position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
                  fontSize: 10, color: "var(--text-primary)", fontWeight: 600,
                  background: "var(--bg-base)", padding: "1px 5px", borderRadius: 3,
                  border: "1px solid var(--border-subtle)",
                  whiteSpace: "nowrap",
                }}>NOW · 10:00</span>
              </div>
            </div>
            {/* Hour labels */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", marginTop: 8 }}>
              {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                <div key={h} className="muted text-xs mono">{String(h).padStart(2, "0")}:00</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: "var(--brand-accent)", borderRadius: 2 }} /> Scheduled
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: "repeating-linear-gradient(45deg, var(--brand-accent) 0, var(--brand-accent) 2px, transparent 2px, transparent 4px)", borderRadius: 2 }} /> Failed
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: "var(--bg-surface)", borderRadius: 2, border: "1px solid var(--border-default)" }} /> Past
              </span>
            </div>
          </div>

          {/* Upcoming list */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 4, paddingTop: 12 }}>
            <div className="muted text-xs" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 8 }}>
              Up next
            </div>
            <div className="v-stack" style={{ gap: 6 }}>
              {upcoming.slice(0, 4).map(p => {
                const prof = findProfile(p.profile);
                return (
                  <div key={p.id} style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr auto",
                    gap: 12, alignItems: "center",
                    padding: "6px 4px",
                    borderRadius: 4,
                  }}>
                    <div className="mono text-xs muted">{p.scheduledIn || "queued"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <PlatformGlyph p={prof.platform} size={14} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                        {p.text}
                      </span>
                    </div>
                    <StatusPill status={p.status} />
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Active queues + rate limits */}
        <div className="v-stack" style={{ gap: 16 }}>
          <Card title="Active queues" action={<a onClick={() => go("queues")} style={{ fontSize: 12, color: "var(--brand-accent)", cursor: "pointer" }}>All queues →</a>}>
            <div className="v-stack" style={{ gap: 10 }}>
              {QUEUES.map(q => (
                <div key={q.id} style={{ display: "grid", gap: 4 }} onClick={() => go("queue-detail", q.id)} className="row-clickable" >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlatformGlyph p={findProfile(q.profile).platform} size={14} />
                      <span className="fw-medium" style={{ fontSize: 13 }}>{q.name}</span>
                    </div>
                    <StatusPill status={q.status} />
                  </div>
                  <div className="muted text-xs" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{q.posts} posts</span>
                    <span>Next: {q.nextRun}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Rate limits" action={<a style={{ fontSize: 12, color: "var(--text-muted)" }}>4 healthy</a>}>
            <div className="v-stack" style={{ gap: 10 }}>
              {PROFILES.filter(p => p.active && p.rateMax > 0).slice(0, 3).map(p => {
                const pct = (p.rateUsed / p.rateMax) * 100;
                const tone = pct > 80 ? "danger" : pct > 60 ? "warning" : "success";
                return (
                  <div key={p.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <PlatformGlyph p={p.platform} size={14} />
                        <span className="fw-medium" style={{ fontSize: 12 }}>{p.name}</span>
                      </span>
                      <span className="mono muted text-xs">{p.rateUsed}/{p.rateMax}</span>
                    </div>
                    <div className="progress">
                      <div style={{
                        width: `${pct}%`,
                        background: `var(--status-${tone})`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)", fontSize: 11 }} className="muted">
              All reset Jun 1 (10 days)
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

const StatCard = ({ label, value, sub, tone, trend, icon, onClick }) => (
  <div className="card" style={{ padding: 14, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
      <div className="muted text-xs" style={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      {icon && <div style={{ color: `var(--status-${tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "info"})`, opacity: 0.7 }}>
        <Icon name={icon} size={14} />
      </div>}
    </div>
    <div className="text-2xl fw-semibold tabular" style={{ marginBottom: 2 }}>{value}</div>
    <div className="muted text-xs">{sub}</div>
    {trend && <div className="text-xs" style={{ color: `var(--status-${tone === "danger" ? "danger" : "success"})`, marginTop: 4 }}>{trend}</div>}
  </div>
);

Object.assign(window, { Login, Recover, Setup, Dashboard, Brandmark });
