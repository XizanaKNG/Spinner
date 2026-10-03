import {previewData,buildImportEntries,mapRowsInBatches} from './data-import.js';
import {makeNumberEntries,captureWorkspace,trimUndo,reconcileEntries,yieldToUI} from './large-data.js';
import { animateSpin } from "./spin.js";
import { recordResult, exportHistory, validateHistory } from "./history.js";
import {
  TAU,
  MAX_ENTRIES,
  MAX_DURATION,
  invalidateSegments,
  PALETTES,
  uid,
  clone,
  random,
  segments,
  winnerAt,
  choose,
  targetRotation,
  ease,
  boundaryPosition,
  shuffle,
  removeWinner,
  deduplicate,
  entry,
  newWheel,
  validColor,
  configuration,
  validateConfiguration,
  parseData,
  mappedEntries,
  csv,
} from "./engine.js";
import { decorateIcons } from "./icons.js";
import { render } from "./renderer.js";
import {
  openStorage,
  read,
  write,
  download,
  optimizeImage,
} from "./storage.js";
import * as audio from "./audio.js";
import { shareLink, loadShare } from "./sharing.js";
import { t, setLocale, localize } from "./i18n.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = {
    wheels: [newWheel()],
    activeId: null,
    history: [],
    theme: "system",
    direction: "ltr",
  },
  saved = [],
  role = "edit",
  shared = false;
state.activeId = state.wheels[0].id;
let stateReady=false;
let busy = false,
  spinState = "idle",
  editing = false,
  page = 0,
  search = "",
  rotation = 0,
  undoStack = [],
  redoStack = [],
  saveTimer,
  inputTimer,
  toastTimer,
  settingsTab = "Appearance",
  dialogContext = null,
  lastResults = [],
  lastFocus = null,
  importPreview = null,
  googleConfig = null;
const current = () =>
    state.wheels.find((w) => w.id === state.activeId) || state.wheels[0],
  canEdit = () => role === "edit",
  canSpin = () => role !== "view",
  conf = () => ({format:"orbit-wheel",version:1,wheels:state.wheels,activeId:state.activeId});
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
function fail(e) {
  notify(
    e instanceof Error
      ? e.message
      : "This action could not be completed. Please try again.",
  );
}
function snapshot(){undoStack.push(captureWorkspace(state.wheels,state.activeId));trimUndo(undoStack);redoStack=[];}
function mutate(fn, history = true) {
  if (busy || !canEdit()) return false;
  if (history) snapshot();
  invalidateSegments(current().entries);
  fn(current());
  invalidateSegments(current().entries);
  current().updatedAt = new Date().toISOString();
  scheduleSave();
  update();
  return true;
}
function scheduleSave() {
  if (shared||!stateReady) return;
  state.revision=(state.revision||0)+1;
  clearTimeout(saveTimer);
  $("#save-status").textContent = t("saving");
  saveTimer = setTimeout(async () => {
    try {
      const persisted=await write("session", state);
      if(persisted===false)return;
      $("#save-status").textContent = t("saved");
    } catch (e) {
      $("#save-status").textContent = t("saveError");
      fail(e);
    }
  }, 350);
}
function theme() {
  document.body.dataset.theme =
    state.theme === "system"
      ? matchMedia("(prefers-color-scheme:dark)").matches
        ? "dark"
        : "light"
      : state.theme;
}
function update() {
  const w = current(),
    a = w.appearanceSettings;
  $("#wheel-title").textContent =
    w.name === "My first wheel" ? "The good kind of indecision." : w.name;
  $("#wheel-description").textContent =
    w.description || "Add your possibilities. Find your next pick.";
  $("#wheel-tabs").innerHTML =
    state.wheels
      .map(
        (x) =>
          `<button data-wheel="${esc(x.id)}" class="${x.id === w.id ? "active" : ""}" ${busy ? "disabled" : ""}>${esc(x.name)}</button>${x.id === w.id && canEdit() ? '<button class="wheel-options" data-action="wheel-menu" aria-label="Manage this wheel">⋯</button>' : ""}`,
      )
      .join("") +
    (canEdit()
      ? '<button data-action="add-wheel" aria-label="Add wheel">＋</button>'
      : "");
  $("#entry-count").textContent = w.entries.length.toLocaleString();
  $("#line-count").textContent = `${w.entries.length.toLocaleString()} ${t("entries")}`;
  if(w.entries.length>10000)editing=true;
  $("#simple-tab").disabled=w.entries.length>10000;
  $("#simple-tab").title=w.entries.length>10000?"Large lists use the paged editor. Use Import to paste or replace data.":"";
  if (w.entries.length<=10000&&document.activeElement !== $("#entries"))
    $("#entries").value = w.entries.map((e) => e.text).join("\n");
  $("#entries").disabled = busy || !canEdit();
  $("#dedupe").checked = w.winnerSettings.dedupe;
  $("#dedupe").disabled = busy || !canEdit();
  $("#duration").disabled = busy || !canEdit();
  const preset=[2,5,9,14].includes(w.spinSettings.duration)&&!w.spinSettings.customDuration;
  $('#duration').value=preset?String(w.spinSettings.duration):'custom';
  $('#custom-duration-field').hidden=preset;
  $('#custom-duration').disabled=busy||!canEdit();
  if(document.activeElement!==$('#custom-duration'))$('#custom-duration').value=w.spinSettings.duration;
  $("#spin-button").disabled =
    busy || !canSpin() || !segments(w.entries).length;
  $("#spin-button").innerHTML =
    esc(busy ? (spinState==="loading"?"Loading…":t("spinning")) : t("spin")) + " <span>↻</span>";
  $("#hub").disabled = busy || !canSpin();
  $("[data-action=spin-all]").disabled = busy || !canSpin();
  $("#hub").style.width = a.centerSize + "%";
  $("#hub").style.height = a.centerSize + "%";
  $("#hub").innerHTML = a.centerImage
    ? `<img src="${esc(a.centerImage)}" alt="Wheel center">`
    : `${esc(a.centerText)}<span>YOUR LUCK</span>`;
  $(".pointer").style.background = a.pointerColor;
  $(".stage").style.setProperty("--stage-bg", a.background);
  $("#fair-label").textContent =
    `${segments(w.entries).length.toLocaleString()} ACTIVE · ${w.entries.length>4096?"SIMPLIFIED DISPLAY":"CRYPTO RANDOM"}`;
  $("#history-summary").textContent = state.history.length
    ? `${state.history.length} picks and counting`
    : "Your picks, all in one place";
  $("#simple-editor").hidden = editing;
  $("#advanced-editor").hidden = !editing;
  $("#simple-tab").setAttribute("aria-selected", !editing);
  $("#advanced-tab").setAttribute("aria-selected", editing);
  if (editing) renderEntries();
  theme();
  draw();
  localize(document.body);
  decorateIcons(document.body);
  for (const b of document.querySelectorAll("[data-action]"))
    if (
      [
        "shuffle",
        "sort",
        "import",
        "clear",
        "new-entry",
        "entry-menu",
        "add-wheel",
        "wheel-menu",
        "customize",
        "save",
        "undo",
        "redo",
      ].includes(b.dataset.action)
    )
      b.disabled = busy || !canEdit();
}
function draw() {
  $("#wheel").style.transform = "";
  render($("#wheel"), current(), rotation, () => {
    if (!busy) draw();
  });
}
let entryRenderRevision=0;
async function renderEntries(){const request=++entryRenderRevision,w=current(),query=search.toLowerCase();let count=0,rows=[];const from=page*40;for(let i=0;i<w.entries.length;i++){const e=w.entries[i];if(!query||e.text.toLowerCase().includes(query)){if(count>=from&&count<from+40)rows.push({e,index:i});count++;}if(i&&i%20000===0){await yieldToUI();if(request!==entryRenderRevision)return;}}if(request!==entryRenderRevision)return;const pages=Math.max(1,Math.ceil(count/40));if(page>=pages){page=pages-1;return renderEntries();}$('#entry-list').innerHTML=rows.map(({e,index})=>`<div class="entry-row"><input type="checkbox" data-enabled="${esc(e.id)}" aria-label="Enable ${esc(e.text)}" ${e.enabled?'checked':''} ${busy||!canEdit()?'disabled':''}><span class="color-dot" style="background:${e.color||w.appearanceSettings.palette[index%w.appearanceSettings.palette.length]}"></span><button class="entry-name" data-entry="${esc(e.id)}" ${!canEdit()?'disabled':''}>${esc(e.text)}</button><span class="weight">${e.weight}×</span><button class="icon" data-entry="${esc(e.id)}" aria-label="Edit ${esc(e.text)}" ${!canEdit()?'disabled':''}>⋯</button></div>`).join('')||'<p class="muted">No matching entries.</p>';$('#page-label').textContent=`${count.toLocaleString()} found · ${page+1}/${pages.toLocaleString()}`;$('[data-action=prev-page]').disabled=page===0;$('[data-action=next-page]').disabled=page>=pages-1;}
function dialog(title, html, context = null) {
  lastFocus = document.activeElement;
  $("#dialog-title").textContent = title;
  $("#dialog-content").innerHTML = html;
  dialogContext = context;
  localize($("#dialog"));
  decorateIcons($("#dialog"));
  if (!$("#dialog").open) $("#dialog").showModal();
  setTimeout(
    () =>
      $(
        "#dialog-content input:not([type=checkbox]):not([type=color]), #dialog-content textarea, #dialog-content button",
      )?.focus(),
    20,
  );
}
function close() {
  if (dialogContext === "settings") audio.stopMusic();
  $("#dialog").close();
  dialogContext = null;
  lastFocus?.focus?.();
}
function confirmAction(message, callback) {
  dialog(
    t("confirmation"),
    `<p class="muted">${esc(message)}</p><div class="dialog-actions"><button data-action="close" class="outlined">Cancel</button><button id="confirm-action" class="danger">Confirm</button></div>`,
  );
  $("#confirm-action").onclick = async () => {
    close();
    try {
      await callback();
    } catch (e) {
      fail(e);
    }
  };
}
const field = (label, id, value, type = "text", extra = "") =>
    `<label class="field">${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`,
  check = (label, id, value) =>
    `<label class="check"><input id="${id}" type="checkbox" ${value ? "checked" : ""}>${esc(label)}</label>`;
