// ===============================
// HYPERCAR MODE + BRAKES + PATAKA
// Controls:
// Arrow keys = shift lanes/gears
// W = accelerate
// S = brake
// Enter = unlock sound
// ===============================

const knob = document.getElementById("knob");
const gearText = document.getElementById("gearText");
const muteBtn = document.getElementById("muteBtn");
const dial = document.querySelector(".dial");

const tach = document.getElementById("tach");
const rpmText = document.getElementById("rpmText");
const speedText = document.getElementById("speedText");
const tachGear = document.getElementById("tachGear");

const brakeText = document.getElementById("brakeText");
const hudBrake = document.getElementById("hudBrake");

let muted = false;

// -------------------------------
// Shifter H-pattern coordinates
// -------------------------------
const P = {
  x: { left: 30, mid: 50, right: 70 },
  y: { top: 20, center: 50, bot: 80 },
};

let lane = "mid";
let row  = "center";
let currentGear = "N";

function gearFrom(l, r) {
  if (l === "mid" && r === "center") return "N";
  if (l === "left" && r === "top") return "1";
  if (l === "left" && r === "bot") return "2";
  if (l === "mid" && r === "top") return "3";
  if (l === "mid" && r === "bot") return "4";
  if (l === "right" && r === "top") return "5";
  if (l === "right" && r === "bot") return "R";
  return "N";
}

function setKnob() {
  knob.style.left = `${P.x[lane]}%`;
  knob.style.top  = `${P.y[row]}%`;
}

// -------------------------------
// UI FX
// -------------------------------
function pulseFX() {
  if (!dial) return;
  dial.classList.remove("pulse");
  knob.classList.remove("pop");
  void dial.offsetWidth;
  dial.classList.add("pulse");
  knob.classList.add("pop");
  if (navigator.vibrate) navigator.vibrate(25);
}

// -------------------------------
// Engine model + hypercar tuning
// -------------------------------
const IDLE_RPM = 950;
const REDLINE_RPM = 8000;
const LIMITER_START = 7750;
const LIMITER_FREQ = 14;

const GEAR_RATIO = {
  "N": 0,
  "1": 3.6,
  "2": 2.2,
  "3": 1.5,
  "4": 1.1,
  "5": 0.9,
  "R": 3.3,
};

// Hypercar speeds
const GEAR_MAX_SPEED = {
  "N": 999,
  "1": 120,
  "2": 200,
  "3": 290,
  "4": 380,
  "5": 520,
  "R": 90,
};

// Hypercar feel
const DRAG = 0.045;
const ENGINE_BRAKE = 0.09;
const ACCEL_BASE = 95;
const RPM_SMOOTH = 0.24;

// Brakes
let braking = false;
const BRAKE_FORCE = 520; // strong hypercar brakes

let speed = 0;
let rpm = IDLE_RPM;

let throttle = 0;
let throttleTarget = 0;
let accelerating = false;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function gearToRatio(g){ return GEAR_RATIO[g] ?? 0; }

function calcRpmFromSpeed(gear, spd, thr){
  const ratio = gearToRatio(gear);

  if (gear === "N") {
    const free = IDLE_RPM + thr * (REDLINE_RPM - IDLE_RPM) * 0.85;
    return clamp(free, IDLE_RPM, REDLINE_RPM);
  }

  const linked = IDLE_RPM + spd * ratio * 85;
  return clamp(linked, IDLE_RPM, REDLINE_RPM);
}

function updateTachUI(){
  const rpm01 = clamp(rpm / REDLINE_RPM, 0, 1);
  const needleDeg = (-120 + rpm01 * 240).toFixed(2) + "deg";

  if (tach) {
    tach.style.setProperty("--rpm", rpm01.toFixed(4));
    tach.style.setProperty("--needle", needleDeg);
  }
  if (rpmText) rpmText.textContent = Math.round(rpm).toString();
  if (speedText) speedText.textContent = Math.max(0, Math.round(speed)).toString();
}

// -------------------------------
// Audio (engine + shift + pops)
// -------------------------------
let audioCtx = null;
let engineOn = false;

let engineGain, engineFilter, engineOsc1, engineOsc2, engineLfo, lfoGain;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function startEngineAudio(){
  if (engineOn || muted) return;
  ensureAudio();
  const now = audioCtx.currentTime;

  engineGain = audioCtx.createGain();
  engineGain.gain.setValueAtTime(0.0001, now);

  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.setValueAtTime(700, now);
  engineFilter.Q.setValueAtTime(0.9, now);

  engineOsc1 = audioCtx.createOscillator();
  engineOsc2 = audioCtx.createOscillator();
  engineOsc1.type = "sawtooth";
  engineOsc2.type = "square";

  engineLfo = audioCtx.createOscillator();
  engineLfo.type = "sine";
  engineLfo.frequency.setValueAtTime(9, now);

  lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(7, now);

  engineLfo.connect(lfoGain);
  lfoGain.connect(engineOsc1.frequency);
  lfoGain.connect(engineOsc2.frequency);

  engineOsc1.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audioCtx.destination);

  engineGain.gain.exponentialRampToValueAtTime(0.09, now + 0.08);

  engineOsc1.start();
  engineOsc2.start();
  engineLfo.start();
  engineOn = true;
}

