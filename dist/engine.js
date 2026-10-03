export const TAU = Math.PI * 2;
export const PALETTES = {
  Orbit: [
    "#b9a5f5",
    "#f6b9d1",
    "#f4ca83",
    "#d4e9a3",
    "#96d3cf",
    "#9abbea",
    "#c0afe8",
    "#efa989",
  ],
  Ocean: ["#175d75", "#2a8796", "#52b8aa", "#a6d7c5"],
  Electric: ["#7058e7", "#ef6bac", "#f3bc59", "#8cdaab"],
  Midnight: ["#343c77", "#614995", "#9061a6", "#b982ae"],
  Monochrome: ["#33394a", "#5f687d", "#8795ac", "#bdc8dc"],
};
export const uid = () => crypto.randomUUID();
export const clone = (x) => JSON.parse(JSON.stringify(x));
export function random() {
  if (!globalThis.crypto?.getRandomValues)
    throw new Error(
      "Secure randomness is unavailable. Open Xizana Spinner in a modern browser.",
    );
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return ((a[0] >>> 5) * 67108864 + (a[1] >>> 6)) / 9007199254740992;
}
export const mod = (v, n = TAU) => ((v % n) + n) % n;
export const MAX_ENTRIES = 1_000_000;
export const MAX_DURATION = 86_400;
const segmentCache = new WeakMap();
export const invalidateSegments = entries => segmentCache.delete(entries);
export const segmentAt = (parts, index) => parts.get ? parts.get(index) : parts[index];
class SegmentTable {
  constructor(entries, indexes, ends, max, total) { Object.assign(this, {entries,indexes,ends,max,total,length:indexes.length}); }
  get(index) { if(index<0||index>=this.length)return undefined;const entry=this.entries[this.indexes[index]];return {entry,index,start:index?this.ends[index-1]:0,end:this.ends[index],probability:entry.weight/this.max/this.total}; }
  at(index) { return this.get(index<0?this.length+index:index); }
  find(predicate) { for(let i=0;i<this.length;i++){const part=this.get(i);if(predicate(part,i))return part;} }
  map(callback) { return Array.from({length:this.length},(_,i)=>callback(this.get(i),i)); }
  every(callback) { for(let i=0;i<this.length;i++)if(!callback(this.get(i),i))return false;return true; }
  *[Symbol.iterator]() { for(let i=0;i<this.length;i++)yield this.get(i); }
}
export function segments(entries) {
  if(entries.length>10000&&segmentCache.has(entries))return segmentCache.get(entries);
  let max=0,count=0,total=0;
  for(const e of entries)if(e.enabled!==false&&Number.isFinite(e.weight)&&e.weight>0){max=Math.max(max,e.weight);count++;}
  if(!count)return [];
  for(const e of entries)if(e.enabled!==false&&Number.isFinite(e.weight)&&e.weight>0)total+=e.weight/max;
  let angle=0,index=0;
  if(entries.length<=10000){const result=[];for(const e of entries){if(e.enabled===false||!Number.isFinite(e.weight)||e.weight<=0)continue;const start=angle;angle+=e.weight/max/total*TAU;result.push({entry:e,index:index++,start,end:angle,probability:e.weight/max/total});}result.at(-1).end=TAU;return result;}
  const indexes=new Uint32Array(count),ends=new Float64Array(count);
  for(let i=0;i<entries.length;i++){const e=entries[i];if(e.enabled===false||!Number.isFinite(e.weight)||e.weight<=0)continue;angle+=e.weight/max/total*TAU;indexes[index]=i;ends[index++]=angle;}
  ends[count-1]=TAU;const result=new SegmentTable(entries,indexes,ends,max,total);segmentCache.set(entries,result);return result;
}
export function segmentAtAngle(parts,angle){if(!parts.length)return undefined;let lo=0,hi=parts.length-1;while(lo<hi){const mid=(lo+hi)>>>1;const end=parts.ends?parts.ends[mid]:parts[mid].end;if(angle<end)hi=mid;else lo=mid+1;}return segmentAt(parts,lo);}
export function winnerAt(parts,rotation){return segmentAtAngle(parts,mod(-rotation));}
export function choose(parts,rng=random){if(!parts.length)throw Error('Add an enabled entry with a positive weight first.');return segmentAtAngle(parts,Math.min(1-Number.EPSILON,Math.max(0,rng()))*TAU);}
export function targetRotation(part, current, rng = random) {
  const interior = 0.12 + 0.76 * rng();
  const target = mod(-(part.start + (part.end - part.start) * interior));
  return (
    current + TAU * (5 + Math.floor(rng() * 3)) + mod(target - mod(current))
  );
}
export const ease = (t) => 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
export function boundaryPosition(parts, rotation) {
  if (!parts.length) return 0;
  const part = winnerAt(parts, rotation),
    index = part.index,
    phase = mod(rotation);
  return (
    Math.floor(rotation / TAU) * parts.length +
    (phase === 0 ? 0 : parts.length - index)
  );
}
export function shuffle(entries, rng = random) {
  const result = [...entries];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function removeWinner(entries, winner, all = false) {
  return entries.filter((e) =>
    all ? e.text !== winner.text : e.id !== winner.id,
  );
}
export function deduplicate(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    if (seen.has(e.text)) return false;
    seen.add(e.text);
    return true;
  });
}
export function entry(text = "", weight = 1) {
  return {
    id: uid(),
    text: String(text),
    weight,
    color: null,
    image: null,
    enabled: true,
  };
}
export function newWheel(
  name = "My first wheel",
  texts = [
    "Alex",
    "Emma",
    "Noah",
    "Olivia",
    "Liam",
    "Sophia",
    "James",
    "Amelia",
  ],
) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    description: "",
    entries: texts.map((t) => entry(t)),
    appearanceSettings: {
      palette: [...PALETTES.Orbit],
      textColor: "#25263b",
      fontSize: 28,
      labels: true,
      dividers: true,
      centerText: "SPIN",
      centerImage: null,
      centerSize: 22,
      centerClick: "spin",
      pointerColor: "#202039",
      background: "#ffffff",
      borderWidth: 1,
    },
    spinSettings: { duration: 5, customDuration: false },
    winnerSettings: { autoRemove: false, confetti: true, dedupe: false },
    soundSettings: {
      spin: true,
      tick: true,
      winner: true,
      celebration: false,
      music: false,
      master: 0.6,
      effects: 0.5,
      musicVolume: 0.15,
    },
    createdAt: now,
    updatedAt: now,
  };
}
const plain = (x) =>
  x !== null &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
