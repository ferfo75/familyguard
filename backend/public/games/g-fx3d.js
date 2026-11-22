// Utilidades compartidas por los juegos con gráficos 3D (ajedrez y generala) y por el minigolf (sonidos).
// Three.js va incluido en /games/vendor (no se descarga de internet).
import * as THREE from "./vendor/three.module.min.js";
export { THREE };

/** Celulares modestos: menos resolución y sombras más livianas para que no se trabe. */
export function isLowEnd() { return (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 3; }

/** Números al azar repetibles (para que las texturas salgan siempre iguales). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Escena 3D que solo dibuja cuando hace falta (ahorra batería). */
export function createStage(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: opts.antialias !== false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || (isLowEnd() ? 1.5 : 2)));
  renderer.shadowMap.enabled = opts.shadow !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cv = renderer.domElement;
  cv.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  container.appendChild(cv);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 38, 1, 0.1, 100);
  const anims = new Set();
  let dirty = true, raf = 0, dead = false, lost = false;

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (stage.onResize) stage.onResize(w, h);
    dirty = true; schedule();
  }
  function frame(t) {
    raf = 0;
    if (dead || lost) return;
    for (const a of [...anims]) { if (a(t) === false) anims.delete(a); }
    renderer.render(scene, camera);
    dirty = false;
    if (anims.size) schedule();
  }
  function schedule() { if (!raf && !dead) raf = requestAnimationFrame(frame); }
  const stage = {
    THREE, renderer, scene, camera, canvas: cv, onResize: null,
    invalidate() { dirty = true; schedule(); },
    /** Registra una animación: fn(ms) se llama en cada cuadro hasta que devuelve false. */
    addAnim(fn) { anims.add(fn); schedule(); return () => anims.delete(fn); },
    resize,
    dispose() { dead = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("resize", resize); try { renderer.dispose(); } catch (e) {} cv.remove(); },
  };
  cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; if (stage.onLost) stage.onLost(); });
  cv.addEventListener("webglcontextrestored", () => { lost = false; dirty = true; schedule(); });
  const ro = new ResizeObserver(resize); ro.observe(container);
  window.addEventListener("resize", resize);
  setTimeout(resize, 0);
  return stage;
}

/** Iluminación de ambiente (un "estudio" con paneles de luz) para que brillen las maderas y las piezas. */
export function envMap(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: 0x4a423b, side: THREE.BackSide }));
  room.position.y = 5; s.add(room);
  const panel = (w, h, x, y, z, rx, ry, k, color = 0xffffff) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); s.add(p);
  };
  panel(9, 9, 0, 10.5, 0, Math.PI / 2, 0, 5);
  panel(5, 7, -9.5, 5, 2, 0, Math.PI / 2, 3, 0xffe7c8);
  panel(5, 7, 9.5, 5, -2, 0, Math.PI / 2, 2.2, 0xd8e6ff);
  panel(8, 4, 0, 4, -9.5, 0, 0, 1.6);
  const tex = pm.fromScene(s, 0.03).texture;
  pm.dispose();
  return tex;
}

/** Textura de madera pintada a mano con vetas. */
export function woodTexture(size, base, dark, seed, opts = {}) {
  const r = rng(seed);
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const streaks = opts.streaks || size / 3;
  for (let i = 0; i < streaks; i++) {
    const x = r() * size, w = 0.6 + r() * 3.2, a = 0.04 + r() * 0.2;
    g.strokeStyle = dark; g.globalAlpha = a; g.lineWidth = w;
    g.beginPath();
    const ph = r() * 6.28, amp = 1 + r() * 5, fr = 0.004 + r() * 0.01;
    for (let y = 0; y <= size; y += 8) {
      const xx = x + Math.sin(y * fr + ph) * amp + Math.sin(y * 0.031 + ph * 2) * 1.2;
      if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
    }
    g.stroke();
  }
  // nudos suaves
  for (let i = 0; i < (opts.knots ?? 3); i++) {
    const x = r() * size, y = r() * size;
    for (let k = 0; k < 7; k++) {
      g.globalAlpha = 0.07; g.strokeStyle = dark; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(x, y, 5 + k * 5, 11 + k * 11, 0, 0, 6.28); g.stroke();
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Fieltro verde con grano. */
export function feltTexture(size, base, seed) {
  const r = rng(seed);
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 26; d[i] += n; d[i + 1] += n * 1.1; d[i + 2] += n * 0.8; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Sonidos sintetizados (no hace falta descargar nada). `isOn()` respeta el botón de silencio del juego. */
export function createSfx(isOn) {
  let ctx = null, noiseBuf = null;
  const get = () => {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  const tone = (f, d, type = "sine", v = 0.12, delay = 0, slide = 0) => {
    if (!isOn()) return; const c = get(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.03);
  };
  const noise = (d, v = 0.2, delay = 0, freq = 1200, type = "lowpass", q = 1) => {
    if (!isOn()) return; const c = get(); if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate); const a = noiseBuf.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t, Math.random() * 0.5, d + 0.05);
  };
  return {
    unlock() { get(); },
    tap() { tone(1100, 0.04, "sine", 0.05); },
    // ficha de madera sobre tablero
    wood() { noise(0.09, 0.5, 0, 900, "lowpass", 2); tone(170, 0.11, "sine", 0.22, 0, 90); },
    capture() { noise(0.14, 0.6, 0, 700, "lowpass", 2); tone(140, 0.16, "triangle", 0.25, 0, 60); tone(95, 0.2, "sine", 0.2, 0.04); },
    check() { tone(880, 0.12, "square", 0.07); tone(660, 0.18, "square", 0.07, 0.12); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, "triangle", 0.14, i * 0.13)); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.34, "sine", 0.12, i * 0.2)); },
    draw() { tone(440, 0.25, "triangle", 0.1); tone(440, 0.25, "triangle", 0.1, 0.22); },
    // dados rodando y cayendo
    rattle() { for (let i = 0; i < 9; i++) noise(0.045, 0.28, i * 0.065 + Math.random() * 0.03, 1800 + Math.random() * 1600, "bandpass", 3); },
    diceLand() { noise(0.07, 0.4, 0, 1500, "bandpass", 2); tone(230, 0.08, "sine", 0.14, 0, 130); },
    score() { tone(660, 0.12, "triangle", 0.1); tone(990, 0.16, "triangle", 0.1, 0.09); },
    // minigolf
    hit(p = 0.5) { noise(0.05, 0.5, 0, 2400, "bandpass", 3); tone(240 + p * 160, 0.1, "square", 0.12, 0, 120); },
    bounce(p = 0.5) { tone(300 + Math.random() * 120, 0.05, "triangle", 0.05 + p * 0.08); noise(0.03, 0.12 * p + 0.05, 0, 3000, "highpass"); },
    bump() { tone(520, 0.12, "sine", 0.14, 0, 900); tone(780, 0.1, "triangle", 0.08, 0.03); },
    splash() { noise(0.45, 0.45, 0, 1400, "lowpass", 0.7); tone(300, 0.3, "sine", 0.1, 0, 90); },
    plop() { tone(520, 0.1, "sine", 0.2, 0, 160); tone(210, 0.18, "sine", 0.2, 0.08, 120); },
    cheer() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.11, i * 0.08)); noise(0.7, 0.15, 0, 3200, "bandpass", 0.6); },
    portal() { tone(300, 0.25, "sine", 0.1, 0, 1200); tone(1200, 0.2, "sine", 0.08, 0.15, 300); },
  };
}
