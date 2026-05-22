/* Shared primitives used across screens. */

const Pill = ({ tone = "neutral", icon, children, dot }) => (
  <span className={`pill pill-${tone}`}>
    {dot && <span className="pill-dot" />}
    {icon && <Icon name={icon} size={11} />}
    {children}
  </span>
);

const Avatar = ({ name, src, size = "md", platform }) => {
  const sz = size === "sm" ? "avatar-sm" : size === "lg" ? "avatar-lg" : "";
  const initials = (name || "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`avatar ${sz}`} style={{ position: "relative" }}>
      {initials}
      {platform && (
        <span style={{
          position: "absolute", bottom: -2, right: -2,
          background: "var(--bg-base)", borderRadius: "50%", padding: 1,
          border: "1.5px solid var(--bg-base)",
          display: "inline-flex",
        }}>
          <PlatformGlyph p={platform} size={12} />
        </span>
      )}
    </span>
  );
};

const StatusPill = ({ status }) => {
  const cfg = {
    scheduled: { tone: "info", icon: "clock", label: "Scheduled" },
    queued: { tone: "neutral", icon: "queues", label: "Queued" },
    draft: { tone: "neutral", icon: "edit", label: "Draft" },
    published: { tone: "success", icon: "check", label: "Published" },
    failed: { tone: "danger", icon: "error", label: "Failed" },
    active: { tone: "success", icon: null, label: "Active", dot: true },
    paused: { tone: "warning", icon: "pause", label: "Paused" },
    deprecated: { tone: "neutral", icon: null, label: "Deprecated", dot: true },
  }[status] || { tone: "neutral", label: status };
  return <Pill tone={cfg.tone} icon={cfg.icon} dot={cfg.dot}>{cfg.label}</Pill>;
};

const Button = ({ variant = "default", size, icon, iconRight, children, ...rest }) => {
  const classes = ["btn"];
  if (variant === "primary") classes.push("btn-primary");
  if (variant === "accent") classes.push("btn-accent");
  if (variant === "ghost") classes.push("btn-ghost");
  if (variant === "outline") classes.push("btn-outline");
  if (variant === "danger") classes.push("btn-danger");
  if (size === "sm") classes.push("btn-sm");
  if (size === "lg") classes.push("btn-lg");
  return (
    <button className={classes.join(" ")} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  );
};

const IconButton = ({ icon, size = 16, ...rest }) => (
  <button className="btn-icon" {...rest}>
    <Icon name={icon} size={size} />
  </button>
);

const Input = React.forwardRef(({ label, hint, error, icon, ...rest }, ref) => (
  <div>
    {label && <label className="field-label">{label}</label>}
    {icon ? (
      <div className="input-group">
        <Icon name={icon} size={14} />
        <input ref={ref} className="input" {...rest} />
      </div>
    ) : (
      <input ref={ref} className="input" {...rest} />
    )}
    {hint && !error && <div className="field-hint">{hint}</div>}
    {error && <div className="field-hint field-error">{error}</div>}
  </div>
));

const Textarea = ({ label, hint, error, ...rest }) => (
  <div>
    {label && <label className="field-label">{label}</label>}
    <textarea className="textarea" {...rest} />
    {hint && !error && <div className="field-hint">{hint}</div>}
    {error && <div className="field-hint field-error">{error}</div>}
  </div>
);

