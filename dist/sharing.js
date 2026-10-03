import { validateConfiguration } from "./engine.js";
const encode = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const decode = (s) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
export async function shareLink(config, permission) {
  const payload = JSON.stringify({ configuration: config, permission });
  if (payload.length > 3000000)
    throw Error("This session is too large for a link. Export a file instead.");
  let bytes = new TextEncoder().encode(payload),
    prefix = "j";
  if ("CompressionStream" in window) {
    bytes = new Uint8Array(
      await new Response(
        new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer(),
    );
    prefix = "z";
  }
  const link = new URL(location.href);
  link.hash = "orbit=" + prefix + encode(bytes);
  if (link.href.length > 150000)
    throw Error("Images make this link too large. Export a file instead.");
  return link.href;
}
export async function loadShare(hash) {
  if (!hash.startsWith("#orbit=")) return null;
  try {
    if (hash.length > 150000) throw Error();
    const value = hash.slice(7);
    let bytes = decode(value.slice(1));
    if (value[0] === "z") {
      if (!("DecompressionStream" in window)) throw Error();
      const reader = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"))
        .getReader();
      let length = 0,
        chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 15000000) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(value);
      }
      bytes = new Uint8Array(length);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
    } else if (value[0] !== "j") throw Error();
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!["edit", "spin", "view", "spin-only"].includes(data.permission))
      throw Error();
    return {
      ...validateConfiguration(data.configuration),
      permission: data.permission,
    };
  } catch {
    throw Error(
      "This share link is invalid or unsupported. Ask the sender for a Xizana Spinner file.",
    );
  }
}

