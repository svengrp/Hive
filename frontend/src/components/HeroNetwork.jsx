import { useEffect, useRef } from 'react';
import classes from './HeroNetwork.module.css';

/* Fond animé du hero : des points (les membres) dérivent et se relient quand ils
   sont proches, des signaux circulent le long des liens. Illustre l'idée de Hive
   (connecter des gens autour d'un projet). Canvas 2D, en pause hors écran,
   figé sur une seule frame si l'utilisateur préfère réduire les animations. */
const LINK_DISTANCE = 150;
const POINTER_DISTANCE = 190;
const MAX_NODES = 72;

function readRgb(name, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

const readAccent = () => readRgb('--accent-rgb', '36, 89, 214');
// Un membre sur quatre prend la teinte --highlight : des profils variés dans la ruche.
const readHighlight = () => readRgb('--highlight-rgb', '36, 89, 214');

function HeroNetwork({ pointerTarget }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pointer = { x: 0, y: 0, active: false };
    let accent = readAccent();
    let highlight = readHighlight();
    let width = 0;
    let height = 0;
    let nodes = [];
    let signals = [];
    let frame = 0;
    let running = false;
    let visible = true;
    let lastSignal = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(MAX_NODES, Math.round((width * height) / 16000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 1.2 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        highlighted: Math.random() < 0.25,
      }));
      signals = [];
    };

    const draw = (time) => {
      ctx.clearRect(0, 0, width, height);
      const links = [];
      ctx.lineWidth = 1;

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK_DISTANCE) {
            ctx.strokeStyle = `rgba(${accent}, ${(1 - dist / LINK_DISTANCE) * 0.32})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            links.push([a, b]);
          }
        }

        if (pointer.active) {
          const dist = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (dist < POINTER_DISTANCE) {
            ctx.strokeStyle = `rgba(${accent}, ${(1 - dist / POINTER_DISTANCE) * 0.55})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }

      nodes.forEach((node) => {
        ctx.fillStyle = `rgba(${node.highlighted ? highlight : accent}, ${0.55 + Math.sin(time / 900 + node.phase) * 0.25})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();
      });

      return links;
    };

    const step = (time) => {
      if (!running) return;

      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      });

      const links = draw(time);

      if (time - lastSignal > 420 && links.length > 0 && signals.length < 8) {
        const [from, to] = links[Math.floor(Math.random() * links.length)];
        signals.push({ from, to, t: 0 });
        lastSignal = time;
      }

      signals = signals.filter((signal) => {
        signal.t += 0.018;
        if (signal.t >= 1) return false;
        const x = signal.from.x + (signal.to.x - signal.from.x) * signal.t;
        const y = signal.from.y + (signal.to.y - signal.from.y) * signal.t;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 7);
        glow.addColorStop(0, `rgba(${accent}, 0.95)`);
        glow.addColorStop(1, `rgba(${accent}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });

      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduceMotion || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(step);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    resize();
    draw(0);
    start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    intersection.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    // Le thème clair/sombre change la couleur d'accent : on la relit.
    const themeObserver = new MutationObserver(() => {
      accent = readAccent();
      highlight = readHighlight();
      if (!running) draw(performance.now());
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const target = pointerTarget?.current;
    const onMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = event.pointerType === 'mouse';
    };
    const onLeave = () => {
      pointer.active = false;
    };
    if (target && !reduceMotion) {
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerleave', onLeave);
    }

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (target) {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerleave', onLeave);
      }
    };
  }, [pointerTarget]);

  return <canvas ref={canvasRef} className={classes.canvas} aria-hidden="true" />;
}

export default HeroNetwork;
