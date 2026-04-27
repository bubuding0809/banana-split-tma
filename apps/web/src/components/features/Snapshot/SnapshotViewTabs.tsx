import { SegmentedControl } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";

export const SNAPSHOT_VIEWS = ["cat", "date"] as const;
export type SnapshotView = (typeof SNAPSHOT_VIEWS)[number];

interface SnapshotViewTabsProps {
  value: SnapshotView;
  onChange: (view: SnapshotView) => void;
}

const VIEWS: Array<{ id: SnapshotView; label: string }> = [
  { id: "cat", label: "📋 Category" },
  { id: "date", label: "📅 Date" },
];

export function SnapshotViewTabs({ value, onChange }: SnapshotViewTabsProps) {
  return (
    <SegmentedControl>
      {VIEWS.map((v) => (
        <SegmentedControl.Item
          key={v.id}
          selected={v.id === value}
          onClick={() => {
            if (v.id === value) return;
            if (hapticFeedback.isSupported()) hapticFeedback.selectionChanged();
            onChange(v.id);
          }}
        >
          {v.label}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl>
  );
}
