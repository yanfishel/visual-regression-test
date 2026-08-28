import { VIEWPORT_PRESETS, type ViewportPreset, type ViewportPresetId } from "@vrt/shared/constants";
import type { Viewport } from "@vrt/db";

// Viewport rows carry no preset id column, so a row is matched back to its
// preset by width - preset widths are unique for exactly this reason. Every
// viewport is created from a preset today; a row that matches none is a
// leftover from before presets existed (see CLAUDE.md section 4).
export function presetOf(viewport: Pick<Viewport, "width">): ViewportPreset | undefined {
  return VIEWPORT_PRESETS.find((preset) => preset.width === viewport.width);
}

export function presetIdsOf(viewports: Pick<Viewport, "width">[]): ViewportPresetId[] {
  const ids = viewports.map((viewport) => presetOf(viewport)?.id).filter(Boolean) as ViewportPresetId[];
  return [...new Set(ids)];
}

export type ViewportKind = ViewportPresetId;

// Which device family a viewport belongs to, for the badge icons on the
// project page. Preset rows answer by id; a non-preset row falls back to
// common device-width breakpoints.
export function viewportKindOf(viewport: Pick<Viewport, "width">): ViewportKind {
  const preset = presetOf(viewport);
  if (preset) {
    return preset.id;
  }
  if (viewport.width >= 1024) {
    return "desktop";
  }
  return viewport.width >= 600 ? "tablet" : "mobile";
}

export interface ViewportSelectionDiff {
  toInsert: ViewportPreset[];
  toDeleteIds: string[];
}

export function diffViewportSelection(
  existing: Pick<Viewport, "id" | "width">[],
  selected: ViewportPresetId[],
): ViewportSelectionDiff {
  const selectedIds = new Set(selected);
  const existingIds = new Set(presetIdsOf(existing));

  const toInsert = VIEWPORT_PRESETS.filter(
    (preset) => selectedIds.has(preset.id) && !existingIds.has(preset.id),
  );

  // A row matching no preset is deleted unconditionally: the editor has no
  // way to create or keep one anymore, so its presence means it predates
  // presets or was restored from a backup. The baseline guard in
  // saveProjectAction still blocks the delete (and its cascade to shots) if
  // the row is an approved baseline.
  const toDeleteIds = existing
    .filter((viewport) => {
      const preset = presetOf(viewport);
      return preset === undefined || !selectedIds.has(preset.id);
    })
    .map((viewport) => viewport.id);

  return { toInsert: [...toInsert], toDeleteIds };
}
