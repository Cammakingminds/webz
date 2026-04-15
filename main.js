// ============================================================
//  SPIDER WEB SIMULATION — Radial Spokes, Strand Crawling, Breakable
// ============================================================
const canvas = document.getElementById('webCanvas');
const ctx = canvas.getContext('2d');

// ============================================================
//  AUDIO ENGINE — Procedural Web Audio API sounds
// ============================================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.masterGain = null;
    this.ambientGain = null;
    this.ambientOsc = null;
    this.ambientLfo = null;
    this.lastCrawlSound = 0;
    this.lastStrandSound = 0;
    this.spiralToneIndex = 0;
    this.lastGrumbleSound = 0;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
      this.startAmbient();
    } catch (e) { console.warn('AudioEngine: Web Audio not available', e); }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // --- Ambient background drone ---
  startAmbient() {
    // Disabled at user request
  }

  // --- Strand creation: professional 'zip' / 'slide' texture ---
  playStrandSound(length, type = 'radial') {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStrandSound < 0.05) return;
    this.lastStrandSound = now;

    const c = this.ctx;
    const l = Math.max(10, Math.min(length || 50, 500));
    
    // The "Slide" - rapid pitch sweep of a high-passed noise burst
    const dur = 0.06 + (l / 500) * 0.08;
    const bufSize = c.sampleRate * dur;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    
    for (let i = 0; i < bufSize; i++) {
        // High frequency noise with decay
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;

    // Filter sweep for "zip" effect - vary based on type
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    
    const startFreq = (type === 'radial') ? 3500 : 6000;
    const endFreq = (type === 'radial') ? 700 : 1500;
    
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    filter.Q.value = (type === 'radial') ? 1.2 : 2.0;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    const peakGain = (type === 'radial') ? 0.05 : 0.035;
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start(now);
  }

  // --- Sounds removed per user request ---
  playBreakSound() {}

  // --- Spider crawling: ultra soft rustle ---
  playCrawlSound() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCrawlSound < 0.1) return;
    this.lastCrawlSound = now;

    const c = this.ctx;
    const dur = 0.1;

    // Extremely high passed pink-like noise burst
    const bufSize = c.sampleRate * dur;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000 + Math.random() * 2000;
    
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    // Super quiet rustle
    gain.gain.linearRampToValueAtTime(0.006, now + 0.02); 
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
  }

  // --- Sounds removed per user request ---
  playRepairStartSound() {}
  playRepairGrumble() {}
  playWindSound() {}

  resetSpiralIndex() {
    this.spiralToneIndex = 0;
  }
}

const audio = new AudioEngine();

const CFG = {
  gravity: 0.05, damping: 0.994, stiffness: 0.5, iterations: 8,
  numRadials: 18, nodesPerRadial: 8, numSpiralRings: 12,
  spiderSpeed: 12, windDecay: 0.96, breakRadius: 25, repairDelay: 60,
};

let W, H, cx, cy, gravityOn = false, time = 0;
let mouseWind = { x: 0, y: 0, active: false };
let mousePos = { x: -999, y: -999 }, mouseDown = false;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2; cy = H / 2;
}
window.addEventListener('resize', resize); resize();

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}
function linesIntersect(a, b, c, d) {
  const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (det === 0) return false;
  const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
  const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}
function setStatus() {} // UI removed

// ---- NODE ----
class Node {
  constructor(x, y, pinned = false) {
    this.x = x; this.y = y; this.ox = x; this.oy = y;
    this.homeX = x; this.homeY = y; this.pinned = pinned;
  }
  update() {
    if (this.pinned) return;
    const vx = (this.x - this.ox) * CFG.damping, vy = (this.y - this.oy) * CFG.damping;
    this.ox = this.x; this.oy = this.y;
    this.x += vx; this.y += vy;
    if (gravityOn) this.y += CFG.gravity;
    if (mouseWind.active) { this.x += mouseWind.x * 0.1; this.y += mouseWind.y * 0.1; }
    // Clamp to screen bounds significantly inside the viewport
    this.x = Math.max(10, Math.min(W - 10, this.x));
    this.y = Math.max(10, Math.min(H - 10, this.y));
  }
  getConnections(web) {
    let count = 0;
    for (const s of web.strands) { if (!s.broken && (s.a === this || s.b === this)) count++; }
    return count;
  }
}

// ---- STRAND ----
class Strand {
  constructor(a, b) {
    this.a = a; this.b = b;
    this.restLen = dist(a, b); this.origRestLen = this.restLen;
    this.type = 'radial'; this.opacity = 1.0;
    this.broken = false; this.breakFade = 0;
    this.gracePeriod = 0;
  }
  solve() {
    if (this.broken) return;
    const dx = this.b.x - this.a.x, dy = this.b.y - this.a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const diff = (d - this.restLen) / d * CFG.stiffness;
    const ox = dx * diff * 0.5, oy = dy * diff * 0.5;
    if (!this.a.pinned) { this.a.x += ox; this.a.y += oy; }
    if (!this.b.pinned) { this.b.x -= ox; this.b.y -= oy; }
  }
  draw(ctx) {
    if (this.broken) {
      if (this.breakFade > 0) {
        this.breakFade -= 0.08;
        ctx.beginPath(); ctx.moveTo(this.a.x, this.a.y); ctx.lineTo(this.b.x, this.b.y);
        ctx.strokeStyle = `rgba(255,180,120,${this.breakFade * 0.5})`; ctx.lineWidth = 1.5; ctx.stroke();
      }
      return;
    }
    if (this.type === 'adhesion') return; // Do not draw hidden snags
    if (this.opacity < 1) this.opacity = Math.min(1, this.opacity + 0.05);
    const a = this.opacity;
    ctx.beginPath(); ctx.moveTo(this.a.x, this.a.y); ctx.lineTo(this.b.x, this.b.y);
    if (this.type === 'radial') {
      ctx.strokeStyle = `rgba(190,210,240,${a * 0.8})`; ctx.lineWidth = 1.4;
    } else {
      ctx.strokeStyle = `rgba(160,185,230,${a * 0.5})`; ctx.lineWidth = 0.7;
    }
    ctx.stroke();
  }
}

// ---- SPARKLE ----
class Sparkle {
  constructor(s) { this.s = s; this.t = Math.random(); this.ph = Math.random() * 6.28; this.sp = 0.005 + Math.random() * 0.012; this.sz = 1 + Math.random() * 1.8; }
  draw(ctx, time) {
    if (this.s.broken || this.s.opacity < 0.3) return;
    const x = this.s.a.x + (this.s.b.x - this.s.a.x) * this.t, y = this.s.a.y + (this.s.b.y - this.s.a.y) * this.t;
    const g = Math.sin(time * this.sp + this.ph) * 0.5 + 0.5;
    if (g < 0.3) return;
    ctx.beginPath(); ctx.arc(x, y, this.sz * g, 0, 6.28);
    ctx.fillStyle = `rgba(220,235,255,${g * 0.85 * this.s.opacity})`; ctx.fill();
  }
}

