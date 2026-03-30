const $ = (id) => document.getElementById(id);

const elements = {
  stage: $("stage"),
  orbitA: $("orbitA"),
  orbitB: $("orbitB"),
  armA: $("armA"),
  armB: $("armB"),
  dotA: $("dotA"),
  dotB: $("dotB"),
  durationSlider: $("durationSlider"),
  daysSlider: $("daysSlider"),
  easingSlider: $("easingSlider"),
  amplitudeSlider: $("amplitudeSlider"),
  beepLowSlider: $("beepLowSlider"),
  beepHighSlider: $("beepHighSlider"),
  orbitADaysSlider: $("orbitADaysSlider"),
  orbitBDaysSlider: $("orbitBDaysSlider"),
  orbitADirectionToggle: $("orbitADirectionToggle"),
  orbitBDirectionToggle: $("orbitBDirectionToggle"),
  playPauseBtn: $("playPauseBtn"),
  resetBtn: $("resetBtn"),
  beepToggle: $("beepToggle"),
  continuousToneToggle: $("continuousToneToggle"),
  angleTableBody: $("angleTableBody"),
  durationValue: $("durationValue"),
  daysValue: $("daysValue"),
  easingValue: $("easingValue"),
  amplitudeValue: $("amplitudeValue"),
  beepLowValue: $("beepLowValue"),
  beepHighValue: $("beepHighValue"),
  orbitADaysValue: $("orbitADaysValue"),
  orbitBDaysValue: $("orbitBDaysValue"),
  orbitADirectionValue: $("orbitADirectionValue"),
  orbitBDirectionValue: $("orbitBDirectionValue"),
  angleAReadout: $("angleAReadout"),
  angleBReadout: $("angleBReadout"),
  realReadout: $("realReadout"),
  elapsedDaysLabel: $("elapsedDaysLabel"),
  totalDaysLabel: $("totalDaysLabel"),
  timelineFill: $("timelineFill"),
  timelineMarker: $("timelineMarker"),
  beepValue: $("beepValue"),
  stage: $("stage"),
  lastAlignmentValue: $("lastAlignmentValue"),
  nextAlignmentValue: $("nextAlignmentValue"),
};

const DEFAULTS = {
  realDuration: 56,
  simulatedDays: 52.5,
  easing: 0,
  amplitude: 30,
  beepLowFreq: 440,
  beepHighFreq: 2200,
  orbitADays: 32.5,
  orbitBDays: 97,
  orbitADirection: 1,
  orbitBDirection: 1,
  beepEnabled: true,
  continuousTone: true,
};

const state = {
  ...DEFAULTS,
  elapsedMs: 0,
  lastTs: 0,
  running: true,
  lastBeepDay: -1,
  lastAlignmentDay: null,
  nextAlignmentDay: null,
  lastAlignmentIndex: -1,
  alignmentFlashLock: false,
};

