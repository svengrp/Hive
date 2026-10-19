import { useEffect, useRef } from "react";
import classes from "./HiveFacade.module.css";

/* Façade cinétique de l'étape prénom : un mur d'alvéoles montées sur pivot, comme les
   façades d'architecte qui ondulent au vent. Chaque plaquette est un ressort amorti :
   le pointeur les fait basculer dans le sens de son mouvement (les plus proches se
   retournent et montrent leur face bleue), chaque lettre tapée envoie une onde depuis
   le curseur du champ, et une brise passe de temps en temps. Le mur se déplie en
   cascade à l'arrivée. Dessiné en canvas : physique et lumière par plaquette, boucle
   arrêtée dès que tout est immobile. */

const ROOT3 = Math.sqrt(3);
// Ressort : raideur et amortissement (unités par seconde)
const STIFFNESS = 60;
const DAMPING = 3.4;
const MAX_SPIN = 46;
// Lumière venant d'en haut à gauche, légèrement de face
const LIGHT = (() => {
  const v = [-0.38, -0.56, 0.74];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

const parseColor = (value, fallback) => {
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

export default function HiveFacade({ inputRef, value }) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let radius = 10;
    let hexPath = null;
    let count = 0;
    let cx, cy, theta, omega, axis, fade, born;
    let palette = null;
    let rings = [];
    let frame = 0;
    let last = 0;
    let gustTimer = 0;
    let introTimer = 0;

    const readPalette = () => {
      const style = getComputedStyle(canvas);
      const bg = parseColor(style.getPropertyValue("--bg-main"), [12, 13, 16]);
      const card = parseColor(style.getPropertyValue("--bg-card"), [22, 24, 29]);
      const text = parseColor(style.getPropertyValue("--text-main"), [236, 237, 240]);
      const accent = parseColor(style.getPropertyValue("--accent"), [91, 141, 239]);
      palette = {
        face: card,
        lit: mix(card, text, 0.42),
        shade: mix(card, bg, 0.85),
        back: accent,
        backShade: mix(accent, bg, 0.62),
      };
    };

    const build = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      radius = width < 600 ? 8 : 10.5;
      const inner = radius - (width < 600 ? 1.1 : 1.4);
      hexPath = new Path2D();
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        hexPath[i ? "lineTo" : "moveTo"](Math.cos(a) * inner, Math.sin(a) * inner);
      }
      hexPath.closePath();

      const stepX = ROOT3 * radius;
      const stepY = 1.5 * radius;
      const cols = Math.ceil(width / stepX) + 2;
      const rows = Math.ceil(height / stepY) + 2;
      const wasBorn = born ? born.some(Boolean) : false;
      count = cols * rows;
      cx = new Float32Array(count);
      cy = new Float32Array(count);
      theta = new Float32Array(count);
      omega = new Float32Array(count);
      axis = new Float32Array(count);
      fade = new Float32Array(count);
      // Redimensionné après l'arrivée : le mur est déjà là, pas de nouveau dépliage
      born = new Uint8Array(count).fill(reduced || wasBorn ? 1 : 0);
      rings = [];
      let i = 0;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const x = (c - 1) * stepX + (r % 2 ? stepX / 2 : 0);
          const y = (r - 1) * stepY + radius * 0.5;
          cx[i] = x;
          cy[i] = y;
          // Le mur se fond dans la page : fondu sur les côtés, plus long en haut
          const side = smooth(Math.min(x, width - x) / (width * 0.16));
          const top = smooth(y / (height * 0.5));
          const bottom = smooth((height - y) / (height * 0.14));
          fade[i] = side * top * bottom;
          i += 1;
        }
      }
    };

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { face, lit, shade, back, backShade } = palette;
      const restLight = LIGHT[2];
      for (let i = 0; i < count; i += 1) {
        const a = fade[i];
        if (!born[i] || a < 0.01) continue;
        const t = theta[i];
        const cosT = Math.cos(t);
        const sinT = Math.sin(t);
        const c = Math.cos(axis[i]);
        const s = Math.sin(axis[i]);
        // Rotation autour de l'axe : écrasement perpendiculaire à l'axe, et la
        // plaquette qui bascule vient légèrement vers nous
        const lift = 1 + 0.16 * Math.abs(sinT);
        const m11 = (c * c + cosT * s * s) * lift;
        const m12 = c * s * (1 - cosT) * lift;
        const m22 = (s * s + cosT * c * c) * lift;
        ctx.setTransform(m11 * dpr, m12 * dpr, m12 * dpr, m22 * dpr, cx[i] * dpr, cy[i] * dpr);

        // Normale de la plaquette inclinée, éclairée par LIGHT
        const light = sinT * (s * LIGHT[0] - c * LIGHT[1]) + cosT * LIGHT[2];
        let color;
        if (cosT >= 0) {
          color = light >= restLight
            ? mix(face, lit, clamp01(((light - restLight) / (1 - restLight)) * 1.4))
            : mix(face, shade, clamp01((restLight - light) / restLight));
        } else {
          color = mix(backShade, back, clamp01(-light * 1.25));
        }
        ctx.globalAlpha = a * (0.82 + 0.18 * Math.abs(sinT));
        ctx.fillStyle = rgb(color);
        ctx.fill(hexPath);
      }
      ctx.globalAlpha = 1;
    };

    const step = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
      last = now;
      const time = now / 1000;
      let energy = 0;

      // Ondes : chaque plaquette reçoit une impulsion quand le front la traverse
      rings = rings.filter((ring) => {
        const front = (time - ring.start) * ring.speed;
        for (let i = 0; i < count; i += 1) {
          if (ring.hit[i]) continue;
          const dx = cx[i] - ring.x;
          const dy = cy[i] - ring.y;
          const d = Math.hypot(dx, dy);
          if (d > front) continue;
          ring.hit[i] = 1;
          if (ring.birth && !born[i]) {
            born[i] = 1;
            // Elle arrive presque de profil et se déplie
            theta[i] = 1.45;
            omega[i] = 0;
          } else if (born[i]) {
            omega[i] += ring.strength * Math.max(0.25, 1 - d / ring.reach);
          }
          axis[i] = Math.atan2(dy, dx) + Math.PI / 2;
        }
        return front < ring.reach;
      });

      for (let i = 0; i < count; i += 1) {
        if (!born[i]) continue;
        omega[i] += (-STIFFNESS * theta[i] - DAMPING * omega[i]) * dt;
        theta[i] += omega[i] * dt;
        energy += Math.abs(theta[i]) + Math.abs(omega[i]) * 0.1;
      }

      draw();
      if (rings.length || energy > 0.002 * count) {
        frame = requestAnimationFrame(step);
      } else {
        theta.fill(0);
        omega.fill(0);
        draw();
        frame = 0;
      }
    };

    const wake = () => {
      if (reduced || frame) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };

    const addRing = (ring) => {
      rings.push({ hit: new Uint8Array(count), start: performance.now() / 1000, ...ring });
      wake();
    };

    // ---------- Pointeur : les plaquettes basculent dans le sens du mouvement ----------
    let prev = null;
    const local = (event) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const onMove = (event) => {
      if (reduced) return;
      const { x, y } = local(event);
      if (!prev) { prev = { x, y }; return; }
      const mx = x - prev.x;
      const my = y - prev.y;
      const moved = Math.hypot(mx, my);
      if (moved < 0.5) return;
      const reach = radius * 7;
      const heading = Math.atan2(my, mx) + Math.PI / 2;
      for (let i = 0; i < count; i += 1) {
        if (!born[i]) continue;
        // Distance au segment parcouru depuis le dernier événement
        const px = cx[i] - prev.x;
        const py = cy[i] - prev.y;
        const along = clamp01((px * mx + py * my) / (moved * moved));
        const d = Math.hypot(px - mx * along, py - my * along);
        if (d > reach) continue;
        const falloff = (1 - d / reach) ** 2;
        if (Math.abs(theta[i]) < 0.35) axis[i] = heading;
        omega[i] = Math.min(MAX_SPIN, omega[i] + moved * 0.95 * falloff);
      }
      prev = { x, y };
      wake();
    };
    const onLeave = () => { prev = null; };
    const onDown = (event) => {
      if (reduced) return;
      prev = local(event);
      addRing({ ...prev, speed: 520, strength: 16, reach: 260 });
    };

    // ---------- Brise : une onde lente et douce, de temps en temps ----------
    const scheduleGust = () => {
      gustTimer = setTimeout(() => {
        if (!document.hidden) {
          const fromLeft = Math.random() < 0.5;
          addRing({
            x: fromLeft ? -width * 0.6 : width * 1.6,
            y: height * (0.2 + Math.random() * 0.6),
            speed: 380,
            strength: 2.6,
            reach: width * 2.4,
          });
        }
        scheduleGust();
      }, 6500 + Math.random() * 4000);
    };

    readPalette();
    build();
    draw();
    if (!reduced) {
      // Le mur se déplie depuis le titre, au-dessus de lui
      introTimer = setTimeout(() => {
        addRing({ x: width * 0.32, y: -height * 0.25, speed: 620, strength: 0, reach: Math.hypot(width, height) * 1.4, birth: true });
      }, 450);
      scheduleGust();
    }

    apiRef.current = {
      ripple: (clientX) => {
        if (reduced) return;
        const box = canvas.getBoundingClientRect();
        addRing({ x: clientX - box.left, y: -radius * 2, speed: 700, strength: 13, reach: height * 1.6 });
      },
    };

    const resize = new ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      if (Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1) return;
      build();
      draw();
    });
    resize.observe(canvas);
    const themeWatch = new MutationObserver(() => { readPalette(); draw(); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(gustTimer);
      clearTimeout(introTimer);
      resize.disconnect();
      themeWatch.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      apiRef.current = null;
    };
  }, []);

  // Chaque lettre tapée envoie une onde depuis le curseur du champ
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const input = inputRef.current;
    if (!input || !apiRef.current) return;
    const style = getComputedStyle(input);
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const box = input.getBoundingClientRect();
    const caret = box.left + parseFloat(style.paddingLeft) + measure.measureText(value).width;
    apiRef.current.ripple(Math.min(caret, box.right));
  }, [value, inputRef]);

  return <canvas ref={canvasRef} className={classes.facade} aria-hidden="true" />;
}