// ---- SPIDER ----
class Spider {
  constructor(x, y) {
    this.x = x; this.y = y; this.path = []; this.legPhase = 0;
    this.size = 8; this.angle = -Math.PI / 2; this.moving = false;
    this.restNode = null;
    this.mood = 'neutral';       // 'neutral' | 'happy' | 'angry'
    this.moodIntensity = 0;      // 0→1 smooth transition
    this.moodTarget = 0;
    this.onWeb = false;          // true = crawling on strand, false = flying/rappelling
    this.bodyBob = 0;            // idle breathing bob
    this.draglineAnchor = null;  // {x,y} for silk dragline while flying
    this.happyBounce = 0;        // bounce animation when happy
    this.grabbedNode = null;     // Node the spider is currently holding
    this._forceBusy = false;    // Lock to prevent task overlaps during transitions
  }

  flyTo(x, y, cb) {
    this._forceBusy = true;
    this.draglineAnchor = { x: this.x, y: this.y };
    this.path.push({ x, y, node: null, cb: () => { if (cb) cb(); this._forceBusy = false; }, type: 'fly' });
  }
  crawlTo(node, cb) {
    this._forceBusy = true;
    this.path.push({ x: node.x, y: node.y, node, cb: () => { if (cb) cb(); this._forceBusy = false; }, type: 'crawl' });
  }
  get busy() { return this.path.length > 0 || this._forceBusy; }

  grabNode(node) {
    if (node && !node.pinned) {
      console.log("Spider: Physically GRABBING node.", node);
      this.grabbedNode = node;
    }
  }
  releaseNode() {
    if (this.grabbedNode) {
        console.log("Spider: Physically RELEASING node.");
        // Zero out velocity so it doesn't 'fly' after being moved by the spider
        this.grabbedNode.oldX = this.grabbedNode.x;
        this.grabbedNode.oldY = this.grabbedNode.y;
    }
    this.grabbedNode = null;
  }

  setMood(m) {
    this.mood = m;
    this.moodTarget = 1;
  }

  update() {
    // Smooth mood intensity
    if (this.moodTarget > 0) {
      this.moodIntensity = Math.min(1, this.moodIntensity + 0.04);
      if (this.moodIntensity >= 1) this.moodTarget = 0;
    }
    
    if (!this.busy) {
      // Don't calm down if the web is still broken
      const webStillBroken = web && web.repairQueue.length > 0;
      if (!webStillBroken) {
          this.moodIntensity = Math.max(0, this.moodIntensity - 0.01);
      }
    }

    // Only affected by wind if NOT currently busy with a task (building/repairing)
    if (mouseWind.active && !this.grabbedNode && !this.busy) {
      this.vx += mouseWind.x * 0.1;
      this.vy += mouseWind.y * 0.1;
    }

    // Happy bounce
    if (this.mood === 'happy') {
      this.happyBounce += 0.12;
    } else {
      this.happyBounce *= 0.95;
    }

    // Idle breathing
    this.bodyBob += 0.03;

    if (this.path.length > 0) {
      this.moving = true;
      const tgt = this.path[0];
      this.onWeb = tgt.type === 'crawl';

      // Different leg animation speeds for crawling vs flying
      if (this.onWeb) {
        this.legPhase += 0.25; // deliberate crawling gait
      } else {
        this.legPhase += 0.08; // slow dangle while flying
      }

      const tx = tgt.node ? tgt.node.x : tgt.x, ty = tgt.node ? tgt.node.y : tgt.y;
      const dx = tx - this.x, dy = ty - this.y, d = Math.sqrt(dx * dx + dy * dy);
      this.angle = Math.atan2(dy, dx);
      if (d < CFG.spiderSpeed + 1) {
        this.x = tx; this.y = ty;
        this.restNode = tgt.node || null;
        this.draglineAnchor = null;
        const cb = tgt.cb; this.path.shift(); if (cb) cb();
      } else {
        this.x += (dx / d) * CFG.spiderSpeed; this.y += (dy / d) * CFG.spiderSpeed;
        if (this.onWeb) {
          audio.playCrawlSound();
        }
      }
    } else {
      this.moving = false; this.legPhase += 0.015;
      this.onWeb = true;
      this.draglineAnchor = null;
      
      // If we don't have a restNode but we aren't moving, try to find footing on the nearest node
      if (!this.restNode) {
          const nearest = web ? web.findNearestNode(this.x, this.y) : null;
          if (nearest && dist(this, nearest) < 100) {
              this.restNode = nearest;
          }
      }

      if (this.restNode) {
        this.x = this.restNode.x;
        this.y = this.restNode.y;
      }
    }
    this.x = Math.max(20, Math.min(W - 20, this.x));
    this.y = Math.max(20, Math.min(H - 20, this.y));

    if (this.grabbedNode) {
      this.grabbedNode.x = this.x;
      this.grabbedNode.y = this.y;
    }
  }