const audio = {
  ctx: null,
  toneOsc: null,
  toneGain: null,
  baseGain: 0.015,
  accentFactor: 1.05,
  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  },
  async resumeIfNeeded() {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  },
  playBeep(frequency) {
    if (!state.beepEnabled || state.continuousTone) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  },
  startContinuousTone(frequency) {
    if (!state.beepEnabled || !state.continuousTone) return;
    const ctx = this.ensureContext();
    if (!this.toneOsc) {
      this.toneOsc = ctx.createOscillator();
      this.toneGain = ctx.createGain();
      this.toneOsc.type = "sine";
      this.toneGain.gain.value = this.baseGain;
      this.toneOsc.connect(this.toneGain);
      this.toneGain.connect(ctx.destination);
      this.toneOsc.start();
    }
    this.toneOsc.frequency.setTargetAtTime(frequency, ctx.currentTime, 0.03);
    this.toneGain.gain.setTargetAtTime(this.baseGain, ctx.currentTime, 0.03);
  },
  stopContinuousTone() {
    if (this.toneGain && this.ctx) {
      this.toneGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
    }
  },
  accentContinuousTone() {
    if (!state.beepEnabled || !state.continuousTone || !this.toneGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const base = this.baseGain;
    this.toneGain.gain.cancelScheduledValues(now);
    this.toneGain.gain.setValueAtTime(base, now);
    this.toneGain.gain.linearRampToValueAtTime(base * this.accentFactor, now + 0.02);
    this.toneGain.gain.linearRampToValueAtTime(base, now + 0.15);
  },
  playAlignmentBeep() {
    if (!state.beepEnabled) return;

    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(1320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  },
};

const simulation = {
  shapedOscillation(t) {
    const s = Math.sin(t);
    const shaped = Math.sign(s) * Math.pow(Math.abs(s), 1 + state.easing * 2.6);
    return s * (1 - state.easing) + shaped * state.easing;
  },
  formatRealTime(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec.toFixed(1)}s`;
  },
  getBaseAtProgress(progressFraction) {
    return this.shapedOscillation(progressFraction * Math.PI * 2);
  },
  getAngles(progress) {
    const base = this.shapedOscillation(progress * Math.PI * 2);
    return {
      angleA: base * state.amplitude,
      angleB: -base * state.amplitude,
      base,
    };
  },
  getBeepFrequencyAtAngle(angle) {
    const normalized = 1 - Math.min(Math.abs(angle) / state.amplitude, 1);
    return state.beepLowFreq * Math.pow(state.beepHighFreq / state.beepLowFreq, normalized);
  },
  dayCrossesCenter(dayStartFraction, dayEndFraction) {
    const samples = 72;
    let prev = this.getBaseAtProgress(dayStartFraction);
    for (let i = 1; i <= samples; i++) {
      const f = dayStartFraction + (dayEndFraction - dayStartFraction) * (i / samples);
      const current = this.getBaseAtProgress(f);
      if ((prev <= 0 && current >= 0) || (prev >= 0 && current <= 0)) return true;
      prev = current;
    }
    return false;
  },
  normalizeAngle(rad) {
    let a = rad % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a;
  },

  getOrbitAngles(elapsedDays) {
    const angleA = (elapsedDays / state.orbitADays) * Math.PI * 2 * state.orbitADirection;
    const angleB = (elapsedDays / state.orbitBDays) * Math.PI * 2 * state.orbitBDirection;

    return {
      angleA: this.normalizeAngle(angleA),
      angleB: this.normalizeAngle(angleB),
    };
  },

  getAlignmentDelta(elapsedDays) {
    const { angleA, angleB } = this.getOrbitAngles(elapsedDays);
    let diff = Math.abs(angleA - angleB);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff;
  },

  formatDayTime(dayFloat) {
    const day = Math.floor(dayFloat);
    const hourFloat = (dayFloat - day) * 24;
    const hour = Math.floor(hourFloat);
    const minute = Math.floor((hourFloat - hour) * 60);

    return `Dag ${day}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  },

  findNextAlignment(fromDay) {
    const maxSearchDays = Math.max(state.orbitADays, state.orbitBDays) * 4;
    const step = 1 / 24; // 1 time
    const threshold = 0.01;

    const startDay = Math.floor(fromDay) + 1;
    let prevDelta = this.getAlignmentDelta(startDay);

    for (let d = startDay + step; d <= startDay + maxSearchDays; d += step) {
      const currentDelta = this.getAlignmentDelta(d);

      if (currentDelta < threshold || (currentDelta > prevDelta && prevDelta < threshold * 2)) {
        return d - step;
      }

      prevDelta = currentDelta;
    }

    return null;
  },
};

