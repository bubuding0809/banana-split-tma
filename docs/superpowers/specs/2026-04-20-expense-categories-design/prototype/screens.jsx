// Screens for the Categories prototype

// ==================== Category Picker Sheet ====================
function CategoryPickerSheet({ open, onClose, categories, selectedId, onSelect, onCreateCustom, context }) {
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(() => {
    if (!search) return categories;
    const s = search.toLowerCase();
    return categories.filter(c => c.name.toLowerCase().includes(s));
  }, [search, categories]);

  const base = filtered.filter(c => !c.custom);
  const custom = filtered.filter(c => c.custom);

  React.useEffect(() => { if (!open) setSearch(""); }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Choose category">
      <div style={{
        position: "sticky", top: 0, paddingBottom: 10, background: "var(--tg-bg)", zIndex: 2,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "4px 12px",
          background: "var(--tg-section-bg)", borderRadius: 10, height: 36,
        }}>
          <Icon.Search color="var(--tg-hint)" />
          <input
            type="text"
            placeholder="Search categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 15, color: "var(--tg-text)", fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      {base.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: "var(--tg-hint)", padding: "4px 4px 8px", textTransform: "uppercase" }}>
            Standard
          </div>
          <div className="cat-grid">
            {base.map(cat => (
              <button
                key={cat.id}
                className={`cat-tile ${selectedId === cat.id ? "selected" : ""}`}
                onClick={() => onSelect(cat)}
              >
                <div className="emoji">{cat.emoji}</div>
                <div className="name">{cat.name}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 13, color: "var(--tg-hint)", padding: "16px 4px 8px", textTransform: "uppercase" }}>
        Custom {context && <span style={{ textTransform: "none", opacity: 0.7 }}>· {context}</span>}
      </div>
      <div className="cat-grid">
        {custom.map(cat => (
          <button
            key={cat.id}
            className={`cat-tile ${selectedId === cat.id ? "selected" : ""}`}
            onClick={() => onSelect(cat)}
          >
            <div className="emoji">{cat.emoji}</div>
            <div className="name">{cat.name}</div>
          </button>
        ))}
        <button className="cat-tile add" onClick={onCreateCustom}>
          <div className="emoji">＋</div>
          <div className="name">New</div>
        </button>
      </div>
      <div style={{ height: 16 }} />
    </Sheet>
  );
}

// ==================== Create Custom Category ====================
const EMOJI_POOL = [
  "🍜","🍕","🍔","☕","🍺","🍷","🍰","🎂","🍦","🥗","🍱","🥘",
  "🚕","🚗","🚲","✈️","🚆","⛴️","🛵","⛽",
  "🏠","🏢","🛋️","🛏️","🧺","🧹",
  "🛒","🥦","🍎","🥕","🥛","🧀",
  "🎉","🎊","🎮","🎬","🎵","🎤","🎨","📚","🎁","🎯",
  "✈️","🏖️","🗻","🏝️","🗼","🌴","🏨","🎡",
  "💊","🏥","💉","🧘","🏋️","🚴","⚽","🏀",
  "🛍️","👕","👟","👜","💄","💍",
  "💡","💧","📶","📱","📺","🔌",
  "💼","💰","💸","💳","📈","🧾","📦",
];

const CATEGORY_COLORS = [
  "#007aff","#5856d6","#ff2d55","#ff3b30","#ff9500","#ffcc00",
  "#34c759","#00c7be","#30b0c7","#af52de","#8e8e93","#a2845e",
];

function CreateCategoryScreen({ initial, onCancel, onSave }) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [emoji, setEmoji] = React.useState(initial?.emoji ?? "🍜");
  const [color, setColor] = React.useState(initial?.color ?? CATEGORY_COLORS[0]);
  const valid = name.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TgHeader
        title={initial ? "Edit category" : "New category"}
        onBack={onCancel}
      />
      <div className="tg-scroll" style={{ paddingBottom: 120 }}>
        {/* Preview */}
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 8px" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18, background: color + "22",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 40, border: `2px solid ${color}44`,
            }}>{emoji}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tg-text)" }}>
              {name || "Category name"}
            </div>
          </div>
        </div>

        <Section header="Name">
          <input
            className="tg-input"
            placeholder="e.g. Bali Trip"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
        </Section>

        <Section header="Emoji">
          <div style={{ padding: 10 }}>
            <div className="emoji-grid">
              {EMOJI_POOL.map((e, i) => (
                <button
                  key={i}
                  className={`emoji-cell ${emoji === e ? "selected" : ""}`}
                  onClick={() => setEmoji(e)}
                >{e}</button>
              ))}
            </div>
          </div>
        </Section>

        <Section header="Accent color">
          <div style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {CATEGORY_COLORS.map(c => (
              <button
                key={c}
                className={`color-swatch ${color === c ? "selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </Section>

        <Section footer="Custom categories are visible only to this chat's members.">
          <Cell
            title={<span style={{ color: "var(--tg-hint)" }}>Scope</span>}
            after={<span>This chat only</span>}
            noIcon
          />
        </Section>
      </div>
      <MainButton
        label={initial ? "Save changes" : "Create category"}
        disabled={!valid}
        onClick={() => valid && onSave({ name: name.trim(), emoji, color, id: initial?.id ?? `c-${Date.now()}`, custom: true, keywords: [name.trim().toLowerCase()] })}
      />
    </div>
  );
}

// ==================== Manage Categories ====================
function ManageCategoriesScreen({ onBack, categories, customCategories, onEdit, onCreate, onDelete, context }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TgHeader title="Categories" onBack={onBack} />
      <div className="tg-scroll" style={{ paddingBottom: 40 }}>
        <Section header="Custom" footer={`Categories in ${context}. Tap to edit.`}>
          {customCategories.length === 0 && (
            <Cell noIcon title={<span style={{ color: "var(--tg-hint)" }}>No custom categories yet</span>} />
          )}
          {customCategories.map(cat => (
            <Cell
              key={cat.id}
              before={<CatIcon emoji={cat.emoji} />}
              title={cat.name}
              description={`${cat.keywords?.length ?? 0} auto-match keywords`}
              chevron
              onClick={() => onEdit(cat)}
            />
          ))}
          <Cell
            before={<div className="cat-icon" style={{ background: "color-mix(in srgb, var(--tg-link) 15%, transparent)", color: "var(--tg-link)" }}><Icon.Plus size={18} color="var(--tg-link)"/></div>}
            title={<span style={{ color: "var(--tg-link)" }}>New custom category</span>}
            onClick={onCreate}
          />
        </Section>

        <Section header="Standard" footer="Standard categories are shared across all chats and can't be edited.">
          {categories.map(cat => (
            <Cell
              key={cat.id}
              before={<CatIcon emoji={cat.emoji} />}
              title={cat.name}
              after={<span style={{ fontSize: 13 }}>{cat.keywords.length} keywords</span>}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

// ==================== Add/Edit Expense ====================
function AddExpenseScreen({ onBack, onSave, allCategories, editing, chatType, onOpenManage, onCreateCustom }) {
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [amount, setAmount] = React.useState(editing?.amount ?? "");
  const [category, setCategory] = React.useState(editing?.category ?? null);
  const [autoPicked, setAutoPicked] = React.useState(!!editing?.auto);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");

  // Auto-assign when description changes (debounced)
  React.useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => {
      const suggestion = autoAssignCategory(description, allCategories);
      if (suggestion) {
        setCategory(suggestion);
        setAutoPicked(true);
      } else if (autoPicked) {
        // Description cleared — keep last manual or clear
      }
    }, 300);
    return () => clearTimeout(t);
  }, [description]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  const handleSelectCategory = (cat) => {
    setCategory(cat);
    setAutoPicked(false);
    setPickerOpen(false);
    showToast(`${cat.emoji} ${cat.name}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <TgHeader title={editing ? "Edit expense" : "Add expense"} onBack={onBack} />

      {/* Progress steps */}
      <div style={{ padding: "10px 16px 4px", background: "var(--tg-bg)" }}>
        <div className="tg-steps"><div className="tg-steps-fill" style={{ width: "33%" }}/></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--tg-hint)", paddingTop: 4 }}>
          <span style={{ color: "var(--tg-text)", fontWeight: 600 }}>1. Amount</span>
          <span>2. Paid by</span>
          <span>3. Split</span>
        </div>
      </div>

      <div className="tg-scroll" style={{ paddingBottom: 120 }}>
        <Section header="Amount">
          <Cell
            before={<div style={{ fontSize: 22 }}>🇸🇬</div>}
            title="Singapore Dollar"
            after={<span>SGD</span>}
            chevron
          />
          <div style={{
            display: "flex", alignItems: "baseline", padding: "18px 16px",
            borderTop: "0.5px solid var(--tg-separator)",
          }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 34, fontWeight: 600, color: "var(--tg-text)", fontFamily: "inherit",
                minWidth: 0,
              }}
            />
            <span style={{ fontSize: 22, color: "var(--tg-hint)", fontWeight: 500 }}>SGD</span>
          </div>
        </Section>

        <Section header={
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Details</span>
            <span style={{ textTransform: "none", color: "var(--tg-hint)" }}>{description.length} / 60</span>
          </span>
        }>
          <textarea
            className="tg-textarea"
            placeholder="e.g. Supper at Paradise Biryani"
            value={description}
            maxLength={60}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div style={{ borderTop: "0.5px solid var(--tg-separator)" }}>
            <Cell
              before={<Icon.Calendar color="var(--tg-hint)" />}
              title="Transaction Date"
              after={<span>Today</span>}
            />
          </div>
        </Section>

        {/* CATEGORY - the new bit */}
        <Section
          header="Category"
          footer={autoPicked && category
            ? "Auto-picked from description. Tap to change."
            : "Helps you track spending by type."}
        >
          <button className="tg-cell" onClick={() => setPickerOpen(true)}>
            <div className="before">
              {category ? (
                <CatIcon emoji={category.emoji} />
              ) : (
                <div className="cat-icon" style={{ background: "color-mix(in srgb, var(--tg-link) 12%, transparent)" }}>
                  <Icon.Plus size={18} color="var(--tg-link)" />
                </div>
              )}
            </div>
            <div className="content">
              <div className="title" style={{ color: category ? "var(--tg-text)" : "var(--tg-link)" }}>
                {category ? category.name : "Pick a category"}
              </div>
              {category?.custom && (
                <div className="description">Custom · {chatType === "group" ? "Weekend Crew" : "Personal"}</div>
              )}
            </div>
            <div className="after">
              {autoPicked && category && <SparkleBadge label="Auto" />}
            </div>
            <div className="chevron"><Icon.Chevron /></div>
          </button>
        </Section>
      </div>

      <MainButton label="Next »" onClick={() => onSave({ description, amount, category, auto: autoPicked })} disabled={!amount || !description} />

      <CategoryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        categories={allCategories}
        selectedId={category?.id}
        onSelect={handleSelectCategory}
        onCreateCustom={() => { setPickerOpen(false); onCreateCustom(); }}
        context={chatType === "group" ? "Weekend Crew" : "Personal"}
      />

      <Toast open={!!toast} label={toast} />
    </div>
  );
}