  draw(ctx) {
    const s = this.size;
    const isAngry = this.mood === 'angry';
    const isHappy = this.mood === 'happy';
    const mi = this.moodIntensity;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Add happy bounce offset
    if (isHappy) {
      ctx.translate(0, Math.sin(this.happyBounce) * 2 * mi);
    }

    if (this.moving) ctx.rotate(this.angle + Math.PI / 2);

    // Angry vibration
    if (isAngry && mi > 0.3) {
      const shake = Math.sin(time * 0.8) * 0.5 * mi;
      ctx.translate(shake, 0);
    }

    // ============ LEGS (drawn behind body) ============
    this.drawLegs(ctx, s);

    // ============ ABDOMEN ============
    ctx.shadowColor = isAngry ? 'rgba(230,100,80,0.35)' : 'rgba(140,170,230,0.3)';
    ctx.shadowBlur = 12;

    // Main abdomen shape — larger, more bulbous
    ctx.beginPath();
    ctx.ellipse(0, 5, s * 0.95, s * 1.3, 0, 0, 6.28);
    const ag = ctx.createRadialGradient(1, 3, 0, 0, 5, s * 1.3);
    if (isAngry) {
      ag.addColorStop(0, '#3a1a1a'); ag.addColorStop(0.6, '#1c0808');
      ag.addColorStop(1, '#0e0505');
    } else {
      ag.addColorStop(0, '#2a2535'); ag.addColorStop(0.6, '#151020');
      ag.addColorStop(1, '#0a0812');
    }
    ctx.fillStyle = ag; ctx.fill();
    ctx.strokeStyle = isAngry ? 'rgba(200,100,80,0.3)' : 'rgba(130,155,210,0.3)';
    ctx.lineWidth = 0.5; ctx.stroke();

    // Dorsal pattern — hourglass / chevron markings
    ctx.save();
    ctx.globalAlpha = isAngry ? 0.4 : 0.2;
    const patColor = isAngry ? '#ff6040' : '#8090c0';
    ctx.fillStyle = patColor;
    // V-shaped marking
    ctx.beginPath();
    ctx.moveTo(0, 1.5); ctx.lineTo(-2.5, 4); ctx.lineTo(-1, 4.5); ctx.lineTo(0, 3);
    ctx.lineTo(1, 4.5); ctx.lineTo(2.5, 4); ctx.closePath(); ctx.fill();
    // Two dots
    ctx.beginPath(); ctx.arc(-1.5, 6, 0.9, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(1.5, 6, 0.9, 0, 6.28); ctx.fill();
    // Bottom chevron
    ctx.beginPath();
    ctx.moveTo(0, 7); ctx.lineTo(-2, 8.5); ctx.lineTo(0, 8); ctx.lineTo(2, 8.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // Abdomen hair texture
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = isAngry ? '#cc8060' : '#8899bb';
    ctx.lineWidth = 0.3;
    for (let h = 0; h < 14; h++) {
      const ha = (h / 14) * 6.28;
      const hr = s * (0.7 + Math.random() * 0.3);
      const hx = Math.cos(ha) * hr * 0.8, hy = 5 + Math.sin(ha) * hr * 1.1;
      const hl = 2 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ha) * hl, hy + Math.sin(ha) * hl);
      ctx.stroke();
    }
    ctx.restore();

    // Spinnerets at abdomen tip
    ctx.fillStyle = isAngry ? 'rgba(180,100,80,0.5)' : 'rgba(140,155,190,0.4)';
    ctx.beginPath(); ctx.ellipse(-1, 10, 0.8, 0.5, 0.2, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1, 10, 0.8, 0.5, -0.2, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 10.5, 0.5, 0.4, 0, 0, 6.28); ctx.fill();

    ctx.shadowBlur = 0;

    // ============ PEDICEL (narrow waist) ============
    ctx.fillStyle = isAngry ? '#1c0a0a' : '#12101a';
    ctx.beginPath(); ctx.ellipse(0, 0.5, s * 0.2, s * 0.25, 0, 0, 6.28); ctx.fill();

    // ============ CEPHALOTHORAX (head) ============
    ctx.beginPath();
    ctx.ellipse(0, -3, s * 0.65, s * 0.62, 0, 0, 6.28);
    const cg = ctx.createRadialGradient(0.5, -4, 0, 0, -3, s * 0.65);
    if (isAngry) {
      cg.addColorStop(0, '#301515'); cg.addColorStop(1, '#120505');
    } else {
      cg.addColorStop(0, '#252035'); cg.addColorStop(1, '#0d0a18');
    }
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = isAngry ? 'rgba(180,90,70,0.3)' : 'rgba(120,140,190,0.25)';
    ctx.lineWidth = 0.4; ctx.stroke();

    // Head hair
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = isAngry ? '#bb7060' : '#7788aa';
    ctx.lineWidth = 0.25;
    for (let h = 0; h < 8; h++) {
      const ha = -Math.PI + (h / 8) * Math.PI;
      const hx = Math.cos(ha) * s * 0.55, hy = -3 + Math.sin(ha) * s * 0.5;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ha) * 1.5, hy + Math.sin(ha) * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // ============ CHELICERAE (fangs) ============
    ctx.strokeStyle = isAngry ? 'rgba(255,120,80,0.7)' : 'rgba(160,175,210,0.5)';
    ctx.lineWidth = isAngry ? 1.0 : 0.7;
    // Left fang
    ctx.beginPath(); ctx.moveTo(-1.5, -6);
    ctx.quadraticCurveTo(-2.5, -8, isAngry ? -1.5 : -1.8, isAngry ? -9.5 : -8.5);
    ctx.stroke();
    // Right fang
    ctx.beginPath(); ctx.moveTo(1.5, -6);
    ctx.quadraticCurveTo(2.5, -8, isAngry ? 1.5 : 1.8, isAngry ? -9.5 : -8.5);
    ctx.stroke();
    // Fang tips (little dots)
    ctx.fillStyle = isAngry ? 'rgba(255,140,100,0.8)' : 'rgba(180,195,220,0.6)';
    ctx.beginPath();
    ctx.arc(isAngry ? -1.5 : -1.8, isAngry ? -9.5 : -8.5, 0.4, 0, 6.28); ctx.fill();
    ctx.beginPath();
    ctx.arc(isAngry ? 1.5 : 1.8, isAngry ? -9.5 : -8.5, 0.4, 0, 6.28); ctx.fill();

    // ============ PEDIPALPS ============
    ctx.strokeStyle = isAngry ? 'rgba(200,110,80,0.5)' : 'rgba(130,150,190,0.4)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-2.5, -5); ctx.quadraticCurveTo(-4, -6.5, -3.5, -7.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2.5, -5); ctx.quadraticCurveTo(4, -6.5, 3.5, -7.5); ctx.stroke();
    // Pedipalp tips
    ctx.fillStyle = isAngry ? 'rgba(200,130,100,0.5)' : 'rgba(150,165,200,0.4)';
    ctx.beginPath(); ctx.arc(-3.5, -7.5, 0.6, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -7.5, 0.6, 0, 6.28); ctx.fill();

    // ============ EYES (8 eyes in realistic arrangement) ============
    this.drawEyes(ctx, s);

    // ============ EXPRESSION ============
    this.drawExpression(ctx, s);
    
    ctx.restore();
  }