const ui = {
  syncControlsToState() {
    elements.durationSlider.value = String(state.realDuration);
    elements.daysSlider.value = String(state.simulatedDays);
    elements.easingSlider.value = String(state.easing);
    elements.amplitudeSlider.value = String(state.amplitude);
    elements.beepLowSlider.value = String(state.beepLowFreq);
    elements.beepHighSlider.value = String(state.beepHighFreq);
    elements.orbitADaysSlider.value = String(state.orbitADays);
    elements.orbitBDaysSlider.value = String(state.orbitBDays);
    elements.orbitADirectionToggle.checked = state.orbitADirection === -1;
    elements.orbitBDirectionToggle.checked = state.orbitBDirection === -1;
    elements.beepToggle.checked = state.beepEnabled;
    elements.continuousToneToggle.checked = state.continuousTone;
  },
  updateLabels() {
    elements.durationValue.textContent = `${state.realDuration.toFixed(1)} s`;
    elements.daysValue.textContent = `${state.simulatedDays.toFixed(1)} dage`;
    elements.easingValue.textContent = state.easing.toFixed(2);
    elements.amplitudeValue.textContent = `${state.amplitude.toFixed(0)}°`;
    elements.beepLowValue.textContent = `${state.beepLowFreq.toFixed(0)} Hz`;
    elements.beepHighValue.textContent = `${state.beepHighFreq.toFixed(0)} Hz`;
    elements.orbitADaysValue.textContent = `${state.orbitADays.toFixed(1)} dage`;
    elements.orbitBDaysValue.textContent = `${state.orbitBDays.toFixed(1)} dage`;
    elements.orbitADirectionValue.textContent = state.orbitADirection === 1 ? "Med uret" : "Mod uret";
    elements.orbitBDirectionValue.textContent = state.orbitBDirection === 1 ? "Med uret" : "Mod uret";
    elements.totalDaysLabel.textContent = `${state.simulatedDays.toFixed(1)} dage pr. svingperiode`;
    elements.beepValue.textContent = !state.beepEnabled ? "Fra" : state.continuousTone ? "Kontinuerlig" : "Enkelte bip";
    elements.playPauseBtn.textContent = state.running ? "Pause" : "Afspil";
    elements.lastAlignmentValue.textContent = state.lastAlignmentDay === null ? "Ingen endnu" : simulation.formatDayTime(state.lastAlignmentDay);

    elements.nextAlignmentValue.textContent = state.nextAlignmentDay === null ? "Ikke fundet" : simulation.formatDayTime(state.nextAlignmentDay);
  },
  updateOrbitDots(elapsedDays) {
    const angleA = (elapsedDays / state.orbitADays) * Math.PI * 2 * state.orbitADirection;
    const angleB = (elapsedDays / state.orbitBDays) * Math.PI * 2 * state.orbitBDirection;
    const radiusA = elements.orbitA.offsetWidth / 2;
    const radiusB = elements.orbitB.offsetWidth / 2;
    const ax = Math.cos(angleA - Math.PI / 2) * radiusA;
    const ay = Math.sin(angleA - Math.PI / 2) * radiusA;
    const bx = Math.cos(angleB - Math.PI / 2) * radiusB;
    const by = Math.sin(angleB - Math.PI / 2) * radiusB;
    elements.dotA.style.transform = `translate(calc(-50% + ${ax}px), calc(-50% + ${ay}px))`;
    elements.dotB.style.transform = `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))`;
  },
  updateAngleTable() {
    const totalWholeDays = Math.floor(state.simulatedDays);
    const rows = [];
    for (let day = 0; day <= totalWholeDays; day++) {
      const startFraction = day / state.simulatedDays;
      const clampedStartFraction = Math.min(startFraction, 1);
      const base = simulation.getBaseAtProgress(clampedStartFraction);
      const angleA = base * state.amplitude;
      const angleB = -base * state.amplitude;
      const nextFraction = Math.min((day + 1) / state.simulatedDays, 1);
      const crossing = day < state.simulatedDays && simulation.dayCrossesCenter(clampedStartFraction, nextFraction);
      const beepFreq = simulation.getBeepFrequencyAtAngle(angleA);
      rows.push(`
        <tr class="${crossing ? "crossing" : ""}">
          <td>Dag ${day}</td>
          <td>${(clampedStartFraction * 100).toFixed(2)}%</td>
          <td>${angleA.toFixed(2)}°</td>
          <td>${angleB.toFixed(2)}°</td>
          <td class="${crossing ? "crossing-yes" : "crossing-no"}">${crossing ? "Ja" : "Nej"}</td>
          <td>${beepFreq.toFixed(1)} Hz</td>
        </tr>
      `);
    }
    elements.angleTableBody.innerHTML = rows.join("");
  },
  render() {
    const progress = state.elapsedMs / 1000 / state.realDuration;
    const simulatedElapsedDays = progress * state.simulatedDays;
    const alignmentDelta = simulation.getAlignmentDelta(simulatedElapsedDays);
    const alignmentThreshold = 0.01;
    const alignmentIndex = Math.floor(simulatedElapsedDays * 24); // time buckets
    const { angleA, angleB } = simulation.getAngles(progress);

    elements.armA.style.transform = `translate(-50%, -50%) rotate(${angleA}deg)`;
    elements.armB.style.transform = `translate(-50%, -50%) rotate(${angleB}deg)`;
    elements.armA.style.left = "50%";
    elements.armA.style.top = "50%";
    elements.armB.style.left = "50%";
    elements.armB.style.top = "50%";

    const cycleProgress = state.simulatedDays > 0 ? (simulatedElapsedDays % state.simulatedDays) / state.simulatedDays : 0;
    const pct = cycleProgress * 100;

    this.updateOrbitDots(simulatedElapsedDays);
    elements.angleAReadout.textContent = `${angleA.toFixed(2)}°`;
    elements.angleBReadout.textContent = `${angleB.toFixed(2)}°`;
    elements.realReadout.textContent = simulation.formatRealTime(state.elapsedMs / 1000);
    elements.elapsedDaysLabel.textContent = `${simulatedElapsedDays.toFixed(2)} dage gået`;
    elements.timelineFill.style.width = `${pct}%`;
    elements.timelineMarker.style.left = `${pct}%`;

    const currentFrequency = simulation.getBeepFrequencyAtAngle(angleA);
    if (state.beepEnabled && state.continuousTone && state.running) {
      audio.startContinuousTone(currentFrequency);
    } else {
      audio.stopContinuousTone();
    }

    const wholeDay = Math.floor(simulatedElapsedDays);
    if (state.running && state.beepEnabled && wholeDay !== state.lastBeepDay) {
      if (simulatedElapsedDays > 0) {
        if (state.continuousTone) {
          audio.accentContinuousTone();
        } else {
          audio.playBeep(currentFrequency);
        }
      }
      state.lastBeepDay = wholeDay;
    }
    if (alignmentDelta < alignmentThreshold && alignmentIndex !== state.lastAlignmentIndex) {
      state.lastAlignmentIndex = alignmentIndex;
      state.lastAlignmentDay = simulatedElapsedDays;
      state.nextAlignmentDay = simulation.findNextAlignment(simulatedElapsedDays + 1 / 24);

      audio.playAlignmentBeep();
      this.flashAlignment();
      this.updateLabels();
    }
  },
  updateOrbitSizes() {
    const stageRect = elements.stage.getBoundingClientRect();
    const base = Math.min(stageRect.width, stageRect.height);

    const orbitASize = Math.max(120, base * 0.62);
    const orbitBSize = Math.max(180, base * 0.89);

    elements.orbitA.style.setProperty("--orbit-a-size", `${orbitASize}px`);
    elements.orbitB.style.setProperty("--orbit-b-size", `${orbitBSize}px`);
  },
  flashAlignment() {
    if (!elements.stage) return;

    elements.stage.classList.remove("flash");
    void elements.stage.offsetWidth;
    elements.stage.classList.add("flash");
  },
};

