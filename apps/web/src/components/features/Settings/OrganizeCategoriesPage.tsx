import { useEffect, useMemo, useRef, useState } from "react";
import {
  backButton,
  hapticFeedback,
  mainButton,
  secondaryButton,
} from "@telegram-apps/sdk-react";
import { useNavigate } from "@tanstack/react-router";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import clsx from "clsx";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Snackbar } from "@telegram-apps/telegram-ui";
import { Eye, Move } from "lucide-react";
import { trpc } from "@/utils/trpc";
import CategoryTile from "@/components/features/Category/CategoryTile";

interface OrganizeItem {
  categoryKey: string;
  emoji: string;
  title: string;
  kind: "base" | "custom";
  sortOrder: number;
  hidden: boolean;
}

const ZONE_VISIBLE_ID = "zone:visible";
const ZONE_HIDDEN_ID = "zone:hidden";

function DroppableZone({
  id,
  isTargetZone,
  className,
  targetClassName,
  overClassName,
  children,
}: {
  id: string;
  /**
   * True when a drag is in flight AND this zone is a valid cross-zone
   * target (i.e., the tile's source zone is the OTHER one). Source zone
   * stays neutral because dropping into your own zone is just reorder.
   */
  isTargetZone: boolean;
  className: string;
  /** Applied while this zone is a valid target (pointer not yet on it). */
  targetClassName?: string;
  /** Applied while the pointer is directly over this zone AND it's target. */
  overClassName?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const showOver = isOver && isTargetZone;
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        className,
        isTargetZone && !showOver && targetClassName,
        showOver && overClassName
      )}
    >
      {children}
    </div>
  );
}

function IdleEmptyLabel({ text }: { text: string }) {
  return (
    <div className="col-span-4 px-3 py-7 text-center text-[11px] italic text-[var(--tg-theme-subtitle-text-color)] opacity-70">
      {text}
    </div>
  );
}

/**
 * Rendered inside the target zone while dragging. Shows a ghost of the
 * dragged tile where it will land (append to end of zone on empty-area
 * drop). Color matches the zone's own tone — green in the Visible zone
 * ("bring it back / in use"), amber in the Hidden zone ("park it").
 */
function DropPlaceholder({
  emoji,
  tone,
}: {
  emoji: string;
  tone: "amber" | "green";
}) {
  return (
    <div
      className={clsx(
        "relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-1 py-2",
        tone === "green"
          ? "border-[#22c55e]/70 bg-[#22c55e]/10"
          : "border-[#f59e0b]/70 bg-[#f59e0b]/10"
      )}
    >
      <span className="flex h-10 items-center text-3xl leading-none opacity-40 grayscale">
        {emoji}
      </span>
      <span className="block w-full truncate text-center text-[10px] italic opacity-60">
        Drop here
      </span>
    </div>
  );
}

function SortableTile({
  item,
  onToggleHide,
}: {
  item: OrganizeItem;
  onToggleHide: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.categoryKey });

  // While the source tile is being dragged, fade it down to a placeholder
  // outline — the real visual follows the cursor via the DragOverlay below.
  // Append our own opacity transition to dnd-kit's transform-only one so the
  // fade is visually continuous with the overlay hand-off.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: [transition, "opacity 160ms cubic-bezier(0.23,1,0.32,1)"]
      .filter(Boolean)
      .join(", "),
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <CategoryTile
      emoji={item.emoji}
      title={item.title}
      showCustomDot={item.kind === "custom"}
      hideToggle={item.hidden ? "hidden" : "visible"}
      dim={item.hidden}
      onToggleHide={onToggleHide}
      sortableRef={setNodeRef}
      sortableStyle={style}
      sortableListeners={listeners as Record<string, unknown>}
      sortableAttributes={attributes as unknown as Record<string, unknown>}
      // isDragging intentionally NOT passed — source tile shouldn't scale
      // or shadow since the DragOverlay handles that visual.
    />
  );
}