// ==================== Chat Transactions ====================
const SAMPLE_EXPENSES = [
  { kind: "expense", id: "e1", description: "Supper at Paradise Biryani", amount: 48.50, payer: "You", category: "food", date: "Today", sortKey: 9, you: "lent", youAmount: 32.33, auto: true },
  { kind: "expense", id: "e2", description: "Grab to airport", amount: 24.00, payer: "Sarah", category: "transport", date: "Today", sortKey: 8, you: "borrowed", youAmount: 8.00, auto: true },
  { kind: "settlement", id: "s1", from: "You", to: "Dan", amount: 35.00, currency: "SGD", date: "Today", sortKey: 7 },
  { kind: "expense", id: "e3", description: "Airbnb Bali deposit", amount: 420.00, payer: "You", category: "c-bali", date: "Yesterday", sortKey: 6, you: "lent", youAmount: 315.00, auto: false },
  { kind: "expense", id: "e4", description: "Groceries — NTUC", amount: 67.40, payer: "Dan", category: "groceries", date: "Yesterday", sortKey: 5, you: "borrowed", youAmount: 22.47, auto: true },
  { kind: "settlement", id: "s2", from: "Sarah", to: "You", amount: 82.50, currency: "SGD", date: "Yesterday", sortKey: 4 },
  { kind: "expense", id: "e5", description: "Cinema — Dune Part 3", amount: 54.00, payer: "You", category: "entertainment", date: "Mon", sortKey: 3, you: "lent", youAmount: 36.00, auto: true },
  { kind: "expense", id: "e6", description: "Dan's birthday cake", amount: 85.00, payer: "Sarah", category: "c-birthday", date: "Sun", sortKey: 2, you: "borrowed", youAmount: 28.33, auto: false },
  { kind: "settlement", id: "s3", from: "Dan", to: "Clive", amount: 18.00, currency: "SGD", date: "Sun", sortKey: 2 },
  { kind: "expense", id: "e7", description: "Flat white at Common Man", amount: 6.50, payer: "You", category: "c-coffee", date: "Sun", sortKey: 1, you: "lent", youAmount: 6.50, auto: true },
  { kind: "expense", id: "e8", description: "Pharmacy — cough syrup", amount: 18.20, payer: "You", category: "health", date: "Sat", sortKey: 0, you: "lent", youAmount: 18.20, auto: true },
];

