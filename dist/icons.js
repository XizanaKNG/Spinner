const paths = {
  orbit:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m19 2 3 1-1 3"/>',
  spin: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
  shuffle:
    '<path d="m18 3 3 3-3 3M18 15l3 3-3 3M3 6h3c5 0 7 12 12 12h3M3 18h3c2 0 4-3 6-6M14 8c1-1 2-2 4-2h3"/>',
  sort: '<path d="M4 5h12M4 10h9M4 15h6M4 20h3M19 5v15m-3-3 3 3 3-3"/>',
  import: '<path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6"/>',
  clear: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  customize:
    '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16v1"/>',
  theme: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  menu: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  templates:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  undo: '<path d="M9 4 4 9l5 5M4 9h9a7 7 0 0 1 0 14"/>',
  redo: '<path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0 0 14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.menu}</svg>`;
export function decorateIcons(root) {
  const map = {
    help: "help",
    theme: "theme",
    customize: "customize",
    fullscreen: "fullscreen",
    "entry-menu": "menu",
    "wheel-menu": "menu",
    "add-wheel": "add",
    undo: "undo",
    redo: "redo",
    close: "close",
  };
  for (const el of root.querySelectorAll(
    "button.icon,button.wheel-options,button[data-action=undo],button[data-action=redo],button[data-action=add-wheel]",
  )) {
    const name = map[el.dataset.action] || "menu";
    if (el.dataset.action) el.innerHTML = icon(name);
  }
  for (const el of root.querySelectorAll(".editor-tools button")) {
    const name = el.dataset.action;
    if (el.firstChild?.nodeType === Node.TEXT_NODE)
      el.firstChild.textContent = "";
    if (!el.querySelector("svg"))
      el.insertAdjacentHTML("afterbegin", icon(name));
  }
  for (const el of root.querySelectorAll(".feature-card"))
    el.querySelector(".card-icon").innerHTML = icon(el.dataset.action);
  for (const el of root.querySelectorAll(".chevron"))
    el.innerHTML = icon("chevron");
  const brand = root.querySelector(".brandmark");
  if (brand) brand.innerHTML = icon("orbit");
  const spin = root.querySelector("#spin-button span");
  if (spin) spin.innerHTML = icon("spin");
}
