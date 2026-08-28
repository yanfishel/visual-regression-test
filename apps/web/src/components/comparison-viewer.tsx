"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { Rect, RegionEntry, RegionReport } from "@vrt/shared/regions";
import { isEditableTarget, isPlainKey } from "@/lib/keyboard-shortcuts";
import {
  ActualSizeIcon,
  ColumnsIcon,
  CurtainIcon,
  DiffIcon,
  DraggableHorizontalIcon,
  FitWidthIcon,
  LayersIcon,
  RegionsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";
import { RegionList } from "./region-list";
import { ShotLayer, type RegionSide, type Size } from "./region-overlay";
import { SelectMenu, type SelectMenuOption } from "./select-menu";

type Mode = "side-by-side" | "curtain" | "onion" | "diff";

// Order doubles as the keyboard shortcut: digit 1-4 selects the mode.
const MODES: { id: Mode; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "side-by-side", label: "Side by side", Icon: ColumnsIcon },
  { id: "curtain", label: "Curtain", Icon: CurtainIcon },
  { id: "onion", label: "Onion skin", Icon: LayersIcon },
  { id: "diff", label: "Diff overlay", Icon: DiffIcon },
];

// The mode dropdown's rows: icon + name, the same node in the trigger and
// the list (Radix Select echoes the chosen ItemText into the trigger).
const MODE_OPTIONS: SelectMenuOption[] = MODES.map(({ id, label, Icon }) => ({
  value: id,
  label: (
    <span className="inline-flex items-center gap-2 font-sans font-semibold">
      {/* Nudged 1px down: the icon centres on the line box, whose centre
          sits above the x-height centre of the text beside it (same as
          ViewportChip's plain form). */}
      <Icon className="h-4 w-4 translate-y-px text-text-muted" />
      {label}
    </span>
  ),
}));

// Modes whose left/right halves are literally baseline/current, so the
// caption strip above the image splits the same way.
const SPLIT_MODES: readonly Mode[] = ["side-by-side", "curtain"];

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.0015; // wheel deltaY -> zoom multiplier
const ZOOM_BUTTON_STEP = 1.25; // multiplicative step per +/- button click

export interface ComparisonViewerProps {
  currentUrl: string;
  baselineUrl: string;
  diffOverlayUrl: string;
  altText: string;
  /** Names the baseline side - which run it came from (`Baseline · <run date>`). */
  baselineCaption: ReactNode;
  /** Names the current side (`Current · this run`). */
  currentCaption: ReactNode;
  /** Parsed region report, or null when the comparison has none - then the toggle is not rendered. */
  regionReport: RegionReport | null;
  /** Pixel size of the current capture, the viewBox the current side's rects are drawn in. */
  currentSize: Size;
  /** Pixel size of the baseline capture, the viewBox the baseline side's rects are drawn in. */
  baselineSize: Size;
}