const Select = ({ label, hint, options = [], value, onChange, ...rest }) => (
  <div>
    {label && <label className="field-label">{label}</label>}
    <select className="select input" value={value} onChange={onChange} {...rest}>
      {options.map(o => (
        typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    {hint && <div className="field-hint">{hint}</div>}
  </div>
);

const Switch = ({ on, onChange, label, hint, id }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
    <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} id={id} aria-pressed={on} />
    {(label || hint) && (
      <div style={{ flex: 1 }}>
        {label && <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>}
        {hint && <div className="field-hint" style={{ marginTop: 2 }}>{hint}</div>}
      </div>
    )}
  </div>
);

const Checkbox = ({ checked, onChange, label, id }) => (
  <label htmlFor={id} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
    <span className={`checkbox ${checked ? "checked" : ""}`} onClick={() => onChange?.(!checked)} role="checkbox" aria-checked={checked} />
    {label && <span style={{ fontSize: 13 }}>{label}</span>}
  </label>
);

const Radio = ({ checked, onChange, label, id, hint }) => (
  <label htmlFor={id} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "8px 0" }}>
    <span className={`radio ${checked ? "checked" : ""}`} onClick={() => onChange?.(true)} role="radio" aria-checked={checked} style={{ marginTop: 1 }} />
    <div>
      {label && <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>}
      {hint && <div className="field-hint" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  </label>
);

/* Segmented control */
const Segmented = ({ options, value, onChange }) => (
  <div className="segmented">
    {options.map(o => {
      const v = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      return (
        <button key={v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      );
    })}
  </div>
);

/* Lightweight popover menu, positioned below trigger */
const Menu = ({ open, onClose, children, anchor = "right", style }) => {
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!e.target.closest("[data-menu]")) onClose?.(); };
    setTimeout(() => document.addEventListener("click", h), 0);
    return () => document.removeEventListener("click", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="menu" data-menu style={{
      position: "absolute",
      top: "calc(100% + 4px)",
      [anchor]: 0,
      ...style,
    }}>
      {children}
    </div>
  );
};

const MenuItem = ({ icon, danger, children, ...rest }) => (
  <button className={`menu-item ${danger ? "danger" : ""}`} {...rest}>
    {icon && <Icon name={icon} size={14} />}
    {children}
  </button>
);

const Card = ({ title, action, padded = true, children, style }) => (
  <div className="card" style={style}>
    {(title || action) && (
      <div className="card-header">
        {title && <div className="fw-semibold">{title}</div>}
        {action}
      </div>
    )}
    <div style={padded ? { padding: 16 } : {}}>{children}</div>
  </div>
);

const PageHeader = ({ title, subtitle, breadcrumb, action }) => (
  <div>
    {breadcrumb && (
      <div className="breadcrumb">
        {breadcrumb.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="breadcrumb-sep">/</span>}
            {b.onClick ? (
              <a onClick={b.onClick} style={{ cursor: "pointer" }}>{b.label}</a>
            ) : (
              <span style={{ color: i === breadcrumb.length - 1 ? "var(--text-secondary)" : "inherit" }}>{b.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>
    )}
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  </div>
);

const EmptyState = ({ icon, title, body, action }) => (
  <div className="empty">
    {icon && <div className="empty-icon"><Icon name={icon} size={20} /></div>}
    {title && <div className="empty-title">{title}</div>}
    {body && <div className="empty-body">{body}</div>}
    {action && <div style={{ marginTop: 14 }}>{action}</div>}
  </div>
);

const Banner = ({ tone = "info", icon = "info", title, children, action }) => (
  <div className={`banner banner-${tone}`}>
    <Icon name={icon} size={16} style={{ flexShrink: 0, marginTop: 1, color: `var(--status-${tone})` }} />
    <div style={{ flex: 1 }}>
      {title && <div className="fw-semibold" style={{ marginBottom: 2 }}>{title}</div>}
      <div className="text-base">{children}</div>
    </div>
    {action}
  </div>
);

const Modal = ({ open, onClose, title, subtitle, children, footer, width = 480 }) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            {title && <div className="text-lg fw-semibold">{title}</div>}
            {subtitle && <div className="muted text-base" style={{ marginTop: 4 }}>{subtitle}</div>}
          </div>
          <IconButton icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

const Kbd = ({ children }) => (
  <kbd style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 18, height: 18, padding: "0 4px",
    background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
    borderRadius: 4, fontSize: 10, fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  }}>{children}</kbd>
);

Object.assign(window, {
  Pill, Avatar, StatusPill, Button, IconButton, Input, Textarea, Select,
  Switch, Checkbox, Radio, Segmented, Menu, MenuItem, Card, PageHeader,
  EmptyState, Banner, Modal, Kbd,
});