function entryDialog(id) {
  const e = current().entries.find((e) => e.id === id);
  if (!e) return;
  const p = segments(current().entries).find((p) => p.entry.id === id);
  dialog(
    t("advanced"),
    `<div class="form-grid">${field("Name or text", "edit-name", e.text, "text", 'maxlength="1000"')}${field("Weight", "edit-weight", e.weight, "number", 'min="0.000001" max="1000000000" step="any"')}${field("Segment color", "edit-color", e.color || current().appearanceSettings.palette[0], "color")}<div class="field">Probability<strong>${p ? (p.probability * 100).toFixed(2) : "0"}%</strong><small>Weights and enabled state determine the odds.</small></div><div class="field full">${check("Enabled", "edit-enabled", e.enabled)}${check("Use palette color", "edit-auto-color", !e.color)}</div><label class="field full">Entry image<input id="edit-image" type="file" accept="image/png,image/jpeg,image/webp">${e.image ? `<img src="${esc(e.image)}" class="image-preview" alt="Entry image"><button data-action="remove-entry-image" class="outlined">Remove image</button>` : ""}</label></div><div class="dialog-actions"><button data-action="entry-up" class="outlined">Move up</button><button data-action="entry-down" class="outlined">Move down</button><button data-action="duplicate-entry" class="outlined">Duplicate</button><button data-action="delete-entry" class="danger">Delete</button><button data-action="save-entry" class="primary">Done</button></div>`,
    { entryId: id },
  );
}
async function saveEntry() {
  const e = current().entries.find((e) => e.id === dialogContext?.entryId);
  if (!e) return;
  const text = $("#edit-name").value.trim(),
    weight = Number($("#edit-weight").value);
  if (
    !text ||
    text.length > 1000 ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 1e9
  )
    return notify("Enter a name and a positive weight up to 1 billion.");
  const button = $("[data-action=save-entry]");
  button.disabled = true;
  try {
    let image = e.image;
    if ($("#edit-image").files[0])
      image = await optimizeImage($("#edit-image").files[0]);
    const color = $("#edit-auto-color").checked ? null : $("#edit-color").value,
      enabled = $("#edit-enabled").checked;
    mutate(() => Object.assign(e, { text, weight, color, enabled, image }));
    close();
  } catch (error) {
    fail(error);
    button.disabled = false;
  }
}
function wheelMenu() {
  const w = current();
  dialog(
    "Your wheel",
    `<div class="form-grid">${field("Wheel name", "rename-wheel", w.name, "text", 'maxlength="120"')}<label class="field full">Description<textarea id="wheel-desc" maxlength="1000">${esc(w.description)}</textarea></label></div><div class="dialog-actions"><button data-action="delete-wheel" class="danger" ${state.wheels.length === 1 ? "disabled" : ""}>Delete wheel</button><button data-action="duplicate-wheel" class="outlined">Duplicate</button><button data-action="rename-wheel" class="primary">Save changes</button></div>`,
  );
}
const templates = [
  ["Blank Wheel", "A fresh start", []],
  [
    "Random Names",
    "Meet your next lucky person",
    ["Alex", "Emma", "Noah", "Olivia", "Liam", "Sophia", "James", "Amelia"],
  ],
  ["Yes / No", "For the beautifully undecided", ["Yes", "No"]],
  [
    "Numbers",
    "A pick from one to ten",
    Array.from({ length: 10 }, (_, i) => String(i + 1)),
  ],
  [
    "Giveaway",
    "One lucky winner",
    ["ნიკა", "გიორგი", "მარიამი", "ანა", "ლუკა"],
  ],
  [
    "Classroom",
    "Everyone gets a turn",
    [
      "Read aloud",
      "Ask a question",
      "Lead the group",
      "Summarize",
      "Choose a topic",
    ],
  ],
  ["Team Picker", "Find your side", ["Team A", "Team B", "Team C", "Team D"]],
  [
    "Prize Wheel",
    "A little something to win",
    ["Grand prize", "Gift card", "Mystery box", "Bonus entry", "Try again"],
  ],
  [
    "Dinner Picker",
    "What sounds good tonight?",
    ["Pizza", "Sushi", "Tacos", "Pasta", "Burgers", "Khinkali"],
  ],
  [
    "Task Picker",
    "Start somewhere",
    [
      "Inbox zero",
      "Take a walk",
      "Write a page",
      "Tidy your desk",
      "Plan tomorrow",
    ],
  ],
  ["Truth or Dare", "A classic with a twist", ["Truth", "Dare"]],
];
function showTemplates() {
  dialog(
    t("templates"),
    `<p class="muted" style="margin-bottom:18px">Start a new wheel. Your current wheels stay right where they are.</p><div class="template-grid">${templates.map((x, i) => `<button class="template" data-template="${i}" ${!canEdit() ? "disabled" : ""}><strong>${esc(x[0])}</strong><small>${esc(x[1])}</small></button>`).join("")}</div>`,
  );
}
function showSettings(tab = settingsTab) {
  settingsTab = tab;
  const w = current(),
    a = w.appearanceSettings,
    s = w.soundSettings,
    v = w.winnerSettings;
  let html = `<div class="dialog-tabs">${["Appearance", "Spin & result", "Sound", "Presentation"].map((x) => `<button data-settings-tab="${x}" class="${tab === x ? "active" : ""}">${x}</button>`).join("")}</div>`;
  if (tab === "Appearance")
    html += `<div class="section-label">Wheel colors</div><label class="field">Palette<select id="setting-palette"><option value="custom">Custom palette</option>${Object.keys(
      PALETTES,
    )
      .map((k) => `<option>${k}</option>`)
      .join(
        "",
      )}</select></label><div style="margin-top:12px">${a.palette.map((c, i) => `<div class="palette-row"><input type="color" data-palette-color="${i}" value="${c}" aria-label="Palette color ${i + 1}"><input value="${c}" data-palette-hex="${i}" aria-label="Hex color ${i + 1}" maxlength="7"><button data-color-up="${i}" aria-label="Move color up">↑</button><button data-color-down="${i}" aria-label="Move color down">↓</button><button data-color-delete="${i}" aria-label="Delete color" ${a.palette.length === 1 ? "disabled" : ""}>×</button></div>`).join("")}</div><button class="outlined" data-action="add-color">＋ Add color</button><div class="section-label">Text & segments</div><div class="form-grid">${field("Text color", "setting-textColor", a.textColor, "color")}${field("Label size", "setting-fontSize", a.fontSize, "number", 'min="12" max="60"')}${check("Show labels", "setting-labels", a.labels)}${check("Segment dividers", "setting-dividers", a.dividers)}${field("Divider width", "setting-borderWidth", a.borderWidth, "number", 'min="0" max="8" step="0.5"')}${field("Pointer color", "setting-pointerColor", a.pointerColor, "color")}</div><div class="section-label">The center</div><div class="form-grid">${field("Center text", "setting-centerText", a.centerText, "text", 'maxlength="30"')}${field("Center size (%)", "setting-centerSize", a.centerSize, "number", 'min="10" max="40"')}<label class="field">Click behavior<select id="setting-centerClick">${["spin", "customize", "none"].map((x) => `<option value="${x}" ${a.centerClick === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label class="field">Center image or logo<input type="file" id="center-image" accept="image/png,image/jpeg,image/webp">${a.centerImage ? '<button data-action="remove-center-image" class="outlined">Remove image</button>' : ""}</label></div>`;
  if (tab === "Spin & result")
    html += `<div class="form-grid">${field("Spin duration (seconds)", "setting-duration", w.spinSettings.duration, "number", 'min="0.1" max="86400" step="0.1"')}</div><div class="section-label">When the wheel lands</div><div class="form-grid">${check("Remove winner automatically", "setting-autoRemove", v.autoRemove)}${check("Celebrate with confetti", "setting-confetti", v.confetti)}${check("Remove duplicate names automatically", "setting-dedupe", v.dedupe)}</div><p class="info">An entry’s weight changes both its odds and its slice of the wheel. Disabled entries are excluded. Secure browser randomness chooses a location on the wheel before the animation starts.</p>`;
  if (tab === "Sound")
    html += `<div class="form-grid">${Object.entries({
      spin: "Spin sound",
      tick: "Segment boundary ticks",
      winner: "Winner melody",
      celebration: "Celebration flourish",
      music: "Background music",
    })
      .map(([k, label]) => check(label, "sound-" + k, s[k]))
      .join(
        "",
      )}</div><div class="section-label">Mix your sound</div><div class="form-grid">${field("Master volume", "sound-master", s.master, "range", 'min="0" max="1" step="0.01"')}${field("Effects volume", "sound-effects", s.effects, "range", 'min="0" max="1" step="0.01"')}${field("Music volume", "sound-musicVolume", s.musicVolume, "range", 'min="0" max="1" step="0.01"')}</div><button class="outlined" data-action="test-sound" style="margin-top:20px">Preview sound</button><p class="note">Sounds are synthesized on your device. Ticks follow segment crossings; dense wheels are rate-limited for comfortable listening.</p>`;
  if (tab === "Presentation")
    html += `<div class="form-grid">${field("Presentation background", "setting-background", a.background, "color")}<label class="field">Reading direction<select id="direction"><option value="ltr" ${state.direction === "ltr" ? "selected" : ""}>Left to right</option><option value="rtl" ${state.direction === "rtl" ? "selected" : ""}>Right to left</option></select></label></div><div class="dialog-actions"><button data-action="fullscreen" class="primary">Presentation mode</button><button data-action="streamer" class="outlined">Streamer mode</button></div><p class="info">Streamer mode removes controls and uses a transparent page background. Capture this browser source in OBS. Press Esc to leave. Use Space to spin.</p><p class="note">Integration hooks: <code>window.Orbit.spin()</code>, <code>window.Orbit.spinAll()</code> and <code>orbit:winner</code> events. Remote networking is not enabled.</p>`;
  html += `<div class="dialog-actions"><button data-action="reset-settings" class="outlined">Reset settings</button><button data-action="close" class="primary">Done</button></div>`;
  dialog(t("customize"), html, "settings");
}
function applySetting(el) {
  const id = el.id,
    value =
      el.type === "checkbox"
        ? el.checked
        : el.type === "number" || el.type === "range"
          ? Number(el.value)
          : el.value;
  if (id.startsWith("setting-")) {
    const key = id.slice(8),
      limits = {
        fontSize: [12, 60],
        centerSize: [10, 40],
        borderWidth: [0, 8],
        duration: [0.1, MAX_DURATION],
      };
    if (
      limits[key] &&
      (!Number.isFinite(value) ||
        value < limits[key][0] ||
        value > limits[key][1])
    )
      return notify("Choose a value within the displayed limits.");
    mutate((w) => {
      if (key === "duration") w.spinSettings.duration = value;
      if(key==="duration")w.spinSettings.customDuration=true;
      else if (["autoRemove", "confetti", "dedupe"].includes(key)) {
        w.winnerSettings[key] = value;
        if (key === "dedupe" && value) w.entries = deduplicate(w.entries);
      } else w.appearanceSettings[key] = value;
    });
  } else if (id.startsWith("sound-"))
    mutate((w) => (w.soundSettings[id.slice(6)] = value));
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    notify(t("copied"));
  } catch {
    dialog(
      "Copy this text",
      `<textarea class="linkbox" rows="8" readonly>${esc(text)}</textarea><p class="note">Select and copy with Ctrl/Cmd + C.</p>`,
    );
  }
}
const historyText = (format) => exportHistory(state.history, format);
let historyPage = 0;
function showHistory(selectedPage = 0) {
  historyPage = Math.max(
    0,
    Math.min(selectedPage, Math.ceil(state.history.length / 50) - 1),
  );
  dialog(
    t("history"),
    `<div class="scrollbox">${
      state.history.length
        ? [...state.history]
            .reverse()
            .slice(historyPage * 50, historyPage * 50 + 50)
            .map(
              (h) =>
                `<div class="row"><div class="grow"><strong>${esc(h.text)}</strong><small>${esc(h.wheelName)} · ${esc(new Date(h.date).toLocaleString())}</small></div></div>`,
            )
            .join("")
        : '<p class="muted">Your first pick is waiting to happen.</p>'
    }</div><div class="dialog-actions"><button data-action="history-prev" class="outlined">Previous</button><span class="note">Page ${historyPage + 1} of ${Math.max(1, Math.ceil(state.history.length / 50))}</span><button data-action="history-next" class="outlined">Next</button><button data-action="clear-history" class="danger">Clear history</button><button data-action="copy-history" class="outlined">Copy</button><button data-action="export-history" class="primary">Export history</button></div>`,
  );
}
function saveSession() {
  if (!canEdit() || busy) return;
  dialog(
    "Save this session",
    `${field("Session name", "save-name", current().name, "text", 'maxlength="120"')}<p class="note">All ${state.wheels.length} wheels, images and settings will be saved on this device.</p><div class="dialog-actions"><button data-action="close" class="outlined">Cancel</button><button data-action="confirm-save" class="primary">Save session</button></div>`,
  );
}
async function confirmSave() {
  const name = $("#save-name").value.trim();
  if (!name) return notify("Give this session a name.");
  const next = [
    ...saved,
    { id: uid(), name, configuration: {...conf(),...captureWorkspace(state.wheels,state.activeId)}, date: new Date().toISOString() },
  ];
  await write("saved", next);
  saved = next;
  close();
  notify("Session saved");
}
function library() {
  dialog(
    t("library"),
    `<p class="muted">Saved on this device. Export a backup to use your wheels elsewhere.</p><div class="scrollbox">${saved.map((s) => `<div class="row"><div class="grow"><strong>${esc(s.name)}</strong><small>${s.configuration.wheels.length} wheels · ${esc(new Date(s.date).toLocaleDateString())}</small></div><div class="row-actions"><button data-saved="${esc(s.id)}" data-op="open" ${busy || !canEdit() ? "disabled" : ""}>Open</button><button data-saved="${esc(s.id)}" data-op="rename">Rename</button><button data-saved="${esc(s.id)}" data-op="duplicate">Copy</button><button data-saved="${esc(s.id)}" data-op="export">Export</button><button data-saved="${esc(s.id)}" data-op="delete" class="danger">Delete</button></div></div>`).join("") || '<p class="info">No saved sessions yet. Create one with Save session.</p>'}</div><div class="dialog-actions"><button data-action="import" class="outlined" ${!canEdit() ? "disabled" : ""}>Open a file</button><button data-action="save" class="primary" ${!canEdit() ? "disabled" : ""}>Save current session</button></div>`,
  );
}
async function savedAction(id, op) {
  const s = saved.find((x) => x.id === id);
  if (!s) return;
  if (op === "open")
    confirmAction(
      "Replace the workspace with this saved session? Save or export the current workspace first if you want to keep it.",
      () => {
        const next = validateConfiguration(s.configuration);
        snapshot();
        state.wheels = next.wheels;
        state.activeId = next.activeId;
        rotation = 0;
        scheduleSave();
        update();
        notify("Session opened");
      },
    );
  if (op === "export")
    download(
      JSON.stringify(s.configuration, null, 2),
      safeName(s.name) + ".orbit",
    );
  if (op === "rename") {
    dialog(
      "Rename saved session",
      `${field("Name", "saved-name", s.name, "text", 'maxlength="120"')}<div class="dialog-actions"><button id="saved-rename" class="primary">Rename</button></div>`,
    );
    $("#saved-rename").onclick = async () => {
      try {
        const name = $("#saved-name").value.trim();
        if (!name) return;
        const next = saved.map((x) => (x.id === id ? { ...x, name } : x));
        await write("saved", next);
        saved = next;
        library();
        notify("Renamed");
      } catch (e) {
        fail(e);
      }
    };
  }
  if (op === "duplicate") {
    const next = [...saved, { ...clone(s), id: uid(), name: s.name + " copy" }];
    await write("saved", next);
    saved = next;
    library();
    notify("Session duplicated");
  }
  if (op === "delete")
    confirmAction(`Delete “${s.name}” from saved sessions?`, async () => {
      const next = saved.filter((x) => x.id !== id);
      await write("saved", next);
      saved = next;
      library();
      notify("Saved session deleted");
    });
}
const safeName = (name) =>
  name.replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 60) || "orbit";
function exportDialog(kind = "entries") {
  dialog(
    "Take your wheel with you",
    `<div class="form-grid"><label class="field">What to export<select id="export-kind">${[
      ["entries", "Entry list"],
      ["history", "Winner history"],
      ["configuration", "Complete session"],
      ["results", "Last spin results"],
    ]
      .map(
        ([v, label]) =>
          `<option value="${v}" ${kind === v ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field">Format<select id="export-format"><option value="txt">TXT</option><option value="csv">CSV</option><option value="json">JSON</option><option value="orbit">Xizana Spinner configuration</option></select></label></div><div class="dialog-actions"><button data-action="download-export" class="primary">Download</button></div>`,
  );
  if (kind === "configuration") $("#export-format").value = "orbit";
}
function exportNow() {
  const kind = $("#export-kind").value,
    format = $("#export-format").value;
  let value,
    ext = format;
  if (kind === "configuration" || format === "orbit") {
    value = JSON.stringify(conf(), null, 2);
    ext = format === "json" ? "json" : "orbit";
  } else if (kind === "history") value = historyText(format);
  else {
    const rows = kind === "results" ? lastResults : current().entries;
    value =
      format === "json"
        ? JSON.stringify(rows, null, 2)
        : format === "csv"
          ? csv([
              kind === "results"
                ? ["Text", "Wheel", "Date"]
                : ["Text", "Weight", "Color", "Enabled"],
              ...rows.map((x) =>
                kind === "results"
                  ? [x.text, x.wheelName, x.date]
                  : [x.text, x.weight, x.color, x.enabled],
              ),
            ])
          : rows.map((x) => x.text).join("\n");
  }
  download(
    value,
    `orbit-${kind}.${ext}`,
    ext === "txt"
      ? "text/plain"
      : ext === "csv"
        ? "text/csv"
        : "application/json",
  );
  notify(t("exported"));
  close();
}
function importDialog() {
  importPreview = null;
  dialog(
    t("import"),
    `<p class="muted">Paste names, spreadsheet cells, CSV or JSON. Structured data gets a preview before it touches your wheel.</p><label class="field" style="margin-top:15px">Paste data<textarea id="import-text" placeholder="One entry per line, or paste a table…"></textarea></label><label class="field" style="margin-top:15px">Or choose a file<input id="import-file" type="file" accept=".txt,.csv,.json,.orbit,text/plain,text/csv,application/json"></label><div class="dialog-actions"><button data-action="google-sheets" class="outlined">Google Sheets</button><button data-action="preview-import" class="primary">Preview import</button></div>`,
  );
}
async function previewImport() {
  const file = $("#import-file")?.files[0];
  let text = $("#import-text")?.value || "",
    type = "auto";
  if (file) {
    if (file.size > 250000000) throw Error("Choose a file under 250 MB.");
    if (!/\.(txt|csv|json|orbit)$/i.test(file.name))
      throw Error("Use TXT, CSV, JSON or Xizana Spinner files.");
    text = await file.text();
    type = file.name.endsWith(".csv")
      ? "csv"
      : file.name.endsWith(".json")
        ? "json"
        : "auto";
  }
  if (!text.trim()) throw Error("Paste entries or choose a file first.");
  const button=$("[data-action=preview-import]");button.disabled=true;button.textContent="Preparing preview…";
  try{importPreview=await previewData(text,type);showImportPreview();}finally{button.disabled=false;button.textContent="Preview import";}
}
function showImportPreview() {
  const p = importPreview;
  if (p.config) {
    dialog(
      "Open Xizana Spinner session",
      `<p class="muted">This file contains ${p.config.wheels.length} wheels and ${p.config.wheels.reduce((n, w) => n + w.entries.length, 0)} entries. Opening it replaces the workspace.</p><div class="dialog-actions"><button data-action="close" class="outlined">Cancel</button><button data-action="apply-import" class="primary">Open session</button></div>`,
    );
    return;
  }
  dialog(
    "Preview your import",
    `<p class="muted">${(p.rowCount??p.rows.length).toLocaleString()} rows. Match columns to entry fields.</p><div class="form-grid" style="margin:15px 0">${[
      ["text", "Entry text"],
      ["weight", "Weight"],
      ["color", "Color"],
    ]
      .map(
        ([k, label]) =>
          `<label class="field">${label}<select id="map-${k}">${k !== "text" ? '<option value="">Not included</option>' : ""}${p.columns.map((c, i) => `<option value="${i}" ${(k === "text" && i === 0) || c.toLowerCase() === k || (k === "text" && ["name", "text"].includes(c.toLowerCase())) ? "selected" : ""}>${esc(c || "Column " + (i + 1))}</option>`).join("")}</select></label>`,
      )
      .join(
        "",
      )}<label class="field">Import mode<select id="import-mode"><option value="append">Add to current entries</option><option value="replace">Replace current entries</option></select></label></div>${p.rawRows ? check("First row contains column names", "import-header", true) : ""}<div class="scrollbox"><table class="preview-table"><thead><tr>${p.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${p.rows
      .slice(0, 8)
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join(
        "",
      )}</tbody></table></div><p class="note">Showing the first 8 rows. Names need text, weights must be positive, and colors use #RRGGBB.</p><div class="dialog-actions"><button data-action="import" class="outlined">Back</button><button data-action="apply-import" class="primary">Import entries</button></div>`,
  );
}
async function applyImport() {
  const p = importPreview;
  if (p.config) {
    confirmAction("Replace the workspace with this imported session?", () => {
      snapshot();
      state.wheels = p.config.wheels;
      state.activeId = p.config.activeId;
      rotation = 0;
      scheduleSave();
      update();
      notify(t("imported"));
    });
    return;
  }
  const rows = p.rawRows && !$("#import-header").checked ? p.rawRows : p.rows,
    map = {
      text: Number($("#map-text").value),
      weight:
        $("#map-weight").value === "" ? null : Number($("#map-weight").value),
      color:
        $("#map-color").value === "" ? null : Number($("#map-color").value),
    },
    replace = $("#import-mode").value === "replace";
  const rowCount=p.worker?(p.rawRowCount&&!$('#import-header').checked?p.rawRowCount:p.rowCount):rows.length;
  if(rowCount+(replace?0:current().entries.length)>MAX_ENTRIES)throw Error('Keep each wheel under 1,000,000 entries.');
  const button=$('[data-action=apply-import]');button.disabled=true;busy=true;let entries;
  try{const onProgress=value=>button.textContent=`Importing ${Math.round(value*100)}%…`;entries=p.worker?await buildImportEntries(map,$('#import-header')?.checked??true,onProgress):await mapRowsInBatches(rows,map,onProgress);}finally{busy=false;button.disabled=false;button.textContent='Import entries';}
  if (entries.length + (replace ? 0 : current().entries.length) > MAX_ENTRIES)
    throw Error("Keep each wheel under 1,000,000 entries.");
  const apply = () => {
    mutate((w) => {
      w.entries = replace ? entries : [...w.entries, ...entries];
      if (w.winnerSettings.dedupe) w.entries = deduplicate(w.entries);
    });
    close();
    notify(t("imported"));
  };
  if (replace)
    confirmAction("Replace all entries with the previewed data?", apply);
  else apply();
}
function googleDialog() {
  dialog(
    "Connect a Google Sheet",
    `<p class="muted">Import a publicly readable sheet with the Google Sheets API. Your API key stays in this tab’s memory and is never shared or exported.</p><div class="form-grid" style="margin-top:16px">${field("Spreadsheet ID", "google-id", googleConfig?.id || "")}${field("Range", "google-range", googleConfig?.range || "Sheet1!A1:C1000")}${field("Google API key", "google-key", "", "password")}</div><p class="note">Enable the Google Sheets API and restrict the key to this website. Private sheets needing account authorization are not supported.</p><div class="dialog-actions"><button data-action="fetch-google" class="primary">Preview sheet</button></div>`,
  );
}
async function fetchGoogle() {
  const id = $("#google-id").value.trim(),
    range = $("#google-range").value.trim(),
    key = $("#google-key").value.trim() || googleConfig?.key;
  if (
    !/^[a-zA-Z0-9_-]{15,100}$/.test(id) ||
    !range ||
    range.length > 200 ||
    !key
  )
    throw Error("Enter a valid spreadsheet ID, range and API key.");
  const button = $("[data-action=fetch-google]");
  button.disabled = true;
  button.textContent = "Loading sheet…";
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok)
      throw Error(
        "The sheet could not be read. Check visibility, API key and range.",
      );
    const data = await res.json();
    if (!Array.isArray(data.values) || data.values.length > 20001)
      throw Error("Use a range with up to 1,000,000 entries.");
    googleConfig = { id, range, key };
    const rows = data.values.map((r) => r.map(String));
    importPreview = {
      columns: rows[0] || [],
      rows: rows.slice(1),
      rawRows: rows,
    };
    showImportPreview();
  } catch (e) {
    button.disabled = false;
    button.textContent = "Preview sheet";
    throw e;
  }
}
function toolsDialog() {
  dialog(
    t("numbers"),
    `<div class="section-label">Number generator</div><div class="form-grid">${field("Starting number", "number-start", 1, "number")}${field("Ending number", "number-end", 20, "number")}${field("Step", "number-step", 1, "number", 'step="any"')}</div><button data-action="generate-numbers" class="outlined" style="margin-top:15px">Create number wheel</button><div class="section-label">Team generator</div><p class="muted">Uses the ${current().entries.filter((e) => e.enabled).length} enabled participants. Weights do not affect team assignments.</p><div class="form-grid" style="margin-top:15px"><label class="field">Divide by<select id="team-mode"><option value="teams">Number of teams</option><option value="size">Participants per team</option></select></label>${field("Number", "team-count", 2, "number", 'min="1" max="1000000"')}</div><button data-action="generate-teams" class="outlined" style="margin-top:15px">Generate teams</button>`,
  );
}
async function generateNumbers(){const start=Number($('#number-start').value),end=Number($('#number-end').value),step=Number($('#number-step').value);if(![start,end,step].every(Number.isFinite)||step===0||(end-start)*step<0)throw Error('Use a nonzero step that moves from start toward end.');const count=Math.floor((end-start)/step+1e-9)+1;if(count<1||count>MAX_ENTRIES)throw Error('Generate between 1 and 1,000,000 numbers.');if(state.wheels.length>=30)throw Error('A session supports up to 30 wheels.');const button=$('[data-action=generate-numbers]');button.disabled=true;busy=true;try{const entries=await makeNumberEntries(start,step,count,p=>button.textContent=`Creating ${Math.round(p*100)}%…`);busy=false;const wheel=newWheel('Numbers',[]);wheel.entries=entries;addWheel(wheel);close();notify(`${count.toLocaleString()} number entries created`);}catch(e){busy=false;button.disabled=false;button.textContent='Create number wheel';throw e;}}
function generateTeams() {
  const participants = shuffle(current().entries.filter((e) => e.enabled)),
    value = Number($("#team-count").value);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    !participants.length ||
    value > participants.length
  )
    throw Error("Choose a whole number no greater than the participant count.");
  const n =
      $("#team-mode").value === "teams"
        ? value
        : Math.ceil(participants.length / value),
    teams = Array.from({ length: n }, () => []);
  participants.forEach((e, i) => teams[i % n].push(e.text));
  const text = teams
    .map((x, i) => `Team ${i + 1}\n${x.join("\n")}`)
    .join("\n\n");
  dialog(
    "Your teams",
    `<div class="scrollbox">${teams.map((team, i) => `<div class="info"><strong>Team ${i + 1}</strong><p>${team.map(esc).join(", ")}</p></div>`).join("")}</div><div class="dialog-actions"><button id="copy-teams" class="outlined">Copy teams</button><button id="export-teams" class="primary">Export teams</button></div>`,
  );
  $("#copy-teams").onclick = () => copy(text);
  $("#export-teams").onclick = () =>
    download(text, "orbit-teams.txt", "text/plain");
}
function addWheel(w) {
  if (state.wheels.length >= 30)
    throw Error("A session supports up to 30 wheels.");
  mutate(() => {
    state.wheels.push(w);
    state.activeId = w.id;
    rotation = 0;
  });
}
function shareDialog() {
  dialog(
    t("share"),
    `<p class="muted">Share a snapshot of your session, including colors, weights and images. Future edits do not change this link.</p><label class="field" style="margin-top:16px">Recipient experience<select id="share-permission"><option value="edit">Can edit and spin</option><option value="spin">Can spin · editor locked</option><option value="view">View only</option><option value="spin-only">Spin only · presentation view</option></select></label><p class="info">Permissions control the interface. Anyone with this link has a copy of its data; these are not server-enforced access restrictions.</p><div class="dialog-actions"><button data-action="generate-share" class="primary">Create link</button></div>`,
  );
}
async function generateShare() {
  const button = $("[data-action=generate-share]");
  button.disabled = true;
  button.textContent = "Creating link…";
  try {
    const link = await shareLink(conf(), $("#share-permission").value);
    dialog(
      "Ready to share",
      `<label class="field">Share link<textarea id="share-link" class="linkbox" rows="4" readonly>${esc(link)}</textarea></label><p class="note">Shared snapshots do not overwrite a recipient’s local workspace. Hosted site access still applies.</p><div class="dialog-actions"><button data-action="copy-link" class="primary">Copy link</button></div>`,
    );
  } catch (e) {
    button.disabled = false;
    button.textContent = "Create link";
    throw e;
  }
}
function celebration() {
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const canvas = $("#confetti"),
    ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const pieces = Array.from({ length: 85 }, () => ({
      x: random() * innerWidth,
      y: (-random() * innerHeight) / 2,
      v: 2 + random() * 5,
      w: 5 + random() * 7,
      c: PALETTES.Orbit[Math.floor(random() * 8)],
      r: random() * TAU,
    })),
    start = performance.now();
  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.y += p.v;
      p.x += Math.sin((p.r += 0.06)) * 1.5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, 0, p.w, p.w * 0.5);
      ctx.restore();
    }
    if (now - start < 2800) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}