export const validColor = (c) =>
  typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
export const validImage = (s) =>
  s == null ||
  (typeof s === "string" &&
    s.length < 700000 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s));
const string = (v, max = 1000) => typeof v === "string" && v.length <= max;
const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
export function validateWheel(value) {
  if (
    !plain(value) ||
    !string(value.name, 120) ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_ENTRIES
  )
    throw Error("Invalid wheel. Use a name and no more than 1,000,000 entries.");
  const base = newWheel(value.name, []);
  base.description = string(value.description, 1000) ? value.description : "";
  base.id = string(value.id, 100) && value.id ? value.id : uid();
  const seen = new Set();
  base.entries = value.entries.map((e) => {
    if (
      !plain(e) ||
      !string(e.text, 1000) ||
      !num(e.weight, 0.000001, 1e9) ||
      !validImage(e.image) ||
      (e.color != null && !validColor(e.color)) ||
      typeof e.enabled !== "boolean"
    )
      throw Error(
        "An entry contains invalid text, weight, color, image or enabled state.",
      );
    let id = string(e.id, 100) && e.id ? e.id : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    return {
      id,
      text: e.text,
      weight: e.weight,
      color: e.color || null,
      image: e.image || null,
      enabled: e.enabled,
    };
  });
  const a = value.appearanceSettings;
  if (a) {
    if (!plain(a)) throw Error("Invalid appearance settings.");
    for (const key of ["textColor", "pointerColor", "background"])
      if (a[key] !== undefined) {
        if (!validColor(a[key])) throw Error("Invalid appearance color.");
        base.appearanceSettings[key] = a[key];
      }
    if (a.palette !== undefined) {
      if (
        !Array.isArray(a.palette) ||
        !a.palette.length ||
        a.palette.length > 64 ||
        !a.palette.every(validColor)
      )
        throw Error("Invalid palette.");
      base.appearanceSettings.palette = [...a.palette];
    }
    for (const [key, min, max] of [
      ["fontSize", 12, 60],
      ["centerSize", 10, 40],
      ["borderWidth", 0, 8],
    ])
      if (a[key] !== undefined) {
        if (!num(a[key], min, max)) throw Error("Invalid appearance size.");
        base.appearanceSettings[key] = a[key];
      }
    for (const key of ["labels", "dividers"])
      if (typeof a[key] === "boolean") base.appearanceSettings[key] = a[key];
    if (string(a.centerText, 30))
      base.appearanceSettings.centerText = a.centerText;
    if (!validImage(a.centerImage)) throw Error("Invalid center image.");
    base.appearanceSettings.centerImage = a.centerImage || null;
    if (["spin", "customize", "none"].includes(a.centerClick))
      base.appearanceSettings.centerClick = a.centerClick;
  }
  if (value.spinSettings) {
    if (!num(value.spinSettings.duration, 0.1, MAX_DURATION))
      throw Error("Spin duration must be 0.1–86,400 seconds.");
    base.spinSettings.duration = value.spinSettings.duration;
    base.spinSettings.customDuration = value.spinSettings.customDuration === true;
  }
  for (const section of ["winnerSettings", "soundSettings"])
    if (value[section]) {
      if (!plain(value[section])) throw Error("Invalid settings.");
      for (const key of Object.keys(base[section])) {
        const v = value[section][key];
        if (v === undefined) continue;
        if (typeof base[section][key] === "boolean") {
          if (typeof v !== "boolean") throw Error("Invalid toggle.");
        } else if (!num(v, 0, 1)) throw Error("Invalid volume.");
        base[section][key] = v;
      }
    }
  base.createdAt =
    string(value.createdAt, 40) && !isNaN(Date.parse(value.createdAt))
      ? value.createdAt
      : base.createdAt;
  return base;
}
export function configuration(wheels, activeId) {
  return { format: "orbit-wheel", version: 1, wheels: clone(wheels), activeId };
}
export function validateConfiguration(data) {
  if (
    !plain(data) ||
    data.format !== "orbit-wheel" ||
    data.version !== 1 ||
    !Array.isArray(data.wheels) ||
    !data.wheels.length ||
    data.wheels.length > 30
  )
    throw Error("This is not a supported Xizana Spinner configuration.");
  const wheels = data.wheels.map(validateWheel);
  if (new Set(wheels.map((w) => w.id)).size !== wheels.length)
    throw Error("Wheel IDs must be unique.");
  return {
    wheels,
    activeId: wheels.some((w) => w.id === data.activeId)
      ? data.activeId
      : wheels[0].id,
  };
}
export function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("A quoted CSV field is not closed.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export const csv = (rows) =>
  rows
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            String(
              /^[=+@-]/.test(String(v ?? "")) && typeof v !== "number"
                ? "'" + v
                : (v ?? ""),
            ).replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
export function parseData(text, type = "auto") {
  if (text.length > 250000000) throw Error("Import is too large.");
  if (type === "json" || (type === "auto" && /^\s*[\[{]/.test(text))) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Error("The JSON file could not be read.");
    }
    if (data?.format === "orbit-wheel")
      return { config: validateConfiguration(data) };
    if (!Array.isArray(data))
      throw Error("Use a JSON array of names or entry objects.");
    if (data.every((x) => typeof x === "string" || typeof x === "number"))
      return { columns: ["Text"], rows: data.map((x) => [String(x)]) };
    if (!data.every(plain))
      throw Error("Use a consistent array of entry objects.");
    const columns = Object.keys(data[0] || {}).filter(
      (k) => !["__proto__", "constructor", "prototype"].includes(k),
    );
    return {
      columns,
      rows: data.map((x) => columns.map((k) => String(x[k] ?? ""))),
    };
  }
  const delimiter = text.includes("\t")
    ? "\t"
    : type === "csv" || text.split("\n")[0].includes(",")
      ? ","
      : null;
  if (!delimiter)
    return {
      columns: ["Text"],
      rows: text
        .split(/\r?\n/)
        .map((x) => [x.trim()])
        .filter((x) => x[0]),
    };
  const rows = parseDelimited(text, delimiter);
  return { columns: rows[0] || [], rows: rows.slice(1), rawRows: rows };
}
export function mappedEntries(rows, map) {
  if (rows.length > MAX_ENTRIES) throw Error("The maximum is 1,000,000 entries.");
  return rows.map((r) => {
    const text = String(r[map.text] ?? "").trim();
    const weight = map.weight == null ? 1 : Number(r[map.weight]);
    const color = map.color == null ? null : r[map.color];
    if (
      !text ||
      text.length > 1000 ||
      !num(weight, 0.000001, 1e9) ||
      (color && !validColor(color))
    )
      throw Error(
        "Check names, positive weights and hex colors in the preview.",
      );
    return { ...entry(text, weight), color: color || null };
  });
}

