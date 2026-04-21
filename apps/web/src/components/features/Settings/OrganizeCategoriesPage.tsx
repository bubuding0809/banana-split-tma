import { useEffect, useMemo, useRef, useState } from "react";
import {
  backButton,
  mainButton,
  secondaryButton,
} from "@telegram-apps/sdk-react";
import { useNavigate } from "@tanstack/react-router";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      isDragging={isDragging}
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

  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);

  const utils = trpc.useUtils();
  const setOrderingMut = trpc.category.setOrdering.useMutation({
    onSuccess: () => utils.category.listByChat.invalidate({ chatId }),
  });
  const resetOrderingMut = trpc.category.resetOrdering.useMutation({
    onSuccess: () => utils.category.listByChat.invalidate({ chatId }),
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
            to: "/chat/$chatId/settings/categories",
            params: { chatId: String(chatId) },
          }),
      }
    );
  };

  const onReset = () => {
    if (
      !window.confirm(
        "Reset to defaults? Custom order and hidden tiles will be cleared."
      )
    )
      return;
    resetOrderingMut.mutate(
      { chatId },
      {
        onSuccess: () =>
          navigate({
            to: "/chat/$chatId/settings/categories",
            params: { chatId: String(chatId) },
          }),
      }
    );
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    setItems((prev) => {
      const activeIdx = prev.findIndex((p) => p.categoryKey === active.id);
      const overIdx = prev.findIndex((p) => p.categoryKey === over.id);
      if (activeIdx < 0 || overIdx < 0) return prev;

      const activeItem = prev[activeIdx]!;
      const overItem = prev[overIdx]!;

      // Cross-zone drag flips `hidden` to match the zone of the drop target.
      const shouldFlipHidden = activeItem.hidden !== overItem.hidden;

      let next = arrayMove(prev, activeIdx, overIdx);
      if (shouldFlipHidden) {
        next = next.map((it) =>
          it.categoryKey === active.id ? { ...it, hidden: overItem.hidden } : it
        );
      }
      // Re-number sortOrder so persisted values match visual order.
      return next.map((it, idx) => ({ ...it, sortOrder: idx }));
    });
  };

  const toggleHide = (categoryKey: string) => {
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
      navigate({
        to: "/chat/$chatId/settings/categories",
        params: { chatId: String(chatId) },
      });
    });
    return () => {
      off();
      backButton.hide();
    };
  }, [chatId, navigate]);

  return (
    <main className="flex flex-col gap-4 px-3 pb-24">
      <p className="px-1 pt-2 text-[12px] leading-snug text-[var(--tg-theme-subtitle-text-color)]">
        Drag to reorder. Drag into the Hidden zone (or tap the eye icon) to
        hide. Shared with everyone in this group.
      </p>

      {visible.length === 0 && (
        <p className="rounded-lg border border-[rgba(232,148,60,0.3)] bg-[rgba(232,148,60,0.08)] px-3 py-2 text-[12px] leading-snug text-[var(--tg-theme-text-color)]">
          All tiles are hidden — the picker will be empty.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <section>
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
            <span>Visible</span>
            <span>
              {visible.length} / {items.length}
            </span>
          </div>
          <SortableContext
            items={visible.map((v) => v.categoryKey)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-[rgba(255,255,255,0.02)] p-1">
              {visible.map((it) => (
                <SortableTile
                  key={it.categoryKey}
                  item={it}
                  onToggleHide={() => toggleHide(it.categoryKey)}
                />
              ))}
            </div>
          </SortableContext>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
            <span>Hidden</span>
            <span>{hidden.length} hidden</span>
          </div>
          <SortableContext
            items={hidden.map((v) => v.categoryKey)}
            strategy={rectSortingStrategy}
          >
            <div className="grid min-h-[92px] grid-cols-4 gap-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] p-1">
              {hidden.length === 0 ? (
                <div className="col-span-4 px-3 py-7 text-center text-[11px] italic text-[var(--tg-theme-subtitle-text-color)] opacity-70">
                  Drag a tile here (or tap its eye) to hide it from the picker.
                </div>
              ) : (
                hidden.map((it) => (
                  <SortableTile
                    key={it.categoryKey}
                    item={it}
                    onToggleHide={() => toggleHide(it.categoryKey)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </section>
      </DndContext>
    </main>
  );
}
