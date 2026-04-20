// Shared Telegram UI primitives + icons + data

const BASE_CATEGORIES = [
  { id: "food", emoji: "🍜", name: "Food", keywords: ["food","lunch","dinner","breakfast","supper","meal","restaurant","cafe","coffee","biryani","pizza","burger","noodle","pasta","sushi","ramen","drinks","brunch"] },
  { id: "transport", emoji: "🚕", name: "Transport", keywords: ["taxi","uber","grab","bus","mrt","train","ride","transport","gas","petrol","parking","toll","gojek","lyft","cab"] },
  { id: "home", emoji: "🏠", name: "Home", keywords: ["rent","home","repair","furniture","mortgage","cleaning","maintenance"] },
  { id: "groceries", emoji: "🛒", name: "Groceries", keywords: ["groceries","supermarket","ntuc","cold storage","fairprice","veggies","fruits","market"] },
  { id: "entertainment", emoji: "🎉", name: "Entertainment", keywords: ["movie","cinema","concert","party","karaoke","bar","club","netflix","spotify","game","event"] },
  { id: "travel", emoji: "✈️", name: "Travel", keywords: ["flight","hotel","airbnb","trip","travel","vacation","holiday","airline"] },
  { id: "health", emoji: "💊", name: "Health", keywords: ["doctor","clinic","pharmacy","medicine","gym","fitness","hospital","dental","health"] },
  { id: "shopping", emoji: "🛍️", name: "Shopping", keywords: ["shopping","clothes","amazon","shopee","lazada","shoes","bag","electronics"] },
  { id: "utilities", emoji: "💡", name: "Utilities", keywords: ["electricity","water","internet","wifi","phone","bill","utility","gas bill"] },
  { id: "other", emoji: "📦", name: "Other", keywords: [] },
];

const DEFAULT_CUSTOM = {
  group: [
    { id: "c-bali", emoji: "🌴", name: "Bali Trip", keywords: ["bali","ubud","seminyak","canggu"], custom: true },
    { id: "c-birthday", emoji: "🎂", name: "Dan's Birthday", keywords: ["birthday","cake","dan"], custom: true },
  ],
  personal: [
    { id: "c-coffee", emoji: "☕", name: "Coffee Habit", keywords: ["starbucks","coffee bean","flat white","latte"], custom: true },
  ],
};

// Auto-assign: simple keyword match against description (case-insensitive)
function autoAssignCategory(description, categories) {
  if (!description) return null;
  const desc = description.toLowerCase();
  // Check custom first (higher priority)
  const sorted = [...categories].sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0));
  for (const cat of sorted) {
    if (cat.keywords?.some(kw => desc.includes(kw.toLowerCase()))) {
      return cat;
    }
  }
  return null;
}

