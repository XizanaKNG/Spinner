let context,
  timer,
  index = 0;
export function ready() {
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") void context.resume();
  } catch {}
  return context;
}
export function tone(s, type = "tick", frequency, duration = 0.04) {
  if (!s[type] || s.master <= 0 || s.effects <= 0) return;
  const ctx = ready();
  if (!ctx) return;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = type === "tick" ? "triangle" : "sine";
  osc.frequency.value =
    frequency ||
    { tick: 900, spin: 180, winner: 660, celebration: 1046 }[type] ||
    440;
  gain.gain.setValueAtTime(
    s.master * s.effects * (type === "tick" ? 0.12 : 0.22),
    ctx.currentTime,
  );
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}
export function win(s) {
  [0, 160, 320].forEach((ms, i) =>
    setTimeout(() => tone(s, "winner", [523, 659, 784][i], 0.25), ms),
  );
  if (s.celebration)
    [480, 620, 760].forEach((ms, i) =>
      setTimeout(() => tone(s, "celebration", [784, 988, 1046][i], 0.3), ms),
    );
}
export function stopMusic() {
  clearInterval(timer);
  timer = null;
}
export function music(s) {
  stopMusic();
  if (!s.music) return;
  const ctx = ready();
  if (!ctx) return;
  const play = () => {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = [
      130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61,
    ][index++ % 8];
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      s.master * s.musicVolume * 0.12,
      ctx.currentTime + 0.3,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.7);
  };
  play();
  timer = setInterval(play, 1000);
}
