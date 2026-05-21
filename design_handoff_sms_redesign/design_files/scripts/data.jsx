/* Shared icons (lucide-style outline, 16px default). Compact inline SVGs. */
const Icon = ({ name, size = 16, strokeWidth = 1.75, color = "currentColor", style }) => {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    posts: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    queues: <><path d="M3 6h18M3 12h18M3 18h12" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" /></>,
    upload: <><path d="M12 16V4M5 11l7-7 7 7M4 20h16" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><circle cx="17" cy="8" r="3" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.23.65.55.87.93" /></>,
    activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    check: <path d="m5 12 5 5L20 7" />,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
    warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
    error: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>,
    success: <><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></>,
    panelLeft: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>,
    more: <><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></>,
    moreH: <><circle cx="12" cy="12" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
    eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M14.1 14.1a3 3 0 0 1-4.2-4.2" /><path d="M6.6 6.6A13.2 13.2 0 0 0 2 12s3 7 10 7c1.6 0 3-.3 4.3-.8" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
    arrowLeft: <path d="M19 12H5M12 5l-7 7 7 7" />,
    play: <path d="M5 3 19 12 5 21Z" />,
    pause: <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 16l3 2.7a9 9 0 0 0 15-6.7" /><path d="M21 3v5h-5M3 21v-5h5" /></>,
    download: <><path d="M12 3v12M5 12l7 7 7-7M4 21h16" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    hash: <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
    list: <><path d="M3 5h18M3 12h18M3 19h18" /></>,
    filter: <path d="M3 6h18M6 12h12M10 18h4" />,
    drag: <><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>,
    lightning: <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />,
    eyeSlash: <><path d="m2 2 20 20" /></>,
    logo: <><rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" opacity="0.15" /><path d="m6 13 4-7 4 14 4-7" /></>,
    book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
    flag: <><path d="M4 22V2l9 4-9 4M4 6l9-4v13l-9 4" /></>,
    snippet: <><path d="m9 18-6-6 6-6M15 6l6 6-6 6" /></>,
    storage: <><path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" /><path d="M6 16h.01M10 16h.01" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
    eyeShow: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
    sparkles: <><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" /></>,
    cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths[name] || <circle cx="12" cy="12" r="2" />}
    </svg>
  );
};

/* Platform glyph — monochrome letter chip with subtle platform color */
const PlatformGlyph = ({ p, size = 16 }) => {
  const cfg = {
    twitter: { letter: "𝕏", color: "#d4d4d4", bg: "#332f30" },
    linkedin: { letter: "in", color: "#5b9bff", bg: "#5b9bff20" },
    facebook: { letter: "f", color: "#7c93f0", bg: "#7c93f020" },
  }[p] || { letter: "?", color: "#847d79", bg: "#332f30" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: 4,
      background: cfg.bg, color: cfg.color,
      fontSize: size <= 16 ? 9 : 11, fontWeight: 700,
      fontFamily: "var(--font-mono)",
      flexShrink: 0,
    }}>{cfg.letter}</span>
  );
};

/* --------- Fixture data --------- */
const PROFILES = [
  { id: "p1", name: "Personal Twitter", handle: "@joshslaughter", platform: "twitter", active: true, rateUsed: 87, rateMax: 500, connectedDaysAgo: 124, lastPublished: "2h ago", nextScheduled: "tomorrow 9:00am" },
  { id: "p2", name: "Clicks & Mortar", handle: "@clicksandmortar", platform: "twitter", active: true, rateUsed: 312, rateMax: 500, connectedDaysAgo: 89, lastPublished: "12m ago", nextScheduled: "in 2h" },
  { id: "p3", name: "CMW LinkedIn", handle: "Clicks & Mortar Websites", platform: "linkedin", active: true, rateUsed: 0, rateMax: 0, connectedDaysAgo: 14, lastPublished: "yesterday", nextScheduled: "Fri 12:00pm" },
  { id: "p4", name: "CMW Facebook", handle: "Clicks & Mortar Websites", platform: "facebook", active: true, rateUsed: 0, rateMax: 0, connectedDaysAgo: 14, lastPublished: null, nextScheduled: null },
  { id: "p5", name: "Old Test Account", handle: "@joshs_old", platform: "twitter", active: false, deprecated: true, rateUsed: 0, rateMax: 500, connectedDaysAgo: 220, lastPublished: "3 months ago", nextScheduled: null },
];

