"use client";
/**
 * Timelapse: a small picture of the tile after every step, kept in memory while painting.
 * Replays in the paint tool, exports as a vertical video, and gives the reviewer a strip of
 * frames as proof the tile was painted by hand. Only this one square is ever in it.
 */

const SIDE = 360, MAX_FRAMES = 480;

export class TimelapseRecorder {
  private frames: Blob[] = [];
  private pending: Promise<void> = Promise.resolve();
  steps = 0;

  get length(): number { return this.frames.length; }

  /** Adds a frame of the whole tile. Cheap: a 360 px JPEG made off the main work. */
  capture(source: HTMLCanvasElement) {
    this.steps++;
    const c = document.createElement("canvas");
    c.width = c.height = SIDE;
    c.getContext("2d")!.drawImage(source, 0, 0, SIDE, SIDE);
    this.pending = this.pending.then(() => new Promise<void>((done) => c.toBlob((b) => {
      if (b) {
        this.frames.push(b);
        // Long paintings keep every other frame, so memory stays small and the replay stays short.
        if (this.frames.length > MAX_FRAMES) this.frames = this.frames.filter((_, i) => i % 2 === 0);
      }
      done();
    }, "image/jpeg", 0.8)));
  }

  async images(): Promise<HTMLImageElement[]> {
    await this.pending;
    return Promise.all(this.frames.map((b) => new Promise<HTMLImageElement>((ok, no) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(img.src); ok(img); };
      img.onerror = no;
      img.src = URL.createObjectURL(b);
    })));
  }

  /** Eight frames side by side (512 × 64), for the reviewer. Null when there is too little to show. */
  async strip(): Promise<string | null> {
    const imgs = await this.images();
    if (imgs.length < 2) return null;
    const n = 8, c = document.createElement("canvas");
    c.width = n * 64; c.height = 64;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < n; i++) ctx.drawImage(imgs[Math.round((i / (n - 1)) * (imgs.length - 1))], i * 64, 0, 64, 64);
    return c.toDataURL("image/jpeg", 0.7);
  }
}

/** One frame of the shareable video: the square on the dark wall, framed in its slot colour. */
export function drawVideoFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, slotHex: string, label: string, sub: string) {
  const W = ctx.canvas.width, H = ctx.canvas.height, box = Math.round(W * 0.84), x = (W - box) / 2, y = Math.round(H * 0.24);
  ctx.fillStyle = "#0e0b09"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = slotHex; ctx.fillRect(x - 18, y - 18, box + 36, box + 36);
  if (img) { ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, x, y, box, box); }
  const css = typeof document !== "undefined" ? getComputedStyle(document.body) : null;
  const serif = css?.getPropertyValue("--serif").trim() || "Georgia, serif", sans = css?.getPropertyValue("--sans").trim() || "system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(201,162,79,.95)"; ctx.font = `500 ${Math.round(W * 0.026)}px ${sans}`;
  ctx.fillText("TESSERA  ·  PAINTED BY HAND", W / 2, y - Math.round(W * 0.09));
  ctx.fillStyle = "#efe3cc"; ctx.font = `italic ${Math.round(W * 0.06)}px ${serif}`;
  ctx.fillText(label, W / 2, y + box + Math.round(W * 0.14));
  ctx.fillStyle = "#a89a84"; ctx.font = `${Math.round(W * 0.028)}px ${sans}`;
  ctx.fillText(sub, W / 2, y + box + Math.round(W * 0.2));
}

/** Records the replay as a 1080 × 1920 video. Resolves with a file to download. */
export async function exportTimelapse(rec: TimelapseRecorder, slotHex: string, label: string, seconds = 10): Promise<{ url: string; ext: string }> {
  const imgs = await rec.images();
  if (!imgs.length) throw new Error("Paint a few strokes first.");
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1920;
  const ctx = c.getContext("2d")!;
  if (typeof MediaRecorder === "undefined" || !c.captureStream) throw new Error("This browser can’t make videos. Try Chrome, Edge or Safari.");
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  const media = new MediaRecorder(c.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: Blob[] = [];
  media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((ok) => { media.onstop = () => ok(new Blob(chunks, { type: media.mimeType || "video/webm" })); });
  drawVideoFrame(ctx, imgs[0], slotHex, label, `Step 1 of ${imgs.length}`);
  media.start();
  const total = Math.max(2, seconds) * 1000, hold = 1500, t0 = performance.now();
  await new Promise<void>((finish) => {
    const step = () => {
      const t = performance.now() - t0;
      const i = Math.min(imgs.length - 1, Math.floor((t / total) * imgs.length));
      drawVideoFrame(ctx, imgs[i], slotHex, label, `Step ${i + 1} of ${imgs.length}`);
      if (t < total + hold) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  });
  media.stop();
  const blob = await done;
  return { url: URL.createObjectURL(blob), ext: blob.type.includes("mp4") ? "mp4" : "webm" };
}
