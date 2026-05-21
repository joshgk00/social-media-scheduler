/* Posts screens: list, composer, edit, import, bulk actions, snippet picker */

const PostsList = ({ go }) => {
  const [selected, setSelected] = React.useState(new Set());
  const [expanded, setExpanded] = React.useState(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState("all");

  const filtered = POSTS.filter(p => filterStatus === "all" || p.status === filterStatus);
  const allChecked = filtered.length > 0 && filtered.every(p => selected.has(p.id));

  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  return (
    <>
      <PageHeader
        title="Posts"
        subtitle="One-off and queued posts across all profiles."
        action={
          <div className="h-stack">
            <Button variant="outline" icon="upload" onClick={() => go("import")}>Import CSV</Button>
            <Button variant="primary" icon="plus" onClick={() => go("compose")}>New post</Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <Segmented
          options={[
            { value: "all", label: `All (${POSTS.length})` },
            { value: "scheduled", label: "Scheduled" },
            { value: "queued", label: "Queued" },
            { value: "draft", label: "Drafts" },
            { value: "failed", label: `Failed (${POSTS.filter(p => p.status === "failed").length})` },
          ]}
          value={filterStatus}
          onChange={setFilterStatus}
        />
        <div style={{ flex: 1 }}>
          <Input icon="search" placeholder="Search posts… ⌘ K" />
        </div>
        <Button variant="outline" icon="filter" size="sm">Profile</Button>
        <Button variant="outline" icon="hash" size="sm">Tags</Button>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div style={{
          background: "var(--brand-primary-soft)",
          border: "1px solid var(--brand-primary)",
          borderRadius: "var(--r-md)",
          padding: "8px 12px",
          marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div className="h-stack" style={{ gap: 14 }}>
            <span className="fw-medium" style={{ fontSize: 13 }}>{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>Clear</button>
          </div>
          <div style={{ position: "relative" }}>
            <Button variant="outline" size="sm" iconRight="chevronDown" onClick={() => setBulkOpen(!bulkOpen)}>Bulk actions</Button>
            <Menu open={bulkOpen} onClose={() => setBulkOpen(false)} style={{ right: 0, minWidth: 220 }}>
              <div className="menu-section-label">Publishing</div>
              <MenuItem icon="pause">Pause publishing</MenuItem>
              <MenuItem icon="play">Resume publishing</MenuItem>
              <div className="menu-divider" />
              <div className="menu-section-label">Edit</div>
              <MenuItem icon="hash">Modify tags…</MenuItem>
              <MenuItem icon="clock">Reschedule…</MenuItem>
              <div className="menu-divider" />
              <div className="menu-section-label">Export</div>
              <MenuItem icon="download">Export as CSV</MenuItem>
              <div className="menu-divider" />
              <div className="menu-section-label" style={{ color: "var(--brand-accent)" }}>Danger zone</div>
              <MenuItem icon="trash" danger>Delete {selected.size} posts</MenuItem>
            </Menu>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32, paddingRight: 0 }}>
                <Checkbox checked={allChecked} onChange={toggleAll} />
              </th>
              <th style={{ width: 28 }} />
              <th style={{ width: "auto" }}>Post</th>
              <th style={{ width: 180 }}>Profile</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 140 }}>When</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const prof = findProfile(p.profile);
              const isExpanded = expanded === p.id;
              return (
                <React.Fragment key={p.id}>
                  <tr className="row-clickable" style={{ background: selected.has(p.id) ? "var(--brand-primary-soft)" : "transparent" }}>
                    <td onClick={(e) => { e.stopPropagation(); toggle(p.id); }}>
                      <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td onClick={() => setExpanded(isExpanded ? null : p.id)}>
                      {p.status === "failed" ? (
                        <IconButton icon={isExpanded ? "chevronDown" : "chevronRight"} />
                      ) : null}
                    </td>
                    <td onClick={() => go("post-edit", p.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {p.status === "failed" && <Icon name="error" size={14} color="var(--status-danger)" />}
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.text}</span>
                      </div>
                      {p.tags?.length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                          {p.tags.map(t => (
                            <span key={t} className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>#{t}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <PlatformGlyph p={prof.platform} size={16} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{prof.name}</span>
                          <span className="muted text-xs mono">{prof.handle}</span>
                        </div>
                        {prof.deprecated && <Pill tone="warning">deprecated</Pill>}
                      </div>
                    </td>
                    <td><StatusPill status={p.status} /></td>
                    <td className="muted text-xs">
                      {p.scheduledIn || p.publishedAt || p.failedAt || (p.queueId ? `via ${findQueue(p.queueId)?.name}` : "—")}
                    </td>
                    <td>
                      <IconButton icon="more" />
                    </td>
                  </tr>
                  {isExpanded && p.status === "failed" && (
                    <tr style={{ background: "var(--bg-surface)" }}>
                      <td colSpan={7} style={{ padding: "12px 16px" }}>
                        <div style={{ display: "grid", gap: 12 }}>
                          <div>
                            <div className="muted text-xs" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Full text</div>
                            <div style={{ fontSize: 13 }}>{p.text}</div>
                          </div>
                          <Banner tone="danger" icon="error" title="Failure reason"
                            action={<Button size="sm" variant="outline" icon="refresh">Retry now</Button>}>
                            {p.error}
                          </Banner>
                          <div className="muted text-xs">
                            <strong>Publish history:</strong> No attempts logged yet. Last failure {p.failedAt}.
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <EmptyState icon="posts" title="No posts here yet" body="When you compose a post or import a CSV, it'll show up here." action={<Button variant="primary" icon="plus" onClick={() => go("compose")}>New post</Button>} />
        )}
      </div>
    </>
  );
};

/* ============================================================
   Composer (works for new + edit)
   ============================================================ */
const Composer = ({ go, postId, breadcrumb }) => {
  const editing = postId && POSTS.find(p => p.id === postId);
  const [profile, setProfile] = React.useState(editing?.profile || "");
  const [text, setText] = React.useState(editing?.text || "");
  const [thread, setThread] = React.useState(false);
  const [spinnable, setSpinnable] = React.useState(false);
  const [autoDestruct, setAutoDestruct] = React.useState(false);
  const [snippetOpen, setSnippetOpen] = React.useState(false);
  const [scheduleShortcut, setScheduleShortcut] = React.useState(null);

  const prof = findProfile(profile);
  const platform = prof?.platform || "twitter";
  const platformLimits = {
    twitter: 280,
    linkedin: 3000,
    facebook: 63206,
  };
  const limit = platformLimits[platform];

  // Generic labels based on platform
  const labels = {
    twitter: { textLabel: "Tweet text", previewLabel: "Tweet preview", placeholder: "What's happening?", entityPlural: "tweets" },
    linkedin: { textLabel: "Post text", previewLabel: "LinkedIn preview", placeholder: "Share an update with your network…", entityPlural: "posts" },
    facebook: { textLabel: "Post text", previewLabel: "Facebook preview", placeholder: "What's on your mind?", entityPlural: "posts" },
  }[platform];

  const renderSpinPreview = (text) => {
    if (!text || !text.includes("{")) return [text];
    const parts = text.split(/(\{[^}]+\})/);
    return [0, 1, 2].map(i =>
      parts.map(part => {
        const m = part.match(/^\{([^}]+)\}$/);
        if (!m) return part;
        const opts = m[1].split("|");
        return opts[i % opts.length];
      }).join("")
    );
  };

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb || [{ label: "Posts", onClick: () => go("posts") }, { label: editing ? "Edit post" : "New post" }]}
        title={editing ? "Edit post" : "New post"}
        action={
          <div className="h-stack">
            <Button variant="ghost" onClick={() => go("posts")}>Cancel</Button>
            <Button variant="outline">Save draft</Button>
            <Button variant="primary" iconRight="chevronDown">
              {scheduleShortcut ? `Schedule (${scheduleShortcut})` : "Schedule"}
            </Button>
          </div>
        }
      />

      {/* Two-col: form + right rail */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20 }}>
        {/* Left: text + media */}
        <div className="v-stack" style={{ gap: 16 }}>
          {/* Profile picker */}
          <Card padded={true}>
            <label className="field-label">Posting to</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PROFILES.filter(p => p.active).map(p => (
                <button
                  key={p.id}
                  onClick={() => setProfile(p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px 6px 6px",
                    borderRadius: "var(--r-sm)",
                    border: `1px solid ${profile === p.id ? "var(--brand-accent)" : "var(--border-default)"}`,
                    background: profile === p.id ? "var(--brand-accent-soft)" : "var(--bg-base)",
                    cursor: "pointer",
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                >
                  <Avatar name={p.name} platform={p.platform} size="sm" />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                    <div className="muted text-xs mono">{p.handle}</div>
                  </div>
                </button>
              ))}
            </div>
            {prof && (
              <div className="muted text-xs" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="info" size={12} />
                Posting as <strong style={{ color: "var(--text-secondary)" }}>{prof.name}</strong> on {platform === "twitter" ? "Twitter / X" : platform === "linkedin" ? "LinkedIn" : "Facebook"}
              </div>
            )}
          </Card>

          {/* Text composer */}
          <Card padded={true}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label className="field-label" style={{ marginBottom: 0 }}>{labels.textLabel}</label>
              <Switch on={thread} onChange={setThread} label={null} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Thread mode {platform !== "twitter" && "(Twitter only)"}</span>
            </div>
            <Textarea
              placeholder={labels.placeholder}
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ minHeight: 140, fontSize: 14, lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" variant="ghost" icon="image">Add media</Button>
                <Button size="sm" variant="ghost" icon="snippet" onClick={() => setSnippetOpen(true)}>Insert snippet</Button>
                <Button size="sm" variant="ghost" icon="sparkles">AI rewrite</Button>
              </div>
              <div className="mono text-xs muted tabular">
                <span style={{ color: text.length > limit ? "var(--brand-accent)" : "inherit" }}>{text.length}</span> / {limit}
              </div>
            </div>
          </Card>

          {/* Media drop */}
          <div style={{
            border: "1.5px dashed var(--border-strong)",
            borderRadius: "var(--r-md)",
            padding: "24px 20px",
            textAlign: "center",
            color: "var(--text-muted)",
            background: "var(--bg-surface)",
          }}>
            <Icon name="image" size={18} />
            <div style={{ marginTop: 8, fontSize: 13 }}>Drop images, GIFs, or video — or <a style={{ color: "var(--brand-accent)", textDecoration: "underline" }}>browse</a></div>
            <div className="muted text-xs" style={{ marginTop: 4 }}>
              {platform === "twitter" && "Up to 4 images (5 MB each) or 1 video (15 MB)"}
              {platform === "linkedin" && "Up to 9 images (10 MB each) or 1 video (200 MB)"}
              {platform === "facebook" && "Images and video"}
            </div>
          </div>

          {/* Spinnable text */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="fw-semibold" style={{ fontSize: 13, marginBottom: 4 }}>Spinnable text</div>
                <div className="muted text-xs" style={{ maxWidth: 380 }}>
                  Use <code className="mono" style={{ background: "var(--bg-elevated)", padding: "1px 4px", borderRadius: 3 }}>&#123;option1|option2&#125;</code> in your text. One variant is randomly chosen each time this post is published (great for recycled queues).
                </div>
              </div>
              <Switch on={spinnable} onChange={setSpinnable} />
            </div>
            {spinnable && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div className="muted text-xs" style={{ marginBottom: 6 }}>Preview — 3 random renderings:</div>
                <div className="v-stack" style={{ gap: 6 }}>
                  {renderSpinPreview(text || "Hello {there|friend|world}!").map((variant, i) => (
                    <div key={i} style={{
                      padding: "8px 10px",
                      background: "var(--bg-base)",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: 13,
                    }}>
                      <span className="mono text-xs muted">#{i + 1}</span> · {variant}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Auto-destruct */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="fw-semibold" style={{ fontSize: 13, marginBottom: 4 }}>Auto-destruct</div>
                <div className="muted text-xs">Automatically delete this post after a specified time.</div>
              </div>
              <Switch on={autoDestruct} onChange={setAutoDestruct} />
            </div>
            {autoDestruct && (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <Input type="number" defaultValue="24" style={{ width: 80 }} />
                <Select options={["hours", "days", "weeks"]} defaultValue="hours" style={{ flex: 1 }} />
              </div>
            )}
          </Card>
        </div>

        {/* Right rail: preview + schedule + tags + notes */}
        <div className="v-stack" style={{ gap: 16 }}>
          {/* Preview */}
          <Card title={labels.previewLabel}>
            <div style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-md)",
              padding: 12,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Avatar name={prof?.name || "??"} platform={platform} size="sm" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{prof?.name || "Select a profile"}</div>
                  <div className="muted text-xs mono">{prof?.handle || "—"}</div>
                </div>
              </div>
              <div style={{ minHeight: 60, color: text ? "var(--text-primary)" : "var(--text-muted)" }}>
                {text || `Your ${platform === "twitter" ? "tweet" : "post"} preview will appear here…`}
              </div>
            </div>
          </Card>

          {/* Schedule */}
          <Card title="Schedule">
            <div className="v-stack" style={{ gap: 8 }}>
              <Input icon="calendar" placeholder="Pick a date and time" defaultValue="Fri May 23, 9:00 AM" />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["In 1h", "Tonight 8pm", "Tomorrow 9am", "Next Mon 9am"].map(s => (
                  <button
                    key={s}
                    onClick={() => setScheduleShortcut(s)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "var(--r-sm)",
                      background: scheduleShortcut === s ? "var(--brand-accent-soft)" : "var(--bg-elevated)",
                      border: `1px solid ${scheduleShortcut === s ? "var(--brand-accent)" : "transparent"}`,
                      fontSize: 11, fontWeight: 500,
                      color: scheduleShortcut === s ? "var(--brand-accent)" : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="muted text-xs">Times in America/Detroit</div>
            </div>
          </Card>

          <Card title="Tags">
            <Input icon="hash" placeholder="Add tag…" />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
              {["blog", "small-biz", "features"].map(t => (
                <Pill key={t} tone="neutral">#{t} <span style={{ marginLeft: 4, opacity: 0.6 }}>×</span></Pill>
              ))}
            </div>
          </Card>

          <Card title="Internal notes">
            <Textarea placeholder="Not published. Just for you." style={{ minHeight: 60, fontSize: 12 }} />
          </Card>
        </div>
      </div>

      {/* Snippet picker modal */}
      <Modal
        open={snippetOpen}
        onClose={() => setSnippetOpen(false)}
        title="Insert snippet"
        subtitle="Reusable text and link blocks."
        width={520}
      >
        <Input icon="search" placeholder="Search snippets…" autoFocus />
        <div style={{ marginTop: 12 }}>
          {SNIPPETS.map(s => (
            <div
              key={s.id}
              onClick={() => { setText(text + (text ? " " : "") + s.body); setSnippetOpen(false); }}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--r-sm)",
                cursor: "pointer",
                marginBottom: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="fw-medium mono text-base">{s.name}</div>
                <Pill tone="neutral">{s.category}</Pill>
              </div>
              <div className="muted text-xs" style={{ marginTop: 4 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};

/* ============================================================
   Import Posts (numbered steps preserved)
   ============================================================ */
const Import = ({ go }) => {
  const [target, setTarget] = React.useState("scheduled");
  const [profile, setProfile] = React.useState("");
  const [queue, setQueue] = React.useState("");
  const [file, setFile] = React.useState(null);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Posts", onClick: () => go("posts") }, { label: "Import CSV" }]}
        title="Import posts from CSV"
        subtitle="Upload a CSV to create scheduled posts or append to an existing queue."
      />

      <div style={{ maxWidth: 760 }}>
        {/* Step 1 — Target */}
        <Card>
          <Step number={1} title="Where should imported posts go?" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <ChoiceCard
              selected={target === "scheduled"}
              onClick={() => setTarget("scheduled")}
              title="Scheduled posts"
              hint="Each CSV row becomes a scheduled post with its own publish time."
            />
            <ChoiceCard
              selected={target === "queue"}
              onClick={() => setTarget("queue")}
              title="Append to a queue"
              hint="Each row joins the end of an existing queue, in CSV order."
            />
          </div>
        </Card>

        {/* Step 2 — Profile / queue */}
        <div style={{ height: 14 }} />
        <Card>
          <Step number={2} title={target === "scheduled" ? "Which profile publishes these?" : "Which queue should they join?"} />
          <div style={{ marginTop: 10 }}>
            {target === "scheduled" ? (
              <Select
                value={profile}
                onChange={e => setProfile(e.target.value)}
                options={[{ value: "", label: "Select a profile…" }, ...PROFILES.filter(p => p.active).map(p => ({ value: p.id, label: `${p.name} (${p.handle})` }))]}
              />
            ) : (
              <Select
                value={queue}
                onChange={e => setQueue(e.target.value)}
                options={[{ value: "", label: "Select a queue…" }, ...QUEUES.map(q => ({ value: q.id, label: `${q.name} — ${q.posts} posts` }))]}
              />
            )}
          </div>
        </Card>

        {/* Step 3 — File */}
        <div style={{ height: 14 }} />
        <Card>
          <Step number={3} title="Upload your CSV" />
          <div
            style={{
              marginTop: 10,
              border: "1.5px dashed var(--border-strong)",
              borderRadius: "var(--r-md)",
              padding: file ? "16px 20px" : "32px 20px",
              textAlign: "center",
              background: "var(--bg-surface)",
              transition: "all 0.2s",
              cursor: "pointer",
            }}
            onClick={() => setFile({ name: "blog-posts-may-2026.csv", rows: 47 })}
          >
            {file ? (
              <div className="h-stack" style={{ justifyContent: "center" }}>
                <Icon name="file" size={18} />
                <span className="mono text-base fw-medium">{file.name}</span>
                <Pill tone="success" icon="check">{file.rows} rows valid</Pill>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ color: "var(--text-muted)", cursor: "pointer" }}><Icon name="x" /></button>
              </div>
            ) : (
              <>
                <Icon name="upload" size={20} />
                <div style={{ marginTop: 8, fontSize: 13 }}>Drop a CSV here or click to browse</div>
                <div className="muted text-xs" style={{ marginTop: 4 }}>UTF-8 encoded · max 10 MB</div>
              </>
            )}
          </div>
        </Card>

        {/* Templates */}
        <div style={{ height: 14 }} />
        <Card>
          <div className="h-stack" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="fw-semibold" style={{ fontSize: 13 }}>Need a template?</div>
              <div className="muted text-xs" style={{ marginTop: 4 }}>Tags are semicolon-separated. Spinnable text uses {"{a|b|c}"} syntax verbatim.</div>
            </div>
            <div className="h-stack">
              <Button size="sm" variant="outline" icon="download">Scheduled template</Button>
              <Button size="sm" variant="outline" icon="download">Queue template</Button>
            </div>
          </div>
        </Card>

        {/* Footer actions */}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}>
          <Button variant="ghost" onClick={() => go("posts")}>← Back to posts</Button>
          <Button variant="primary" disabled={!file || (!profile && !queue)}>Import {file ? `${file.rows} posts` : ""}</Button>
        </div>
      </div>
    </>
  );
};

const Step = ({ number, title }) => (
  <div className="h-stack" style={{ gap: 10 }}>
    <span style={{
      width: 22, height: 22, borderRadius: "50%",
      background: "var(--brand-primary)", color: "white",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 600,
    }}>{number}</span>
    <span className="fw-semibold" style={{ fontSize: 14 }}>{title}</span>
  </div>
);

const ChoiceCard = ({ selected, onClick, title, hint }) => (
  <button
    onClick={onClick}
    style={{
      textAlign: "left",
      padding: "12px 14px",
      border: `1px solid ${selected ? "var(--brand-accent)" : "var(--border-default)"}`,
      borderRadius: "var(--r-md)",
      background: selected ? "var(--brand-accent-soft)" : "var(--bg-base)",
      cursor: "pointer",
      display: "flex", gap: 10, alignItems: "flex-start",
      transition: "all 0.15s",
    }}
  >
    <span className={`radio ${selected ? "checked" : ""}`} style={{ marginTop: 2 }} />
    <div>
      <div className="fw-medium" style={{ fontSize: 13, marginBottom: 2 }}>{title}</div>
      <div className="muted text-xs">{hint}</div>
    </div>
  </button>
);

Object.assign(window, { PostsList, Composer, Import, Step, ChoiceCard });