export default function OrganizeCategoriesPage({ chatId }: { chatId: number }) {
  const navigate = useNavigate();
  const { data } = trpc.category.listByChat.useQuery({ chatId });

  const initial = useMemo<OrganizeItem[]>(() => {
    if (!data) return [];
    return data.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        categoryKey: it.id,
        emoji: it.emoji,
        title: it.title,
        kind: it.kind,
        sortOrder: it.sortOrder,
        hidden: it.hidden,
      }));
  }, [data]);

  const [items, setItems] = useState<OrganizeItem[]>([]);
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  // Track the currently-dragged tile so the DragOverlay can render a
  // clone of it that floats above everything and follows the cursor.
  // Without this, the source tile's CSS transform alone was getting
  // clipped behind layout when dragged across zones on narrow viewports.
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = activeId
    ? (items.find((i) => i.categoryKey === activeId) ?? null)
    : null;

  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);

  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const setOrderingMut = trpc.category.setOrdering.useMutation({
    onSuccess: () => utils.category.listByChat.invalidate({ chatId }),
    onError: (e) => {
      // Most likely: a concurrent member deleted a custom category the draft
      // still references. Re-invalidate to surface the fresh data.
      setError(e.message || "Couldn't save changes. Try again.");
      utils.category.listByChat.invalidate({ chatId });
    },
  });
  const resetOrderingMut = trpc.category.resetOrdering.useMutation({
    onSuccess: () => utils.category.listByChat.invalidate({ chatId }),
    onError: (e) => {
      setError(e.message || "Couldn't reset. Try again.");
      utils.category.listByChat.invalidate({ chatId });
    },
  });

  const isDirty = useMemo(() => {
    if (initial.length !== items.length) return true;
    for (let i = 0; i < initial.length; i++) {
      const a = initial[i]!;
      const b = items[i]!;
      if (
        a.categoryKey !== b.categoryKey ||
        a.sortOrder !== b.sortOrder ||
        a.hidden !== b.hidden
      ) {
        return true;
      }
    }
    return false;
  }, [initial, items]);

  const onSave = () => {
    setOrderingMut.mutate(
      {
        chatId,
        items: items.map((it) => ({
          categoryKey: it.categoryKey,
          sortOrder: it.sortOrder,
          hidden: it.hidden,
        })),
      },
      {
        onSuccess: () =>
          navigate({
            to: "/chat/$chatId/settings",
            params: { chatId: String(chatId) },
            search: { prevTab: "transaction" },
          }),
      }
    );
  };

  const onReset = () => {
    const confirmMessage = isDirty
      ? "Reset to defaults? Custom order and hidden tiles will be cleared, and this also discards your unsaved changes."
      : "Reset to defaults? Custom order and hidden tiles will be cleared.";
    if (!window.confirm(confirmMessage)) return;
    // Stay on the page; the listByChat invalidate in the mutation's
    // onSuccess triggers a refetch that rewrites `initial` -> `items`
    // with the post-reset default order.
    resetOrderingMut.mutate({ chatId });
  };

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    mainButton.mount();
    mainButton.setParams({ text: "Save", isVisible: true });
    const off = mainButton.onClick(() => onSaveRef.current());
    return () => {
      off();
      mainButton.setParams({
        isVisible: false,
        isEnabled: true,
        isLoaderVisible: false,
      });
    };
  }, []);

  useEffect(() => {
    mainButton.setParams({
      isEnabled: isDirty && !setOrderingMut.isPending,
      isLoaderVisible: setOrderingMut.isPending,
    });
  }, [isDirty, setOrderingMut.isPending]);

  useEffect(() => {
    secondaryButton.mount();
    secondaryButton.setParams({
      text: "Reset to defaults",
      isVisible: true,
      backgroundColor: "#E53935",
      textColor: "#FFFFFF",
    });
    const off = secondaryButton.onClick(() => onResetRef.current());
    return () => {
      off();
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: true,
        isLoaderVisible: false,
        backgroundColor: undefined,
        textColor: undefined,
      });
    };
  }, []);

  useEffect(() => {
    secondaryButton.setParams({
      isEnabled:
        !resetOrderingMut.isPending &&
        !setOrderingMut.isPending &&
        data?.hasCustomOrder === true,
      isLoaderVisible: resetOrderingMut.isPending,
    });
  }, [
    resetOrderingMut.isPending,
    setOrderingMut.isPending,
    data?.hasCustomOrder,
  ]);

  // Split mouse + touch sensors so each platform gets its idiomatic
  // activation rule. A single PointerSensor forced us to pick one or the
  // other: `delay` works for touch (prevents scroll→drag) but never
  // triggers on desktop where users click-and-drag immediately; `distance`
  // works for desktop but makes touch scrolls accidentally start drags.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Collision detection: prefer pointerWithin so the cursor's exact
  // position decides the target. Fall back to rectIntersection when the
  // pointer is outside any droppable — handles the "drop on empty zone
  // area" case where no tile is under the cursor.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  };

  const onDragStart = (e: DragStartEvent) => {
    // Soft "lift" thump when the tile detaches from the grid.
    try {
      hapticFeedback.impactOccurred("light");
    } catch {
      // hapticFeedback can throw in non-TMA dev contexts — swallow.
    }
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    // Solid "land" thump when a valid drop actually changed state.
    try {
      hapticFeedback.impactOccurred("medium");
    } catch {
      // non-TMA; swallow.
    }

    const activeKey = String(active.id);
    const overKey = String(over.id);

    setItems((prev) => {
      const activeIdx = prev.findIndex((p) => p.categoryKey === activeKey);
      if (activeIdx < 0) return prev;
      const activeItem = prev[activeIdx]!;

      // CASE 1: dropped on a zone container (empty space in that zone) —
      // append the active tile to the end of that zone.
      if (overKey === ZONE_VISIBLE_ID || overKey === ZONE_HIDDEN_ID) {
        const targetHidden = overKey === ZONE_HIDDEN_ID;
        const rest = prev.filter((p) => p.categoryKey !== activeKey);
        const sameZone: OrganizeItem[] = [];
        const otherZone: OrganizeItem[] = [];
        for (const it of rest) {
          if (it.hidden === targetHidden) sameZone.push(it);
          else otherZone.push(it);
        }
        const moved = { ...activeItem, hidden: targetHidden };
        const next = targetHidden
          ? [...otherZone, ...sameZone, moved]
          : [...sameZone, moved, ...otherZone];
        return next.map((it, idx) => ({ ...it, sortOrder: idx }));
      }

      // CASE 2: dropped on another tile — cross-zone or same-zone reorder.
      const overIdx = prev.findIndex((p) => p.categoryKey === overKey);
      if (overIdx < 0) return prev;
      const overItem = prev[overIdx]!;

      const shouldFlipHidden = activeItem.hidden !== overItem.hidden;

      let next = arrayMove(prev, activeIdx, overIdx);
      if (shouldFlipHidden) {
        next = next.map((it) =>
          it.categoryKey === activeKey ? { ...it, hidden: overItem.hidden } : it
        );
      }
      return next.map((it, idx) => ({ ...it, sortOrder: idx }));
    });
  };

  const toggleHide = (categoryKey: string) => {
    // Telegram-native "tick" for toggling a setting in/out of the picker.
    try {
      hapticFeedback.selectionChanged();
    } catch {
      // non-TMA; swallow.
    }
    setItems((prev) => {
      const target = prev.find((p) => p.categoryKey === categoryKey);
      if (!target) return prev;
      const nextHidden = !target.hidden;

      // Remove the target; drop it at the end of its new zone so the user
      // sees it land somewhere predictable rather than staying in place
      // with only its badge changing.
      const rest = prev.filter((p) => p.categoryKey !== categoryKey);
      const sameZoneFirst: OrganizeItem[] = [];
      const sameZoneSecond: OrganizeItem[] = [];
      for (const it of rest) {
        if (it.hidden === nextHidden) sameZoneFirst.push(it);
        else sameZoneSecond.push(it);
      }

      const moved = { ...target, hidden: nextHidden };
      const zoneOrder = nextHidden
        ? [...sameZoneSecond, ...sameZoneFirst, moved]
        : [...sameZoneFirst, moved, ...sameZoneSecond];

      return zoneOrder.map((it, idx) => ({ ...it, sortOrder: idx }));
    });
  };

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() => {
      if (isDirtyRef.current && !window.confirm("Discard changes?")) return;
      // Return to main Settings, not Manage Categories — the Customize
      // picker entry lives on the main Settings card now, so that's the
      // natural "up" navigation.
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
        search: { prevTab: "transaction" },
      });
    });
    return () => {
      off();
      backButton.hide();
    };
  }, [chatId, navigate]);

  return (
    <main className="flex flex-col gap-4 px-3 pb-24 pt-2">
      {visible.length === 0 && (
        <p className="rounded-lg border border-[rgba(232,148,60,0.3)] bg-[rgba(232,148,60,0.08)] px-3 py-2 text-[12px] leading-snug text-[var(--tg-theme-text-color)]">
          All tiles are hidden — the picker will be empty.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <section>
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
            <span>Visible</span>
            <span>
              {visible.length} / {items.length}
            </span>
          </div>
          {/* Visible zone is themed green ("in use"). Idle state has a
              subtle green tint; when it's the cross-zone target the ring
              brightens; when the cursor is over it, fills + scales up. */}
          <SortableContext
            items={visible.map((v) => v.categoryKey)}
            strategy={rectSortingStrategy}
          >
            <DroppableZone
              id={ZONE_VISIBLE_ID}
              isTargetZone={activeItem?.hidden === true}
              className="grid min-h-[92px] grid-cols-4 gap-2 rounded-xl border-2 border-dashed border-[#22c55e]/15 bg-[#22c55e]/[0.04] p-1 transition-[border-color,background-color,box-shadow,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
              targetClassName="border-[#22c55e]/70"
              overClassName="scale-[1.02] border-[#22c55e] bg-[#22c55e]/10 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]"
            >
              {visible.map((it) => (
                <SortableTile
                  key={it.categoryKey}
                  item={it}
                  onToggleHide={() => toggleHide(it.categoryKey)}
                />
              ))}
              {activeItem?.hidden === true && (
                <DropPlaceholder emoji={activeItem.emoji} tone="green" />
              )}
              {visible.length === 0 && activeItem?.hidden !== true && (
                <IdleEmptyLabel text="Drag a tile here to show it in the picker." />
              )}
            </DroppableZone>
          </SortableContext>
        </section>

        {/* Inline instructions between the zones. A hairline rule runs
            edge-to-edge through the row, cutting through both legend
            items so they read as "floating" on a single divider — one
            element that's both separator and cheat sheet. No container
            or border, still reads as guidance not a tappable pill. */}
        <div className="flex items-center gap-3 py-1 text-[13px] italic text-[var(--tg-theme-hint-color)]">
          <span
            aria-hidden
            className="h-px flex-1 bg-[rgba(255,255,255,0.08)]"
          />
          <span className="flex flex-shrink-0 items-center gap-1.5">
            <Move size={14} strokeWidth={2.25} style={{ color: "#22c55e" }} />
            Drag to move
          </span>
          <span
            aria-hidden
            className="h-px flex-1 bg-[rgba(255,255,255,0.08)]"
          />
          <span className="flex flex-shrink-0 items-center gap-1.5">
            <Eye size={14} strokeWidth={2.25} style={{ color: "#f59e0b" }} />
            Tap eye to hide / show
          </span>
          <span
            aria-hidden
            className="h-px flex-1 bg-[rgba(255,255,255,0.08)]"
          />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
            <span>Hidden</span>
            <span>{hidden.length} hidden</span>
          </div>
          {/* Hidden zone is themed amber ("parked"). Same idle→target→over
              escalation as Visible but in amber to distinguish the two
              zones by color at rest, not only during drag. */}
          <SortableContext
            items={hidden.map((v) => v.categoryKey)}
            strategy={rectSortingStrategy}
          >
            <DroppableZone
              id={ZONE_HIDDEN_ID}
              isTargetZone={activeItem?.hidden === false}
              className="grid min-h-[92px] grid-cols-4 gap-2 rounded-xl border-2 border-dashed border-[#f59e0b]/15 bg-[#f59e0b]/[0.04] p-1 transition-[border-color,background-color,box-shadow,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
              targetClassName="border-[#f59e0b]/70"
              overClassName="scale-[1.02] border-[#f59e0b] bg-[#f59e0b]/10 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]"
            >
              {hidden.map((it) => (
                <SortableTile
                  key={it.categoryKey}
                  item={it}
                  onToggleHide={() => toggleHide(it.categoryKey)}
                />
              ))}
              {activeItem?.hidden === false && (
                <DropPlaceholder emoji={activeItem.emoji} tone="amber" />
              )}
              {hidden.length === 0 && activeItem?.hidden !== false && (
                <IdleEmptyLabel text="Drag a tile here (or tap its eye) to hide it from the picker." />
              )}
            </DroppableZone>
          </SortableContext>
        </section>

        {/* Detached clone that follows the cursor during drag — renders
            via a portal above everything else, so cross-zone drags never
            clip behind layout. dropAnimation={null} skips the default
            settle-back animation since our state update moves the tile
            to its final resting position immediately. */}
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div style={{ width: 72, aspectRatio: "1 / 1" }}>
              <CategoryTile
                emoji={activeItem.emoji}
                title={activeItem.title}
                showCustomDot={activeItem.kind === "custom"}
                isDragging
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {error ? (
        <Snackbar onClose={() => setError(null)} description={error}>
          Error
        </Snackbar>
      ) : null}
    </main>
  );
}
