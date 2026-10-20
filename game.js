(() => {
  "use strict";

  const BPM = 120;
  const BEAT = 60 / BPM;

  const DIFF = {
    easy: {
      label: "쉬움",
      time: 99,
      goal: 4000,
      pots: 1,
      spares: 3,
      burnSec: 16,
      goldStart: 38,
      goldEnd: 78,
      travel: 2.05,
      interval: BEAT * 2,
      perfect: 0.11,
      great: 0.18,
      good: 0.28,
      notes: ["Space", "Enter", "Space", "Enter"]
    },
    normal: {
      label: "보통",
      time: 90,
      goal: 10000,
      pots: 2,
      spares: 2,
      burnSec: 10,
      goldStart: 48,
      goldEnd: 74,
      travel: 1.85,
      interval: BEAT,
      perfect: 0.07,
      great: 0.12,
      good: 0.2,
      notes: ["Space", "Enter", "Space", "Enter", "Enter", "Space"]
    },
    hard: {
      label: "어려움",
      time: 75,
      goal: 12000,
      pots: 3,
      spares: 1,
      burnSec: 6.4,
      goldStart: 54,
      goldEnd: 70,
      travel: 1.55,
      interval: BEAT,
      perfect: 0.055,
      great: 0.095,
      good: 0.15,
      notes: ["Space", "Enter", "Space", "Space", "Enter", "Enter", "Space", "Enter"]
    }
  };

  const LINES = {
    perfect: ["치즈가 쭉—! 최고야!", "이 블링은 반칙이야!", "공주님 라면, 앵콜!"],
    great: ["녹진하고 좋아~", "치즈가 반짝인다!"],
    ok: ["맛은 있는데 리듬이 조금 흔들려", "타이밍이 아슬아슬했어"],
    salty: ["윽, 너무 짜!", "치즈가 졸아버렸어..."],
    early: ["치즈가 아직 안 녹았잖아!", "토핑이 빨리 들어갔어!"],
    plain: ["토핑이 허전해...", "라면이 너무 심플한걸?"],
    joke: ["지금 장난해?", "필수 재료가 빠졌어!"],
    burnt: ["탄 걸 어떡해 먹어!", "이건 티아라로도 못 가려!"]
  };

  const MOUTHS = {
    idle: "M70 98 Q80 106 90 98",
    love: "M68 94 Q80 112 92 94",
    sad: "M70 104 Q80 96 90 104",
    wow: "M74 94 Q80 110 86 94"
  };

  const FACES = {
    perfect: "love",
    great: "love",
    ok: "idle",
    salty: "sad",
    early: "sad",
    plain: "sad",
    joke: "sad",
    burnt: "wow"
  };

  const state = {
    screen: "title",
    mode: "title",
    diffKey: "normal",
    diff: DIFF.normal,
    practice: false,
    practiceWon: false,
    time: 0,
    money: 0,
    combo: 0,
    maxCombo: 0,
    bowls: 0,
    spares: 0,
    pots: [],
    selectedIngredient: null,
    selectedPot: null,
    notes: [],
    rhythmPot: null,
    finishTimer: 0,
    lastWarn: null,
    bubbleT: 0.8,
    countdownTimer: 0
  };

  const pointer = {
    active: false,
    kind: null,
    ingredient: null,
    potId: null,
    x: 0,
    y: 0,
    lx: 0,
    ly: 0,
    moved: false,
    lastSpark: 0
  };

  const $ = (id) => document.getElementById(id);
  const speech = $("speech");
  const hint = $("hint");
  const hand = $("hand");
  const ghost = $("ghost");
  const notesEl = $("notes");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let sayTimer = 0;

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function won(n) {
    return n.toLocaleString("ko-KR");
  }

  const audio = {
    ctx: null,
    master: null,
    music: null,
    sfx: null,
    noise: null,
    muted: false,
    started: false,
    origin: 0,
    next: 0,
    step: 0,
    timer: 0,
    unlock() {
      try {
        if (!this.ctx) this.build();
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch (err) {
        console.warn(err);
      }
    },
    build() {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.005;
      comp.release.value = 0.18;
      comp.connect(master);
      master.connect(ctx.destination);
      this.master = master;
      this.music = ctx.createGain();
      this.music.gain.value = 0.42;
      this.music.connect(comp);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(comp);
      const len = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    },
    now() {
      return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    },
    start() {
      this.unlock();
      if (!this.ctx || this.started) return;
      this.started = true;
      this.step = 0;
      this.next = this.ctx.currentTime + 0.06;
      this.origin = this.next;
      this.pump();
    },
    pump() {
      if (!this.started) return;
      const ctx = this.ctx;
      if (this.next < ctx.currentTime - 0.02) this.next = ctx.currentTime + 0.05;
      const horizon = ctx.currentTime + 0.22;
      const sp = BEAT / 4;
      while (this.next < horizon) {
        this.playStep(this.step, this.next);
        this.step++;
        this.next += sp;
      }
      this.timer = setTimeout(() => this.pump(), 70);
    },
    playStep(step, time) {
      const sixteenth = step % 16;
      const bar = Math.floor(step / 16) % 4;
      if (sixteenth === 0 || sixteenth === 8) this.kick(time);
      if (sixteenth === 4 || sixteenth === 12) this.snare(time);
      if (sixteenth % 2 === 0) this.hat(time, sixteenth === 14);
      const roots = [87.31, 130.81, 146.83, 116.54];
      const root = roots[bar];
      if (sixteenth === 0 || sixteenth === 6 || sixteenth === 8 || sixteenth === 14) {
        const fifth = sixteenth === 6 || sixteenth === 14;
        this.tone(time, fifth ? root * 1.5 : root, 0.16, "sine", 0.11, this.music);
      }
      if (sixteenth % 2 === 0) {
        const melody = [
          698.46, 880, 1046.5, 880, 783.99, 698.46, 659.25, 783.99,
          880, 1046.5, 1174.66, 1046.5, 932.33, 880, 783.99, 698.46,
          1046.5, 880, 783.99, 880, 698.46, 783.99, 880, 1046.5,
          783.99, 698.46, 659.25, 783.99, 880, 783.99, 698.46, 523.25
        ];
        const idx = (Math.floor(step / 2) % melody.length);
        this.tone(time, melody[idx], 0.18, "triangle", 0.055, this.music);
        if (bar === 1 || bar === 3) {
          this.tone(time, melody[idx] * 2, 0.08, "sine", 0.02, this.music);
        }
      }
      if (sixteenth === 0) {
        const chord = [
          [349.23, 440, 523.25],
          [261.63, 329.63, 392],
          [293.66, 349.23, 440],
          [233.08, 293.66, 349.23]
        ][bar];
        chord.forEach((f) => this.tone(time, f, 0.42, "sine", 0.02, this.music));
      }
    },
    tone(time, freq, dur, type, gain, dest) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      o.connect(g);
      g.connect(dest);
      o.start(time);
      o.stop(time + dur + 0.03);
    },
    kick(time) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(170, time);
      o.frequency.exponentialRampToValueAtTime(48, time + 0.12);
      g.gain.setValueAtTime(0.34, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      o.connect(g);
      g.connect(this.music);
      o.start(time);
      o.stop(time + 0.2);
    },
    snare(time) {
      this.tone(time, 210, 0.1, "triangle", 0.05, this.music);
      this.burst(time, 1800, 0.09, 0.06);
    },
    hat(time, open) {
      this.burst(time, 7000, open ? 0.1 : 0.035, open ? 0.045 : 0.03);
    },
    burst(time, freq, dur, gain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.music);
      src.start(time);
      src.stop(time + dur + 0.02);
    },
    sfxBurst(time, freq, dur, gain, type = "highpass") {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(freq, time);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.sfx);
      src.start(time);
      src.stop(time + dur + 0.02);
    },
    blip(freq = 660) {
      if (!this.ctx) return;
      this.tone(this.now(), freq, 0.12, "sine", 0.12, this.sfx);
    },
    pop() {
      if (!this.ctx) return;
      const t = this.now();
      this.tone(t, 520, 0.09, "sine", 0.12, this.sfx);
      this.tone(t + 0.04, 780, 0.08, "triangle", 0.06, this.sfx);
    },
    pour() {
      if (!this.ctx) return;
      const t = this.now();
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(1600, t + 0.32);
      filter.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.sfx);
      src.start(t);
      src.stop(t + 0.4);
    },
    bubble() {
      if (!this.ctx) return;
      this.tone(this.now(), 700 + Math.random() * 400, 0.07, "sine", 0.035, this.sfx);
    },
    no() {
      if (!this.ctx) return;
      const t = this.now();
      this.tone(t, 180, 0.1, "square", 0.04, this.sfx);
      this.tone(t + 0.09, 140, 0.12, "square", 0.04, this.sfx);
    },
    burn() {
      if (!this.ctx) return;
      const t = this.now();
      this.tone(t, 90, 0.28, "sawtooth", 0.04, this.sfx);
      this.sfxBurst(t, 300, 0.28, 0.08, "lowpass");
    },
    hit(grade) {
      if (!this.ctx) return;
      const t = this.now();
      if (grade === "perfect") {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(t + i * 0.045, f, 0.12, "triangle", 0.08, this.sfx));
      } else if (grade === "great") {
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(t + i * 0.04, f, 0.1, "sine", 0.07, this.sfx));
      } else {
        this.tone(t, 620, 0.08, "sine", 0.06, this.sfx);
      }
    },
    miss() {
      if (!this.ctx) return;
      this.tone(this.now(), 150, 0.14, "square", 0.04, this.sfx);
    },
    coin(pay) {
      if (!this.ctx) return;
      const t = this.now();
      const n = pay >= 950 ? 4 : pay >= 700 ? 3 : 2;
      for (let i = 0; i < n; i++) this.tone(t + i * 0.07, 880 + i * 180, 0.1, "sine", 0.07, this.sfx);
    },
    tick() {
      if (!this.ctx) return;
      this.tone(this.now(), 990, 0.06, "square", 0.03, this.sfx);
    },
    sting(win) {
      if (!this.ctx) return;
      const t = this.now();
      this.music.gain.setTargetAtTime(win ? 0.22 : 0.12, t, 0.05);
      const notes = win
        ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5]
        : [392, 311.13, 293.66, 261.63];
      notes.forEach((f, i) => this.tone(t + i * 0.11, f, 0.2, win ? "triangle" : "sine", 0.1, this.sfx));
      setTimeout(() => {
        if (this.music) this.music.gain.setTargetAtTime(0.42, this.now(), 0.2);
      }, win ? 1100 : 800);
    },
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.85;
    }
  };

  const canvas = $("bg");
  const ctx = canvas.getContext("2d");
  let viewW = 1;
  let viewH = 1;
  let dpr = 1;
  const items = [];
  const sparks = [];

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    viewW = innerWidth;
    viewH = innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
  }

  function makeItem(type) {
    return {
      type,
      x: Math.random() * viewW,
      y: Math.random() * viewH,
      vx: (Math.random() - 0.5) * 26,
      vy: (Math.random() - 0.5) * 20,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      s: 0.75 + Math.random() * 0.7,
      pink: Math.random() > 0.45,
      phase: Math.random() * Math.PI * 2
    };
  }

  function initItems() {
    items.length = 0;
    for (let i = 0; i < 13; i++) items.push(makeItem("packet"));
    for (let i = 0; i < 11; i++) items.push(makeItem("noodle"));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function drawPacket(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.scale(it.s, it.s);
    roundRect(-26, -36, 52, 72, 8);
    ctx.fillStyle = it.pink ? "#ff8ec3" : "#ffe56b";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = it.pink ? "#ffe56b" : "#ff8ec3";
    ctx.fillRect(-26, -8, 52, 16);
    ctx.beginPath();
    ctx.moveTo(-8, -28);
    ctx.lineTo(0, -18);
    ctx.lineTo(8, -28);
    ctx.lineTo(4, -18);
    ctx.lineTo(10, -16);
    ctx.lineTo(0, -6);
    ctx.lineTo(-10, -16);
    ctx.lineTo(-4, -18);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = it.pink ? "#fff" : "#6b2d4a";
    ctx.font = '700 15px Jua, "Malgun Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("치즈", 0, -20);
    ctx.fillStyle = "#6b2d4a";
    ctx.fillText("스프", 0, 18);
    ctx.restore();
  }

  function drawNoodle(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.scale(it.s, it.s);
    roundRect(-36, -26, 72, 52, 10);
    ctx.fillStyle = "rgba(255, 250, 235, 0.95)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f0c14d";
    ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const y = -16 + i * 8;
      ctx.beginPath();
      ctx.moveTo(-28, y);
      ctx.bezierCurveTo(-8, y - 8, 4, y + 8, 28, y - 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#ff8ec3";
    ctx.fillRect(-16, -8, 32, 16);
    ctx.fillStyle = "#6b2d4a";
    ctx.font = '700 13px Jua, "Malgun Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("생면", 0, 0);
    ctx.restore();
  }

  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 150;
      sparks.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 30,
        life: 0.55 + Math.random() * 0.4,
        max: 0.9,
        color: colors[i % colors.length],
        size: 2 + Math.random() * 3.5
      });
    }
    if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
  }

  function updateBackdrop(dt, time) {
    const speed = reduceMotion ? 0.25 : 1;
    for (const it of items) {
      it.x += it.vx * dt * speed + Math.sin(time + it.phase) * 8 * dt;
      it.y += it.vy * dt * speed + Math.cos(time * 0.8 + it.phase) * 6 * dt;
      it.rot += it.vr * dt * speed;
      if (it.x < -90) it.x = viewW + 80;
      if (it.x > viewW + 90) it.x = -80;
      if (it.y < -90) it.y = viewH + 80;
      if (it.y > viewH + 90) it.y = -80;
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 90 * dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  }

  function drawBackdrop() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    for (const it of items) {
      if (it.type === "packet") drawPacket(it);
      else drawNoodle(it);
    }
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life / s.max);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem("cheeseRamenBest") || "{}");
    } catch {
      return {};
    }
  }

  function saveBest() {
    if (state.practice) return;
    const best = loadBest();
    best[state.diffKey] = Math.max(best[state.diffKey] || 0, state.money);
    localStorage.setItem("cheeseRamenBest", JSON.stringify(best));
    renderBest();
  }

  function renderBest() {
    const best = loadBest();
    const bits = ["easy", "normal", "hard"]
      .filter((k) => best[k])
      .map((k) => `${DIFF[k].label} ${won(best[k])}원`);
    $("best").textContent = bits.length ? `최고 기록  ${bits.join("  ·  ")}` : "아직 기록이 없어요. 첫 가게를 열어보자!";
  }

  function setMode(mode) {
    state.mode = mode;
    document.body.classList.toggle("rhythm-on", mode === "rhythm");
    document.body.classList.toggle("countdown-on", mode === "countdown");
    $("rhythm").hidden = mode !== "rhythm";
    if (mode !== "rhythm") {
      notesEl.innerHTML = "";
    }
  }

  function showScreen(name) {
    state.screen = name;
    $("screen-title").classList.toggle("active", name === "title");
    $("screen-game").classList.toggle("active", name === "game");
  }

  function customerFace(face) {
    const path = $("fan-mouth");
    path.setAttribute("d", MOUTHS[face] || MOUTHS.idle);
    path.setAttribute("fill", face === "wow" ? "#e84393" : "none");
  }

  function say(text, face = "idle") {
    speech.textContent = text;
    speech.classList.remove("pop");
    void speech.offsetWidth;
    speech.classList.add("pop");
    customerFace(face);
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      if (state.mode === "play" || state.mode === "countdown") {
        speech.textContent = state.practice ? "천천히 해도 괜찮아!" : "치즈라면 하나 부탁해~";
        customerFace("idle");
      }
    }, 2800);
  }

  function potById(id) {
    return state.pots.find((p) => p.id === id) || null;
  }

  function inGold(pot) {
    const d = state.diff;
    return pot.water && !pot.burnt && !pot.dead && pot.heat >= d.goldStart && pot.heat <= d.goldEnd;
  }

  function focusPot() {
    const live = state.pots.filter((p) => !p.dead);
    if (!live.length) return null;
    const gold = live.find((p) => inGold(p));
    if (gold) return gold;
    const danger = live.find((p) => p.water && !p.burnt && p.heat > state.diff.goldEnd);
    if (danger) return danger;
    const heating = live.filter((p) => p.water && !p.burnt);
    if (heating.length) return heating.reduce((a, b) => (a.heat >= b.heat ? a : b));
    const burnt = live.find((p) => p.burnt);
    if (burnt) return burnt;
    return live[0];
  }

  function statusText(pot) {
    if (pot.dead) return "사용 불가";
    if (pot.burnt) return "타버렸어!";
    if (!pot.noodle && !pot.soup && !pot.water && !pot.cheese && !pot.onion) return "빈 냄비";
    if (!pot.water) return "물 기다리는 중";
    if (pot.heat < state.diff.goldStart) return "데우는 중";
    if (inGold(pot) && (!pot.cheese || !pot.onion)) return "골든타임!";
    if (pot.heat > state.diff.goldEnd) return "위험! 빨리 서빙";
    return "서빙해도 좋아";
  }

  function shake(el) {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  function popPot(pot) {
    pot.el.classList.remove("pop");
    void pot.el.offsetWidth;
    pot.el.classList.add("pop");
  }

  function createPot(id) {
    const el = document.createElement("div");
    el.className = "pot";
    el.dataset.id = String(id);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "냄비");
    el.innerHTML = `
      <div class="focus-crown">👑</div>
      <div class="pot-rim"></div>
      <div class="pot-body">
        <div class="pot-shine"></div>
        <div class="gem"></div>
        <div class="stream"></div>
        <div class="pot-inner">
          <div class="broth"></div>
          <svg class="in-noodle" viewBox="0 0 120 60">
            <path d="M8 42 C22 10 30 52 46 18" fill="none" stroke="#ffe08a" stroke-width="5" stroke-linecap="round"/>
            <path d="M28 46 C44 12 58 54 78 16" fill="none" stroke="#fff3b0" stroke-width="5" stroke-linecap="round"/>
            <path d="M52 44 C70 14 86 50 108 20" fill="none" stroke="#f0b429" stroke-width="4" stroke-linecap="round"/>
          </svg>
          <div class="cheese-bits"><i></i><i></i><i></i></div>
          <div class="onion-bits"><i></i><i></i><i></i></div>
          <div class="glitter"><i></i><i></i><i></i></div>
          <div class="bubbles"><i></i><i></i><i></i></div>
        </div>
        <div class="steam"><i></i><i></i><i></i></div>
        <div class="burnt-cover">탔어</div>
      </div>
      <div class="meter"><div class="gold-mark"></div><div class="meter-fill"></div></div>
      <div class="pips">
        <i data-k="noodle"></i><i data-k="soup"></i><i data-k="water"></i><i data-k="cheese"></i><i data-k="onion"></i>
      </div>
      <div class="pot-status"></div>`;
    return {
      id,
      el,
      fill: el.querySelector(".meter-fill"),
      mark: el.querySelector(".gold-mark"),
      status: el.querySelector(".pot-status"),
      water: false,
      noodle: false,
      soup: false,
      cheese: false,
      onion: false,
      cheeseTiming: null,
      onionTiming: null,
      heat: 0,
      burnt: false,
      dead: false
    };
  }

  function resetPot(pot) {
    pot.water = false;
    pot.noodle = false;
    pot.soup = false;
    pot.cheese = false;
    pot.onion = false;
    pot.cheeseTiming = null;
    pot.onionTiming = null;
    pot.heat = 0;
    pot.burnt = false;
    pot.dead = false;
  }

  function syncPot(pot) {
    const el = pot.el;
    el.classList.toggle("has-water", pot.water);
    el.classList.toggle("has-noodle", pot.noodle);
    el.classList.toggle("has-soup", pot.soup);
    el.classList.toggle("has-cheese", pot.cheese);
    el.classList.toggle("has-onion", pot.onion);
    el.classList.toggle("burnt", pot.burnt);
    el.classList.toggle("dead", pot.dead);
    el.classList.toggle("gold", inGold(pot));
    el.classList.toggle("danger", pot.water && !pot.burnt && !pot.dead && pot.heat > state.diff.goldEnd);
    el.classList.toggle("hot", pot.water && pot.heat > 28 && !pot.burnt);
    el.classList.toggle("focus", focusPot() === pot && state.mode === "play");
    el.classList.toggle("selected", state.selectedPot === pot.id);
    const heat = Math.max(0, Math.min(100, pot.heat));
    pot.fill.style.width = heat + "%";
    pot.fill.style.background = pot.burnt
      ? "#6a5648"
      : inGold(pot)
        ? "linear-gradient(90deg,#fff6c2,#ffd34d)"
        : pot.heat > state.diff.goldEnd
          ? "linear-gradient(90deg,#ffd0dc,#ff4d6d)"
          : "linear-gradient(90deg,#e8fbff,#6fd4ff)";
    pot.mark.style.left = state.diff.goldStart + "%";
    pot.mark.style.width = (state.diff.goldEnd - state.diff.goldStart) + "%";
    pot.status.textContent = statusText(pot);
  }

  function canCook() {
    return state.mode === "play";
  }

  function addIngredient(pot, ing) {
    state.selectedIngredient = null;
    if (!canCook() || !pot || pot.dead) return;
    if (pot.burnt) {
      say("탄 냄비야! 쓰레기통으로 보내!");
      audio.no();
      shake(pot.el);
      return;
    }
    if (pot[ing]) {
      say("이미 들어 있어!");
      audio.no();
      return;
    }
    pot[ing] = true;
    if (ing === "cheese" || ing === "onion") {
      pot[ing + "Timing"] = !pot.water ? "early" : inGold(pot) ? "perfect" : pot.heat < state.diff.goldStart ? "early" : "late";
    }
    if (ing === "water") {
      audio.pour();
      pot.el.classList.add("pouring");
      setTimeout(() => pot.el.classList.remove("pouring"), 460);
    } else {
      audio.pop();
    }
    popPot(pot);
    const rect = pot.el.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + 30, 10, ["#fff", "#ffe56b", "#ff8ec3", "#9aecff"]);
    if ((ing === "cheese" || ing === "onion") && pot[ing + "Timing"] === "perfect") {
      say(ing === "cheese" ? "치즈가 살살 녹는 중!" : "파까지 완벽!");
    }
  }

  function tryTrash(pot) {
    if (!canCook() || !pot) return;
    state.selectedPot = null;
    if (!pot.burnt) {
      say("아직 멀쩡한 냄비야!");
      audio.no();
      return;
    }
    if (pot.dead) return;
    if (state.practice || state.spares > 0) {
      if (!state.practice) state.spares -= 1;
      resetPot(pot);
      say("반짝이는 새 냄비!");
      audio.pop();
    } else {
      pot.dead = true;
      say("여분 냄비가 없어...");
      audio.burn();
      if (!state.practice && state.pots.every((p) => p.dead)) {
        setTimeout(() => endGame(), 900);
      }
    }
  }

  function tryServe(pot) {
    if (!canCook() || !pot || pot.dead) return;
    state.selectedPot = null;
    if (pot.burnt) {
      say(pick(LINES.burnt), "wow");
      audio.no();
      shake(pot.el);
      return;
    }
    if (!pot.water || !pot.noodle || !pot.soup) {
      say(pick(LINES.joke), "sad");
      audio.no();
      shake(pot.el);
      return;
    }
    startRhythm(pot);
  }

  function nextBeat(after) {
    if (!audio.started) return after;
    const elapsed = Math.max(0, after - audio.origin);
    const i = Math.ceil((elapsed + 0.02) / BEAT);
    return audio.origin + i * BEAT;
  }

  function startRhythm(pot) {
    clearTimeout(state.finishTimer);
    state.finishTimer = 0;
    state.rhythmPot = pot;
    pot.el.classList.add("rhythm-focus");
    setMode("rhythm");
    const travel = state.diff.travel;
    let hit = nextBeat(audio.now() + travel);
    if (hit < audio.now() + travel * 0.85) hit += BEAT;
    notesEl.innerHTML = "";
    state.notes = state.diff.notes.map((key, i) => {
      const el = document.createElement("div");
      el.className = "note " + (key === "Space" ? "space" : "enter");
      el.textContent = key === "Space" ? "스페이스" : "엔터";
      notesEl.appendChild(el);
      return { key, hitAt: hit + i * state.diff.interval, el, judged: false, grade: null };
    });
    $("stretch-fill").style.width = "0%";
    $("next-key").textContent = "다가오는 보석을 봐!";
    say("치즈를 쭉— 당겨!");
    audio.blip(880);
  }

  function positionNotes() {
    const width = $("runway").clientWidth || 600;
    const hitX = width * 0.2;
    const spawnX = width + 40;
    const t = audio.now();
    const travel = state.diff.travel;
    for (const n of state.notes) {
      const x = hitX + ((n.hitAt - t) / travel) * (spawnX - hitX);
      n.el.style.transform = `translate(${x - 42}px, -50%)`;
    }
    const upcoming = state.notes.find((n) => !n.judged);
    if (upcoming) {
      const soon = upcoming.hitAt - t < 0.45;
      $("next-key").textContent = (soon ? "지금! " : "다음 ") + (upcoming.key === "Space" ? "스페이스" : "엔터");
      document.querySelectorAll(".keycap").forEach((cap) => {
        cap.classList.toggle("lit", soon && cap.dataset.key === upcoming.key);
      });
    }
  }

  const GRADE_LABEL = { perfect: "완벽!", great: "좋음!", good: "아슬!", miss: "빗나감" };
  const GRADE_WEIGHT = { perfect: 1, great: 0.82, good: 0.5, miss: 0 };

  function runningScore() {
    const done = state.notes.filter((n) => n.judged);
    if (!done.length) return 0;
    return done.reduce((s, n) => s + (GRADE_WEIGHT[n.grade] || 0), 0) / state.notes.length;
  }

  function judgeNote(note, grade) {
    if (!note || note.judged) return;
    note.judged = true;
    note.grade = grade;
    note.el.classList.add("judged", grade);
    const layer = $("judge-layer");
    const el = document.createElement("div");
    el.className = "judge " + grade;
    el.textContent = GRADE_LABEL[grade];
    layer.appendChild(el);
    setTimeout(() => el.remove(), 700);
    if (grade === "miss") audio.miss();
    else {
      audio.hit(grade);
      const zone = $("hit-zone").getBoundingClientRect();
      burst(zone.left + zone.width / 2, zone.top + zone.height / 2, grade === "perfect" ? 16 : 8, ["#fff", "#ffe56b", "#ff8ec3"]);
    }
    $("stretch-fill").style.width = Math.round(runningScore() * 100) + "%";
    if (state.notes.every((n) => n.judged)) queueFinish();
  }

  function queueFinish() {
    if (state.finishTimer) return;
    state.finishTimer = setTimeout(() => {
      state.finishTimer = 0;
      if (state.mode === "rhythm") finishRhythm();
    }, 420);
  }

  function evaluate(pot, score) {
    let q = 0.45;
    if (pot.cheese) q += 0.18;
    if (pot.onion) q += 0.12;
    if (pot.cheese && pot.cheeseTiming === "perfect") q += 0.15;
    else if (pot.cheese && pot.cheeseTiming === "early") q -= 0.08;
    else if (pot.cheese && pot.cheeseTiming === "late") q -= 0.15;
    if (pot.onion && pot.onionTiming === "perfect") q += 0.1;
    else if (pot.onion && pot.onionTiming === "late") q -= 0.08;
    if (!pot.cheese && !pot.onion) q -= 0.15;
    if (pot.heat > state.diff.goldEnd + 8) q -= 0.18;
    if (pot.heat > 90) q -= 0.22;
    q = Math.max(0, Math.min(1, q));
    q *= 0.62 + 0.38 * score;
    let pay = Math.round((q * 1000) / 50) * 50;
    pay = Math.max(0, Math.min(1000, pay));
    let cat = "ok";
    if (pot.heat > 90 || ((pot.cheeseTiming === "late" || pot.onionTiming === "late") && pay <= 750)) cat = "salty";
    else if ((pot.cheeseTiming === "early" || pot.onionTiming === "early") && pay <= 800) cat = "early";
    else if (!pot.cheese && !pot.onion) cat = "plain";
    else if (score < 0.45) cat = "ok";
    else if (pay >= 950 && score >= 0.9) cat = "perfect";
    else if (pay >= 750) cat = "great";
    return { pay, cat };
  }

  function floatPay(pay) {
    const el = document.createElement("div");
    el.className = "pay-float";
    el.textContent = `${pay > 0 ? "+" : ""}${won(pay)}원`;
    document.querySelector(".customer").appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function finishRhythm() {
    const pot = state.rhythmPot;
    if (!pot) return;
    const score = state.notes.reduce((s, n) => s + (GRADE_WEIGHT[n.grade] || 0), 0) / Math.max(1, state.notes.length);
    const result = evaluate(pot, score);
    if (result.pay >= 950) state.combo += 1;
    else state.combo = 0;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    let bonus = 0;
    if (state.combo > 1 && result.pay > 0) bonus = Math.min(500, (state.combo - 1) * 100);
    const pay = result.pay + bonus;
    state.money += pay;
    state.bowls += 1;
    audio.coin(pay);
    floatPay(pay);
    const pct = Math.round(score * 100);
    const face = FACES[result.cat] || "idle";
    say(`${pick(LINES[result.cat])}\n리듬 ${pct}% · +${won(pay)}원`, face);
    const rect = pot.el.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + 40, 22, ["#fff", "#ffe56b", "#ff8ec3", "#9aecff"]);
    pot.el.classList.remove("rhythm-focus");
    resetPot(pot);
    document.querySelectorAll(".keycap").forEach((cap) => cap.classList.remove("lit", "hit"));
    setMode("play");
    state.notes = [];
    state.rhythmPot = null;
    flashMoney();
    if (state.practice && !state.practiceWon && pay >= 800) {
      state.practiceWon = true;
      $("practice-win").hidden = false;
    }
  }

  function flashMoney() {
    const box = document.querySelector(".hud-stat.money");
    box.classList.remove("pop");
    void box.offsetWidth;
    box.classList.add("pop");
  }

  function hintText() {
    if (state.mode === "countdown") return "곧 시작이야. 손을 올려!";
    if (state.mode === "rhythm") return "보석이 왕관 위에 오면 적힌 키를 눌러! 스페이스 또는 엔터";
    if (state.selectedIngredient) return "선택한 재료를 냄비에 클릭해서 넣거나, 그대로 드래그해!";
    if (state.selectedPot != null) return "선택된 냄비를 하트 쟁반이나 쓰레기통으로!";
    const pot = focusPot();
    if (!pot) return "냄비가 모두 멈췄어...";
    if (pot.burnt) return "탄 냄비를 쓰레기통으로 드래그하거나, 클릭한 뒤 쓰레기통을 클릭!";
    if (!pot.noodle) return "생라면을 드래그하거나, 클릭한 다음 냄비를 클릭!";
    if (!pot.soup) return "치즈스프를 넣어!";
    if (!pot.water) return "주전자로 물을 부어! 붓는 순간부터 게이지가 차.";
    if (pot.heat < state.diff.goldStart) {
      const other = state.pots.some((p) => p !== pot && !p.dead && !p.burnt && !p.water);
      if (other) return "끓는 동안 다른 냄비에 면·스프·물을 미리 넣어봐!";
      return "게이지가 노란 칸에 들어올 때까지 기다려.";
    }
    if (!pot.cheese) return "지금! 노란 칸일 때 치즈를 넣어.";
    if (!pot.onion) return "파도 골든타임에 올려!";
    return "냄비를 하트 쟁반으로 드래그! 클릭한 뒤 쟁반을 눌러도 돼.";
  }

  function updateUrgency() {
    document.querySelectorAll(".card").forEach((card) => card.classList.toggle("selected", card.dataset.ingredient === state.selectedIngredient));
    const pot = focusPot();
    const need = { noodle: false, soup: false, water: false, cheese: false, onion: false };
    let tray = false;
    let trash = false;
    if (pot && state.mode === "play") {
      if (pot.burnt) trash = true;
      else if (inGold(pot)) {
        if (!pot.cheese) need.cheese = true;
        if (!pot.onion) need.onion = true;
        if (pot.cheese && pot.onion && pot.noodle && pot.soup) tray = true;
      } else if (pot.water && pot.heat > state.diff.goldEnd) {
        if ((pot.cheese && pot.onion) || pot.heat > 88) tray = true;
        else {
          if (!pot.cheese) need.cheese = true;
          if (!pot.onion) need.onion = true;
        }
      }
    }
    document.querySelectorAll(".card").forEach((card) => {
      card.classList.toggle("urgent", !!need[card.dataset.ingredient]);
    });
    $("tray").classList.toggle("urgent", tray);
    $("trash").classList.toggle("urgent", trash);
  }

  function updateHand() {
    if (!state.practice || state.mode !== "play" || !$("practice-win").hidden) {
      hand.hidden = true;
      return;
    }
    const pot = focusPot();
    if (!pot) {
      hand.hidden = true;
      return;
    }
    let target = null;
    if (state.selectedIngredient) target = pot.el;
    else if (state.selectedPot != null) target = potById(state.selectedPot)?.burnt ? $("trash") : $("tray");
    else if (pot.burnt) target = $("trash");
    else if (!pot.noodle) target = document.querySelector('[data-ingredient="noodle"]');
    else if (!pot.soup) target = document.querySelector('[data-ingredient="soup"]');
    else if (!pot.water) target = document.querySelector('[data-ingredient="water"]');
    else if (pot.heat < state.diff.goldStart) target = pot.el.querySelector(".meter");
    else if (!pot.cheese) target = document.querySelector('[data-ingredient="cheese"]');
    else if (!pot.onion) target = document.querySelector('[data-ingredient="onion"]');
    else target = $("tray");
    if (!target) {
      hand.hidden = true;
      return;
    }
    const r = target.getBoundingClientRect();
    hand.hidden = false;
    hand.textContent = "👇";
    hand.style.left = r.left + r.width / 2 + "px";
    hand.style.top = r.top + 8 + "px";
  }

  function formatTime(t) {
    const s = Math.max(0, t);
    if (s < 10) return s.toFixed(1);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function updateHud() {
    $("timer").textContent = state.practice ? "연습" : formatTime(state.time);
    $("money").textContent = won(state.money) + "원";
    $("combo").textContent = String(state.combo);
    $("bowls").textContent = String(state.bowls);
    $("spares").textContent = state.practice ? "∞" : String(state.spares);
    $("timer").style.color = !state.practice && state.time < 10 ? "#e84393" : "";
  }

  function pressRhythm(code) {
    document.querySelectorAll(`.keycap[data-key="${code}"]`).forEach((cap) => {
      cap.classList.add("hit");
      setTimeout(() => cap.classList.remove("hit"), 120);
    });
    if (state.mode !== "rhythm") return;
    const t = audio.now();
    let best = null;
    let bestAbs = Infinity;
    for (const n of state.notes) {
      if (n.judged || n.key !== code) continue;
      const ad = Math.abs(n.hitAt - t);
      if (ad < bestAbs) {
        bestAbs = ad;
        best = n;
      }
    }
    if (!best || bestAbs > state.diff.good) return;
    let grade = "good";
    if (bestAbs <= state.diff.perfect) grade = "perfect";
    else if (bestAbs <= state.diff.great) grade = "great";
    judgeNote(best, grade);
  }

  function elementAt(x, y, selector) {
    return document.elementsFromPoint(x, y).map((el) => el.closest && el.closest(selector)).find(Boolean) || null;
  }

  function onDown(e) {
    audio.unlock();
    if (!e.target.closest(".mute")) audio.start();
    const keycap = e.target.closest(".keycap");
    if (keycap) {
      pressRhythm(keycap.dataset.key);
      return;
    }
    if (e.target.closest("button, dialog")) return;
    if (state.screen !== "game" || state.mode === "countdown" || state.mode === "result") return;
    const ing = e.target.closest("[data-ingredient]");
    const potEl = e.target.closest(".pot");
    const tray = e.target.closest("#tray");
    const trash = e.target.closest("#trash");
    if (tray && state.selectedPot != null && canCook()) {
      tryServe(potById(state.selectedPot));
      return;
    }
    if (trash && state.selectedPot != null && canCook()) {
      tryTrash(potById(state.selectedPot));
      return;
    }
    if (ing && canCook()) {
      pointer.active = true;
      pointer.kind = "ingredient";
      pointer.ingredient = ing.dataset.ingredient;
      pointer.x = pointer.lx = e.clientX;
      pointer.y = pointer.ly = e.clientY;
      pointer.moved = false;
      state.selectedIngredient = ing.dataset.ingredient;
      state.selectedPot = null;
      ghost.innerHTML = ing.querySelector(".ico").innerHTML;
      return;
    }
    if (potEl && canCook() && !potEl.classList.contains("dead")) {
      pointer.active = true;
      pointer.kind = "pot";
      pointer.potId = Number(potEl.dataset.id);
      pointer.x = pointer.lx = e.clientX;
      pointer.y = pointer.ly = e.clientY;
      pointer.moved = false;
      const pot = potById(pointer.potId);
      ghost.innerHTML = `<div style="font-size:54px">${pot && pot.burnt ? "🔥" : "🍲"}</div>`;
      return;
    }
    if (!tray && !trash) {
      state.selectedIngredient = null;
      state.selectedPot = null;
    }
  }

  function onMove(e) {
    if (!pointer.active) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (!pointer.moved && dx * dx + dy * dy > 64) pointer.moved = true;
    pointer.lx = e.clientX;
    pointer.ly = e.clientY;
    if (!pointer.moved) return;
    ghost.hidden = false;
    const spin = Math.max(-18, Math.min(18, (e.clientX - pointer.x) * 0.05));
    ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -60%) rotate(${spin}deg)`;
    if (performance.now() - pointer.lastSpark > 36) {
      pointer.lastSpark = performance.now();
      burst(e.clientX, e.clientY, 1, ["#fff", "#ffe56b", "#ff8ec3"]);
    }
  }

  function onUp(e) {
    if (!pointer.active) return;
    const moved = pointer.moved;
    const kind = pointer.kind;
    const ingredient = pointer.ingredient;
    const potId = pointer.potId;
    const x = e.clientX || pointer.lx;
    const y = e.clientY || pointer.ly;
    pointer.active = false;
    ghost.hidden = true;
    if (kind === "ingredient") {
      const potEl = elementAt(x, y, ".pot");
      if (potEl) {
        addIngredient(potById(Number(potEl.dataset.id)), ingredient);
        return;
      }
      if (!moved) return;
      if (elementAt(x, y, "#tray")) say("재료는 냄비 안에 넣는 거야!");
      return;
    }
    if (kind === "pot") {
      const pot = potById(potId);
      if (elementAt(x, y, "#tray")) {
        tryServe(pot);
        return;
      }
      if (elementAt(x, y, "#trash")) {
        tryTrash(pot);
        return;
      }
      if (!moved) {
        if (state.selectedIngredient) addIngredient(pot, state.selectedIngredient);
        else state.selectedPot = state.selectedPot === potId ? null : potId;
      }
    }
  }

  function updateGame(dt) {
    if ($("guide").open) {
      updateHud();
      return;
    }
    if (state.mode === "play" && !state.practice) {
      state.time -= dt;
      if (state.time <= 0) {
        state.time = 0;
        endGame();
        return;
      }
      if (state.time < 10) {
        const sec = Math.ceil(state.time);
        if (sec !== state.lastWarn) {
          state.lastWarn = sec;
          audio.tick();
        }
      }
    }
    if (state.mode === "play") {
      const rate = 100 / state.diff.burnSec;
      for (const pot of state.pots) {
        if (pot.dead || pot.burnt || !pot.water) continue;
        if (state.practice) {
          const mid = (state.diff.goldStart + state.diff.goldEnd) / 2;
          if (pot.heat < mid) pot.heat = Math.min(mid, pot.heat + dt * rate);
        } else {
          pot.heat += dt * rate;
          if (pot.heat >= 100) {
            pot.heat = 100;
            pot.burnt = true;
            audio.burn();
            say(pick(LINES.burnt), "wow");
            shake(pot.el);
            const rect = pot.el.getBoundingClientRect();
            burst(rect.left + rect.width / 2, rect.top + 20, 14, ["#888", "#ffb3d9", "#444"]);
          }
        }
      }
      state.bubbleT -= dt;
      if (state.bubbleT <= 0 && state.pots.some((p) => p.water && !p.burnt && p.heat > 32)) {
        state.bubbleT = 0.72;
        audio.bubble();
      }
    }
    if (state.mode === "rhythm") {
      const t = audio.now();
      for (const n of state.notes) {
        if (!n.judged && t > n.hitAt + state.diff.good) judgeNote(n, "miss");
      }
      positionNotes();
    }
    for (const pot of state.pots) syncPot(pot);
    updateHud();
    if (state.mode === "play" || state.mode === "rhythm" || state.mode === "countdown") {
      hint.textContent = hintText();
    }
    updateUrgency();
    updateHand();
  }

  function endGame() {
    if (state.mode === "result" || state.mode === "title" || state.practice || state.screen !== "game") return;
    clearTimeout(state.finishTimer);
    setMode("result");
    const win = state.money >= state.goal;
    audio.sting(win);
    const ratio = state.goal ? state.money / state.goal : 0;
    const n = ratio >= 1 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
    $("result-stars").textContent = "★".repeat(n) + "☆".repeat(3 - n);
    $("result-title").textContent = win ? "앵콜! 치즈 공주 라면!" : "오늘 영업 종료";
    $("result-kicker").textContent = win
      ? "역시 치즈가 끓인 라면이 최고야!"
      : ratio >= 0.8
        ? "아쉽게 시간이 끝났어. 한 번 더!"
        : "넌 티아라 닦기나 해!";
    $("result-money").textContent = `${won(state.money)}원`;
    $("result-detail").textContent = `목표 ${won(state.goal)}원 · 완성한 라면 ${state.bowls}그릇 · 최고 콤보 ${state.maxCombo}`;
    $("result").hidden = false;
    saveBest();
    customerFace(win ? "love" : "sad");
    if (win) {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => burst(viewW * (0.2 + Math.random() * 0.6), viewH * (0.3 + Math.random() * 0.3), 18, ["#fff", "#ffe56b", "#ff8ec3", "#9aecff"]), i * 120);
      }
    }
  }

  function startCountdown() {
    setMode("countdown");
    const words = ["준비~", "3", "2", "1", "라면 타임!"];
    const overlay = $("countdown");
    overlay.hidden = false;
    let i = 0;
    const tick = () => {
      overlay.textContent = words[i];
      audio.blip(520 + i * 90);
      i += 1;
      if (i < words.length) state.countdownTimer = setTimeout(tick, 520);
      else {
        state.countdownTimer = setTimeout(() => {
          overlay.hidden = true;
          setMode("play");
          say("치즈라면, 부탁해~!");
        }, 460);
      }
    };
    tick();
  }

  function startGame(key) {
    audio.unlock();
    audio.start();
    clearTimeout(state.countdownTimer);
    clearTimeout(state.finishTimer);
    state.finishTimer = 0;
    state.diffKey = key === "practice" ? "easy" : key;
    state.practice = key === "practice";
    state.practiceWon = false;
    state.diff = state.practice
      ? {
          ...DIFF.easy,
          label: "연습",
          burnSec: 8,
          goldStart: 40,
          goldEnd: 82,
          pots: 1,
          spares: 99,
          travel: 2.15,
          interval: BEAT * 2,
          perfect: 0.12,
          great: 0.2,
          good: 0.3,
          notes: ["Space", "Enter", "Space", "Enter"]
        }
      : DIFF[key];
    state.time = state.diff.time;
    state.money = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.bowls = 0;
    state.spares = state.practice ? 99 : state.diff.spares;
    state.selectedIngredient = null;
    state.selectedPot = null;
    state.notes = [];
    state.rhythmPot = null;
    state.lastWarn = null;
    const wrap = $("pots");
    wrap.innerHTML = "";
    wrap.classList.toggle("single", state.diff.pots === 1);
    state.pots = [];
    for (let i = 0; i < state.diff.pots; i++) {
      const pot = createPot(i);
      state.pots.push(pot);
      wrap.appendChild(pot.el);
    }
    $("mode-label").textContent = state.practice ? "연습 무대" : state.diff.label;
    $("goal-label").textContent = state.practice ? "불은 골든타임에서 멈춤" : `목표 ${won(state.diff.goal)}원`;
    $("result").hidden = true;
    $("practice-win").hidden = true;
    $("countdown").hidden = true;
    showScreen("game");
    if (state.practice) {
      setMode("play");
      say("생라면을 냄비에 넣어보자!");
    } else {
      startCountdown();
    }
    updateHud();
  }

  function goTitle() {
    clearTimeout(state.countdownTimer);
    clearTimeout(state.finishTimer);
    setMode("title");
    showScreen("title");
    $("result").hidden = true;
    $("practice-win").hidden = true;
    $("countdown").hidden = true;
    $("rhythm").hidden = true;
    hand.hidden = true;
    ghost.hidden = true;
  }

  function toggleMute(e) {
    audio.unlock();
    audio.setMuted(!audio.muted);
    if (!audio.muted) audio.start();
    document.querySelectorAll(".mute").forEach((b) => {
      b.textContent = audio.muted ? "♪ 꺼짐" : "♪ 켜짐";
    });
    e.stopPropagation();
  }

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => startGame(btn.dataset.mode));
  });
  document.querySelectorAll(".mute").forEach((btn) => btn.addEventListener("click", toggleMute));
  $("open-guide").addEventListener("click", () => $("guide").showModal());
  $("open-guide-2").addEventListener("click", () => $("guide").showModal());
  $("guide-close").addEventListener("click", () => $("guide").close());
  $("guide").addEventListener("click", (e) => {
    if (e.target === $("guide")) $("guide").close();
  });
  $("btn-title").addEventListener("click", goTitle);
  $("result-title").addEventListener("click", goTitle);
  $("result-retry").addEventListener("click", () => startGame(state.practice ? "practice" : state.diffKey));
  $("practice-continue").addEventListener("click", () => {
    $("practice-win").hidden = true;
  });
  $("practice-go").addEventListener("click", () => startGame("normal"));

  document.addEventListener("pointerdown", onDown);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (state.mode === "rhythm") pressRhythm(e.code);
    } else if (e.key === "Escape") {
      if ($("guide").open) $("guide").close();
    }
  });
  document.addEventListener("contextmenu", (e) => {
    if (state.screen === "game") e.preventDefault();
  });

  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!document.hidden) {
      updateBackdrop(dt, ts / 1000);
      if (state.screen === "game" && state.mode !== "result") updateGame(dt);
    }
    drawBackdrop();
    requestAnimationFrame(frame);
  }

  resize();
  initItems();
  renderBest();
  addEventListener("resize", () => {
    resize();
    if (!items.length) initItems();
  });
  requestAnimationFrame(frame);
})();
