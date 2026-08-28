import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { computeDiffOverlay } from "./overlay.js";

async function makeSolidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

describe("computeDiffOverlay", () => {
  it("tints pixels that differ and leaves matching pixels untouched", async () => {
    const baseline = await makeSolidPng(4, 4, { r: 10, g: 10, b: 10 });

    const currentRaw = Buffer.alloc(4 * 4 * 4);
    for (let i = 0; i < currentRaw.length; i += 4) {
      currentRaw[i] = 10;
      currentRaw[i + 1] = 10;
      currentRaw[i + 2] = 10;
      currentRaw[i + 3] = 255;
    }
    currentRaw[0] = 200; // top-left pixel's red channel changed dramatically
    const current = await sharp(currentRaw, { raw: { width: 4, height: 4, channels: 4 } })
      .png()
      .toBuffer();

    const result = await computeDiffOverlay(current, baseline);
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(4);
    expect(info.height).toBe(4);
    // Changed pixel: tinted toward red, not passed through as (200,10,10).
    expect(data[1]).toBeLessThan(10);
    // Untouched pixel (second pixel, offset 4 channels in): unchanged.
    const untouchedOffset = 4;
    expect(data[untouchedOffset]).toBe(10);
    expect(data[untouchedOffset + 1]).toBe(10);
    expect(data[untouchedOffset + 2]).toBe(10);
  });

  it("crops to the shared top-left region when dimensions differ", async () => {
    const baseline = await makeSolidPng(4, 4, { r: 5, g: 5, b: 5 });
    const current = await makeSolidPng(4, 6, { r: 5, g: 5, b: 5 }); // taller - layout-diff case

    const result = await computeDiffOverlay(current, baseline);
    const metadata = await sharp(result).metadata();

    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(4);
  });
});