const QUEUES = [
  { id: "q1", name: "Daily tips", profile: "p2", status: "active", posts: 14, lastPublished: "12m ago", nextRun: "in 2h", interval: "specific-times", times: ["08:00", "12:00", "15:00"], days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { id: "q2", name: "Weekly promos", profile: "p3", status: "active", posts: 6, lastPublished: "Mon 9am", nextRun: "Fri 12pm", interval: "fixed", every: "1 day" },
  { id: "q3", name: "Weekend round-up", profile: "p2", status: "paused", posts: 8, lastPublished: "last Sat", nextRun: "—", interval: "variable", every: "12h" },
];

const POSTS = [
  { id: "post1", text: "New blog: 5 things every small business website needs in 2026. Cash flow is #1.", profile: "p2", platform: "twitter", status: "scheduled", scheduledIn: "in 2h 14m", tags: ["blog", "small-biz"] },
  { id: "post2", text: "Built another local restaurant a site this week — 14 days from kickoff to launch. No down payment.", profile: "p2", platform: "twitter", status: "scheduled", scheduledIn: "tomorrow 9:00am", tags: ["case-study"] },
  { id: "post3", text: "Excited to announce we're now MMSDC certified. More opportunities for our minority-owned clients.", profile: "p3", platform: "linkedin", status: "scheduled", scheduledIn: "Fri 12:00pm", tags: ["news"] },
  { id: "post4", text: "30 minutes of monthly content updates included. Every plan. Always.", profile: "p2", platform: "twitter", status: "queued", queueId: "q1", tags: ["features"] },
  { id: "post5", text: "Family-owned, Michigan-based, MMSDC-certified.", profile: "p2", platform: "twitter", status: "queued", queueId: "q1", tags: ["about"] },
  { id: "post6", text: "Want a website without writing a $2,000 check on day one? That's the whole point.", profile: "p2", platform: "twitter", status: "failed", error: "Your client app is not configured with the appropriate oauth1 permissions for this endpoint.", failedAt: "6 days ago", tags: [] },
  { id: "post7", text: "Working on a refresh for an existing client — free every 3 years.", profile: "p3", platform: "linkedin", status: "draft", tags: ["features"] },
  { id: "post8", text: "Friday — let's go.", profile: "p4", platform: "facebook", status: "published", publishedAt: "2 days ago", tags: [] },
];

const NOTIFICATIONS = [
  { id: "n1", title: "Publish failed on Personal Twitter", body: "Your client app is not configured with the appropriate oauth1 permissions for this endpoint.", severity: "error", time: "6 days ago", read: false },
  { id: "n2", title: "Token expires in 5 days on CMW LinkedIn", body: "Reconnect to avoid interrupted publishing.", severity: "warning", time: "2 days ago", read: false },
  { id: "n3", title: "Rate limit reached for Personal Twitter", body: "Publishing paused until the rate limit window resets (in 9h).", severity: "warning", time: "2 days ago", read: true },
  { id: "n4", title: "Queue 'Daily tips' resumed", body: "After the rate limit window cleared.", severity: "info", time: "yesterday", read: true },
  { id: "n5", title: "5 posts published successfully", body: "Through 'Daily tips' queue this morning.", severity: "info", time: "yesterday", read: true },
  { id: "n6", title: "Bulk import finished", body: "47 posts added to 'Daily tips' queue from CSV.", severity: "info", time: "3 days ago", read: true },
  { id: "n7", title: "Token expires in 7 days on CMW Facebook", body: "Reconnect to avoid interrupted publishing.", severity: "warning", time: "4 days ago", read: true },
];

const SNIPPETS = [
  { id: "s1", name: "cta-link", category: "Link", body: "→ clicksandmortarwebsites.com", updated: "May 12, 2026" },
  { id: "s2", name: "hashtags-smallbiz", category: "Hashtags", body: "#smallbusiness #michigan #websites #cashflow", updated: "May 2, 2026" },
  { id: "s3", name: "tagline", category: "Text", body: "Building websites without the upfront costs.", updated: "Apr 28, 2026" },
  { id: "s4", name: "contact", category: "Text", body: "[name redacted] · [phone redacted]", updated: "Mar 14, 2026" },
];

const findProfile = (id) => PROFILES.find(p => p.id === id);
const findQueue = (id) => QUEUES.find(q => q.id === id);

window.Icon = Icon;
window.PlatformGlyph = PlatformGlyph;
window.PROFILES = PROFILES;
window.QUEUES = QUEUES;
window.POSTS = POSTS;
window.NOTIFICATIONS = NOTIFICATIONS;
window.SNIPPETS = SNIPPETS;
window.findProfile = findProfile;
window.findQueue = findQueue;
