import { useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import classes from "./OnboardingFox.module.css";

/* Le renard du parcours de bienvenue (WebGL). Il accompagne la personne d'étape en
   étape : à chaque étape il saute jusqu'à son perchoir, à côté de ce qu'il faut remplir.
   Il regarde la souris, le curseur du champ pendant l'écriture, le choix qu'on vient
   de faire ; il hoche la tête à chaque choix et saute en tournant sur lui-même quand
   une étape est remplie. Survolé, il se tasse et sourit.

   Perchoirs (attributs posés par Onboarding) :
   - data-fox-perch="beside" | "besideTop" | "top" : à droite de l'élément (pieds sur
     son bord bas, ou à hauteur de son haut), ou debout sur son bord haut ;
   - sur téléphone, il se tient sur la ligne de la barre du bas (data-fox-floor), à
     la position data-fox-x (0 à 1) ; sans barre, sur data-fox-perch-mobile. */

const ORANGE = "#ec6419";
const CREAM = "#fff1e0";
const INNER_EAR = "#ffd6bd";
const SOCK = "#3a2216";
const INK = "#24150e";
// Le foulard porte le bleu de Hive (celui des boutons)
const SCARF = "#2f6fe4";

const MOBILE = 600;
const TYPING_FOCUS = 1500;
const POINTER_FOCUS = 3500;
const LOOK_FOCUS = 1200;
const SETTLE_DELAY = 800;
const SPIN_TIME = 0.95;

function tailGeometry() {
  // Queue touffue : un tube dont le rayon varie, fin à la base, rond au bout crème
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.34, 0.06, -0.12),
    new THREE.Vector3(0.62, 0.4, -0.02),
    new THREE.Vector3(0.6, 0.86, 0.14),
  ]);
  const T = 56;
  const R = 24;
  const geometry = new THREE.TubeGeometry(curve, T, 1, R);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const orange = new THREE.Color(ORANGE);
  const cream = new THREE.Color(CREAM);
  const mix = new THREE.Color();
  const center = new THREE.Vector3();
  const p = new THREE.Vector3();
  const profile = (t) => 0.09 + 0.2 * Math.sin(Math.PI * t) ** 0.7;
  const r85 = profile(0.85);
  for (let i = 0; i <= T; i += 1) {
    const t = i / T;
    const r = t < 0.85 ? profile(t) : r85 * Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2));
    curve.getPointAt(t, center);
    mix.copy(orange).lerp(cream, THREE.MathUtils.smoothstep(t, 0.7, 0.78));
    for (let j = 0; j <= R; j += 1) {
      const k = i * (R + 1) + j;
      p.fromBufferAttribute(pos, k).sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(k, p.x, p.y, p.z);
      colors.set([mix.r, mix.g, mix.b], k * 3);
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildFox() {
  const sphere = new THREE.SphereGeometry(1, 48, 32);
  // Style dessin animé : aplats de couleur et trois niveaux d'ombre francs (toon)
  const steps = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1);
  steps.minFilter = THREE.NearestFilter;
  steps.magFilter = THREE.NearestFilter;
  steps.needsUpdate = true;
  const toon = (options) => new THREE.MeshToonMaterial({ gradientMap: steps, ...options });
  const materials = {
    orange: toon({ color: ORANGE }),
    cream: toon({ color: CREAM }),
    innerEar: toon({ color: INNER_EAR }),
    sock: toon({ color: SOCK }),
    tail: toon({ vertexColors: true }),
    ink: toon({ color: INK }),
    scarf: toon({ color: SCARF }),
    glint: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  };
  materials.steps = steps;
  const blob = (material, s, at, parent) => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.scale.set(...s);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };

  const root = new THREE.Group(); // au sol : écrasement
  const facing = new THREE.Group(); // orientation pendant les sauts
  root.add(facing);

  // ---------- Corps assis ----------
  const body = new THREE.Group();
  facing.add(body);
  blob(materials.orange, [0.6, 0.64, 0.55], [0, 0.62, 0], body);
  blob(materials.cream, [0.34, 0.42, 0.22], [0, 0.66, 0.4], body);
  blob(materials.orange, [0.22, 0.14, 0.32], [-0.4, 0.13, 0.1], body);
  blob(materials.orange, [0.22, 0.14, 0.32], [0.4, 0.13, 0.1], body);
  [-0.19, 0.19].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.3, 8, 16), materials.sock);
    leg.position.set(x, 0.3, 0.36);
    body.add(leg);
    blob(materials.sock, [0.13, 0.09, 0.17], [x, 0.08, 0.42], body);
  });

  // Foulard : un tour de cou sous la tête et une pointe de bandana sur le poitrail
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.095, 16, 48), materials.scarf);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 0.93, 1);
  collar.position.y = 0.98;
  const triangle = new THREE.Shape([new THREE.Vector2(-0.22, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0, -0.3)]);
  const flap = new THREE.Mesh(
    new THREE.ExtrudeGeometry(triangle, { depth: 0.04, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 }),
    materials.scarf,
  );
  flap.rotation.x = -0.28;
  flap.position.set(0, 0.97, 0.6);
  body.add(collar, flap);

  const tail = new THREE.Group();
  tail.position.set(0.3, 0.22, -0.32);
  tail.add(new THREE.Mesh(tailGeometry(), materials.tail));
  body.add(tail);

  // ---------- Tête ----------
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0.04);
  facing.add(head);
  blob(materials.orange, [0.66, 0.56, 0.58], [0, 0.3, 0], head);
  blob(materials.cream, [0.3, 0.22, 0.28], [-0.4, 0.13, 0.22], head);
  blob(materials.cream, [0.3, 0.22, 0.28], [0.4, 0.13, 0.22], head);
  blob(materials.cream, [0.28, 0.2, 0.3], [0, 0.14, 0.42], head);
  blob(materials.ink, [0.085, 0.066, 0.07], [0, 0.22, 0.72], head);

  const eyes = [];
  [-0.22, 0.22].forEach((x) => {
    const eye = new THREE.Group();
    eye.position.set(x, 0.38, 0.5);
    eye.rotation.y = x * 1.4;
    blob(materials.ink, [0.075, 0.1, 0.05], [0, 0, 0], eye);
    blob(materials.glint, [0.024, 0.024, 0.02], [-0.022, 0.035, 0.04], eye);
    head.add(eye);
    eyes.push(eye);
  });

  const ears = [];
  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.33, 0.68, -0.04);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.58, 32), materials.orange);
    outer.position.y = 0.25;
    outer.scale.z = 0.55;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.145, 0.38, 32), materials.innerEar);
    inner.position.set(0, 0.19, 0.07);
    inner.scale.z = 0.35;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 32), materials.sock);
    tip.position.y = 0.44;
    tip.scale.z = 0.6;
    ear.add(outer, inner, tip);
    head.add(ear);
    ears.push({ group: ear, side, angle: 0, speed: 0 });
  });

  return { root, facing, body, head, tail, eyes, ears, materials };
}