const controller = {
  tick(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const delta = ts - state.lastTs;
    state.lastTs = ts;
    if (state.running) {
      state.elapsedMs += delta;
    }
    ui.render();
    requestAnimationFrame((nextTs) => this.tick(nextTs));
  },
  bindEvents() {
    elements.durationSlider.addEventListener("input", () => {
      state.realDuration = parseFloat(elements.durationSlider.value);
      ui.updateLabels();
    });

    elements.daysSlider.addEventListener("input", () => {
      state.simulatedDays = parseFloat(elements.daysSlider.value);
      ui.updateLabels();
      ui.updateAngleTable();
      ui.render();
      this.refreshAlignmentPredictions();
    });

    elements.easingSlider.addEventListener("input", () => {
      state.easing = parseFloat(elements.easingSlider.value);
      ui.updateLabels();
      ui.updateAngleTable();
      ui.render();
    });

    elements.amplitudeSlider.addEventListener("input", () => {
      state.amplitude = parseFloat(elements.amplitudeSlider.value);
      ui.updateLabels();
      ui.updateAngleTable();
      ui.render();
    });

    elements.beepLowSlider.addEventListener("input", () => {
      state.beepLowFreq = parseFloat(elements.beepLowSlider.value);
      if (state.beepHighFreq < state.beepLowFreq) {
        state.beepHighFreq = state.beepLowFreq;
        elements.beepHighSlider.value = String(state.beepHighFreq);
      }
      ui.updateLabels();
      ui.updateAngleTable();
    });

    elements.beepHighSlider.addEventListener("input", () => {
      state.beepHighFreq = parseFloat(elements.beepHighSlider.value);
      if (state.beepHighFreq < state.beepLowFreq) {
        state.beepLowFreq = state.beepHighFreq;
        elements.beepLowSlider.value = String(state.beepLowFreq);
      }
      ui.updateLabels();
      ui.updateAngleTable();
    });

    elements.orbitADaysSlider.addEventListener("input", () => {
      state.orbitADays = parseFloat(elements.orbitADaysSlider.value);
      ui.updateLabels();
      ui.render();
      this.refreshAlignmentPredictions();
    });

    elements.orbitBDaysSlider.addEventListener("input", () => {
      state.orbitBDays = parseFloat(elements.orbitBDaysSlider.value);
      ui.updateLabels();
      ui.render();
      this.refreshAlignmentPredictions();
    });

    elements.orbitADirectionToggle.addEventListener("change", () => {
      state.orbitADirection = elements.orbitADirectionToggle.checked ? -1 : 1;
      ui.updateLabels();
      ui.render();
      this.refreshAlignmentPredictions();
    });

    elements.orbitBDirectionToggle.addEventListener("change", () => {
      state.orbitBDirection = elements.orbitBDirectionToggle.checked ? -1 : 1;
      ui.updateLabels();
      ui.render();
      this.refreshAlignmentPredictions();
    });

    elements.playPauseBtn.addEventListener("click", () => {
      state.running = !state.running;
      if (!state.running) {
        audio.stopContinuousTone();
      }
      ui.updateLabels();
      ui.render();
    });

    elements.resetBtn.addEventListener("click", () => {
      state.elapsedMs = 0;
      state.lastBeepDay = -1;
      audio.stopContinuousTone();
      ui.render();
    });

    elements.beepToggle.addEventListener("change", async () => {
      state.beepEnabled = elements.beepToggle.checked;
      await audio.resumeIfNeeded();
      if (!state.beepEnabled) {
        audio.stopContinuousTone();
      }
      ui.updateLabels();
      ui.render();
    });

    elements.continuousToneToggle.addEventListener("change", async () => {
      state.continuousTone = elements.continuousToneToggle.checked;
      await audio.resumeIfNeeded();
      if (!state.continuousTone) {
        audio.stopContinuousTone();
      }
      ui.updateLabels();
      ui.render();
    });
  },
  init() {
    ui.syncControlsToState();
    ui.updateLabels();
    this.refreshAlignmentPredictions();
    ui.updateOrbitSizes();
    ui.updateAngleTable();
    ui.render();
    this.bindEvents();
    window.addEventListener("resize", () => {
      ui.updateOrbitSizes();
      ui.render();
    });
    requestAnimationFrame((ts) => this.tick(ts));
  },
  refreshAlignmentPredictions() {
    const currentDay = (state.elapsedMs / 1000 / state.realDuration) * state.simulatedDays;
    state.nextAlignmentDay = simulation.findNextAlignment(currentDay);
    ui.updateLabels();
  },
};

controller.init();
