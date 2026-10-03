import { test } from "node:test";
import assert from "node:assert/strict";
import { animateSpin, planSpin, frameAt, CRUISE_SPEED } from "../dist/spin.js";
import {
  TAU,
  newWheel,
  entry,
  segments,
  boundaryPosition,
  configuration,
  csv,
  winnerAt,
} from "../dist/engine.js";
import { shareLink, loadShare } from "../dist/sharing.js";
import {
  recordResult,
  exportHistory,
  validateHistory,
} from "../dist/history.js";
test('long spins preserve cruise speed and slow only near the end', () => {
  for (const duration of [2,5,120,300]) for (const fraction of [0,.01,.25,.5,.9,.999999]) {
    const wheel=newWheel('Timing',['A','B','C']); wheel.spinSettings.duration=duration;
    const plan=planSpin(wheel,{initialRotation:123.456,rng:()=>fraction});
    assert.equal(plan.speed,CRUISE_SPEED);
    assert.ok(plan.acceleration<=1 && plan.deceleration<=7);
    const cruiseTime=plan.acceleration+plan.cruise/2;
    assert.equal(frameAt(plan,cruiseTime).velocity,CRUISE_SPEED);
    let previous=frameAt(plan,duration-plan.deceleration).velocity;
    for(let i=1;i<=100;i++) {
      const frame=frameAt(plan,duration-plan.deceleration+plan.deceleration*i/100);
      assert.ok(frame.velocity<=previous+1e-10); previous=frame.velocity;
    }
    for(const boundary of [plan.acceleration,duration-plan.deceleration]) {
      assert.ok(Math.abs(frameAt(plan,boundary-1e-7).rotation-frameAt(plan,boundary+1e-7).rotation)<1e-4);
    }
    assert.equal(winnerAt(plan.parts,plan.target).entry.id,plan.selected.entry.id);
    assert.equal(frameAt(plan,duration).velocity,0);
  }
});
test("spin animation accelerates, decelerates, crosses boundaries and resolves the actual pointer winner", async () => {
  const wheel = newWheel("Test", ["A", "B", "C"]);
  wheel.entries[1].weight = 3;
  let callback,
    frames = [],
    crossings = 0;
  const result = animateSpin(wheel, {
    rng: () => 0.4,
    now: () => 0,
    raf: (fn) => (callback = fn),
    onFrame: (f) => frames.push(f),
    onBoundary: (e) => (crossings += e.count),
  });
  for (let time = 0; time <= 5000; time += 100) callback(time);
  const landed = await result;
  assert.equal(landed.entry.id, landed.selectedId);
  assert.ok(frames.some((f) => f.phase === "accelerating"));
  assert.ok(frames.some((f) => f.phase === "spinning"));
  assert.ok(frames.some((f) => f.phase === "decelerating"));
  assert.equal(frames.at(-1).phase, "finished");
  const delta = (i) => frames[i + 1].rotation - frames[i].rotation;
  assert.ok(delta(1) < delta(20));
  assert.ok(delta(45) < delta(20));
  assert.ok(crossings >= 15);
});
test("a single-segment wheel still ticks at each full revolution", () => {
  const p = segments([entry("Only")]);
  assert.equal(boundaryPosition(p, TAU * 0.1), 1);
  assert.equal(boundaryPosition(p, TAU * 3.1), 4);
});
test('every preset and custom duration waits for its complete time, with either motion preference',async()=>{for(const duration of [2,5,9,14,0.1,3.7,60,3600])for(const reducedMotion of [false,true]){const wheel=newWheel();wheel.spinSettings.duration=duration;let callback,finished=false;const p=animateSpin(wheel,{reducedMotion,now:()=>100,raf:fn=>callback=fn});p.then(()=>finished=true);callback(100);callback(100+duration*1000-1);await Promise.resolve();assert.equal(finished,false,`${duration}s/${reducedMotion} finished early`);callback(100+duration*1000);assert.ok((await p).entry);assert.equal(finished,true);}});
test("safe compressed share snapshots round-trip Unicode and restrict modes", async () => {
  globalThis.window = { CompressionStream, DecompressionStream };
  globalThis.location = { href: "https://orbit.example/" };
  const w = newWheel("ქართული", ["ნიკა", "ანა"]);
  w.entries[0].weight = 3;
  const link = await shareLink(configuration([w], w.id), "view"),
    loaded = await loadShare(new URL(link).hash);
  assert.equal(loaded.permission, "view");
  assert.equal(loaded.wheels[0].entries[0].text, "ნიკა");
  assert.equal(loaded.wheels[0].entries[0].weight, 3);
  await assert.rejects(() =>
    loadShare(
      "#orbit=j" +
        Buffer.from(
          JSON.stringify({
            permission: "admin",
            configuration: configuration([w], w.id),
          }),
        ).toString("base64url"),
    ),
  );
  await assert.rejects(() => loadShare("#orbit=bad-data"));
});
test("history records include independent wheel identity and exports stay safe", () => {
  const w = newWheel(),
    record = recordResult(w, w.entries[0]);
  assert.equal(record.wheelId, w.id);
  assert.equal(record.wheelName, w.name);
  assert.ok(!isNaN(Date.parse(record.date)));
  assert.equal(JSON.parse(exportHistory([record], "json"))[0].text, "Alex");
  assert.equal(
    validateHistory([{ text: "x", wheelName: "x", date: "bad" }, record])
      .length,
    1,
  );
  assert.match(csv([['=HYPERLINK("evil")']]), /^"'/);
});