function spinWheel(w, { visible = false, sound = true } = {}) {
  const start = visible ? rotation : 0;
  let lastTick = 0;
  if (visible) {
    render($("#wheel"), w, 0);
    $("#wheel").style.transform = `rotate(${start}rad)`;
  }
  if (sound) audio.tone(w.soundSettings, "spin", 180, 0.35);
  return animateSpin(w, {
    initialRotation: start,
    reducedMotion: matchMedia("(prefers-reduced-motion:reduce)").matches,
    onFrame: ({ rotation: angle, phase, progress }) => {
      if (visible) {
        rotation = angle % TAU;
        $("#wheel").style.transform = `rotate(${angle}rad)`;
        spinState = phase;
        $("#spin-progress").value=progress;
        $('#spin-status').textContent=`${Math.max(0,w.spinSettings.duration*(1-progress)).toFixed(1)}s remaining`;
      }
    },
    onBoundary: ({ time }) => {
      if (sound && time - lastTick > 30) {
        audio.tone(w.soundSettings, "tick");
        lastTick = time;
      }
    },
  });
}
async function spin(all = false) {
  if (busy || !canSpin()) return null;
  clearTimeout(inputTimer);
  inputTimer = null;
  const wheels = all
    ? state.wheels.filter((w) => segments(w.entries).length)
    : [current()];
  if (!wheels.length || (!segments(current().entries).length && !all))
    return notify(t("empty"));
  close();
  busy = true;
  spinState = "accelerating";
  $("#spin-progress").hidden=false;
  $("#spin-progress").value=0;
  audio.ready();
  audio.music(current().soundSettings);
  update();
  $("#announcer").textContent = "The wheel is spinning.";
  try {
    const results = (
      await Promise.all(
        wheels.map((w) =>
          spinWheel(w, {
            visible: w.id === state.activeId,
            sound: w.id === state.activeId,
          }),
        ),
      )
    ).filter(Boolean);
    lastResults = results.map(({ wheel, entry: e }) => recordResult(wheel, e));
    state.history.push(...lastResults);
    if (state.history.length > 10000)
      state.history.splice(0, state.history.length - 10000);
    for (const { wheel, entry: e } of results) {
      if (wheel.winnerSettings.autoRemove && canEdit()) {
        snapshot();
        wheel.entries = removeWinner(wheel.entries, e);
      }
      window.dispatchEvent(
        new CustomEvent("orbit:winner", {
          detail: {
            winner: clone(e),
            wheelId: wheel.id,
            wheelName: wheel.name,
            date: new Date().toISOString(),
          },
        }),
      );
    }
    const result =
      results.find((x) => x.wheel.id === state.activeId) || results[0];
    audio.win(result.wheel.soundSettings);
    if (result.wheel.winnerSettings.confetti) celebration();
    $("#last-pick").innerHTML =
      `Last pick: <strong>${esc(result.entry.text)}</strong>`;
    $("#announcer").textContent = lastResults
      .map((x) => `${x.wheelName}: ${x.text}`)
      .join(". ");
    busy = false;
    spinState = "finished";
    $("#spin-progress").hidden=true;
    scheduleSave();
    update();
    $("#spin-status").textContent = "Your next pick is ready.";
    showWinner(results, all);
    return lastResults;
  } catch (e) {
    busy = false;
    spinState = "idle";
    $("#spin-progress").hidden=true;
    update();
    fail(e);
    return null;
  }
}
function showWinner(results, all) {
  dialog(
    all ? "A lucky lineup" : t("winner"),
    `<div class="winner"><span class="winner-symbol">✧</span>${results.map(({ wheel, entry: e }) => `<div><h3>${esc(e.text)}</h3><p>${esc(wheel.name)}${wheel.winnerSettings.autoRemove ? " · Automatically removed" : ""}</p></div>`).join("")}</div><div class="dialog-actions"><button data-action="close" class="outlined">Keep winner</button>${!all && canEdit() ? '<button data-action="remove-winner" class="outlined">Remove winner</button><button data-action="remove-all-winners" class="outlined">Remove all instances</button>' : ""}<button data-action="spin-again" class="primary">Spin ${all ? "all " : ""}again</button><button data-action="export-results" class="text-button">Export results</button></div>`,
    { results, all },
  );
}
function removeResult(all) {
  const result = dialogContext?.results?.[0];
  if (!result) return;
  mutate(
    () =>
      (result.wheel.entries = removeWinner(
        result.wheel.entries,
        result.entry,
        all,
      )),
  );
  close();
  notify(t("removed"));
}
function presentation(stream = false) {
  close();
  if (document.body.classList.contains("presenting")) {
    document.body.classList.remove("presenting", "streaming");
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    return;
  }
  document.body.classList.add("presenting");
  document.body.classList.toggle("streaming", stream);
  if (!stream)
    void document.documentElement
      .requestFullscreen?.()
      .catch(() =>
        notify("Presentation is ready. Browser fullscreen is unavailable."),
      );
}
function undo(redo = false) {
  if (busy || !canEdit()) return;
  clearTimeout(inputTimer);
  inputTimer = null;
  const from = redo ? redoStack : undoStack,
    to = redo ? undoStack : redoStack;
  if (!from.length) return notify(redo ? "Nothing to redo" : "Nothing to undo");
  to.push(captureWorkspace(state.wheels,state.activeId));
  trimUndo(to);
  const next = from.pop();
  state.wheels = next.wheels;
  state.activeId = next.activeId;
  rotation = 0;
  scheduleSave();
  update();
  notify(redo ? "Redone" : "Undone");
}
function moveEntry(delta) {
  const id = dialogContext.entryId;
  mutate((w) => {
    const i = w.entries.findIndex((e) => e.id === id),
      j = i + delta;
    if (j >= 0 && j < w.entries.length)
      [w.entries[i], w.entries[j]] = [w.entries[j], w.entries[i]];
  });
}
const actions = {
  "history-prev": () => showHistory(historyPage - 1),
  "history-next": () => showHistory(historyPage + 1),
  close,
  spin: () => spin(),
  hub: () => {
    if (current().appearanceSettings.centerClick === "spin") return spin();
    if (current().appearanceSettings.centerClick === "customize" && canEdit())
      showSettings();
  },
  "spin-all": () => spin(true),
  "spin-again": () => spin(dialogContext?.all),
  simple: () => {
    editing = false;
    update();
  },
  advanced: () => {
    editing = true;
    update();
  },
  shuffle: () => mutate((w) => (w.entries = shuffle(w.entries))),
  sort: () =>
    mutate((w) => w.entries.sort((a, b) => a.text.localeCompare(b.text))),
  clear: () =>
    confirmAction("Clear every entry on this wheel? You can undo this.", () =>
      mutate((w) => (w.entries = [])),
    ),
  "add-wheel": () => addWheel(newWheel("Untitled wheel", [])),
  "wheel-menu": wheelMenu,
  "rename-wheel": () => {
    const name = $("#rename-wheel").value.trim(),
      description = $("#wheel-desc").value;
    if (!name) return notify("Enter a wheel name.");
    mutate((w) => {
      w.name = name;
      w.description = description;
    });
    close();
  },
  "duplicate-wheel": () => {
    const w = clone(current());
    w.id = uid();
    w.name += " copy";
    w.entries.forEach((e) => (e.id = uid()));
    addWheel(w);
    close();
  },
  "delete-wheel": () => {
    const id = current().id;
    if (state.wheels.length === 1) return;
    confirmAction("Delete this wheel and its entries?", () =>
      mutate(() => {
        state.wheels = state.wheels.filter((w) => w.id !== id);
        state.activeId = state.wheels[0].id;
        rotation = 0;
      }),
    );
  },
  "new-entry": () => {
    const e = entry("New possibility");
    if (current().entries.length >= MAX_ENTRIES)
      return notify("The maximum is 1,000,000 entries.");
    mutate((w) => w.entries.push(e));
    entryDialog(e.id);
  },
  "save-entry": saveEntry,
  "delete-entry": () => {
    const id = dialogContext.entryId;
    mutate((w) => (w.entries = w.entries.filter((e) => e.id !== id)));
    close();
  },
  "duplicate-entry": () => {
    const e = current().entries.find((e) => e.id === dialogContext.entryId);
    if (!e || current().entries.length >= MAX_ENTRIES) return;
    const copy = clone(e);
    copy.id = uid();
    mutate((w) => w.entries.splice(w.entries.indexOf(e) + 1, 0, copy));
    entryDialog(copy.id);
  },
  "entry-up": () => moveEntry(-1),
  "entry-down": () => moveEntry(1),
  "remove-entry-image": () => {
    const e = current().entries.find((e) => e.id === dialogContext.entryId);
    mutate(() => (e.image = null));
    entryDialog(e.id);
  },
  customize: () => showSettings(),
  templates: showTemplates,
  history: showHistory,
  save: saveSession,
  "confirm-save": confirmSave,
  library,
  export: () => exportDialog(),
  "export-history": () => exportDialog("history"),
  "export-results": () => exportDialog("results"),
  "download-export": exportNow,
  "copy-history": () => copy(historyText("txt")),
  "clear-history": () =>
    confirmAction(
      "Clear the complete winner history? This cannot be undone.",
      () => {
        state.history = [];
        scheduleSave();
        update();
        showHistory();
        notify("History cleared");
      },
    ),
  import: importDialog,
  "preview-import": previewImport,
  "apply-import": applyImport,
  "google-sheets": googleDialog,
  "fetch-google": fetchGoogle,
  share: shareDialog,
  "generate-share": generateShare,
  "copy-link": () => copy($("#share-link").value),
  tools: toolsDialog,
  "generate-numbers": generateNumbers,
  "generate-teams": generateTeams,
  fullscreen: () => presentation(),
  streamer: () => presentation(true),
  undo: () => undo(),
  redo: () => undo(true),
  theme: () => {
    state.theme = ["system", "light", "dark"][
      (["system", "light", "dark"].indexOf(state.theme) + 1) % 3
    ];
    theme();
    scheduleSave();
    notify("Theme: " + state.theme);
  },
  "remove-winner": () => removeResult(false),
  "remove-all-winners": () => removeResult(true),
  "add-color": () => {
    if (current().appearanceSettings.palette.length >= 64) return;
    mutate((w) => w.appearanceSettings.palette.push("#b9a5f5"));
    showSettings();
  },
  "remove-center-image": () => {
    mutate((w) => (w.appearanceSettings.centerImage = null));
    showSettings();
  },
  "test-sound": () => {
    audio.win(current().soundSettings);
    audio.music(current().soundSettings);
  },
  "reset-settings": () =>
    confirmAction(
      "Reset this wheel’s appearance, spin, winner and sound settings?",
      () => {
        mutate((w) => {
          const defaults = newWheel();
          for (const key of [
            "appearanceSettings",
            "spinSettings",
            "winnerSettings",
            "soundSettings",
          ])
            w[key] = defaults[key];
        });
        showSettings();
        notify("Settings reset");
      },
    ),
  "entry-menu": () =>
    dialog(
      "Entry tools",
      `<div class="dialog-actions"><button data-action="dedupe-now" class="outlined">Remove duplicates</button><button data-action="reverse" class="outlined">Reverse order</button><button data-action="export" class="outlined">Export entries</button><button data-action="clear" class="danger">Clear all</button></div>`,
    ),
  "dedupe-now": () => {
    mutate((w) => (w.entries = deduplicate(w.entries)));
    close();
    notify("Duplicates removed");
  },
  reverse: () => {
    mutate((w) => w.entries.reverse());
    close();
  },
  "prev-page": () => {
    page--;
    renderEntries();
  },
  "next-page": () => {
    page++;
    renderEntries();
  },
  help: () =>
    dialog(
      "A little help",
      `<p class="muted">Add one possibility per line, then spin. Advanced entries let you set weights, colors and images. Every enabled entry takes part, even while searching.</p><div class="section-label">Keyboard shortcuts</div>${[
        ["Space", "Spin"],
        ["S", "Shuffle"],
        ["F", "Presentation"],
        ["C", "Customize"],
        ["Esc", "Close dialog / leave presentation"],
        ["Ctrl/Cmd + S", "Save session"],
        ["Ctrl/Cmd + Z", "Undo"],
        ["Ctrl/Cmd + Shift + Z", "Redo"],
      ]
        .map(
          ([k, v]) =>
            `<div class="row"><kbd>${k}</kbd><span class="grow">${v}</span></div>`,
        )
        .join(
          "",
        )}<p class="note">Data stays on this device. Export backups for a portable copy. Share links contain a snapshot, not a synchronized workspace.</p>`,
    ),
};
document.addEventListener("click", async (event) => {
  const el = event.target.closest("button");
  if (!el || el.disabled) return;
  try {
    if (el.dataset.action) {
      const action = el.dataset.action;
      if (
        busy &&
        !["close", "help", "theme", "history", "fullscreen"].includes(action)
      )
        return;
      const editActions = [
        "shuffle",
        "sort",
        "clear",
        "add-wheel",
        "wheel-menu",
        "new-entry",
        "customize",
        "templates",
        "save",
        "import",
        "tools",
        "undo",
        "redo",
        "entry-menu",
        "dedupe-now",
        "reverse",
      ];
      if (!canEdit() && editActions.includes(action)) return;
      await actions[action]?.();
    } else if (el.dataset.wheel) {
      if (busy) return;
      state.activeId = el.dataset.wheel;
      rotation = 0;
      page = 0;
      scheduleSave();
      update();
    } else if (el.dataset.entry) entryDialog(el.dataset.entry);
    else if (el.dataset.template) {
      addWheel(
        newWheel(
          templates[Number(el.dataset.template)][0],
          templates[Number(el.dataset.template)][2],
        ),
      );
      close();
    } else if (el.dataset.settingsTab) showSettings(el.dataset.settingsTab);
    else if (el.dataset.saved)
      await savedAction(el.dataset.saved, el.dataset.op);
    else if (
      el.dataset.colorUp !== undefined ||
      el.dataset.colorDown !== undefined
    ) {
      const i = Number(el.dataset.colorUp ?? el.dataset.colorDown),
        j = i + (el.dataset.colorUp !== undefined ? -1 : 1);
      mutate((w) => {
        const p = w.appearanceSettings.palette;
        if (j >= 0 && j < p.length) [p[i], p[j]] = [p[j], p[i]];
      });
      showSettings();
    } else if (el.dataset.colorDelete !== undefined) {
      mutate((w) =>
        w.appearanceSettings.palette.splice(Number(el.dataset.colorDelete), 1),
      );
      showSettings();
    }
  } catch (e) {
    fail(e);
  }
});
let textEditRevision=0,pendingLargeText=null;
$('#entries').addEventListener('input',()=>{if(busy||!canEdit())return;const text=$('#entries').value;if(text.length<200000){commitText(text);}else{pendingLargeText=text;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{pendingLargeText=null;commitLargeText(text);},250);}});
function commitText(text){if(!inputTimer)snapshot();clearTimeout(inputTimer);const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(lines.length>MAX_ENTRIES)return notify('The maximum is 1,000,000 entries.');if(lines.some(x=>x.length>1000))return notify('Each entry can contain up to 1,000 characters.');const pools=new Map();for(const e of current().entries){let p=pools.get(e.text);if(!p){p={entries:[],cursor:0};pools.set(e.text,p);}p.entries.push(e);}let entries=lines.map(text=>{const p=pools.get(text);return p&&p.cursor<p.entries.length?p.entries[p.cursor++]:entry(text);});if(current().winnerSettings.dedupe)entries=deduplicate(entries);current().entries=entries;current().updatedAt=new Date().toISOString();$('#entry-count').textContent=entries.length.toLocaleString();$('#line-count').textContent=`${entries.length.toLocaleString()} entries`;draw();scheduleSave();inputTimer=setTimeout(()=>{inputTimer=null;update();},450);}
async function commitLargeText(text){const request=++textEditRevision;inputTimer=null;busy=true;update();try{const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const entries=await reconcileEntries(lines,current().entries,p=>$('#spin-status').textContent=`Preparing ${Math.round(p*100)}%…`);if(request!==textEditRevision)return;snapshot();current().entries=current().winnerSettings.dedupe?deduplicate(entries):entries;current().updatedAt=new Date().toISOString();scheduleSave();}catch(e){fail(e);}finally{busy=false;update();$('#spin-status').textContent='Ready to spin';}}
$("#entries").addEventListener("blur", () => {
  if(pendingLargeText!==null){const text=pendingLargeText;pendingLargeText=null;clearTimeout(inputTimer);void commitLargeText(text);return;}
  clearTimeout(inputTimer);
  inputTimer = null;
  update();
});
$("#entry-search").addEventListener("input", (e) => {
  search = e.target.value;
  page = 0;
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderEntries(),150);
});
let searchTimer;
$('#custom-duration').addEventListener('input',event=>{
  const el=event.target,value=Number(el.value);
  if(busy||!canEdit()||!Number.isFinite(value)||value<.1||value>MAX_DURATION)return;
  el.setCustomValidity('');
  if(current().spinSettings.duration!==value)mutate(w=>{w.spinSettings.duration=value;w.spinSettings.customDuration=true;});
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.id.startsWith("edit-") && dialogContext?.entryId) {
      await liveEntry(el);
    } else if(el.id==='duration'){if(el.value==='custom'){mutate(w=>w.spinSettings.customDuration=true);$('#custom-duration').focus();}else mutate(w=>{w.spinSettings.duration=Number(el.value);w.spinSettings.customDuration=false;});}
    else if(el.id==='custom-duration'){const value=Number(el.value);if(!Number.isFinite(value)||value<.1||value>MAX_DURATION){el.setCustomValidity('Enter 0.1–86,400 seconds.');el.reportValidity();return;}el.setCustomValidity('');mutate(w=>{w.spinSettings.duration=value;w.spinSettings.customDuration=true;});}
    else if (el.id === "dedupe")
      mutate((w) => {
        w.winnerSettings.dedupe = el.checked;
        if (el.checked) w.entries = deduplicate(w.entries);
      });
    else if (el.dataset.enabled)
      mutate(
        (w) =>
          (w.entries.find((e) => e.id === el.dataset.enabled).enabled =
            el.checked),
      );
    else if (el.id === "setting-palette") {
      if (PALETTES[el.value]) {
        mutate((w) => (w.appearanceSettings.palette = [...PALETTES[el.value]]));
        showSettings();
      }
    } else if (el.id.startsWith("setting-") || el.id.startsWith("sound-"))
      applySetting(el);
    else if (
      el.dataset.paletteColor !== undefined ||
      el.dataset.paletteHex !== undefined
    ) {
      if (!validColor(el.value))
        return notify("Use a hex color such as #b9a5f5.");
      const i = Number(el.dataset.paletteColor ?? el.dataset.paletteHex);
      mutate((w) => (w.appearanceSettings.palette[i] = el.value));
      showSettings();
    } else if (el.id === "center-image") {
      el.disabled = true;
      try {
        const image = await optimizeImage(el.files[0]);
        mutate((w) => (w.appearanceSettings.centerImage = image));
        showSettings();
      } finally {
        el.disabled = false;
      }
    } else if (el.id === "direction") {
      state.direction = el.value;
      setLocale("en", el.value);
      scheduleSave();
    }
  } catch (e) {
    fail(e);
  }
});
$("#wheel").onclick = () => spin();
$("#dialog").addEventListener("cancel", () => {
  dialogContext = null;
  audio.stopMusic();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("#dialog").open && document.body.classList.contains("presenting"))
      presentation();
    return;
  }
  if (event.target.closest("input,textarea,select,[contenteditable=true]"))
    return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "s") {
    event.preventDefault();
    saveSession();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "z") {
    event.preventDefault();
    undo(event.shiftKey);
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || $("#dialog").open)
    return;
  if (key === " ") {
    event.preventDefault();
    void spin();
  }
  if (key === "s" && canEdit()) actions.shuffle();
  if (key === "f") presentation();
  if (key === "c" && canEdit() && !busy) showSettings();
});
document.addEventListener("fullscreenchange", () => {
  if (
    !document.fullscreenElement &&
    !document.body.classList.contains("streaming")
  )
    document.body.classList.remove("presenting");
});
window.addEventListener(
  "online",
  () => ($("#connection-status").textContent = t("online")),
);
window.addEventListener(
  "offline",
  () => ($("#connection-status").textContent = t("offline")),
);
matchMedia("(prefers-color-scheme:dark)").addEventListener("change", theme);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.stopMusic();
});
window.Orbit = Object.freeze({
  spin: () => spin(),
  spinAll: () => spin(true),
  getWheels: () => clone(state.wheels),
  getHistory: () => clone(state.history),
  getSpinState: () => spinState,
});
async function init() {
  busy=true;spinState="loading";update();$("#spin-status").textContent="Restoring your session…";
  try {
    await openStorage();
    saved = (await read("saved")) || [];
    if (!Array.isArray(saved)) saved = [];
    saved = saved.filter((s) => {
      try {
        validateConfiguration(s.configuration);
        return typeof s.name === "string" && typeof s.id === "string";
      } catch {
        return false;
      }
    });
    const stored = await read("session");
    if (stored) {
      try {
        const next = validateConfiguration(
          {format:"orbit-wheel",version:1,wheels:stored.wheels,activeId:stored.activeId},
        );
        state = {
          ...state,
          ...next,
          theme: ["light", "dark", "system"].includes(stored.theme)
            ? stored.theme
            : "system",
          direction: stored.direction === "rtl" ? "rtl" : "ltr",
          history: validateHistory(stored.history),
        };
      } catch {
        notify(
          "A previous session could not be restored. Open an exported backup to recover it.",
        );
      }
    }
  } catch (e) {
    fail(e);
  }
  try {
    const share = await loadShare(location.hash);
    if (share) {
      shared = true;
      role = share.permission;
      state.wheels = share.wheels;
      state.activeId = share.activeId;
      state.history = [];
      $("#save-status").textContent = "Shared snapshot";
      if (role !== "edit")
        notify(
          role === "view"
            ? "View-only shared wheel"
            : "Shared wheel · editor locked",
        );
      if (role === "spin-only") document.body.classList.add("presenting");
    }
  } catch (e) {
    fail(e);
  }
  busy=false;stateReady=true;spinState="idle";
  setLocale("en", state.direction);
  update();$("#spin-status").textContent="Ready to spin";
  localize(document.body);
  if (document.modelContext?.registerTool) {
    try {
      void Promise.resolve(
        document.modelContext.registerTool({
          name: "spin_orbit_wheel",
          description:
            "Spin the active wheel and return the winner after the animation.",
          inputSchema: {
            type: "object",
            properties: { all: { type: "boolean" } },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (input) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).some((k) => k !== "all") ||
              (input.all !== undefined && typeof input.all !== "boolean")
            )
              throw Error("Expected an optional boolean all.");
            if (!canSpin() || busy) throw Error("Spinning is unavailable.");
            return await spin(input.all === true);
          },
        }),
      ).catch(() => {});
    } catch {}
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
window.addEventListener("pagehide", () => {
  if (!shared&&stateReady) void write("session", state).catch(() => {});
});
void init();

async function liveEntry(el) {
  const e = current().entries.find((e) => e.id === dialogContext?.entryId);
  if (!e) return;
  const key = el.id.slice(5);
  if (key === "image") {
    if (el.files[0]) {
      el.disabled = true;
      try {
        const image = await optimizeImage(el.files[0]);
        mutate(() => (e.image = image));
      } finally {
        el.disabled = false;
      }
    }
    return;
  }
  if (key === "weight") {
    const n = Number(el.value);
    if (!Number.isFinite(n) || n <= 0 || n > 1e9) {
      el.setCustomValidity("Use a positive weight up to 1 billion.");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    mutate(() => (e.weight = n));
  }
  if (key === "name" && el.value.trim())
    mutate(() => (e.text = el.value.trim()));
  if (key === "enabled") mutate(() => (e.enabled = el.checked));
  if (key === "color" || key === "auto-color")
    mutate(
      () =>
        (e.color = $("#edit-auto-color").checked
          ? null
          : $("#edit-color").value),
    );
  const p = segments(current().entries).find((x) => x.entry.id === e.id);
  const strong = $("#dialog-content .field strong");
  if (strong)
    strong.textContent = (p ? p.probability * 100 : 0).toFixed(2) + "%";
}