function stopEngineAudio(){
  if (!engineOn) return;
  const now = audioCtx.currentTime;

  try{
    engineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    setTimeout(() => {
      try{ engineOsc1.stop(); }catch{}
      try{ engineOsc2.stop(); }catch{}
      try{ engineLfo.stop(); }catch{}
      engineOn = false;
    }, 120);
  }catch{
    engineOn = false;
  }
}

function setEnginePitchFromRpm(){
  if (!engineOn || muted) return;

  const base = (rpm / 60) * 2;
  const now = audioCtx.currentTime;

  const f1 = clamp(base, 20, 290);
  const f2 = clamp(base * 0.55, 20, 240);

  engineOsc1.frequency.setTargetAtTime(f1, now, 0.03);
  engineOsc2.frequency.setTargetAtTime(f2, now, 0.03);

  const cutoff = clamp(500 + (rpm / REDLINE_RPM) * 2600 + throttle * 1000, 500, 4200);
  engineFilter.frequency.setTargetAtTime(cutoff, now, 0.04);

  const vol = clamp(0.055 + throttle * 0.07, 0.03, 0.16);
  engineGain.gain.setTargetAtTime(vol, now, 0.05);
}

function playShiftSfx(intensity = 1) {
  if (muted) return;
  ensureAudio();
  const now = audioCtx.currentTime;

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22 * intensity, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  master.connect(audioCtx.destination);

  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;

  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1700, now);
  bp.Q.setValueAtTime(10, now);

  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(0.8, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  noise.connect(bp); bp.connect(ng); ng.connect(master);
  noise.start(now); noise.stop(now + 0.06);

  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(210, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

  const og = audioCtx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.15 * intensity, now + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(og); og.connect(master);
  osc.start(now); osc.stop(now + 0.1);
}

function playPop(intensity = 1) {
  if (muted) return;
  ensureAudio();
  const now = audioCtx.currentTime;

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.18 * intensity, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  g.connect(audioCtx.destination);

  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.08, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.random() * 2 - 1) * (1 - t);
  }
  const n = audioCtx.createBufferSource();
  n.buffer = buf;

  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(900, now);

  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2200, now);
  bp.Q.setValueAtTime(2.2, now);

  n.connect(hp); hp.connect(bp); bp.connect(g);
  n.start(now);
  n.stop(now + 0.09);
}

// -------------------------------
// Limiter + Neutral pataka
// -------------------------------
let limiterPhase = 0;
let popCooldown = 0;

function applyLimiter(dt) {
  const onLimiter = throttle > 0.65 && rpm >= LIMITER_START && currentGear !== "N";
  if (!onLimiter) { limiterPhase = 0; return 0; }

  limiterPhase += dt * LIMITER_FREQ;
  if (limiterPhase >= 1) limiterPhase -= 1;

  const cut = (limiterPhase < 0.45) ? 1 : 0;

  popCooldown = Math.max(0, popCooldown - dt);
  if (cut === 1 && popCooldown === 0) {
    playPop(0.9 + Math.random() * 0.35);
    popCooldown = 0.12 + Math.random() * 0.10;
  }
  return cut;
}

let neutralPopTimer = 0;
let neutralReleaseBurst = 0;
let neutralReleaseDelay = 0;

function startNeutralPatakaBurst() {
  if (currentGear !== "N") return;
  if (rpm < 5200) return;
  neutralReleaseDelay = 0.05;
  neutralReleaseBurst = 10 + Math.floor(Math.random() * 10);
}

// -------------------------------
// Gear update
// -------------------------------
function updateGear(playSound) {
  const next = gearFrom(lane, row);
  if (next === currentGear) return;

  currentGear = next;
  gearText.textContent = currentGear;
  if (tachGear) tachGear.textContent = currentGear;

  pulseFX();
  if (playSound) playShiftSfx(currentGear === "R" ? 1.2 : currentGear === "N" ? 0.7 : 1);

  rpm = Math.max(IDLE_RPM, rpm * 0.70);
}

// -------------------------------
// Movement
// -------------------------------
function moveLeft()  { if (lane === "right") lane = "mid"; else if (lane === "mid") lane = "left"; }
function moveRight() { if (lane === "left") lane = "mid"; else if (lane === "mid") lane = "right"; }
function moveUp()    { if (row === "bot") row = "center"; else if (row === "center") row = "top"; }
function moveDown()  { if (row === "top") row = "center"; else if (row === "center") row = "bot"; }