// ==================== Icons ====================
const Icon = {
  Chevron: ({ size = 14, color = "currentColor" }) => (
    <svg width={size * 0.6} height={size} viewBox="0 0 8 14" fill="none">
      <path d="M1 1l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Back: ({ color = "currentColor" }) => (
    <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
      <path d="M10 2L2 10l8 8" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Sparkle: ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
      <path d="M8 0.5l1.6 4.9L14.5 7l-4.9 1.6L8 13.5 6.4 8.6 1.5 7l4.9-1.6L8 0.5z"/>
      <circle cx="13.5" cy="2.5" r="1.2"/>
      <circle cx="2.5" cy="13.5" r="0.9"/>
    </svg>
  ),
  Plus: ({ size = 16, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Search: ({ size = 16, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke={color} strokeWidth="1.6"/>
      <path d="M11 11l3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Calendar: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="12" rx="2" stroke={color} strokeWidth="1.6"/>
      <path d="M3 9h14M7 3v4M13 3v4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Filter: ({ size = 16, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M4 8h8M6 12h4" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  X: ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M3 3l8 8M11 3l-8 8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Check: ({ size = 16, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 8l3.5 3.5L13 5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Trash: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M3 5h12M7 5V3h4v2M5 5l1 10h6l1-10" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Link: ({ size = 10, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
      <path d="M3 4.5a1.5 1.5 0 012-1.4L6.5 1.6a2 2 0 112.8 2.8L8 5.8a1.5 1.5 0 01-2.1 0M7 5.5a1.5 1.5 0 01-2 1.4L3.5 8.4a2 2 0 11-2.8-2.8L2 4.2a1.5 1.5 0 012.1 0" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Pencil: ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M9 2l3 3-7 7H2v-3l7-7z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Bolt: ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill={color}>
      <path d="M8 1L2 8h4l-1 5 6-7H7l1-5z"/>
    </svg>
  ),
  Sliders: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M4 6h8M16 6h0M4 14h2M10 14h6M12 4v4M6 12v4" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  Bell: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M4 14h12l-1.5-2V8a4.5 4.5 0 00-9 0v4L4 14zM8 17a2 2 0 004 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Tag: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M3 3h6l8 8-6 6-8-8V3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <circle cx="7" cy="7" r="1.4" fill={color}/>
    </svg>
  ),
  Phone: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M4 3h3l2 4-2 1a9 9 0 005 5l1-2 4 2v3a2 2 0 01-2 2A14 14 0 012 5a2 2 0 012-2z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  Key: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="10" r="3.5" stroke={color} strokeWidth="1.6"/>
      <path d="M10 10h8M16 10v3M14 10v2" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  UpDown: ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M6 6l3-3 3 3M6 12l3 3 3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ==================== Primitives ====================
function TgHeader({ title, onBack, action, actionLabel }) {
  return (
    <div className="tg-header">
      {onBack ? (
        <button className="back" onClick={onBack}>
          <Icon.Back color="var(--tg-link)" /> Back
        </button>
      ) : <div style={{ width: 60 }} />}
      <div className="title">{title}</div>
      {action ? (
        <button className="action" onClick={action}>{actionLabel}</button>
      ) : <div style={{ width: 60 }} />}
    </div>
  );
}

function TgStatusBar() {
  return (
    <div className="tg-status-bar">
      <div>9:41</div>
      <div className="icons">
        <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.5"/>
          <rect x="5" y="4.5" width="3" height="6.5" rx="0.5"/>
          <rect x="10" y="2" width="3" height="9" rx="0.5"/>
          <rect x="15" y="0" width="3" height="11" rx="0.5"/>
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <path d="M8 3c2 0 3.8.8 5.2 2.1l1-1A8.5 8.5 0 008 1.5 8.5 8.5 0 001.8 4.1l1 1A7 7 0 018 3z"/>
          <path d="M8 6c1.2 0 2.3.4 3.2 1.2l1-1A5.5 5.5 0 008 4.5c-1.6 0-3.1.7-4.2 1.7l1 1A4.2 4.2 0 018 6z"/>
          <circle cx="8" cy="9.5" r="1.3"/>
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" stroke="currentColor" opacity="0.4"/>
          <rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor"/>
          <path d="M24 4v4c.8-.3 1.5-1.2 1.5-2S24.8 4.3 24 4z" fill="currentColor" opacity="0.4"/>
        </svg>
      </div>
    </div>
  );
}

function Section({ header, footer, children }) {
  return (
    <div className="tg-section-wrap">
      {header && <div className="tg-section-header">{header}</div>}
      <div className="tg-section">{children}</div>
      {footer && <div className="tg-section-footer">{footer}</div>}
    </div>
  );
}

function Cell({ before, title, subhead, description, after, chevron, onClick, noIcon }) {
  return (
    <button className={`tg-cell ${noIcon || !before ? "no-icon" : ""}`} onClick={onClick}>
      {before && <div className="before">{before}</div>}
      <div className="content">
        {subhead && <div className="subhead">{subhead}</div>}
        <div className="title">{title}</div>
        {description && <div className="description">{description}</div>}
      </div>
      {after && <div className="after">{after}</div>}
      {chevron && <div className="chevron"><Icon.Chevron /></div>}
    </button>
  );
}

function Avatar({ initials, color = "linear-gradient(135deg, #ffb347, #ff7b54)", size = "md" }) {
  return (
    <div className={`tg-avatar ${size === "lg" ? "lg" : ""}`} style={{ background: color }}>
      {initials}
    </div>
  );
}

function CatIcon({ emoji, size = "md" }) {
  return <div className={`cat-icon ${size === "lg" ? "lg" : ""}`}>{emoji}</div>;
}

function SparkleBadge({ label = "Auto" }) {
  return (
    <span className="sparkle-badge">
      <span className="sparkle-icon"><Icon.Sparkle size={10} /></span>
      {label}
    </span>
  );
}

function MainButton({ label, onClick, variant = "primary", disabled, secondary, onSecondary }) {
  return (
    <div className="tg-main-button">
      <button
        className={`tg-btn-primary ${variant === "success" ? "success" : ""}`}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </button>
      {secondary && (
        <button className={`tg-btn-secondary ${secondary.destructive ? "destructive" : ""}`} onClick={onSecondary}>
          {secondary.label}
        </button>
      )}
    </div>
  );
}

// Bottom sheet
function Sheet({ open, onClose, title, children, footer }) {
  return (
    <>
      <div className={`sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sheet ${open ? "open" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ width: 50 }} />
          <div className="sheet-title">{title}</div>
          <button className="sheet-close" onClick={onClose}>Close</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer}
      </div>
    </>
  );
}

function Toast({ open, label }) {
  return <div className={`toast ${open ? "open" : ""}`}>{label}</div>;
}

Object.assign(window, {
  BASE_CATEGORIES, DEFAULT_CUSTOM, autoAssignCategory,
  Icon, TgHeader, TgStatusBar, Section, Cell, Avatar, CatIcon,
  SparkleBadge, MainButton, Sheet, Toast,
});