function ChatTransactionsScreen({
  onAddExpense, onEditExpense, onOpenManage, onOpenSettings, onShowOnboarding,
  allCategories, chatType, onboardingEnabled, showOnboarding, onDismissOnboarding,
}) {
  const [filter, setFilter] = React.useState("all");
  const [tab, setTab] = React.useState("transactions");
  const [filterPickerOpen, setFilterPickerOpen] = React.useState(false);
  const [filtersModalOpen, setFiltersModalOpen] = React.useState(false);
  const setPickerOpenFromFilter = setFilterPickerOpen;

  const categoryById = React.useMemo(() => {
    const map = {};
    allCategories.forEach(c => map[c.id] = c);
    return map;
  }, [allCategories]);

  const visible = filter === "all"
    ? SAMPLE_EXPENSES
    : SAMPLE_EXPENSES.filter(e => e.kind === "settlement" || e.category === filter);

  const chatName = chatType === "group" ? "Weekend Crew" : "Personal";
  const memberCount = chatType === "group" ? 4 : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Chat header */}
      <div className="tg-header">
        <button className="back"><Icon.Back color="var(--tg-link)" /></button>
        <div className="title" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <Avatar initials={chatType === "group" ? "WC" : "🍌"} color={chatType === "group" ? "linear-gradient(135deg, #ffb347, #ff7b54)" : "linear-gradient(135deg, #ffd84d, #ffb347)"} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{chatName}</span>
            <span style={{ fontSize: 12, color: "var(--tg-hint)", fontWeight: 400 }}>
              {memberCount === 1 ? "Personal tracking" : `${memberCount} members`}
            </span>
          </div>
        </div>
        <button className="action" onClick={onOpenSettings}>⋯</button>
      </div>

      {/* Tabs */}
      <div className="tg-tabs">
        <button className={`tg-tab ${tab==="balances" ? "active" : ""}`} onClick={() => setTab("balances")}>Balances</button>
        <button className={`tg-tab ${tab==="transactions" ? "active" : ""}`} onClick={() => setTab("transactions")}>Transactions</button>
      </div>

      {/* Filter row — matches ChatTransactionTab pattern: Cell with pills */}
      <div
        className="tg-filter-cell"
        onClick={() => setFiltersModalOpen(true)}
        role="button"
      >
        <div className="tg-filter-icon">
          <Icon.Sliders size={18} color="white" />
        </div>
        <div className="tg-filter-pills">
          {(() => {
            // Build pill definitions in priority order
            const allPills = [
              filter !== "all" && {
                key: "cat",
                onClick: () => setPickerOpenFromFilter(true),
                dot: <span className="tg-pill-dot" style={{ background: "var(--tg-button)" }}>
                  <span style={{ fontSize: 11, lineHeight: 1 }}>{categoryById[filter]?.emoji}</span>
                </span>,
                label: categoryById[filter]?.name,
                closable: true,
                onClose: () => setFilter("all"),
              },
              {
                key: "pay",
                dot: <span className="tg-pill-dot" style={{ background: "#34c759" }}>
                  <span style={{ fontSize: 10, color: "white", fontWeight: 700, lineHeight: 1 }}>$</span>
                </span>,
                label: "Payments",
              },
              {
                key: "rel",
                dot: <span className="tg-pill-dot" style={{ background: "#007aff" }}>
                  <Icon.Link size={9} color="white"/>
                </span>,
                label: "Related",
              },
              {
                key: "date",
                dot: <span className="tg-pill-dot" style={{ background: "#af52de" }}>
                  <svg width="9" height="9" viewBox="0 0 8 8"><path d="M4 1v6M2 5l2 2 2-2" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                </span>,
                label: "Date",
              },
            ].filter(Boolean);

            // If no category filter, prepend a muted "Category" CTA pill (clickable)
            if (filter === "all") {
              allPills.unshift({
                key: "cat-cta",
                onClick: () => setPickerOpenFromFilter(true),
                dot: <span className="tg-pill-dot" style={{ background: "#8e8e93" }}>
                  <Icon.Filter size={10} color="white" />
                </span>,
                label: "Category",
                muted: true,
              });
            }

            const MAX = 2;
            const visiblePills = allPills.slice(0, MAX);
            const overflowCount = allPills.length - visiblePills.length;

            return (
              <>
                {visiblePills.map(p => (
                  <button
                    key={p.key}
                    className={`tg-pill ${p.muted ? "tg-pill-muted" : ""}`}
                    onClick={(e) => { e.stopPropagation(); p.onClick?.(); }}
                    type="button"
                  >
                    {p.dot}
                    <span>{p.label}</span>
                    {p.closable && (
                      <span
                        className="tg-pill-close"
                        onClick={(e) => { e.stopPropagation(); p.onClose(); }}
                      >
                        <Icon.X size={10} color="currentColor" />
                      </span>
                    )}
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    className="tg-pill tg-pill-more"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFiltersModalOpen(true); }}
                  >
                    <span>+{overflowCount}</span>
                  </button>
                )}
              </>
            );
          })()}
        </div>
        <button
          className="tg-filter-expand"
          onClick={(e) => { e.stopPropagation(); setFiltersModalOpen(true); }}
        >
          <Icon.UpDown size={18} color="var(--tg-hint)" />
        </button>
      </div>

      <div className="tg-scroll" style={{ paddingBottom: 120 }}>
        <div className="tg-section-wrap">
          <div className="tg-section">
            {visible.map(e => {
              if (e.kind === "settlement") {
                const youAreSender = e.from === "You";
                const youAreReceiver = e.to === "You";
                const involved = youAreSender || youAreReceiver;
                const amountColor = youAreSender ? "var(--tg-destructive)"
                  : youAreReceiver ? "var(--tg-success)"
                  : "var(--tg-hint)";
                const primary = youAreSender ? "You paid" : `${e.from} paid`;
                const secondary = youAreReceiver ? "you" : e.to;

                return (
                  <Cell
                    key={e.id}
                    onClick={() => {}}
                    before={
                      <div className="cat-icon" style={{ background: "#34c759", color: "white" }}>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>$</span>
                      </div>
                    }
                    subhead={
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: youAreSender ? "var(--tg-link)" : "var(--tg-hint)" }}>
                          {primary}
                        </span>
                        {involved && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 16, height: 16, borderRadius: 100,
                            background: "color-mix(in srgb, var(--tg-hint) 20%, transparent)",
                            color: "var(--tg-hint)",
                          }}>
                            <Icon.Link size={9} color="currentColor" />
                          </span>
                        )}
                      </span>
                    }
                    title={<span>SGD {e.amount.toFixed(2)}</span>}
                    description={
                      <span>
                        <span style={{ color: youAreReceiver ? "var(--tg-link)" : "var(--tg-hint)" }}>to </span>
                        <span style={{
                          fontWeight: 500,
                          color: youAreReceiver ? "var(--tg-link)" : "var(--tg-text)",
                        }}>
                          {secondary}
                        </span>
                      </span>
                    }
                    after={
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 12 }}>{e.date}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: amountColor }}>
                          {youAreSender ? "−" : youAreReceiver ? "+" : ""}SGD {e.amount.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--tg-hint)" }}>
                          {youAreSender ? "Sent" : youAreReceiver ? "Received" : "Settlement"}
                        </span>
                      </div>
                    }
                  />
                );
              }

              const cat = categoryById[e.category];
              return (
                <Cell
                  key={e.id}
                  onClick={() => onEditExpense(e)}
                  before={<CatIcon emoji={cat?.emoji ?? "📦"} />}
                  subhead={
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: e.payer === "You" ? "var(--tg-link)" : "var(--tg-hint)" }}>
                        {e.payer} spent
                      </span>
                    </span>
                  }
                  title={<span>SGD {e.amount.toFixed(2)}</span>}
                  description={<span>on <span style={{ fontWeight: 500, color: "var(--tg-text)" }}>{e.description}</span></span>}
                  after={
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <span style={{ fontSize: 12 }}>{e.date}</span>
                      <span style={{
                        fontSize: 15, fontWeight: 600,
                        color: e.you === "lent" ? "var(--tg-success)" : "var(--tg-destructive)",
                      }}>
                        {e.you === "lent" ? "+" : "−"}SGD {e.youAmount.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--tg-hint)" }}>
                        {e.you === "lent" ? "Lent" : "Borrowed"}
                      </span>
                    </div>
                  }
                />
              );
            })}
            {visible.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--tg-hint)" }}>
                No expenses in this category yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <MainButton label={<span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon.Plus color="white" /> Add expense</span>} onClick={onAddExpense} />

      {/* Onboarding tooltip */}
      {onboardingEnabled && showOnboarding && (
        <>
          <div className={`tooltip-backdrop open`} onClick={onDismissOnboarding} />
          <div className="tooltip-bubble open" style={{ bottom: 170, left: 20, right: 20 }}>
            <div className="title">
              <span className="sparkle-icon"><Icon.Sparkle size={14} color="white" /></span>
              Categories are here
            </div>
            <div className="body">
              Every expense now gets a category — auto-picked from the description, or choose your own. Create custom categories to tag your trips, projects, or habits.
            </div>
            <div className="cta">
              <button onClick={onDismissOnboarding}>Got it</button>
              <button className="primary" onClick={onAddExpense}>Try it now</button>
            </div>
          </div>
        </>
      )}

      <CategoryPickerSheet
        open={filterPickerOpen}
        onClose={() => setFilterPickerOpen(false)}
        categories={allCategories}
        selectedId={filter === "all" ? null : filter}
        onSelect={(cat) => { setFilter(cat.id); setFilterPickerOpen(false); }}
        onCreateCustom={() => { setFilterPickerOpen(false); onOpenManage(); }}
        context={chatType === "group" ? "Weekend Crew" : "Personal"}
      />

      {/* Filters modal — matches real app's Filters sheet */}
      <Sheet
        open={filtersModalOpen}
        onClose={() => setFiltersModalOpen(false)}
        title="Filters"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 20 }}>
          <Section>
            <Cell
              before={<div className="cat-icon" style={{ background: "#ff9500", color: "white" }}>
                <Icon.Calendar size={20} color="white" />
              </div>}
              title={<span style={{ color: "var(--tg-link)" }}>Jump to date</span>}
            />
          </Section>

          {/* Category filter row — new */}
          <Section>
            <Cell
              onClick={() => {
                setFiltersModalOpen(false);
                setFilterPickerOpen(true);
              }}
              before={<div className="cat-icon" style={{
                background: filter === "all" ? "#8e8e93" : "var(--tg-button)",
                color: "white",
              }}>
                {filter === "all"
                  ? <Icon.Filter size={20} color="white" />
                  : <span style={{ fontSize: 18 }}>{categoryById[filter]?.emoji}</span>}
              </div>}
              title="Category"
              description={filter === "all"
                ? <span style={{ color: "var(--tg-hint)" }}>Show all categories</span>
                : <span style={{ color: "var(--tg-hint)" }}>{categoryById[filter]?.name}</span>}
              after={filter !== "all"
                ? <button
                    onClick={(e) => { e.stopPropagation(); setFilter("all"); }}
                    style={{
                      padding: "4px 10px", borderRadius: 100,
                      background: "color-mix(in srgb, var(--tg-hint) 15%, transparent)",
                      border: "none", color: "var(--tg-hint)", fontSize: 12, fontWeight: 500,
                      fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                : <Icon.Chevron color="var(--tg-hint)" />
              }
            />
          </Section>

          <Section>
            <Cell
              before={<div className="cat-icon" style={{ background: "#34c759", color: "white" }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>$</span>
              </div>}
              title="Include Payments"
              description={<span style={{ color: "var(--tg-hint)" }}>Include payments in the transaction list</span>}
              after={<div className="tg-switch on"><div className="tg-switch-knob" /></div>}
            />
            <Cell
              before={<div className="cat-icon" style={{ background: "#007aff", color: "white" }}>
                <Icon.Link size={14} color="white"/>
              </div>}
              title="Show Related Only"
              description={<span style={{ color: "var(--tg-hint)" }}>Show only transactions that involve you</span>}
              after={<div className="tg-switch on"><div className="tg-switch-knob" /></div>}
            />
          </Section>

          <Section>
            <Cell
              before={<div className="cat-icon" style={{ background: "#af52de", color: "white" }}>
                <svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 6l4-4 4 4M5 12l4 4 4-4" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>}
              title="Sort options"
              description={<span style={{ color: "var(--tg-hint)" }}>Transaction date · Newest first</span>}
              after={<Icon.Chevron color="var(--tg-hint)" />}
            />
          </Section>
        </div>
      </Sheet>
    </div>
  );
}

// ==================== Chat Settings ====================
function ChatSettingsScreen({ onBack, onOpenManage, chatType, customCategories, allCategories }) {
  const isGroup = chatType === "group";
  const chatName = isGroup ? "Weekend Crew" : "Personal";
  const [notifyExpense, setNotifyExpense] = React.useState(true);
  const [notifySettle, setNotifySettle] = React.useState(true);
  const [recurring, setRecurring] = React.useState(true);

  // Show a few category chips (customs first, then base) — preview only
  const customs = customCategories ?? [];
  const previewCats = [...customs, ...allCategories.filter(c => !c.custom)].slice(0, 4);
  const totalCats = allCategories.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="tg-header">
        <button className="back" onClick={onBack}>
          <Icon.Back color="var(--tg-link)" />
          <span style={{ marginLeft: 4, color: "var(--tg-link)", fontSize: 17 }}>Back</span>
        </button>
        <div className="title" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <span style={{ fontSize: 16 }}>⚙️</span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{isGroup ? "Group Settings" : "Chat Settings"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="action" style={{ fontSize: 18 }}>⌄</button>
          <button className="action">⋯</button>
        </div>
      </div>

      <div className="tg-scroll" style={{ paddingBottom: 40 }}>
        {/* BASE CURRENCY */}
        <div className="tg-section-header">BASE CURRENCY</div>
        <Section>
          <Cell
            before={<div style={{
              width: 40, height: 40, borderRadius: 100,
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 20,
            }}>🇸🇬</div>}
            title="Singapore Dollar"
            description={<span style={{ color: "var(--tg-hint)" }}>SGD</span>}
            after={<Icon.UpDown size={18} color="var(--tg-hint)" />}
          />
        </Section>

        {/* CATEGORIES — new section */}
        <div className="tg-section-header">CATEGORIES</div>
        <Section>
          <Cell
            onClick={onOpenManage}
            before={<div style={{
              width: 40, height: 40, borderRadius: 100,
              background: "color-mix(in srgb, var(--tg-link) 15%, transparent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--tg-link)",
            }}>
              <Icon.Tag size={20} color="currentColor" />
            </div>}
            title="Manage categories"
            description={
              <span style={{ color: "var(--tg-hint)" }}>
                {customs.length > 0
                  ? `${customs.length} custom · ${totalCats} total`
                  : `${totalCats} standard · 0 custom`}
              </span>
            }
            after={<Icon.Chevron color="var(--tg-hint)" />}
          />
          {/* Preview chip strip */}
          <div
            onClick={onOpenManage}
            style={{
              display: "flex", gap: 6, padding: "10px 16px 14px",
              overflowX: "auto", cursor: "pointer",
              borderTop: "0.5px solid var(--tg-separator)",
            }}
          >
            {previewCats.map(c => (
              <div
                key={c.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 100, flexShrink: 0,
                  background: "color-mix(in srgb, var(--tg-hint) 12%, transparent)",
                  fontSize: 13, fontWeight: 500, color: "var(--tg-text)",
                }}
              >
                <span style={{ fontSize: 14 }}>{c.emoji}</span>
                <span>{c.name}</span>
              </div>
            ))}
            {totalCats > previewCats.length && (
              <div style={{
                display: "inline-flex", alignItems: "center",
                padding: "6px 10px", borderRadius: 100, flexShrink: 0,
                background: "transparent",
                fontSize: 13, fontWeight: 500, color: "var(--tg-hint)",
              }}>
                +{totalCats - previewCats.length} more
              </div>
            )}
          </div>
        </Section>
        <div className="tg-section-footer">
          {isGroup
            ? "Categories are shared by everyone in this group. Custom categories help auto-assign recurring expenses."
            : "Your custom categories are private to this chat."}
        </div>

        {/* NOTIFICATIONS */}
        {isGroup && (
          <>
            <div className="tg-section-header">NOTIFICATIONS</div>
            <Section>
              <Cell
                onClick={() => setNotifyExpense(v => !v)}
                before={<Icon.Bell size={20} color="var(--tg-text)" />}
                title="Expense added"
                after={<div className={`tg-switch ${notifyExpense ? "on" : ""}`}><div className="tg-switch-knob" /></div>}
              />
              <Cell
                onClick={() => setNotifySettle(v => !v)}
                before={<Icon.Bell size={20} color="var(--tg-text)" />}
                title="Settlement recorded"
                after={<div className={`tg-switch ${notifySettle ? "on" : ""}`}><div className="tg-switch-knob" /></div>}
              />
            </Section>
            <div className="tg-section-footer">
              Choose which events should notify this group. Reminders you send manually are unaffected.
            </div>
          </>
        )}

        {/* RECURRING REMINDERS */}
        {isGroup && (
          <>
            <div className="tg-section-header">RECURRING REMINDERS</div>
            <Section>
              <Cell
                onClick={() => setRecurring(v => !v)}
                before={<Icon.Bell size={20} color="var(--tg-text)" />}
                title="Recurring Reminders"
                after={<div className={`tg-switch ${recurring ? "on" : ""}`}><div className="tg-switch-knob" /></div>}
              />
              <Cell
                title={<span>Every Wednesday, at <span style={{ fontWeight: 600 }}>11:41pm</span></span>}
                description={<span style={{ color: "var(--tg-hint)" }}>Asia/Singapore</span>}
                after={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--tg-hint)" }}>
                    <span style={{ fontSize: 15 }}>Edit</span>
                    <Icon.Chevron color="var(--tg-hint)" />
                  </span>
                }
              />
            </Section>
          </>
        )}

        {/* ACCESS TOKENS */}
        <div className="tg-section-header">ACCESS TOKENS</div>
        <Section>
          <Cell
            before={<Icon.Key size={20} color="var(--tg-text)" />}
            title={<span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 15 }}>bsk_bHgg••••••••</span>}
            description={<span style={{ color: "var(--tg-hint)" }}>by Ruoqian · 13/03/2026</span>}
            after={<button style={{ border: "none", background: "none", padding: 4, color: "var(--tg-destructive)", cursor: "pointer" }}>
              <Icon.Trash size={20} color="currentColor" />
            </button>}
          />
          <Cell
            before={<Icon.Key size={20} color="var(--tg-text)" />}
            title={<span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 15 }}>bsk_li3k••••••••</span>}
            description={<span style={{ color: "var(--tg-hint)" }}>by Ruoqian · 11/03/2026</span>}
            after={<button style={{ border: "none", background: "none", padding: 4, color: "var(--tg-destructive)", cursor: "pointer" }}>
              <Icon.Trash size={20} color="currentColor" />
            </button>}
          />
        </Section>
      </div>
    </div>
  );
}

Object.assign(window, {
  CategoryPickerSheet, CreateCategoryScreen, ManageCategoriesScreen,
  AddExpenseScreen, ChatTransactionsScreen, ChatSettingsScreen, SAMPLE_EXPENSES,
});
