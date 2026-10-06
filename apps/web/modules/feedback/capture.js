/**
 * Browser-side helpers of the beta feedback tool (TEMPORARY): picking an element, describing it, and turning a picture
 * into a small JPEG data URL. Nothing here leaves the browser until the tester presses Send.
 */

const MAX_SIDE = 1400;
const QUALITY = 0.72;

const plainClass = (name) => /^[a-z][\w-]{1,22}$/i.test(name) && !/^(group|peer|hover|focus)/.test(name);

/** A short, readable path to an element, plus the words on it and the section it sits in — enough to search the code for. */
export function describeElement(element) {
  const parts = [];
  let node = element;
  for (let depth = 0; node && node.nodeType === 1 && depth < 5 && node !== document.body; depth += 1) {
    const tag = node.tagName.toLowerCase();
    const id = node.id && /^[\w-]{1,30}$/.test(node.id) ? `#${node.id}` : "";
    const classes = id ? "" : [...node.classList].filter(plainClass).slice(0, 2).map((name) => `.${name}`).join("");
    parts.unshift(`${tag}${id}${classes}`);
    if (id) break;
    node = node.parentElement;
  }
  const section = element.closest?.("section, article, [role=dialog], [role=tabpanel]");
  const heading = section?.querySelector?.("h1, h2, h3, h4")?.textContent || section?.getAttribute?.("aria-label") || "";
  return {
    selector: parts.join(" > "),
    tag: element.tagName.toLowerCase(),
    text: String(element.innerText || element.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 200),
    section: String(heading).replace(/\s+/g, " ").trim().slice(0, 100)
  };
}

/** Lets the tester tap a part of the screen. Resolves with the element, or null on Escape / Cancel. */
export function pickElement() {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;z-index:2147483000;pointer-events:none;border:2px solid #0071e3;background:rgba(0,113,227,0.12);border-radius:6px;transition:all 60ms";
    const banner = document.createElement("div");
    banner.textContent = "Tap the part you mean · Esc to cancel";
    banner.style.cssText = "position:fixed;z-index:2147483001;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;border-radius:999px;padding:8px 16px;font:600 13px system-ui;pointer-events:auto;box-shadow:0 6px 20px rgba(0,0,0,.3)";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "margin-left:12px;background:#fff;color:#1d1d1f;border:0;border-radius:999px;padding:3px 10px;font:600 12px system-ui";
    banner.appendChild(cancel);
    document.body.append(box, banner);

    const targetAt = (event) => {
      const target = event.target;
      return target && target !== banner && !banner.contains(target) && target !== document.body && target !== document.documentElement ? target : null;
    };
    const move = (event) => {
      const target = targetAt(event);
      if (!target) { box.style.display = "none"; return; }
      const rect = target.getBoundingClientRect();
      Object.assign(box.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    };
    const finish = (value) => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      box.remove(); banner.remove();
      resolve(value);
    };
    const click = (event) => {
      if (banner.contains(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      finish(targetAt(event));
    };
    const key = (event) => { if (event.key === "Escape") finish(null); };
    cancel.addEventListener("click", (event) => { event.stopPropagation(); finish(null); });
    document.addEventListener("pointermove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  });
}

async function bitmapOf(blob) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch { /* fall back to an <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

/** Any picture the tester gives us -> a JPEG data URL no larger than 1400px a side. */
export async function imageToDataUrl(file) {
  const bitmap = await bitmapOf(file);
  return draw(bitmap, bitmap.width || bitmap.naturalWidth, bitmap.height || bitmap.naturalHeight);
}

/** One frame of the screen / tab the tester shares (desktop browsers). Resolves with a data URL, or "" if they decline. */
export async function captureScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Give the page a moment to repaint without the feedback panel in it.
    await new Promise((resolve) => setTimeout(resolve, 450));
    return draw(video, video.videoWidth, video.videoHeight);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
