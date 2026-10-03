import { segments, segmentAt, segmentAtAngle, TAU, PALETTES } from "./engine.js";
const images = new Map();
export function imageResource(src, onload) {
  if (!src) return null;
  if (images.has(src)) return images.get(src);
  const img = new Image();
  img.onload = () => onload?.();
  img.src = src;
  images.set(src, img);
  if (images.size > 500) images.delete(images.keys().next().value);
  return img;
}
export function render(canvas, wheel, rotation = 0, redraw) {
  const ctx = canvas.getContext("2d"),
    size = canvas.width,
    c = size / 2,
    r = c - 5,
    a = wheel.appearanceSettings;
  ctx.clearRect(0, 0, size, size);
  const parts = segments(wheel.entries);
  if (!parts.length) {
    ctx.fillStyle = "#e6e7ee";
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#62667a";
    ctx.textAlign = "center";
    ctx.font = "28px Arial";
    ctx.fillText("Add your first possibility", c, c - 100);
    return;
  }
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(rotation);
  // More slices than pixels are drawn as bounded angular samples. Selection retains the exact weighted index.
  let visualParts=parts;
  if(parts.length>4096){visualParts=[];for(let i=0;i<2048;i++){const part=segmentAtAngle(parts,(i+.5)/2048*TAU),previous=visualParts.at(-1);if(previous?.index===part.index)previous.end=(i+1)/2048*TAU;else visualParts.push({...part,start:i/2048*TAU,end:(i+1)/2048*TAU});}}
  for (let i = 0; i < visualParts.length; i++) {
    const p = segmentAt(visualParts,i);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, p.start, p.end);
    ctx.closePath();
    ctx.fillStyle =
      p.entry.color || a.palette[p.index % a.palette.length] || PALETTES.Orbit[0];
    ctx.fill();
    if (a.dividers && parts.length < 500) {
      ctx.strokeStyle = "#ffffff99";
      ctx.lineWidth = a.borderWidth;
      ctx.stroke();
    }
    const sweep = p.end - p.start;
    if (sweep > 0.033) {
      ctx.save();
      const angle = (p.start + p.end) / 2;
      ctx.rotate(angle);
      ctx.fillStyle = a.textColor;
      ctx.textAlign = "right";
      const font = Math.max(14, Math.min(a.fontSize, 120 * sweep));
      ctx.font = `600 ${font}px "DM Sans",Arial,sans-serif`;
      if (a.labels) {
        let text = p.entry.text;
        const maxWidth = r * 0.51,
          chars = [...text];
        if (ctx.measureText(text).width > maxWidth) {
          let lo = 0,
            hi = chars.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (
              ctx.measureText(chars.slice(0, mid).join("") + "…").width <=
              maxWidth
            )
              lo = mid;
            else hi = mid - 1;
          }
          text = chars.slice(0, lo).join("") + "…";
        }
        ctx.fillText(text, r * 0.9, font * 0.34);
      }
      const img = imageResource(p.entry.image, redraw);
      if (img?.complete && img.naturalWidth && sweep > 0.1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(r * 0.29, 0, Math.min(28, sweep * 100), 0, Math.PI * 2);
        ctx.clip();
        const s = Math.min(56, sweep * 200);
        ctx.drawImage(img, r * 0.29 - s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
