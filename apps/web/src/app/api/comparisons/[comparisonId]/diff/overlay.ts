import sharp from "sharp";

// Sum of per-channel absolute differences above which a pixel is treated
// as "really changed" rather than antialiasing/subpixel noise - same
// concern odiff's `antialiasing: true` addresses in the worker
// (run-processor.ts), reimplemented here since this overlay doesn't use
// odiff (see the plan's Global Constraints: no odiff in the web image).
const DIFF_THRESHOLD = 24;
const OVERLAY_ALPHA = 0.6;
const OVERLAY_COLOR = { r: 255, g: 0, b: 64 };

export async function computeDiffOverlay(currentPng: Buffer, baselinePng: Buffer): Promise<Buffer> {
  const [currentMeta, baselineMeta] = await Promise.all([
    sharp(currentPng).metadata(),
    sharp(baselinePng).metadata(),
  ]);

  // Layout-diff case: align both images to their shared top-left region,
  // the same alignment the worker's diffTopAlignedRegion (run-processor.ts)
  // already performs, so this overlay agrees with what odiff compared.
  const width = Math.min(currentMeta.width ?? 0, baselineMeta.width ?? 0);
  const height = Math.min(currentMeta.height ?? 0, baselineMeta.height ?? 0);

  const [{ data: currentRaw }, { data: baselineRaw }] = await Promise.all([
    sharp(currentPng)
      .extract({ left: 0, top: 0, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(baselinePng)
      .extract({ left: 0, top: 0, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  const output = Buffer.from(currentRaw);
  for (let i = 0; i < output.length; i += 4) {
    const delta =
      Math.abs(currentRaw[i]! - baselineRaw[i]!) +
      Math.abs(currentRaw[i + 1]! - baselineRaw[i + 1]!) +
      Math.abs(currentRaw[i + 2]! - baselineRaw[i + 2]!);
    if (delta > DIFF_THRESHOLD) {
      output[i] = Math.round(currentRaw[i]! * (1 - OVERLAY_ALPHA) + OVERLAY_COLOR.r * OVERLAY_ALPHA);
      output[i + 1] = Math.round(currentRaw[i + 1]! * (1 - OVERLAY_ALPHA) + OVERLAY_COLOR.g * OVERLAY_ALPHA);
      output[i + 2] = Math.round(currentRaw[i + 2]! * (1 - OVERLAY_ALPHA) + OVERLAY_COLOR.b * OVERLAY_ALPHA);
    }
  }

  return sharp(output, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
