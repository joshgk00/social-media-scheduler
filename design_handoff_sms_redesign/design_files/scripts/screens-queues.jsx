/* Queues: list, create (with new Specific Times mode + preview), detail, edit, posts */

const QueuesList = ({ go }) => {
  const [openMenu, setOpenMenu] = React.useState(null);
  return (
    <>
      <PageHeader
        title="Queues"
        subtitle="Recurring publishing schedules that auto-fill from a backlog of posts."
        action={<Button variant="primary" icon="plus" onClick={() => go("queue-create")}>New queue</Button>}
      />

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Input icon="search" placeholder="Search queues…" />
        </div>
        <Segmented options={["All", "Active", "Paused"]} value="All" onChange={() => {}} />
      </div>

      <div className="card" style={{ overflow: "visible" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Queue</th>
              <th>Profile</th>
              <th>Cadence</th>
              <th>Posts</th>
              <th>Status</th>
              <th>Next run</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {QUEUES.map(q => {
              const prof = findProfile(q.profile);
              return (
                <tr key={q.id} className="row-clickable" onClick={() => go("queue-detail", q.id)}>
                  <td>
                    <div className="fw-medium">{q.name}</div>
                    <div className="muted text-xs" style={{ marginTop: 2 }}>Last run {q.lastPublished}</div>
                  </td>
                  <td>
                    <div className="h-stack" style={{ gap: 8 }}>
                      <PlatformGlyph p={prof.platform} size={16} />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{prof.name}</span>
                        <span className="muted text-xs mono">{prof.handle}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <CadenceLabel queue={q} />
                  </td>
                  <td>
                    <span className="mono tabular">{q.posts}</span>
                  </td>
                  <td><StatusPill status={q.status} /></td>
                  <td className="muted text-xs">{q.nextRun}</td>
                  <td onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
                    <IconButton icon="more" onClick={() => setOpenMenu(openMenu === q.id ? null : q.id)} />
                    <Menu open={openMenu === q.id} onClose={() => setOpenMenu(null)} style={{ right: 0, top: "100%" }}>
                      <MenuItem icon="posts" onClick={() => go("queue-posts", q.id)}>View posts</MenuItem>
                      <MenuItem icon="edit" onClick={() => go("queue-edit", q.id)}>Edit queue</MenuItem>
                      <MenuItem icon="copy">Copy configuration</MenuItem>
                      <MenuItem icon={q.status === "active" ? "pause" : "play"}>{q.status === "active" ? "Pause queue" : "Resume queue"}</MenuItem>
                      <div className="menu-divider" />
                      <MenuItem icon="trash" danger>Delete queue</MenuItem>
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {QUEUES.length === 0 && (
          <EmptyState icon="queues" title="No queues yet" body="Queues let you fill a posting schedule with a backlog of posts that auto-publish on a recurring cadence." action={<Button variant="primary" icon="plus" onClick={() => go("queue-create")}>Create your first queue</Button>} />
        )}
      </div>
    </>
  );
};

const CadenceLabel = ({ queue }) => {
  if (queue.interval === "specific-times") {
    return (
      <div>
        <span className="mono text-xs">{queue.times.join(" · ")}</span>
        <div className="muted text-xs">{queue.days.length === 5 ? "Weekdays" : queue.days.join(", ")}</div>
      </div>
    );
  }
  if (queue.interval === "fixed") {
    return <span className="text-xs">Every {queue.every}</span>;
  }
  return <span className="text-xs">{queue.every} after last publish</span>;
};

/* ============================================================
   Queue Create — with the new Specific Times mode + live preview
   This is the heaviest IA fix in the redesign.
   ============================================================ */
const QueueCreate = ({ go, queueId, breadcrumb }) => {
  const editing = queueId && findQueue(queueId);
  const [name, setName] = React.useState(editing?.name || "");
  const [profile, setProfile] = React.useState(editing?.profile || "");
  const [mode, setMode] = React.useState(editing?.interval || "specific-times");
  const [times, setTimes] = React.useState(editing?.times || ["08:00", "12:00", "15:00"]);
  const [days, setDays] = React.useState(editing?.days || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [every, setEvery] = React.useState(4);
  const [unit, setUnit] = React.useState("hours");
  const [hourWindows, setHourWindows] = React.useState([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  const [startDate, setStartDate] = React.useState("");
  const [recycle, setRecycle] = React.useState(false);

  const toggleDay = (d) => {
    setDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a,b) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(a) - ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(b)));
  };
  const toggleHour = (h) => {
    setHourWindows(hourWindows.includes(h) ? hourWindows.filter(x => x !== h) : [...hourWindows, h].sort((a,b) => a - b));
  };

  /* --- LIVE PREVIEW: next 5 publish times --- */
  const previewTimes = React.useMemo(() => {
    const result = [];
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wantedDays = new Set(days.map(d => dayMap[d]));
    let cursor = new Date(2026, 4, 21, 11, 0); // Thursday May 21, 11am

    const addTimes = () => {
      if (result.length >= 5) return;
      const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][cursor.getDay()];
      const isWeekday = wantedDays.has(cursor.getDay());

      if (mode === "specific-times") {
        if (isWeekday) {
          for (const t of times) {
            const [h, m] = t.split(":").map(Number);
            const candidate = new Date(cursor); candidate.setHours(h, m, 0, 0);
            if (candidate > cursor && result.length < 5) result.push(candidate);
          }
        }
      } else if (mode === "fixed") {
        if (isWeekday) {
          for (let h = 0; h < 24; h++) {
            if (h % every !== 0) continue;
            if (!hourWindows.includes(h)) continue;
            const candidate = new Date(cursor); candidate.setHours(h, 0, 0, 0);
            if (candidate > cursor && result.length < 5) result.push(candidate);
          }
        }
      } else if (mode === "variable") {
        if (isWeekday) {
          for (const h of hourWindows) {
            const candidate = new Date(cursor); candidate.setHours(h, 0, 0, 0);
            if (candidate > cursor && result.length < 5) result.push(candidate);
          }
        }
      }
    };

    addTimes();
    for (let i = 0; i < 14 && result.length < 5; i++) {
      cursor = new Date(cursor.getTime() + 86400000);
      cursor.setHours(0, 0, 0, 0);
      addTimes();
    }
    return result.slice(0, 5);
  }, [mode, times, days, every, unit, hourWindows]);

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb || [{ label: "Queues", onClick: () => go("queues") }, { label: editing ? "Edit queue" : "New queue" }]}
        title={editing ? `Edit ${editing.name}` : "New queue"}
        subtitle="Set a recurring schedule. Posts in this queue auto-publish on the cadence you define."
        action={
          <div className="h-stack">
            <Button variant="ghost" onClick={() => go("queues")}>Cancel</Button>
            <Button variant="primary">{editing ? "Save queue" : "Create queue"}</Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20 }}>
        {/* Left: form */}
        <div className="v-stack" style={{ gap: 14 }}>
          <Card padded>
            <Input label="Queue name" placeholder="e.g. Daily tips, Weekly promos" value={name} onChange={e => setName(e.target.value)} />
            <div style={{ height: 12 }} />
            <Select
              label="Social profile"
              value={profile}
              onChange={e => setProfile(e.target.value)}
              options={[{ value: "", label: "Select a profile…" }, ...PROFILES.filter(p => p.active).map(p => ({ value: p.id, label: `${p.name} — ${p.handle}` }))]}
            />
          </Card>

          {/* The schedule card — biggest IA fix */}
          <Card title="When should this queue publish?" padded>
            {/* Mode picker — three clear modes */}
            <div className="muted text-xs" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Schedule mode
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <ModeCard
                selected={mode === "specific-times"}
                onClick={() => setMode("specific-times")}
                icon="clock"
                title="Specific times"
                hint="Pick days and exact times. E.g. Mon–Fri at 8am, noon, 3pm."
                recommended
              />
              <ModeCard
                selected={mode === "fixed"}
                onClick={() => setMode("fixed")}
                icon="grid"
                title="Fixed interval"
                hint="Clock-aligned slots: every 4h fires at 0/4/8/12/16/20."
              />
              <ModeCard
                selected={mode === "variable"}
                onClick={() => setMode("variable")}
                icon="refresh"
                title="Variable interval"
                hint="N hours after the last publish, regardless of clock."
              />
            </div>

            <div style={{ height: 18 }} />

            {/* Mode-specific config */}
            {mode === "specific-times" && (
              <div className="v-stack" style={{ gap: 14 }}>
                <div>
                  <div className="field-label">Publish times</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {times.map((t, i) => (
                      <div key={i} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 4px 4px 10px",
                        background: "var(--bg-elevated)",
                        borderRadius: "var(--r-sm)",
                        border: "1px solid var(--border-default)",
                      }}>
                        <input
                          type="time"
                          value={t}
                          onChange={e => setTimes(times.map((x, idx) => idx === i ? e.target.value : x))}
                          style={{
                            background: "transparent", border: "none", color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)", fontSize: 12,
                            width: 70, outline: "none",
                          }}
                        />
                        <button
                          onClick={() => setTimes(times.filter((_, idx) => idx !== i))}
                          style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", borderRadius: 3 }}
                        ><Icon name="x" size={11} /></button>
                      </div>
                    ))}
                    <button
                      onClick={() => setTimes([...times, "18:00"])}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "var(--r-sm)",
                        border: "1px dashed var(--border-strong)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        fontSize: 12, fontWeight: 500,
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                    ><Icon name="plus" size={11} /> Add time</button>
                  </div>
                </div>
                <DayPicker days={days} onToggle={toggleDay} />
              </div>
            )}

            {mode === "fixed" && (
              <div className="v-stack" style={{ gap: 14 }}>
                <div className="h-stack" style={{ alignItems: "flex-end" }}>
                  <span className="text-base">Every</span>
                  <Input type="number" value={every} onChange={e => setEvery(+e.target.value)} style={{ width: 72 }} />
                  <Select value={unit} onChange={e => setUnit(e.target.value)} options={["hours", "minutes"]} />
                </div>
                <DayPicker days={days} onToggle={toggleDay} />
                <HourWindows hours={hourWindows} onToggle={toggleHour} onSelectAll={() => setHourWindows(Array.from({length: 24}, (_, i) => i))} onClear={() => setHourWindows([])} />
              </div>
            )}

            {mode === "variable" && (
              <div className="v-stack" style={{ gap: 14 }}>
                <div className="h-stack" style={{ alignItems: "flex-end" }}>
                  <span className="text-base">Wait</span>
                  <Input type="number" value={every} onChange={e => setEvery(+e.target.value)} style={{ width: 72 }} />
                  <Select value={unit} onChange={e => setUnit(e.target.value)} options={["hours", "minutes", "days"]} />
                  <span className="text-base muted">after each publish</span>
                </div>
                <DayPicker days={days} onToggle={toggleDay} />
                <HourWindows hours={hourWindows} onToggle={toggleHour} onSelectAll={() => setHourWindows(Array.from({length: 24}, (_, i) => i))} onClear={() => setHourWindows([])} />
              </div>
            )}
          </Card>

          <Card title="Advanced" padded>
            <Input
              label="Start date"
              icon="calendar"
              placeholder="Leave blank to start immediately"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <div style={{ height: 12 }} />
            <Switch on={recycle} onChange={setRecycle} label="Recycle posts" hint="When the queue runs out, start over from the first post." />
            <div style={{ height: 12 }} />
            <Textarea label="Internal notes" placeholder="Optional notes about this queue (not published)." />
          </Card>
        </div>

        {/* Right: live preview */}
        <div>
          <Card
            title={
              <div className="h-stack" style={{ gap: 6 }}>
                <Icon name="lightning" size={14} color="var(--brand-accent)" />
                <span>Live preview</span>
              </div>
            }
            padded
            style={{ position: "sticky", top: 0 }}
          >
            <div className="muted text-xs" style={{ marginBottom: 14 }}>
              Next 5 publish times based on your current settings.
            </div>
            <div className="v-stack" style={{ gap: 0 }}>
              {previewTimes.length === 0 && (
                <div className="text-base muted" style={{ padding: 12, textAlign: "center", background: "var(--bg-base)", borderRadius: "var(--r-sm)" }}>
                  Nothing scheduled — pick at least one day and one time.
                </div>
              )}
              {previewTimes.map((d, i) => (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: i < previewTimes.length - 1 ? "1px dashed var(--border-subtle)" : "none",
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "var(--brand-accent-soft)", color: "var(--brand-accent)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
                  }}>{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                    <div className="muted text-xs mono">
                      {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · America/Detroit
                    </div>
                  </div>
                  <span className="muted text-xs mono">
                    {(() => {
                      const diff = d - new Date(2026, 4, 21, 11, 0);
                      const hrs = Math.round(diff / 3600000);
                      if (hrs < 24) return `in ${hrs}h`;
                      const days = Math.floor(hrs / 24);
                      return `in ${days}d`;
                    })()}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
              <div className="muted text-xs">
                {mode === "specific-times" && `${days.length} ${days.length === 5 && days.every(d => ["Mon","Tue","Wed","Thu","Fri"].includes(d)) ? "weekdays" : "days"} × ${times.length} times = ~${days.length * times.length} posts/week`}
                {mode === "fixed" && `${hourWindows.filter(h => h % every === 0).length}× per day × ${days.length} days`}
                {mode === "variable" && `~${Math.floor(24 / every) * days.length} posts/week`}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

const ModeCard = ({ selected, onClick, icon, title, hint, recommended }) => (
  <button
    onClick={onClick}
    style={{
      textAlign: "left",
      padding: "12px",
      border: `1px solid ${selected ? "var(--brand-accent)" : "var(--border-default)"}`,
      borderRadius: "var(--r-md)",
      background: selected ? "var(--brand-accent-soft)" : "var(--bg-base)",
      cursor: "pointer",
      transition: "all 0.15s",
      position: "relative",
    }}
  >
    {recommended && (
      <span style={{
        position: "absolute", top: 8, right: 8,
        fontSize: 9, fontWeight: 600, color: "var(--brand-accent)",
        background: "var(--bg-base)",
        padding: "1px 5px", borderRadius: 3,
        letterSpacing: "0.05em",
      }}>RECOMMENDED</span>
    )}
    <Icon name={icon} size={16} style={{ marginBottom: 8, color: selected ? "var(--brand-accent)" : "var(--text-secondary)" }} />
    <div className="fw-semibold" style={{ fontSize: 13, marginBottom: 4 }}>{title}</div>
    <div className="muted text-xs" style={{ lineHeight: 1.4 }}>{hint}</div>
  </button>
);

const DayPicker = ({ days, onToggle }) => {
  const all = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div>
      <div className="field-label">Days of week</div>
      <div style={{ display: "flex", gap: 4 }}>
        {all.map(d => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              onClick={() => onToggle(d)}
              style={{
                width: 40, height: 32, borderRadius: "var(--r-sm)",
                border: `1px solid ${on ? "var(--brand-accent)" : "var(--border-default)"}`,
                background: on ? "var(--brand-accent)" : "var(--bg-base)",
                color: on ? "white" : "var(--text-secondary)",
                fontSize: 11, fontWeight: 500,
                cursor: "pointer",
              }}
            >{d}</button>
          );
        })}
        <button
          onClick={() => {
            // Toggle weekdays only
            const wd = ["Mon","Tue","Wed","Thu","Fri"];
            const isWd = wd.every(d => days.includes(d)) && days.length === 5;
            if (isWd) wd.forEach(d => onToggle(d));
            else wd.forEach(d => { if (!days.includes(d)) onToggle(d); });
          }}
          style={{
            marginLeft: 8, padding: "4px 10px", borderRadius: "var(--r-sm)",
            background: "transparent", border: "1px solid var(--border-default)",
            color: "var(--text-muted)", fontSize: 11, fontWeight: 500,
            cursor: "pointer",
          }}
        >Weekdays</button>
      </div>
    </div>
  );
};

const HourWindows = ({ hours, onToggle, onSelectAll, onClear }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span className="field-label" style={{ margin: 0 }}>Hour windows</span>
      <div className="h-stack" style={{ gap: 4 }}>
        <button onClick={onSelectAll} style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Select all</button>
        <span className="muted text-xs">·</span>
        <button onClick={onClear} style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Clear</button>
      </div>
    </div>
    <div className="field-hint" style={{ marginBottom: 8, marginTop: 0 }}>Only fire during the hours you check (your timezone).</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
      {Array.from({length: 24}, (_, h) => {
        const on = hours.includes(h);
        const label = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h-12}p`;
        return (
          <button
            key={h}
            onClick={() => onToggle(h)}
            style={{
              height: 30, borderRadius: "var(--r-xs)",
              border: `1px solid ${on ? "var(--brand-accent)" : "var(--border-default)"}`,
              background: on ? "var(--brand-accent-soft)" : "var(--bg-base)",
              color: on ? "var(--brand-accent)" : "var(--text-muted)",
              fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)",
              cursor: "pointer",
            }}
          >{label}</button>
        );
      })}
    </div>
  </div>
);

/* ============================================================
   Queue detail (overview) — used when clicking a queue
   ============================================================ */
const QueueDetail = ({ go, queueId }) => {
  const queue = findQueue(queueId);
  if (!queue) return null;
  const prof = findProfile(queue.profile);
  const posts = POSTS.filter(p => p.queueId === queue.id);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Queues", onClick: () => go("queues") }, { label: queue.name }]}
        title={
          <span className="h-stack" style={{ gap: 10 }}>
            <span>{queue.name}</span>
            <StatusPill status={queue.status} />
          </span>
        }
        action={
          <div className="h-stack">
            <Button variant="outline" icon={queue.status === "active" ? "pause" : "play"}>{queue.status === "active" ? "Pause" : "Resume"}</Button>
            <Button variant="outline" icon="edit" onClick={() => go("queue-edit", queue.id)}>Edit queue</Button>
            <Button variant="primary" icon="plus">Add post</Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <StatCard label="Cadence" value="3×" sub="weekdays" tone="info" icon="clock" />
        <StatCard label="Posts in queue" value={String(queue.posts)} sub="ready to publish" tone="success" icon="posts" />
        <StatCard label="Next run" value={queue.nextRun} sub="—" tone="info" icon="clock" />
        <StatCard label="Profile" value={prof.name} sub={prof.handle} tone="info" icon="users" />
      </div>

      <Card title="Schedule" padded>
        <div className="muted text-xs" style={{ marginBottom: 8 }}>This queue publishes:</div>
        <div className="mono text-base" style={{ background: "var(--bg-base)", padding: "10px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--border-subtle)" }}>
          {queue.interval === "specific-times" && `Mon, Tue, Wed, Thu, Fri at ${queue.times.join(", ")}`}
          {queue.interval === "fixed" && `Every ${queue.every}`}
          {queue.interval === "variable" && `${queue.every} after each publish`}
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <div className="h-stack" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h2 className="text-lg fw-semibold">Posts in queue</h2>
        <Button variant="outline" size="sm" onClick={() => go("queue-posts", queue.id)}>View all {queue.posts} →</Button>
      </div>

      <Card>
        {posts.slice(0, 4).map((p, i) => (
          <div key={p.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
            padding: "10px 0", borderBottom: i < 3 ? "1px solid var(--border-subtle)" : "none",
          }}>
            <span className="mono text-xs muted">#{i + 1}</span>
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.text}</span>
            <StatusPill status={p.status} />
          </div>
        ))}
        {posts.length === 0 && (
          <EmptyState icon="posts" title="No posts in this queue yet" body="Add posts manually or import a CSV." action={<Button variant="primary" icon="plus">Add post</Button>} />
        )}
      </Card>
    </>
  );
};

/* Queue Posts (full listing under a queue) */
const QueuePosts = ({ go, queueId }) => {
  const queue = findQueue(queueId);
  if (!queue) return null;
  const posts = POSTS.filter(p => p.queueId === queue.id);
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Queues", onClick: () => go("queues") },
          { label: queue.name, onClick: () => go("queue-detail", queue.id) },
          { label: "Posts" },
        ]}
        title={
          <span className="h-stack" style={{ gap: 10 }}>
            <span>{queue.name} · posts</span>
            <StatusPill status={queue.status} />
          </span>
        }
        action={<Button variant="primary" icon="plus">Add post</Button>}
      />
      <Card>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 60 }}>Reorder</th>
              <th>Post</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => (
              <tr key={p.id}>
                <td className="mono muted text-xs">{i + 1}</td>
                <td>
                  <div className="h-stack" style={{ gap: 2 }}>
                    <IconButton icon="chevronUp" />
                    <IconButton icon="chevronDown" />
                  </div>
                </td>
                <td>{p.text}</td>
                <td><StatusPill status={p.status} /></td>
                <td><IconButton icon="more" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
};

Object.assign(window, { QueuesList, QueueCreate, QueueDetail, QueuePosts, CadenceLabel });