export default function OnboardingFox({ ref, hidden }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const api = useRef({});

  useImperativeHandle(ref, () => ({
    typing: (input, options) => api.current.typing?.(input, options),
    nod: () => api.current.nod?.(),
    cheer: () => api.current.cheer?.(),
  }), []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const overlay = wrap.parentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
    camera.position.set(0, 1.55, 8.9);
    camera.lookAt(0, 1.22, 0);

    // Une lumière principale en haut à gauche et une ambiance douce : les couleurs
    // restent vives, l'ombre ne tombe que d'un cran
    const key = new THREE.DirectionalLight("#ffffff", 2.2);
    key.position.set(-3, 4, 5);
    scene.add(key, new THREE.AmbientLight("#ffffff", 1.1));

    const fox = buildFox();
    scene.add(fox.root);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // ---------- État ----------
    const s = {
      x: null, y: null, // position dans le parcours (px, coin haut gauche du renard)
      travel: null, // saut en cours vers un nouveau perchoir
      gx: 0, gy: 0,
      squash: 0, squashV: 0,
      nod: 0, nodV: 0,
      blink: 0, blinkTarget: 0, happy: 0, happyUntil: 0,
      spinAt: -10, landed: false, wag: 0, facing: 0,
      idle: null, idleAt: 0,
    };
    const look = { pointer: null, pointerAt: 0, caret: null, typedAt: 0, spot: null, spotAt: 0 };
    const now = () => performance.now() / 1000;

    const cheer = () => {
      const t = now();
      if (t - s.spinAt < SPIN_TIME) return;
      s.spinAt = t;
      s.happyUntil = Math.max(s.happyUntil, t + 1.6);
    };
    const nod = () => {
      s.nodV += 7;
      s.happyUntil = Math.max(s.happyUntil, now() + 0.7);
      if (look.pointer) { look.spot = look.pointer; look.spotAt = performance.now(); }
    };
    const poke = () => {
      s.squashV -= 3;
      s.happyUntil = Math.max(s.happyUntil, now() + 1.1);
    };

    let settleTimer = 0;
    const settled = new WeakMap();
    const typing = (input, { cheerOnPause } = {}) => {
      const style = getComputedStyle(input);
      const measure = document.createElement("canvas").getContext("2d");
      measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const box = input.getBoundingClientRect();
      const x = box.left + parseFloat(style.paddingLeft) + measure.measureText(input.value).width;
      look.caret = { x: Math.min(x, box.right), y: box.top + box.height / 2 };
      look.typedAt = performance.now();
      clearTimeout(settleTimer);
      const text = input.value.trim();
      if (!text || settled.get(input) === text) return;
      settleTimer = setTimeout(() => {
        settled.set(input, text);
        if (cheerOnPause) cheer(); else nod();
      }, SETTLE_DELAY);
    };
    api.current = { typing, nod, cheer };

    // ---------- Perchoir de l'étape en cours ----------
    const perch = () => {
      const o = overlay.getBoundingClientRect();
      const w = wrap.offsetWidth;
      const h = wrap.offsetHeight;
      const target = overlay.querySelector("[data-fox-perch]");
      if (!target) return null;
      const floor = overlay.querySelector("[data-fox-floor]");
      const frac = parseFloat(target.dataset.foxX || "0.85");
      const onFloor = () => {
        const f = floor.getBoundingClientRect();
        // Debout sur la bordure haute de la barre du bas, à une place qui ne cache
        // aucun bouton ni champ (sinon il s'efface)
        const line = floor.closest("footer").getBoundingClientRect().top - o.top;
        const controls = [...overlay.querySelectorAll("main button, main input, main select, main a")]
          .map((el) => el.getBoundingClientRect());
        const y = line - h + 1;
        for (const at of [frac, 0.9, 0.5, 0.1]) {
          const x = THREE.MathUtils.clamp(f.left - o.left + at * f.width - w / 2, 8, o.width - w - 8);
          const left = o.left + x + 10;
          const right = o.left + x + w - 10;
          const top = o.top + y + 8;
          const bottom = o.top + y + h;
          const covers = controls.some((r) => r.right > left && r.left < right && r.bottom > top && r.top < bottom);
          if (!covers) return { x, y };
        }
        return { x: s.x ?? 0, y, away: true };
      };
      const onTop = (el) => {
        const b = el.getBoundingClientRect();
        return { x: Math.min(b.right - o.left - w - 12, o.width - w - 8), y: b.top - o.top - h };
      };
      if (o.width <= MOBILE) {
        const alt = overlay.querySelector("[data-fox-perch-mobile]");
        if (alt) return onTop(alt);
        return floor ? onFloor() : onTop(target);
      }
      const mode = target.dataset.foxPerch;
      if (mode === "top") return onTop(target);
      const b = target.getBoundingClientRect();
      const x = b.right - o.left + 18;
      if (x + w > o.width - 8) return floor ? onFloor() : onTop(target);
      const feet = mode === "besideTop" ? b.top - o.top + h * 0.95 : b.bottom - o.top;
      return { x, y: feet - h };
    };

    // ---------- Pointeur ----------
    const onPointerMove = (event) => {
      look.pointer = { x: event.clientX, y: event.clientY };
      look.pointerAt = performance.now();
    };
    let pokedAt = 0;
    const onEnter = () => {
      if (now() - pokedAt < 0.9) return;
      pokedAt = now();
      poke();
    };
    window.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerdown", cheer);

    // ---------- Clignements, oreilles qui frémissent ----------
    let blinkTimer = 0;
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        const close = () => { s.blinkTarget = 1; setTimeout(() => { s.blinkTarget = 0; }, 110); };
        close();
        if (Math.random() < 0.25) setTimeout(close, 260);
        if (Math.random() < 0.4) fox.ears[Math.random() < 0.5 ? 0 : 1].speed += 9;
        scheduleBlink();
      }, 2000 + Math.random() * 3400);
    };
    if (!reduced) scheduleBlink();

    // ---------- Boucle ----------
    let frame = 0;
    let last = now();
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

    const tick = () => {
      const t = now();
      const dt = Math.min(0.05, t - last);
      last = t;
      const ms = t * 1000;

      // Déplacement : il saute d'un perchoir à l'autre, sinon il suit (défilement, taille)
      if (!s.goalAt || t - s.goalAt > 0.25) { s.goal = perch(); s.goalAt = t; }
      const goal = s.goal && !s.goal.away ? s.goal : null;
      wrap.style.opacity = s.goal?.away ? "0" : "";
      if (goal) {
        if (s.x === null) {
          // Arrivée : il entre par la droite en sautant
          s.x = overlay.getBoundingClientRect().width + 20;
          s.y = goal.y - 30;
          s.travel = { from: { x: s.x, y: s.y }, to: goal, start: t + 0.6, time: 0.9 };
        } else if (s.travel) {
          s.travel.to = goal;
        } else if (Math.hypot(goal.x - s.x, goal.y - s.y) > 30) {
          const dist = Math.hypot(goal.x - s.x, goal.y - s.y);
          s.travel = { from: { x: s.x, y: s.y }, to: goal, start: t, time: THREE.MathUtils.clamp(0.45 + dist / 900, 0.55, 1.05) };
        } else {
          const follow = 1 - Math.exp(-dt * 14);
          s.x += (goal.x - s.x) * follow;
          s.y += (goal.y - s.y) * follow;
        }
      }

      let airborne = 0;
      if (s.travel) {
        const { from, to, start, time } = s.travel;
        const p = reduced ? 1 : (t - start) / time;
        if (p >= 0) {
          const k = Math.min(1, p);
          const e = easeInOut(k);
          const apex = Math.max(50, Math.abs(to.x - from.x) * 0.22) + Math.max(0, from.y - to.y) * 0.3;
          s.x = from.x + (to.x - from.x) * e;
          s.y = from.y + (to.y - from.y) * e - apex * 4 * k * (1 - k);
          airborne = Math.sin(Math.PI * k);
          s.facing = Math.sign(to.x - from.x || 1) * 1.15 * airborne;
          if (k === 1) {
            s.travel = null;
            s.squashV -= 3.4;
            s.facing = 0;
          }
        }
      }

      // Saut de joie sur place, avec un tour complet
      const sp = reduced ? 1 : (t - s.spinAt) / SPIN_TIME;
      let spin = 0;
      let hop = 0;
      if (sp >= 0 && sp < 1) {
        if (sp < 0.15) {
          s.squash += (-0.18 - s.squash) * (1 - Math.exp(-dt * 30));
          s.squashV = 0;
        } else if (sp < 0.8) {
          const air = (sp - 0.15) / 0.65;
          hop = Math.sin(air * Math.PI) * 34;
          spin = easeInOut(air) * Math.PI * 2;
          if (air < 0.1) s.squashV += 2.4;
        } else if (!s.landed) {
          s.landed = true;
          s.squashV -= 3.4;
        }
      } else {
        s.landed = false;
      }
      if (s.x !== null) wrap.style.transform = `translate3d(${s.x.toFixed(1)}px, ${(s.y - hop).toFixed(1)}px, 0)`;

      // Regard : choix qu'on vient de faire, curseur du champ, souris, sinon il rêvasse
      let target = null;
      if (look.spot && ms - look.spotAt < LOOK_FOCUS) target = look.spot;
      else if (look.caret && ms - look.typedAt < TYPING_FOCUS) target = look.caret;
      else if (look.pointer && ms - look.pointerAt < POINTER_FOCUS) target = look.pointer;
      let nx = 0;
      let ny = 0;
      if (target) {
        const box = canvas.getBoundingClientRect();
        const dx = target.x - (box.left + box.width / 2);
        const dy = target.y - (box.top + box.height * 0.3);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 300);
        nx = (dx / d) * reach;
        ny = (dy / d) * reach;
      } else if (!reduced) {
        if (t - s.idleAt > 2.6 + Math.random() * 2) {
          s.idleAt = t;
          s.idle = Math.random() < 0.4 ? null : { x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.6) * 0.9 };
        }
        if (s.idle) { nx = s.idle.x; ny = s.idle.y; }
      }
      const follow = 1 - Math.exp(-dt * 8);
      s.gx += (nx - s.gx) * follow;
      s.gy += (ny - s.gy) * follow;

      // Ressorts : écrasement du corps, hochement de tête, oreilles
      s.squashV += (-170 * s.squash - 10 * s.squashV) * dt;
      s.squash += s.squashV * dt;
      s.nodV += (-120 * s.nod - 9 * s.nodV) * dt;
      s.nod += s.nodV * dt;
      const breath = reduced ? 0 : Math.sin(t * 2) * 0.014;
      const sy = 1 + s.squash + breath + airborne * 0.06;
      const sxz = 1 - (s.squash + breath) * 0.5 - airborne * 0.03;
      fox.root.scale.set(sxz, sy, sxz);

      fox.facing.rotation.y = s.facing + spin;
      fox.head.rotation.y = s.gx * 0.75 * (1 - airborne);
      fox.head.rotation.x = s.gy * 0.38 + s.nod * 0.12;
      fox.head.rotation.z = -s.gx * 0.08;
      fox.body.rotation.y = s.gx * 0.18 * (1 - airborne);

      const happy = t < s.happyUntil ? 1 : 0;
      s.happy += (happy - s.happy) * (1 - Math.exp(-dt * 12));
      s.blink += (s.blinkTarget - s.blink) * (1 - Math.exp(-dt * 40));
      const open = Math.max(0.1, 1 - s.blink * 0.9 - s.happy * 0.62);
      fox.eyes.forEach((eye) => { eye.scale.y = open; });

      // La queue balaie, plus vite quand il est content ; elle traîne pendant les sauts
      s.wag += dt * (reduced ? 0 : 2.2 + s.happy * 7);
      fox.tail.rotation.y = Math.sin(s.wag) * (0.16 + s.happy * 0.28) - airborne * 0.5;
      fox.tail.rotation.z = Math.sin(s.wag * 0.5) * 0.05 + airborne * 0.35;

      fox.ears.forEach((ear) => {
        ear.speed += (-220 * ear.angle - 11 * ear.speed) * dt;
        ear.angle += ear.speed * dt;
        ear.group.rotation.z = -ear.side * (0.32 + ear.angle * 0.25 + s.happy * 0.08);
        ear.group.rotation.x = -airborne * 0.35;
      });

      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) { last = now(); frame = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(blinkTimer);
      clearTimeout(settleTimer);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerdown", cheer);
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = {};
      scene.traverse((node) => { if (node.isMesh) node.geometry.dispose(); });
      Object.values(fox.materials).forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`${classes.fox} ${hidden ? classes.hidden : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className={classes.canvas} />
    </div>
  );
}
