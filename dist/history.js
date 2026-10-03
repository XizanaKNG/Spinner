import { uid, csv } from "./engine.js";
export function recordResult(wheel, entry) {
  return {
    id: uid(),
    entryId: entry.id,
    text: entry.text,
    wheelId: wheel.id,
    wheelName: wheel.name,
    date: new Date().toISOString(),
  };
}
export function exportHistory(history, format = "txt") {
  if (format === "json") return JSON.stringify(history, null, 2);
  if (format === "csv")
    return csv([
      ["Winner", "Wheel", "Date/time"],
      ...history.map((h) => [h.text, h.wheelName, h.date]),
    ]);
  return history
    .map(
      (h) =>
        `${h.text} — ${h.wheelName} — ${new Date(h.date).toLocaleString()}`,
    )
    .join("\n");
}
export function validateHistory(history) {
  return Array.isArray(history)
    ? history
        .filter(
          (h) =>
            h &&
            typeof h.text === "string" &&
            h.text.length <= 1000 &&
            typeof h.wheelName === "string" &&
            h.wheelName.length <= 120 &&
            !isNaN(Date.parse(h.date)),
        )
        .slice(-10000)
        .map((h) => ({
          id: typeof h.id === "string" ? h.id : uid(),
          entryId: typeof h.entryId === "string" ? h.entryId : "",
          wheelId: typeof h.wheelId === "string" ? h.wheelId : "",
          text: h.text,
          wheelName: h.wheelName,
          date: h.date,
        }))
    : [];
}