  drawEyes(ctx, s) {
    const isAngry = this.mood === 'angry';
    const isHappy = this.mood === 'happy';
    const mi = this.moodIntensity;

    // Anterior Median Eyes (AME) — largest, front-facing
    const ameSize = 1.6;
    const eyeGlow = isAngry ? 'rgba(255,80,40,0.9)' : isHappy ? 'rgba(120,255,160,0.9)' : 'rgba(190,215,255,0.9)';
    const pupilColor = isAngry ? 'rgba(180,30,10,1)' : isHappy ? 'rgba(40,180,80,1)' : 'rgba(100,130,200,1)';

    // AME
    ctx.fillStyle = eyeGlow;
    ctx.beginPath(); ctx.arc(-1.8, -5.5, ameSize, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(1.8, -5.5, ameSize, 0, 6.28); ctx.fill();
    // AME pupils
    ctx.fillStyle = pupilColor;
    ctx.beginPath(); ctx.arc(-1.8, -5.5, ameSize * 0.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(1.8, -5.5, ameSize * 0.5, 0, 6.28); ctx.fill();
    // AME highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(-1.4, -5.9, 0.35, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(2.2, -5.9, 0.35, 0, 6.28); ctx.fill();

    // Anterior Lateral Eyes (ALE)
    const aleSize = 0.9;
    ctx.fillStyle = eyeGlow;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(-3.5, -4.5, aleSize, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -4.5, aleSize, 0, 6.28); ctx.fill();

    // Posterior Median Eyes (PME) — small
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(-1.2, -3.5, 0.55, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(1.2, -3.5, 0.55, 0, 6.28); ctx.fill();

    // Posterior Lateral Eyes (PLE)
    ctx.beginPath(); ctx.arc(-3.2, -3, 0.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(3.2, -3, 0.5, 0, 6.28); ctx.fill();

    ctx.globalAlpha = 1;

    // Angry eye glow effect
    if (isAngry && mi > 0.5) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,60,30,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255,80,40,0.3)';
      ctx.beginPath(); ctx.arc(-1.8, -5.5, ameSize * 1.5, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(1.8, -5.5, ameSize * 1.5, 0, 6.28); ctx.fill();
      ctx.restore();
    }

    // Happy eye sparkle
    if (isHappy && mi > 0.5) {
      ctx.save();
      ctx.shadowColor = 'rgba(120,255,160,0.5)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(180,255,200,0.4)';
      const sparkle = Math.sin(time * 0.05) * 0.3 + 0.7;
      ctx.beginPath(); ctx.arc(-1.8, -5.5, ameSize * sparkle * 1.2, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(1.8, -5.5, ameSize * sparkle * 1.2, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }

  drawExpression(ctx, s) {
    const isAngry = this.mood === 'angry';
    const isHappy = this.mood === 'happy';
    const mi = this.moodIntensity;

    if (isHappy && mi > 0.3) {
      // Happy: upward curved mouth, raised "cheeks"
      ctx.strokeStyle = `rgba(120,255,160,${0.5 * mi})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, -5, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      // Little happy marks (^_^)
      ctx.strokeStyle = `rgba(160,255,190,${0.3 * mi})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-5, -4.5); ctx.lineTo(-4.5, -5.2); ctx.lineTo(-4, -4.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -4.5); ctx.lineTo(4.5, -5.2); ctx.lineTo(5, -4.5); ctx.stroke();
    }

    if (isAngry && mi > 0.3) {
      // Angry: furrowed brow lines above AME eyes
      ctx.strokeStyle = `rgba(255,100,60,${0.6 * mi})`;
      ctx.lineWidth = 0.8;
      // Left brow — slopes inward/down
      ctx.beginPath(); ctx.moveTo(-3.5, -7.2); ctx.lineTo(-0.8, -6.5); ctx.stroke();
      // Right brow — slopes inward/down
      ctx.beginPath(); ctx.moveTo(3.5, -7.2); ctx.lineTo(0.8, -6.5); ctx.stroke();
      // Snarling mouth
      ctx.strokeStyle = `rgba(255,80,50,${0.4 * mi})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-2, -1.5);
      ctx.quadraticCurveTo(-1, -2.2, 0, -1.8);
      ctx.quadraticCurveTo(1, -2.2, 2, -1.5);
      ctx.stroke();
    }
  }

  drawLegs(ctx, s) {
    const isAngry = this.mood === 'angry';
    const crawling = this.onWeb && this.moving;
    const flying = !this.onWeb && this.moving;
    const idle = !this.moving;

    // Leg configuration: 4 pairs, each with coxa→femur→patella→tibia→tarsus
    // Each pair has progressively longer segments
    const legDefs = [
      { baseY: -4, spread: 0.6, len: s * 2.2, thick: 1.0 },   // Pair 1 (front)
      { baseY: -2, spread: 0.45, len: s * 2.6, thick: 0.9 },   // Pair 2
      { baseY: 0, spread: 0.35, len: s * 2.4, thick: 0.85 },   // Pair 3
      { baseY: 2, spread: 0.55, len: s * 2.0, thick: 0.8 },    // Pair 4 (rear)
    ];

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const def = legDefs[i];
        let waveAmt, waveSpeed;

        if (crawling) {
          // Deliberate alternating gait — opposite legs move together
          waveAmt = 0.35;
          waveSpeed = this.legPhase + i * 1.5 + (side > 0 ? Math.PI : 0);
        } else if (flying) {
          // Legs dangle and sway loosely — pulled by gravity
          waveAmt = 0.12;
          waveSpeed = this.legPhase + i * 0.5 + side * 0.3;
        } else {
          // Idle — very slight gentle shift
          waveAmt = 0.03;
          waveSpeed = this.legPhase + i * 0.6;
        }

        const wave = Math.sin(waveSpeed) * waveAmt;
        const baseAngle = (def.spread + (i - 1.5) * 0.15) * side + wave;
        const ll = def.len;

        // Joint positions (femur → patella → tibia → tarsus)
        let kx, ky, tx, ty, fx, fy;

        if (flying) {
          // Dangling — legs hang down loosely, pulled by gravity
          const dangle = Math.PI * 0.35 * side; // hang outward
          const sway = Math.sin(this.legPhase * 0.5 + i * 1.1 + side) * 0.15;
          const hangAngle = dangle + sway;

          kx = Math.cos(hangAngle) * ll * 0.3 * side;
          ky = def.baseY + ll * 0.25 + i * 1.5;
          tx = kx + Math.cos(hangAngle + 0.3 * side) * ll * 0.35 * side;
          ty = ky + ll * 0.3;
          fx = tx + Math.cos(hangAngle + 0.1 * side) * ll * 0.2 * side;
          fy = ty + ll * 0.15;
        } else {
          // Crawling / Idle — legs reach outward and grip
          kx = Math.cos(baseAngle - 1.5708) * ll * 0.4 * side;
          ky = def.baseY - ll * 0.2 + i * 1.2;
          tx = Math.cos(baseAngle - 1.5708) * ll * 0.75 * side;
          ty = def.baseY + ll * 0.05 + i * 1.8;
          fx = Math.cos(baseAngle - 1.5708) * ll * 0.95 * side;
          fy = def.baseY + ll * 0.25 + i * 2.2;

          // Crawling legs snap down at extremes (gripping motion)
          if (crawling) {
            const grip = Math.max(0, Math.sin(waveSpeed) * 0.8);
            fy += grip * 2;
          }
        }

        const legColor = isAngry
          ? `rgba(180,80,50,${0.65 - i * 0.04})`
          : `rgba(90,110,160,${0.7 - i * 0.04})`;
        const legColorLight = isAngry
          ? `rgba(200,100,70,${0.5 - i * 0.03})`
          : `rgba(110,130,180,${0.55 - i * 0.03})`;

        // Femur (thick upper segment)
        ctx.strokeStyle = legColor;
        ctx.lineWidth = def.thick;
        ctx.beginPath();
        ctx.moveTo(0, def.baseY);
        ctx.quadraticCurveTo(kx * 0.5, ky * 0.7, kx, ky);
        ctx.stroke();

        // Tibia (middle segment)
        ctx.strokeStyle = legColorLight;
        ctx.lineWidth = def.thick * 0.75;
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        ctx.quadraticCurveTo((kx + tx) * 0.5, (ky + ty) * 0.45, tx, ty);
        ctx.stroke();

        // Tarsus (thin lower segment w/ foot)
        ctx.strokeStyle = legColorLight;
        ctx.lineWidth = def.thick * 0.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(fx, fy);
        ctx.stroke();

        // Tiny joint dots
        ctx.fillStyle = legColor;
        ctx.beginPath(); ctx.arc(kx, ky, def.thick * 0.4, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(tx, ty, def.thick * 0.3, 0, 6.28); ctx.fill();

        // Leg hair (tiny spines on femur)
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = legColor; ctx.lineWidth = 0.2;
        for (let h = 0; h < 3; h++) {
          const ht = (h + 1) / 4;
          const hx = kx * ht, hy = def.baseY + (ky - def.baseY) * ht;
          ctx.beginPath(); ctx.moveTo(hx, hy);
          ctx.lineTo(hx + side * 1.5, hy - 1);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}

// ============================================================
//  WEB BUILDER
// ============================================================
class WebBuilder {
  constructor() {
    this.nodes = []; this.strands = []; this.sparkles = [];
    this.spider = new Spider(cx, cy);
    this.center = null; this.radialChains = [];
    this.repairQueue = [];
    this.breakParticles = [];
    
    this.spokeIndex = 0;
    this.spokeSegIndex = 1;
    this.ringIndex = 0;
    this.spiralRadIndex = 0;
    this.ringData = [];
    
    this.webCompleteOnce = false;
    this.wasRepairing = false;
    this.taskStartTime = Date.now();
    this.inRepairSequence = false;
  }

  start() {
    this.center = this.addNode(cx, cy, true);
    for(let i = 0; i < CFG.numRadials; i++) {
        this.radialChains.push([this.center]);
    }
    this.think();
  }

  addNode(x, y, pinned = false) { const n = new Node(x, y, pinned); this.nodes.push(n); return n; }

  addStrand(a, b, type = 'radial') {
    // Prevent doubled-up webs: Check if a strand already exists between these two nodes
    for (const s of this.strands) {
      if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return s;
    }
    const s = new Strand(a, b); s.type = type; this.strands.push(s);
    if (Math.random() < (type === 'spiral' ? 0.3 : 0.12)) this.sparkles.push(new Sparkle(s));
    audio.playStrandSound(s.restLen, type);
    return s;
  }

  getStabilityScore(node) {
    if (!node) return 0;
    // Massive weight for connectivity: the stable web structure is the best anchor
    let score = node.getConnections(this) * 100;
    // Hub is a priority, but only if it's not wildly out of place
    const drift = dist(node, { x: node.homeX, y: node.homeY });
    if (node === this.center) score += 2000;
    
    // Penalty for drifting - a node far from home is a poor anchor
    score -= drift * 2.5;

    // Being pinned is a minor stability bonus, but we'd rather anchor to the web than the wall
    if (node.pinned) score += 50; 
    // Proximity to logical screen center (cx, cy) - Increased penalty for peripheral nodes
    const dcenter = dist(node, { x: cx, y: cy });
    score -= dcenter * 0.4; 
    return score;
  }

  centerTarget() {
    // Return the hub node itself whenever possible so the spider sways with it.
    if (this.center) return this.center;
    // Fallback to nearest node to the screen center
    return this.findNearestNode(cx, cy);
  }

  // ---- PATHFINDING ----
  findNearestNode(x, y) {
    if (isNaN(x) || isNaN(y)) return this.center;
    let best = null, bestD = Infinity;
    for (const n of this.nodes) { const d = dist(n, { x, y }); if (d < bestD) { bestD = d; best = n; } }
    return best || this.center;
  }

  findPath(from, to) {
    if (from === to) return [];
    const visited = new Set([from]), parent = new Map(), queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === to) {
        const path = []; let n = to;
        while (n !== from) { path.unshift(n); n = parent.get(n); }
        return path;
      }
      for (const s of this.strands) {
        if (s.broken) continue;
        let nb = null;
        if (s.a === cur) nb = s.b; else if (s.b === cur) nb = s.a;
        if (nb && !visited.has(nb)) { visited.add(nb); parent.set(nb, cur); queue.push(nb); }
      }
    }
    return null;
  }

  crawlPath(nodes, cb) {
    if (nodes.length === 0) { if (cb) cb(); return; }
    this.spider.crawlTo(nodes[0], () => this.crawlPath(nodes.slice(1), cb));
  }

  navigateTo(target, cb, allowFly = false) {
    if (!target || isNaN(target.x)) { if (cb) cb(); return; }
    
    // Safety: If the spider isn't explicitly supposed to be holding a node, ensure it's released.
    const isNode = target instanceof Node;
    if (this.spider.grabbedNode && !this.inRepairSequence) {
        const targetingTheGrabbedNode = (target === this.spider.grabbedNode);
        if (!targetingTheGrabbedNode) {
            this.spider.releaseNode();
        }
    }

    const from = this.findNearestNode(this.spider.x, this.spider.y);
    const toNode = isNode ? target : this.findNearestNode(target.x, target.y);
    
    // Check if we are in a 'Special Action' state that permits flying (Rappelling)
    const isSpinning = this.spokeIndex < CFG.numRadials;
    const isDragging = !!this.spider.grabbedNode;
    const canFly = allowFly || isSpinning || isDragging;

    if (!from || from === toNode || dist(this.spider, target) < 15) {
      if (canFly) {
          this.spider.flyTo(target.x, target.y, cb);
      } else {
          this.spider.crawlTo(toNode, cb);
      }
      return;
    }

    const path = this.findPath(from, toNode);
    if (path && path.length > 0) {
        this.crawlPath(path, () => {
            // After crawling to the nearest node, if the final target is a coordinate and we can fly, do final leg
            if (!isNode && canFly) this.spider.flyTo(target.x, target.y, cb);
            else if (cb) cb();
        });
    } else {
        // No web path exists.
        if (canFly) {
            this.spider.flyTo(target.x, target.y, cb);
        } else {
            // STRANDED: If not allowed to fly, stay on the web.
            console.warn("Navigation: No web path found and flying is restricted. Staying put.");
            if (cb) cb();
        }
    }
  }

  spokeEnd(angle) {
    const m = 35, dx = Math.cos(angle), dy = Math.sin(angle);
    const walls = [{ a: 'x', v: m }, { a: 'x', v: W - m }, { a: 'y', v: m }, { a: 'y', v: H - m }];
    let bestT = Infinity, best = null;
    for (const w of walls) {
      let t;
      if (w.a === 'x') { if (Math.abs(dx) < 1e-6) continue; t = (w.v - cx) / dx; if (t > 0) { const iy = cy + dy * t; if (iy >= m - 1 && iy <= H - m + 1 && t < bestT) { bestT = t; best = { x: w.v, y: iy }; } } }
      else { if (Math.abs(dy) < 1e-6) continue; t = (w.v - cy) / dy; if (t > 0) { const ix = cx + dx * t; if (ix >= m - 1 && ix <= W - m + 1 && t < bestT) { bestT = t; best = { x: ix, y: w.v }; } } }
    }
    return best || { x: cx + dx * 400, y: cy + dy * 400 };
  }

  // ---- TASK EVALUATION (The Brain) ----
  think() {
    if (this.spider.busy || this.inRepairSequence) {
        // Safety: If stuck for > 3.5s, forcing a reset to center
        if (Date.now() - this.taskStartTime > 3500) {
            console.warn("Safety Recovery: Spider stuck for too long. Resetting.");
            this.spider.path = []; // Clear current path completely
            this.spider.grabbedNode = null; 
            this.spider.target = null;
            this.inRepairSequence = false; // Release lock
            this.spider.setMood('neutral');
            const home = this.centerTarget();
            this.spider.flyTo(home.x, home.y, () => {
                this.taskStartTime = Date.now();
                this.think();
            });
        }
        return; 
    }
    
    // 0. Structural Integrity Watchdog (Highest Priority)
    // If the center is drifting too far, re-home it immediately even if not broken.
    if (this.center && !this.inRepairSequence) {
        const hubDrift = dist(this.center, {x: cx, y: cy});
        if (hubDrift > 80 && !this.center.pinned) {
            console.log("Integrity Watchdog: Hub drifted. Re-centering.");
            this.inRepairSequence = true;
            this.spider.setMood('angry');
            this.navigateTo(this.center, () => {
                this.spider.grabNode(this.center);
                this.spider.flyTo(cx, cy, () => {
                    this.center.x = cx; this.center.y = cy;
                    this.spider.releaseNode();
                    this.inRepairSequence = false;
                    this.think();
                });
            });
            return;
        }
    }

    // Only reset the timer when accepting a NEW task
    this.taskStartTime = Date.now();

    // 1. Repair Tasks (Highest Priority)
    while (this.repairQueue.length > 0 && !this.repairQueue[0].broken) {
      this.repairQueue.shift();
    }
    
    // Prioritize visible structural strands (radials/spirals) over any hidden ones
    if (this.repairQueue.length > 1) {
        this.repairQueue.sort((a, b) => {
            const p = { radial: 0, spiral: 1, adhesion: 2 };
            return (p[a.type] || 0) - (p[b.type] || 0);
        });
    }

    // "Construction commitment": If we are in the middle of a spoke or a ring, 
    // finish it before switching to repairs to avoid floating loose ends.
    const midSpoke = this.spokeIndex < CFG.numRadials && this.spokeSegIndex > 1;
    const midRing = this.ringIndex < CFG.numSpiralRings && (this.spiralRadIndex > 0 || (this.ringData.length > 0 && this.spiralRadIndex === 0 && this.navigateToCenterForNextRing === false));
    // Wait, let's simplify the spiral check. 
    // If spiralRadIndex > 0, we are definitely mid-ring.
    const isCommitted = midSpoke || (this.ringIndex < CFG.numSpiralRings && this.spiralRadIndex > 0);

    if (this.repairQueue.length > 0 && !isCommitted) {
      if (!this.wasRepairing) {
        audio.playRepairStartSound();
      }
      this.wasRepairing = true;
      this.inRepairSequence = true; // LOCK the spider to this repair
      this.spider.setMood('angry');
      setStatus('Spider repairing web...');
      const strand = this.repairQueue.shift();
      let nA = strand.a, nB = strand.b;
      
      // HUB STABILIZATION:
      // If one of the nodes is the hub (center), it should be the 'anchor' 
      // and we should drag the hub back to the exact center (cx, cy).
      const aIsHub = (nA === this.center);
      const bIsHub = (nB === this.center);
      
      if (aIsHub || bIsHub) {
          if (bIsHub) { const temp = nA; nA = nB; nB = temp; }
          // If the hub is adrift, ignore its current physical location and target the logical center
          const homeX = cx, homeY = cy;
          this.navigateTo(nA, () => {
              this.spider.grabNode(nA);
              // DIRECT CARRY: Fly directly to the center while holding the hub
              this.spider.flyTo(homeX, homeY, () => {
                  nA.x = homeX; nA.y = homeY;
                  this.spider.releaseNode();
                  strand.broken = false; 
                  strand.gracePeriod = 300; 
                  strand.opacity = 0; 
                  strand.restLen = strand.origRestLen;
                  this.inRepairSequence = false;
                  this.think();
              });
          });
          return;
      }

      // Standard Repair logic (non-hub)
      // Pick the node with the HIGHER stability score to be the Anchor (nA)
      // The node with the LOWER score will be carried (nB)
      const scoreA = this.getStabilityScore(nA);
      const scoreB = this.getStabilityScore(nB);
      if (scoreA < scoreB) { const t = nA; nA = nB; nB = t; }

      this.navigateTo(nB, () => {
        this.spider.grabNode(nB);
        this.taskStartTime = Date.now(); 

        // Restoration Target: If the anchor (nA) is adrift, pull both pieces back to the anchor's HOME
        const driftA = dist(nA, {x: nA.homeX, y: nA.homeY});
        const targetX = driftA > 80 ? nA.homeX : nA.x;
        const targetY = driftA > 80 ? nA.homeY : nA.y;

        this.spider.flyTo(targetX, targetY, () => {
            if (driftA > 80) { nB.x = targetX; nB.y = targetY; }
            this.spider.releaseNode(); 
            strand.broken = false; 
            strand.gracePeriod = 300; 
            strand.opacity = 0; 
            strand.restLen = strand.origRestLen; 
            
            // Pull nearby strands back together (tension restoration)
            for (const ws of this.strands) {
                if (!ws.broken && ptSegDist(this.spider.x, this.spider.y, ws.a.x, ws.a.y, ws.b.x, ws.b.y) < 75) {
                    const curLen = dist(ws.a, ws.b);
                    if (curLen < ws.restLen * 0.85) ws.restLen = Math.max(10, curLen * 0.98);
                }
            }

            // Purge local adhesions
            for (let i = this.strands.length - 1; i >= 0; i--) {
                const hook = this.strands[i];
                if (hook.type === 'adhesion' && (hook.a === nA || hook.a === nB || hook.b === nA || hook.b === nB)) {
                    this.strands.splice(i, 1);
                }
            }

            this.inRepairSequence = false; // RELEASE lock
            this.think();
        });
      });
      return;
    }

    if (this.wasRepairing) {
      this.wasRepairing = false;
    }

    // 1.5. Maintenance Tasks (Tighten loose/flapping lines)
    // Only perform maintenance if the web is structurally sound
    if (this.spider.mood !== 'angry' && this.webCompleteOnce && this.repairQueue.length === 0 && this.center) {
        let worstSag = 0, worstStrand = null;
        for (const s of this.strands) {
             if (s.broken || s.type === 'adhesion' || s.type === 'radial') continue;
             const curL = dist(s.a, s.b);
             // Standard slack threshold for spirals
             const slackThreshold = 0.6;
             if (curL < s.restLen * slackThreshold) {
                 const sag = s.restLen - curL;
                 if (sag > worstSag) { worstSag = sag; worstStrand = s; }
             }
        }
        if (worstSag > 15) { 
            this.spider.setMood('neutral');
            setStatus('Spider tightening severely loose web...');
            this.navigateTo(worstStrand.a, () => {
                this.spider.crawlTo(worstStrand.b, () => {
                   worstStrand.restLen = Math.max(10, dist(worstStrand.a, worstStrand.b) * 0.95);
                   this.think();
                });
            });
            return;
        }
    }

    // 2. Build Spokes
    if (this.spokeIndex < CFG.numRadials && this.center && this.center.pinned) {
      this.spider.setMood('neutral');
      setStatus('Spinning radial spokes...');
      gravityOn = false; // Easier to build spokes without sagging everything
      
      const N = CFG.numRadials, segs = CFG.nodesPerRadial;
      const angle = (this.spokeIndex / N) * Math.PI * 2;
      const end = this.spokeEnd(angle);
      const chain = this.radialChains[this.spokeIndex];
      let prev = chain[chain.length - 1];

      this.navigateTo(prev, () => {
        if (this.spokeSegIndex > segs) {
          // Reached edge, pin node, reset for next spoke
          const endN = this.addNode(prev.x, prev.y, false);
          this.spider.grabNode(endN);
          this.spider.flyTo(end.x, end.y, () => {
            endN.x = end.x; endN.y = end.y; endN.pinned = true;
            this.spider.releaseNode();
            const s = this.addStrand(prev, endN, 'radial'); 
            s.gracePeriod = 120;
            chain.push(endN);
            this.spokeIndex++;
            this.spokeSegIndex = 1;
            this.navigateTo(this.centerTarget(), () => this.think());
          });
        } else {
          // Mid-air node
          if (chain[this.spokeSegIndex]) {
              this.spokeSegIndex++;
              this.think();
          } else {
              const t = this.spokeSegIndex / (segs + 1);
              const nx = cx + (end.x - cx) * t, ny = cy + (end.y - cy) * t;
              
              const n = this.addNode(prev.x, prev.y, false);
              this.spider.grabNode(n);
              this.spider.flyTo(nx, ny, () => {
                n.x = nx; n.y = ny;
                this.spider.releaseNode();
                const s = this.addStrand(prev, n, 'radial'); 
                s.gracePeriod = 60;
                chain.push(n); 
                this.spokeSegIndex++;
                this.think();
              });
          }
        }
      });
      return;
    }

    // 3. Prepare Spiral Data
    if (this.ringData.length === 0 && CFG.numSpiralRings > 0) {
      const rings = CFG.numSpiralRings, nRad = CFG.numRadials;
      for (let r = 0; r < rings; r++) {
        const ring = [], t = (r + 1.5) / (rings + 1.5);
        for (let j = 0; j < nRad; j++) {
          const chain = this.radialChains[j];
          ring.push(chain[Math.max(1, Math.min(chain.length - 1, Math.round(t * (chain.length - 1))))]);
        }
        this.ringData.push(ring);
      }
      audio.resetSpiralIndex();
    }

    // 4. Build Spiral
    if (this.ringIndex < CFG.numSpiralRings && (this.center && (this.center.pinned || dist(this.center, {x: cx, y: cy}) < 150))) {
      this.spider.setMood('neutral');
      setStatus('Weaving spiral threads...');
      
      const currRing = this.ringData[this.ringIndex];
      const startNode = currRing[this.spiralRadIndex];
      
      this.navigateTo(startNode, () => {
        const nRad = CFG.numRadials;
        const nextRadIndex = this.spiralRadIndex + 1;
        
        // Efficiency: Check if this segment already exists
        const nextNode = (nextRadIndex >= nRad) ? currRing[0] : currRing[nextRadIndex];
        let exists = false;
        for (const s of this.strands) {
            if (!s.broken && ((s.a === startNode && s.b === nextNode) || (s.a === nextNode && s.b === startNode))) {
                exists = true; break;
            }
        }
        
        if (exists) {
            this.spiralRadIndex = nextRadIndex;
            if (this.spiralRadIndex >= nRad) {
                this.ringIndex++;
                this.spiralRadIndex = 0;
            }
            this.think();
            return;
        }

        if (nextRadIndex >= nRad) {
          // Close the loop
          const endNode = currRing[0];
          this.spider.crawlTo(endNode, () => {
            this.addStrand(startNode, endNode, 'spiral');
            this.ringIndex++;
            this.spiralRadIndex = 0;
            this.think();
          });
        } else {
          // Continue the ring
          const endNode = currRing[nextRadIndex];
          this.spider.crawlTo(endNode, () => {
            this.addStrand(startNode, endNode, 'spiral');
            this.spiralRadIndex++;
            this.think();
          });
        }
      });
      return;
    }

    // 5. Complete
    if (!this.webCompleteOnce) {
      this.webCompleteOnce = true;
      this.center.pinned = false; 
      gravityOn = true;
    }

     // Idle Scuttle: Return to center hub node itself (to sway with it)
     if (!this.spider.busy && dist(this.spider, this.centerTarget()) > 15) {
       this.navigateTo(this.centerTarget());
     }

    this.spider.setMood('happy');
    setStatus('Web complete · drag to break · R restart · G gravity');
  }

  // ---- BREAKING & UPDATE ----
  breakNear(mx, my) {
    let broke = false;
    for (let i = this.strands.length - 1; i >= 0; i--) {
      const s = this.strands[i];
      if (s.broken) continue;
      if (ptSegDist(mx, my, s.a.x, s.a.y, s.b.x, s.b.y) < CFG.breakRadius) {
        s.broken = true; s.breakFade = 1.0; 
        if (s.type !== 'adhesion') {
            // Deep de-duplication: Check if a strand with these endpoints is already queued
            const alreadyQueued = this.repairQueue.some(q => 
                (q.a === s.a && q.b === s.b) || (q.a === s.b && q.b === s.a)
            );
            
            if (!alreadyQueued) {
                this.repairQueue.push(s); 
            }            // Detangle: Purge all adhesions connected to the nodes of this broken structural strand
            for (let j = this.strands.length - 1; j >= 0; j--) {
                const hook = this.strands[j];
                if (hook.type === 'adhesion' && (hook.a === s.a || hook.a === s.b || hook.b === s.a || hook.b === s.b)) {
                    this.strands.splice(j, 1);
                    if (j <= i) i--; // Adjust index
                }
            }
        }
        broke = true;
        audio.playBreakSound();
        const midX = (s.a.x + s.b.x) / 2, midY = (s.a.y + s.b.y) / 2;
        for (let p = 0; p < 5; p++) this.breakParticles.push({
          x: midX, y: midY, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 1.0
        });
      }
    }
    if (broke) {
      this.spider.setMood('angry');
      setStatus('Web damaged!');
    }
  }

  update() {
    this.spider.update();
    for (const n of this.nodes) n.update();
    for (let k = 0; k < CFG.iterations; k++) for (const s of this.strands) s.solve();
    
    // Safety Watchdog: Force release if a repair task takes way too long (spider stuck in corner/physics)
    if (this.inRepairSequence && Date.now() - this.taskStartTime > 12000) {
        this.spider.releaseNode();
        this.spider.path = [];
        this.spider.target = null;
        this.inRepairSequence = false;
        this.spider.setMood('neutral');
        this.think();
    }
    
    // ---- Overlap Snag Detection ----
    // To maintain performance, only check 1 random pair per frame if wind is blowing significantly or strands are dense
    if (this.strands.length > 20 && Math.random() < 0.2) {
      const s1 = this.strands[Math.floor(Math.random() * this.strands.length)];
       if (!s1.broken && s1.type !== 'adhesion' && s1.gracePeriod <= 0) {
        const curL = dist(s1.a, s1.b);
        // Sometimes a very saggy web just snaps on its own
        if (curL < s1.restLen * 0.4 && Math.random() < 0.05) {
           s1.broken = true; s1.breakFade = 1.0; 
           if (s1.type !== 'adhesion' && !this.repairQueue.includes(s1)) this.repairQueue.push(s1);
           audio.playBreakSound();
        } else {
          // Check for intersection with another random strand
          const s2 = this.strands[Math.floor(Math.random() * this.strands.length)];
          if (s1 !== s2 && !s2.broken && s2.type !== 'adhesion') {
            // Not connected to each other
            if (s1.a !== s2.a && s1.a !== s2.b && s1.b !== s2.a && s1.b !== s2.b) {
              if (linesIntersect(s1.a, s1.b, s2.a, s2.b)) {
                // Drop a hidden adhesion spring between the two closest endpoints to tangle them
                const dists = [
                  {n1: s1.a, n2: s2.a, d: dist(s1.a, s2.a)},
                  {n1: s1.a, n2: s2.b, d: dist(s1.a, s2.b)},
                  {n1: s1.b, n2: s2.a, d: dist(s1.b, s2.a)},
                  {n1: s1.b, n2: s2.b, d: dist(s1.b, s2.b)}
                ];
                dists.sort((a,b) => a.d - b.d);
                const closePair = dists[0];
                
                // Ghost Exclusion: NEVER form adhesions to wall anchors (pinned nodes)
                if (closePair.d < 100 && !closePair.n1.pinned && !closePair.n2.pinned) {
                  const hook = new Strand(closePair.n1, closePair.n2);
                  hook.type = 'adhesion'; hook.restLen = 5;
                  this.strands.push(hook);
                  
                  // Sometimes the friction snaps one of the tangled strands
                  // Respect repair grace period
                  if (Math.random() < 0.4 && s1.gracePeriod <= 0) {
                    s1.broken = true; s1.breakFade = 1.0;
                    if (s1.type !== 'adhesion' && !this.repairQueue.includes(s1)) this.repairQueue.push(s1);
                    audio.playBreakSound();
                  }
                }
              }
            }
          }
        }
        }
      }
      
     // Cleanup broken adhesions (they don't get repaired)
     for (let i = this.strands.length - 1; i >= 0; i--) {
       const h = this.strands[i];
       if (h.gracePeriod > 0) h.gracePeriod--;
       if (h.type === 'adhesion' && (h.broken || h.breakFade < 1.0)) this.strands.splice(i, 1);
     }

      for (let i = this.breakParticles.length - 1; i >= 0; i--) {
        const p = this.breakParticles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.025;
        if (p.life <= 0) this.breakParticles.splice(i, 1);
      }
      
      // Breaking is ALWAYS active, regardless of completion progress
      if (mouseDown) this.breakNear(mousePos.x, mousePos.y);
      
      // Let the spider evaluate its task priority list
      this.think();
    }

  draw(ctx) {
    for (const s of this.strands) s.draw(ctx);
    for (const sp of this.sparkles) sp.draw(ctx, time);
    for (const n of this.nodes) {
      if (!n.pinned) continue;
      ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, 6.28);
      ctx.fillStyle = 'rgba(150,175,220,0.4)'; ctx.fill();
    }
    for (const p of this.breakParticles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 * p.life, 0, 6.28);
      ctx.fillStyle = `rgba(255,200,140,${p.life * 0.7})`; ctx.fill();
    }
    this.spider.draw(ctx);
    if (mouseDown) {
      ctx.beginPath(); ctx.arc(mousePos.x, mousePos.y, CFG.breakRadius, 0, 6.28);
      ctx.strokeStyle = 'rgba(255,160,100,0.25)'; ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ---- BACKGROUND ----
function drawBackground() {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
  g.addColorStop(0, '#111120'); g.addColorStop(0.5, '#0a0a16'); g.addColorStop(1, '#050510');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const mx = W * 0.82, my = H * 0.13;
  const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 220);
  mg.addColorStop(0, 'rgba(100,120,180,0.14)'); mg.addColorStop(0.3, 'rgba(80,100,160,0.06)'); mg.addColorStop(1, 'transparent');
  ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.arc(mx, my, 28, 0, 6.28);
  const md = ctx.createRadialGradient(mx - 4, my - 4, 0, mx, my, 28);
  md.addColorStop(0, 'rgba(210,220,245,0.14)'); md.addColorStop(1, 'rgba(160,180,220,0.04)');
  ctx.fillStyle = md; ctx.fill();
  ctx.fillStyle = 'rgba(150,170,220,0.1)';
  for (let i = 0; i < 35; i++) {
    const px = (Math.sin(time * 0.0004 + i * 7.1) * 0.5 + 0.5) * W;
    const py = (Math.cos(time * 0.0003 + i * 3.3) * 0.5 + 0.5) * H;
    ctx.beginPath(); ctx.arc(px, py, Math.max(0.2, 0.4 + Math.sin(time * 0.0013 + i) * 0.35), 0, 6.28); ctx.fill();
  }
  const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

// ---- MAIN ----
let web = null;
function init() { gravityOn = false; web = new WebBuilder(); web.start(); }
function loop() {
  time++; drawBackground();
  if (web) { web.update(); web.draw(ctx); }
  if (mouseWind.active) {
    mouseWind.x *= CFG.windDecay; mouseWind.y *= CFG.windDecay;
    if (Math.abs(mouseWind.x) < 0.01 && Math.abs(mouseWind.y) < 0.01) mouseWind.active = false;
  }
  requestAnimationFrame(loop);
}

// ---- INPUT ----
canvas.addEventListener('mousedown', e => {
  audio.init(); audio.resume();
  mouseDown = true; mousePos.x = e.clientX; mousePos.y = e.clientY;
});
canvas.addEventListener('mousemove', e => {
  mousePos.x = e.clientX; mousePos.y = e.clientY;
  if (mouseDown) {
    mouseWind.x = e.movementX * 0.15; mouseWind.y = e.movementY * 0.15; mouseWind.active = true;
    audio.playWindSound();
  }
});
canvas.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('mouseleave', () => { mouseDown = false; });

// ---- TOUCH INPUT (Android / mobile) ----
let lastTouchX = 0, lastTouchY = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  audio.init(); audio.resume();
  const t = e.touches[0];
  mouseDown = true; mousePos.x = t.clientX; mousePos.y = t.clientY;
  lastTouchX = t.clientX; lastTouchY = t.clientY;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0];
  const movX = t.clientX - lastTouchX, movY = t.clientY - lastTouchY;
  mousePos.x = t.clientX; mousePos.y = t.clientY;
  if (mouseDown) { mouseWind.x = movX * 0.15; mouseWind.y = movY * 0.15; mouseWind.active = true; }
  lastTouchX = t.clientX; lastTouchY = t.clientY;
}, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); mouseDown = false; }, { passive: false });
canvas.addEventListener('touchcancel', e => { e.preventDefault(); mouseDown = false; }, { passive: false });

document.addEventListener('keydown', e => {
  audio.init(); audio.resume();
  if (e.key === 'r' || e.key === 'R') { resize(); init(); }
  if (e.key === 'g' || e.key === 'G') { gravityOn = !gravityOn; setStatus(gravityOn ? 'Gravity ON' : 'Gravity OFF'); }
});

document.addEventListener('click', () => {
  audio.init(); audio.resume();
});

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
    audio.init();
    audio.resume();
    overlay.classList.add('hidden');
    init(); // Start the simulation
});

loop();
