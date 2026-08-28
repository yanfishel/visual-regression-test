"use client";

// Imported from the constants entry point, not the package root: the root
// barrel re-exports the redis helper, and pulling ioredis into a client
// component breaks the browser bundle.
import { VIEWPORT_PRESETS, type ViewportPresetId } from "@vrt/shared/constants";

// Multi-select over the fixed preset list - viewport height is never asked for
// (see the VIEWPORT_PRESETS comment: captures are fullPage, so the height in
// the preset is only the browser window).
export function ViewportPicker({
  selected,
  onChange,
  warningFor,
}: {
  selected: ViewportPresetId[];
  onChange: (selected: ViewportPresetId[]) => void;
  warningFor?: (presetId: ViewportPresetId) => string | null;
}) {
  function toggle(presetId: ViewportPresetId) {
    onChange(
      selected.includes(presetId) ? selected.filter((id) => id !== presetId) : [...selected, presetId],
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {VIEWPORT_PRESETS.map((preset) => {
        const isSelected = selected.includes(preset.id);
        const warning = warningFor?.(preset.id) ?? null;

        return (
          <label
            key={preset.id}
            className={`flex cursor-pointer flex-col gap-1 rounded-sm border px-3 py-2.5 transition ${
              isSelected ? "border-accent bg-accent-soft" : "border-border bg-bg hover:border-text-faint"
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(preset.id)}
                className="h-4 w-4 shrink-0 accent-accent"
              />
              <span className="text-sm font-semibold">{preset.label}</span>
              <span className="ml-auto font-mono text-xs text-text-muted">{preset.width}px</span>
            </span>
            {warning ? <span className="text-xs text-danger">{warning}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