export function ComparisonViewer({
  currentUrl,
  baselineUrl,
  diffOverlayUrl,
  altText,
  baselineCaption,
  currentCaption,
  regionReport,
  currentSize,
  baselineSize,
}: ComparisonViewerProps) {
  const [mode, setMode] = useState<Mode>("side-by-side");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [curtainPosition, setCurtainPosition] = useState(50);
  const [onionOpacity, setOnionOpacity] = useState(50);
  // Region overlay: on by default only when there is something to point
  // at; a report of nothing but `unchanged` would just hatch the capture.
  const hasRegionChanges = regionReport?.entries.some((entry) => entry.status !== "unchanged") ?? false;
  // Whether the report has anything to show at all - an empty `entries`
  // array hides the toggle entirely rather than offering a switch that
  // would only ever reveal nothing.
  const hasRegions = (regionReport?.entries.length ?? 0) > 0;
  const [showRegions, setShowRegions] = useState(hasRegionChanges);
  // Hover/selection of a single region, read by every ShotLayer and set by
  // the region list below.
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref on one representative <img> per mode (whichever renders), used to
  // measure the image's own on-screen size for pan clamping - see clampPan.
  const imageRef = useRef<HTMLImageElement>(null);

  // Keeps the image's edges from being dragged past the viewport's edges
  // (no panning into empty space beyond the image). `image.offsetWidth`/
  // `offsetHeight` are the CSS layout size *before* the `scale()` transform
  // (transforms never affect layout box size), so multiplying by the
  // current zoom gives the actual on-screen size to clamp against. In
  // side-by-side mode each image only has half the container's width to
  // itself (the two-column grid); every other mode uses the full width.
  const clampPan = useCallback(
    (next: { x: number; y: number }, currentZoom: number): { x: number; y: number } => {
      const container = containerRef.current;
      const image = imageRef.current;
      if (!container || !image) {
        return next;
      }

      const viewportWidth = mode === "side-by-side" ? container.clientWidth / 2 : container.clientWidth;
      const viewportHeight = container.clientHeight;
      const scaledWidth = image.offsetWidth * currentZoom;
      const scaledHeight = image.offsetHeight * currentZoom;

      const clampAxis = (value: number, viewportSize: number, scaledSize: number): number => {
        if (scaledSize <= viewportSize) {
          // Image doesn't fill the viewport on this axis - center it
          // rather than let it sit flush against one edge.
          return (viewportSize - scaledSize) / 2;
        }
        return Math.min(0, Math.max(viewportSize - scaledSize, value));
      };

      return {
        x: clampAxis(next.x, viewportWidth, scaledWidth),
        y: clampAxis(next.y, viewportHeight, scaledHeight),
      };
    },
    [mode],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      setZoom((current) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current - event.deltaY * ZOOM_STEP * current));
        setPan((currentPan) => clampPan(currentPan, next));
        return next;
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [clampPan]);

  // The viewport shape changes when switching modes (side-by-side halves
  // the effective width), which can leave a previously-valid pan out of
  // bounds - re-clamp whenever mode changes.
  useEffect(() => {
    setPan((current) => clampPan(current, zoom));
  }, [mode, zoom, clampPan]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // The curtain handle/hit-strip call stopPropagation() in their own
      // pointerdown, so a curtain drag never reaches here - no bail-out
      // needed for those.
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = { startX: event.clientX, startY: event.clientY, startPan: pan };
    },
    [pan],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) {
        return;
      }
      const dx = event.clientX - dragState.current.startX;
      const dy = event.clientY - dragState.current.startY;
      setPan(clampPan({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy }, zoom));
    },
    [clampPan, zoom],
  );

  // Covers the case where a drag or zoom happens before the image has
  // finished loading (offsetWidth/Height would read as 0 until then).
  const onImageLoad = useCallback(() => {
    setPan((current) => clampPan(current, zoom));
  }, [clampPan, zoom]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
  }, []);

  const onPointerCancel = useCallback(() => {
    dragState.current = null;
  }, []);

  // Belt-and-suspenders against the browser's own drag gestures competing
  // with the custom pan above: draggable={false} disables HTML5 image
  // drag-and-drop, but a mousedown+move can still kick off native content
  // *selection* (governed by user-select, not draggable) or - in some
  // WebKit versions - image dragging that ignores draggable={false}. Either
  // one fires a native dragstart/selectstart a few pixels into the gesture,
  // which the UA treats as taking over the pointer and cancels our pointer
  // capture for (pointercancel), silently killing the pan after a few
  // pixels of movement. select-none/-webkit-user-drag:none below close the
  // CSS half of this; preventDefault on dragstart closes the DOM-event half.
  const preventDragStart = useCallback((event: DragEvent<HTMLImageElement>) => {
    event.preventDefault();
  }, []);

  // image.naturalWidth / image.offsetWidth: the multiplier from the
  // current "fit width" layout size (offsetWidth - unaffected by the
  // scale() transform) to the image's true native pixel resolution.
  // Recomputed from the DOM on every render rather than cached in state,
  // so it's never stale - it only affects display/the toggle target below,
  // not any correctness-critical logic, and this component already
  // re-renders on every pan/zoom change plus once more via onImageLoad
  // once the image has actually loaded (before that, naturalWidth reads 0
  // and this falls back to 1, matching the fit-width baseline).
  const image = imageRef.current;
  const nativeZoom =
    image && image.naturalWidth && image.offsetWidth
      ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, image.naturalWidth / image.offsetWidth))
      : 1;
  const isFitWidth = Math.abs(zoom - 1) < 0.01;

  // Toggles between "fit width" (zoom 1, matching the image's max-w-full
  // resting size) and "100%" (nativeZoom, the image's true native pixel
  // resolution). Whenever the current zoom isn't (approximately) 1, this
  // always goes back to fit width first, rather than tracking separate
  // toggle state that could drift out of sync with a manually wheel-zoomed
  // value.
  const toggleFitOrNative = useCallback(() => {
    if (!imageRef.current || !imageRef.current.naturalWidth || !imageRef.current.offsetWidth) {
      return;
    }
    const next = isFitWidth ? nativeZoom : 1;
    setZoom(next);
    setPan(clampPan({ x: 0, y: 0 }, next));
  }, [isFitWidth, nativeZoom, clampPan]);

  const zoomIn = useCallback(() => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, current * ZOOM_BUTTON_STEP);
      setPan((currentPan) => clampPan(currentPan, next));
      return next;
    });
  }, [clampPan]);

  const zoomOut = useCallback(() => {
    setZoom((current) => {
      const next = Math.max(MIN_ZOOM, current / ZOOM_BUTTON_STEP);
      setPan((currentPan) => clampPan(currentPan, next));
      return next;
    });
  }, [clampPan]);

  // Click in the list: bring the region's top edge to the container's top.
  // Screen px per screenshot px = layout width × zoom / image width; the
  // side's own width matters when the two captures differ in width.
  const panToRect = useCallback(
    (rect: Rect, side: RegionSide) => {
      const image = imageRef.current;
      if (!image || !image.offsetWidth) {
        return;
      }
      const shotWidth = side === "baseline" ? baselineSize.width : currentSize.width;
      const scale = (image.offsetWidth * zoom) / shotWidth;
      setPan((current) => clampPan({ x: current.x, y: -rect.y * scale }, zoom));
    },
    [baselineSize.width, currentSize.width, zoom, clampPan],
  );

  const onSelectRegion = useCallback(
    (id: string, entry: RegionEntry) => {
      setSelectedKey((current) => (current === id ? null : id));
      setShowRegions(true);
      const target = entry.current
        ? { rect: entry.current, side: "current" as const }
        : entry.baseline
          ? { rect: entry.baseline, side: "baseline" as const }
          : null;
      if (target) {
        panToRect(target.rect, target.side);
      }
    },
    [panToRect],
  );

  // Curtain mode's position control: a handle pinned to the vertical center
  // of the *container's own* visible box (not the tall unclipped image
  // behind it - that's what made the old native <input type="range">,
  // positioned at the bottom of the full image, unreachable once the
  // container gained max-h-[80vh] + overflow-hidden above). Driven by
  // pointer events directly rather than a range input so both the handle
  // and the divider line itself are draggable, computed from the
  // container's own bounding rect - independent of zoom, since
  // curtainPosition is a plain percentage of container width.
  const curtainDragging = useRef(false);

  const updateCurtainPositionFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setCurtainPosition(Math.min(100, Math.max(0, percent)));
  }, []);

  const onCurtainPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Stop this from also bubbling into the pan container's own
      // onPointerDown - otherwise dragging the curtain would pan the
      // images underneath it at the same time (the same bug class the
      // curtain-slider-vs-pan fix addressed for the old range input).
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      curtainDragging.current = true;
      updateCurtainPositionFromClientX(event.clientX);
    },
    [updateCurtainPositionFromClientX],
  );

  const onCurtainPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!curtainDragging.current) {
        return;
      }
      event.stopPropagation();
      updateCurtainPositionFromClientX(event.clientX);
    },
    [updateCurtainPositionFromClientX],
  );

  const onCurtainPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    curtainDragging.current = false;
  }, []);

  const onCurtainPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    curtainDragging.current = false;
  }, []);

  // The onion-opacity bubble shows while the thumb is hovered or dragged.
  // Radix Tooltip alone closes on pointerdown (a tooltip is meant to get out
  // of the way of a press), so the drag half is tracked by hand: armed on
  // the slider's pointerdown, released on the next window pointerup - not
  // the thumb's own, which a drag released off the thumb never fires.
  const [onionThumbHovered, setOnionThumbHovered] = useState(false);
  const [onionSliderDragging, setOnionSliderDragging] = useState(false);

  useEffect(() => {
    if (!onionSliderDragging) {
      return;
    }
    const handlePointerUp = () => setOnionSliderDragging(false);
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [onionSliderDragging]);

  const onCurtainKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCurtainPosition((current) => Math.max(0, current - 2));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setCurtainPosition((current) => Math.min(100, current + 2));
    }
  }, []);

  // Digits 1-4 switch modes and `R` toggles the region overlay, from
  // anywhere on the page (the nav strip owns the arrow keys the same way);
  // never while typing in a field.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isPlainKey(event) || isEditableTarget(event.target as HTMLElement | null)) {
        return;
      }
      if (event.key === "r" || event.key === "R") {
        // Silent when the comparison has no report - there is no toggle in
        // the toolbar either, so the key must not appear to do something.
        if (hasRegions) {
          event.preventDefault();
          setShowRegions((current) => !current);
        }
        return;
      }
      if (!/^[1-4]$/.test(event.key)) {
        return;
      }
      const target = MODES[Number(event.key) - 1];
      if (target) {
        event.preventDefault();
        setMode(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasRegions]);

  const imageTransform = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "0 0",
  };

  // Everything a ShotLayer needs except which capture it shows: the shared
  // pan/zoom transform and the region state, per side.
  const layer = (side: RegionSide) => ({
    transform: imageTransform,
    regions: regionReport,
    side,
    showRegions,
    highlightedKey,
    selectedKey,
    onDragStart: preventDragStart,
  });

  return (
    // One panel: the mode dropdown and every shared control in a toolbar on
    // top, a caption strip naming the sides, then the pan container. Nothing
    // floats over the capture any more except the curtain handle - the zoom
    // panel used to cover the top-right corner of whichever page was under
    // review (see docs/notes/ui.md, diff viewer).
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-2 py-1.5">
        <SelectMenu
          value={mode}
          options={MODE_OPTIONS}
          onValueChange={(next) => setMode(next as Mode)}
          ariaLabel="View mode"
          className="w-44 shrink-0"
        />

        {/* Thin rules between the toolbar's groups and buttons, so the
            controls read as separate stops rather than one run of glyphs. */}
        <div className="ml-auto flex items-center gap-2">
          {/* Onion skin's opacity: the one mode-specific toolbar control.
              The percentage is a tooltip-style bubble on the thumb, shown
              while hovering or dragging it (see onionSliderDragging). */}
          {mode === "onion" && (
            <>
              <div className="flex h-8 items-center gap-2 px-1">
                <span className="text-xs text-text-muted">Baseline</span>
                <Slider.Root
                  className="relative flex h-4 w-32 touch-none select-none items-center"
                  value={[onionOpacity]}
                  onValueChange={([value]) => setOnionOpacity(value ?? onionOpacity)}
                  onPointerDown={() => setOnionSliderDragging(true)}
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Onion skin opacity"
                >
                  <Slider.Track className="relative h-1 grow rounded-full bg-border">
                    <Slider.Range className="absolute h-full rounded-full bg-accent" />
                  </Slider.Track>
                  <Tooltip.Root open={onionThumbHovered || onionSliderDragging}>
                    <Tooltip.Trigger asChild>
                      <Slider.Thumb
                        onPointerEnter={() => setOnionThumbHovered(true)}
                        onPointerLeave={() => setOnionThumbHovered(false)}
                        className="block h-4 w-4 rounded-full border-2 border-accent bg-surface shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="top"
                        sideOffset={2}
                        className="z-50 select-none rounded-md bg-text px-2 py-1 font-mono text-xs font-medium text-bg shadow-lg"
                      >
                        {onionOpacity}%
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Slider.Root>
                <span className="text-xs text-text-muted">Current</span>
              </div>
              <ToolbarRule />
            </>
          )}

          {/* Zoom - one shared control for the one shared zoom/pan state. */}
          <div className="flex shrink-0 items-center gap-1">
            <ZoomPanelButton label={isFitWidth ? "Actual size" : "Fit to width"} onClick={toggleFitOrNative}>
              {isFitWidth ? <ActualSizeIcon className="h-4 w-4" /> : <FitWidthIcon className="h-4 w-4" />}
            </ZoomPanelButton>
            <ToolbarRule />
            <span
              className="min-w-[3rem] px-1 text-center font-mono text-xs text-text-muted"
              aria-live="polite"
              aria-label={`Zoom ${Math.round((zoom / nativeZoom) * 100)} percent of actual size`}
            >
              {Math.round((zoom / nativeZoom) * 100)}%
            </span>
            <ToolbarRule />
            <ZoomPanelButton label="Zoom in" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
              <ZoomInIcon className="h-4 w-4" />
            </ZoomPanelButton>
            <ToolbarRule />
            <ZoomPanelButton label="Zoom out" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
              <ZoomOutIcon className="h-4 w-4" />
            </ZoomPanelButton>
          </div>

          {/* Region overlay - only when the comparison carries a non-empty
              report. */}
          {hasRegions && (
            <div className="flex shrink-0 items-center gap-2">
              <ToolbarRule />
              <ZoomPanelButton
                label="Regions (R)"
                onClick={() => setShowRegions((current) => !current)}
                pressed={showRegions}
              >
                <RegionsIcon className="h-4 w-4" />
              </ZoomPanelButton>
            </div>
          )}
        </div>
      </div>

      {/* Which side is which. Split modes label their halves in place; the
          stacked modes (onion, diff) get one line naming both layers. */}
      {SPLIT_MODES.includes(mode) ? (
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border text-xs">
          <div className="bg-surface-alt px-3 py-1.5 text-text-muted">{baselineCaption}</div>
          <div className="bg-surface-alt px-3 py-1.5 text-text-muted">{currentCaption}</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 border-b border-border bg-surface-alt px-3 py-1.5 text-xs text-text-muted">
          <span>{baselineCaption}</span>
          <span aria-hidden className="text-text-faint">
            {mode === "onion" ? "under" : "vs"}
          </span>
          <span>{currentCaption}</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative max-h-[80vh] select-none overflow-hidden bg-surface-alt outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ cursor: "grab", touchAction: "none" }}
      >
        {mode === "side-by-side" && (
          <div className="grid grid-cols-2 gap-px bg-border">
            <div className="overflow-hidden bg-surface">
              <ShotLayer
                {...layer("baseline")}
                src={baselineUrl}
                alt={`${altText} - baseline`}
                size={baselineSize}
                imageRef={imageRef}
                onLoad={onImageLoad}
              />
            </div>
            <div className="overflow-hidden bg-surface">
              <ShotLayer
                {...layer("current")}
                src={currentUrl}
                alt={`${altText} - current`}
                size={currentSize}
              />
            </div>
          </div>
        )}

        {mode === "curtain" && (
          <>
            {/* Baseline is the clipped layer on the left, current the full
                image behind it on the right - the same left/right assignment
                as side by side, so the caption strip reads the same way. */}
            <div className="relative">
              <ShotLayer
                {...layer("current")}
                src={currentUrl}
                alt={`${altText} - current`}
                size={currentSize}
                imageRef={imageRef}
                onLoad={onImageLoad}
              />
              <div
                className="absolute inset-0 overflow-hidden drop-shadow-[0_8px_15px_3px_rgba(0,0,0,0.45)]"
                style={{ clipPath: `inset(0 ${100 - curtainPosition}% 0 0)` }}
              >
                <ShotLayer
                  {...layer("baseline")}
                  src={baselineUrl}
                  alt={`${altText} - baseline`}
                  size={baselineSize}
                />
              </div>
              {/* Wide invisible hit-strip around the thin visible line, draggable
                  anywhere along its (possibly clipped-tall) visible extent. */}
              <div
                className="absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${curtainPosition}%` }}
                onPointerDown={onCurtainPointerDown}
                onPointerMove={onCurtainPointerMove}
                onPointerUp={onCurtainPointerUp}
                onPointerCancel={onCurtainPointerCancel}
              >
                <div className="mx-auto h-full w-0.5 bg-accent" />
              </div>
            </div>
            {/* Handle pinned to the container's own vertical center (not the
                unclipped image's), so it's always reachable regardless of how
                tall the capture is. */}
            <div
              className="absolute top-1/2 z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-accent bg-surface text-accent shadow-sm"
              style={{ left: `${curtainPosition}%` }}
              onPointerDown={onCurtainPointerDown}
              onPointerMove={onCurtainPointerMove}
              onPointerUp={onCurtainPointerUp}
              onPointerCancel={onCurtainPointerCancel}
              onKeyDown={onCurtainKeyDown}
              role="slider"
              aria-label="Curtain position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(curtainPosition)}
              tabIndex={0}
            >
              <span aria-hidden="true">
                <DraggableHorizontalIcon className={"h-4 w-4"} />
              </span>
            </div>
          </>
        )}

        {mode === "onion" && (
          <div className="relative">
            <ShotLayer
              {...layer("baseline")}
              src={baselineUrl}
              alt={`${altText} - baseline`}
              size={baselineSize}
              imageRef={imageRef}
              onLoad={onImageLoad}
            />
            {/* The opacity sits on the wrapper, not the image, so the
                current side's rects fade with the capture they belong to. */}
            <ShotLayer
              {...layer("current")}
              src={currentUrl}
              alt={`${altText} - current`}
              size={currentSize}
              className="absolute left-0 top-0"
              style={{ opacity: onionOpacity / 100 }}
            />
          </div>
        )}

        {mode === "diff" && (
          // The overlay image is the top-left crop the two captures share,
          // so its rects are drawn in a viewBox of that shared size.
          <ShotLayer
            {...layer("current")}
            src={diffOverlayUrl}
            alt={`${altText} - diff overlay`}
            size={{
              width: Math.min(baselineSize.width, currentSize.width),
              height: Math.min(baselineSize.height, currentSize.height),
            }}
            imageRef={imageRef}
            onLoad={onImageLoad}
          />
        )}
      </div>

      {hasRegions && showRegions && (
        <RegionList
          // hasRegions is only true when regionReport is non-null and its
          // entries array is non-empty.
          report={regionReport!}
          highlightedKey={highlightedKey}
          selectedKey={selectedKey}
          onHighlight={setHighlightedKey}
          onSelect={onSelectRegion}
        />
      )}
    </div>
  );
}

function ToolbarRule() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-border" />;
}

// A zoom-panel button with a Radix Tooltip (not the native `title`
// attribute, which is unstyled, slow to appear, and looks out of place next
// to the rest of this app's design). Tooltip.Content portals to
// document.body, so the panel's overflow-hidden never clips it, and Radix
// repositions it automatically if it would collide with the viewport edge.
function ZoomPanelButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Set on toggle buttons: renders `aria-pressed` and the held-down look. */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-pressed={pressed}
          className={`flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${pressed ? "bg-surface-alt text-text" : ""}`}
          aria-label={label}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 select-none rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow-md"
        >
          {label}
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