// -------------------------------
// Controls
// -------------------------------
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if (k === "enter") {
    ensureAudio();
    if (!muted) { startEngineAudio(); playShiftSfx(0.6); }
    return;
  }

  if (k === "w") {
    e.preventDefault();
    accelerating = true;
    throttleTarget = 1;
    if (!muted) startEngineAudio();
    return;
  }

  if (k === "s") {
    e.preventDefault();
    braking = true;
    return;
  }

  if (!["arrowleft","arrowright","arrowup","arrowdown"].includes(k)) return;
  e.preventDefault();

  const before = currentGear;

  if (k === "arrowleft") moveLeft();
  if (k === "arrowright") moveRight();
  if (k === "arrowup") moveUp();
  if (k === "arrowdown") moveDown();

  setKnob();
  updateGear(before !== gearFrom(lane, row));
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();

  if (k === "w") {
    accelerating = false;
    throttleTarget = 0;
    startNeutralPatakaBurst();
  }

  if (k === "s") {
    braking = false;
  }
});

muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.textContent = `Sound: ${muted ? "OFF" : "ON"}`;
  if (muted) stopEngineAudio();
  else { ensureAudio(); startEngineAudio(); playShiftSfx(0.6); }
});

// -------------------------------
// Main loop
// -------------------------------
let last = performance.now();
function loop(t){
  const dt = Math.min(0.04, (t - last) / 1000);
  last = t;

  // Smooth throttle
  throttle += (throttleTarget - throttle) * 0.16;

  // Brake overrides throttle feel (still lets you rev a bit in N)
  const throttleWhileBraking = (currentGear === "N") ? throttle : throttle * (braking ? 0.15 : 1);

  // Limiter
  const cut = applyLimiter(dt);
  const effThrottle = cut ? 0.02 : throttleWhileBraking;

  // Speed update
  const gear = currentGear;
  const ratio = gearToRatio(gear);
  const cap = GEAR_MAX_SPEED[gear] ?? 999;

  if (gear === "N") {
    speed = Math.max(0, speed - (DRAG * speed + 0.7) * dt);
  } else {
    // strong accel even in high gears
    const accel = effThrottle * ACCEL_BASE * (0.65 + (ratio / 3.2));
    speed += accel * dt;
    if (speed > cap) speed = cap;

    const naturalDecel = (DRAG * speed) + (ENGINE_BRAKE * (1 - effThrottle) * speed);
    speed = Math.max(0, speed - naturalDecel * dt);
  }

  // BRAKES apply everywhere (including N)
  if (braking) {
    speed = Math.max(0, speed - BRAKE_FORCE * dt);

    // drop rpm a bit (feel)
    rpm = Math.max(IDLE_RPM, rpm - 5200 * dt);
  }

  // RPM target and smoothing
  const targetRpm = calcRpmFromSpeed(gear, speed, effThrottle);
  rpm += (targetRpm - rpm) * RPM_SMOOTH;

  if (gear !== "N" && speed >= cap - 0.2 && throttle > 0.6) {
    rpm += (REDLINE_RPM - rpm) * 0.06;
  }

  rpm = clamp(rpm, IDLE_RPM, REDLINE_RPM);

  // Neutral pataka crackles + burst
  neutralPopTimer = Math.max(0, neutralPopTimer - dt);
  const highRevNeutral = (currentGear === "N") && (throttle > 0.35) && (rpm > 4800);

  if (highRevNeutral && neutralPopTimer === 0) {
    const intensity = 0.35 + (rpm / REDLINE_RPM) * 0.75;
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      setTimeout(() => playPop(intensity), i * (35 + Math.random() * 35));
    }
    neutralPopTimer = 0.12 + Math.random() * 0.14;
  }

  if (neutralReleaseDelay > 0) {
    neutralReleaseDelay = Math.max(0, neutralReleaseDelay - dt);
  } else if (neutralReleaseBurst > 0) {
    const intensity = 0.55 + (rpm / REDLINE_RPM) * 0.55;
    playPop(intensity);
    neutralReleaseBurst--;
    neutralReleaseDelay = 0.045 + Math.random() * 0.04;
  }

  // Gear indicator redline + flash
  if (tachGear) {
    if (rpm >= LIMITER_START) {
      tachGear.classList.add("redline");
      if (cut) tachGear.classList.add("flash");
      else tachGear.classList.remove("flash");
    } else {
      tachGear.classList.remove("redline");
      tachGear.classList.remove("flash");
    }
  }

  // BRAKE indicator show/hide
  const brakeOn = braking && speed > 0.5;
  if (brakeText) brakeText.classList.toggle("on", brakeOn);
  if (hudBrake) hudBrake.classList.toggle("on", brakeOn);

  // UI
  updateTachUI();

  // Audio
  if (!muted) {
    if (accelerating) startEngineAudio();
    setEnginePitchFromRpm();

    if (engineOn && engineGain) {
      const now = audioCtx.currentTime;
      const baseVol = clamp(0.055 + throttle * 0.07, 0.03, 0.16);
      const limiterVol = cut ? 0.02 : baseVol;
      engineGain.gain.setTargetAtTime(limiterVol, now, 0.02);
    }
  }

  requestAnimationFrame(loop);
}

// init
setKnob();
updateTachUI();
if (tachGear) tachGear.textContent = currentGear;
requestAnimationFrame(loop);