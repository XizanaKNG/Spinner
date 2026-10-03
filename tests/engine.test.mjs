import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAU,
  newWheel,
  entry,
  segments,
  choose,
  targetRotation,
  winnerAt,
  random,
  removeWinner,
  deduplicate,
  shuffle,
  configuration,
  validateConfiguration,
  validateWheel,
  parseDelimited,
  parseData,
  mappedEntries,
  csv,
} from "../dist/engine.js";
test("equal weights create equal probabilities and contiguous full-circle geometry", () => {
  const p = segments(newWheel().entries);
  assert.equal(p.length, 8);
  for (let i = 0; i < p.length; i++) {
    assert.equal(p[i].probability, 1 / 8);
    assert.ok(Math.abs(p[i].start - (i * TAU) / 8) < 1e-12);
  }
  assert.ok(Math.abs(p.at(-1).end - TAU) < 1e-12);
});
test("1:3:2 weights produce 1/6, 3/6 and 2/6 probabilities", () => {
  const e = [entry("John", 1), entry("Emma", 3), entry("Michael", 2)],
    p = segments(e);
  [1 / 6, 3 / 6, 2 / 6].forEach((v, i) =>
    assert.ok(Math.abs(p[i].probability - v) < 1e-12),
  );
});
test("deterministic stratified selection covers weighted probabilities precisely", () => {
  const p = segments([entry("A", 1), entry("B", 3)]),
    counts = { A: 0, B: 0 };
  for (let i = 0; i < 10000; i++)
    counts[choose(p, () => (i + 0.5) / 10000).entry.text]++;
  assert.deepEqual(counts, { A: 2500, B: 7500 });
});
test("crypto sampling shows statistically reasonable equal and weighted results", () => {
  const p = segments([entry("A", 1), entry("B", 3)]);
  let b = 0;
  for (let i = 0; i < 20000; i++) if (choose(p).entry.text === "B") b++;
  assert.ok(b > 14400 && b < 15600, `count=${b}`);
  for (let i = 0; i < 100; i++) assert.ok(random() >= 0 && random() < 1);
});
test("selected segment agrees with pointer for thousands of target rotations", () => {
  const p = segments([entry("ნიკა", 1), entry("მარიამი", 3), entry("ანა", 2)]);
  for (let i = 0; i < 5000; i++) {
    const chosen = choose(p),
      start = random() * 1000,
      target = targetRotation(chosen, start);
    assert.equal(winnerAt(p, target).entry.id, chosen.entry.id);
    assert.ok(target > start + TAU * 4);
  }
  assert.equal(winnerAt(p, 0).entry.text, "ნიკა");
});
test("duplicates remain independent entries and winner removal uses stable identity", () => {
  const a = entry("ანა"),
    b = entry("ანა"),
    c = entry("ნიკა"),
    e = [a, b, c];
  assert.equal(segments(e).length, 3);
  assert.deepEqual(removeWinner(e, a), [b, c]);
  assert.deepEqual(removeWinner(e, a, true), [c]);
  assert.deepEqual(deduplicate(e), [a, c]);
});
test("invalid and disabled weights cannot affect selection", () => {
  const e = [
    entry("valid"),
    { ...entry("disabled", 100), enabled: false },
    entry("zero", 0),
    entry("negative", -2),
    entry("nan", NaN),
    entry("infinite", Infinity),
  ];
  assert.deepEqual(
    segments(e).map((p) => p.entry.text),
    ["valid"],
  );
  for (const weight of [0, -1, Infinity, NaN, "3"]) {
    const w = newWheel();
    w.entries[0].weight = weight;
    assert.throws(() => validateWheel(w));
  }
  assert.throws(() => choose([]));
});
test("large unequal weights remain finite and normalize safely", () => {
  const p = segments([entry("A", 1e9), entry("B", 1e-6)]);
  assert.ok(p.every((s) => Number.isFinite(s.probability)));
  assert.ok(p.at(-1).end <= TAU + 1e-12);
});
test("multiple wheels save/load preserves independent settings and Unicode", () => {
  const a = newWheel("ქართული", ["ნიკა", "გიორგი"]),
    b = newWheel("Other", ["B"]);
  a.entries[0].weight = 3;
  a.entries[0].color = "#abcdef";
  a.entries[0].image = "data:image/png;base64,aGVsbG8=";
  a.soundSettings.master = 0.25;
  b.appearanceSettings.palette = ["#010203"];
  const data = configuration([a, b], b.id),
    loaded = validateConfiguration(JSON.parse(JSON.stringify(data)));
  assert.equal(loaded.wheels[0].entries[0].text, "ნიკა");
  assert.equal(loaded.wheels[0].entries[0].weight, 3);
  assert.equal(loaded.wheels[0].entries[0].image, a.entries[0].image);
  assert.equal(loaded.wheels[0].soundSettings.master, 0.25);
  assert.equal(loaded.activeId, b.id);
  loaded.wheels[1].entries[0].text = "Changed";
  assert.equal(a.entries[0].text, "ნიკა");
  assert.deepEqual(loaded.wheels[1].appearanceSettings.palette, ["#010203"]);
});
test("imports reject code-bearing images, bad palettes, versions, ids and prototype payloads", () => {
  const w = newWheel();
  w.entries[0].image = "javascript:alert(1)";
  assert.throws(() => validateWheel(w));
  w.entries[0].image = null;
  w.appearanceSettings.palette = ["red"];
  assert.throws(() => validateWheel(w));
  const good = newWheel();
  assert.throws(() =>
    validateConfiguration({
      format: "orbit-wheel",
      version: 2,
      wheels: [good],
    }),
  );
  assert.throws(() =>
    validateConfiguration(configuration([good, good], good.id)),
  );
  const payload = JSON.parse(
    JSON.stringify(configuration([good], good.id)).replace(
      '"version":1',
      '"version":1,"__proto__":{"polluted":true}',
    ),
  );
  validateConfiguration(payload);
  assert.equal({}.polluted, undefined);
});
test("CSV export/import handles quoted cells, multiline data and Unicode", () => {
  const rows = [
    ["Name", "Weight", "Color"],
    ["ანა, მარიამი", "3", "#abcdef"],
    ['"Quote"\nNext', "1", "#010203"],
  ];
  assert.deepEqual(parseDelimited(csv(rows)), rows);
  const p = parseData(csv(rows), "csv");
  const result = mappedEntries(p.rows, { text: 0, weight: 1, color: 2 });
  assert.equal(result[0].text, "ანა, მარიამი");
  assert.equal(result[0].weight, 3);
  assert.equal(result[1].text, '"Quote"\nNext');
  assert.throws(() => parseDelimited('"Unclosed'));
  assert.throws(() =>
    mappedEntries([["A", "0"]], { text: 0, weight: 1, color: null }),
  );
});
test("TXT, TSV, JSON and dedicated configuration import validate", () => {
  assert.equal(parseData("ნიკა\nგიორგი").rows.length, 2);
  assert.deepEqual(parseData("Name\tWeight\nAna\t3").columns, [
    "Name",
    "Weight",
  ]);
  assert.deepEqual(parseData('["ანა","ნიკა"]', "json").rows, [
    ["ანა"],
    ["ნიკა"],
  ]);
  assert.equal(
    parseData(JSON.stringify(configuration([newWheel()], null)), "json").config
      .wheels.length,
    1,
  );
  assert.throws(() => parseData("{broken", "json"));
});
test("20,000 entries calculate without DOM and preserve sum and distinct identities", () => {
  const w = newWheel(
      "Large",
      Array.from({ length: 20000 }, (_, i) => `Entry ${i}`),
    ),
    p = segments(w.entries);
  assert.equal(p.length, 20000);
  assert.ok(Math.abs(p.at(-1).end - TAU) < 1e-10);
  assert.equal(new Set(w.entries.map((e) => e.id)).size, 20000);
  assert.equal(validateWheel(w).entries.length, 20000);

});
test("shuffle preserves all identities without mutating input", () => {
  const e = newWheel().entries,
    original = e.map((x) => x.id),
    result = shuffle(e, () => 0.5);
  assert.deepEqual(
    e.map((x) => x.id),
    original,
  );
  assert.deepEqual([...result].map((x) => x.id).sort(), [...original].sort());
});
