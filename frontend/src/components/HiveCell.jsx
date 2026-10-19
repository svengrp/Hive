import { useEffect, useRef, useState } from "react";
import classes from "./HiveCell.module.css";

/* Le logo Hive en grand, à l'étape prénom. Deux alvéoles pleines, une alvéole ouverte :
   celle de la personne qui arrive. Chaque lettre tapée y verse un peu de bleu ; dès
   qu'on s'arrête d'écrire, l'alvéole se remplit, s'emboîte dans les deux autres et
   l'initiale apparaît en creux, comme découpée dans le logo.
   Mêmes coordonnées que img/logoHive.svg (viewBox 64 × 64). */

const hex = (cx, cy, r) => {
  const dx = r * 0.866;
  return `${cx},${cy - r} ${cx + dx},${cy - r / 2} ${cx + dx},${cy + r / 2} ${cx},${cy + r} ${cx - dx},${cy + r / 2} ${cx - dx},${cy - r / 2}`;
};

const CELLS = [
  { id: "a", cx: 20.22, cy: 21.8, r: 10.6 },
  { id: "b", cx: 43.78, cy: 21.8, r: 10.6 },
];
const OPEN = { id: "open", cx: 32, cy: 42.2, r: 10.5 };
const OPEN_POINTS = hex(OPEN.cx, OPEN.cy, OPEN.r);
// Cadré au plus près des alvéoles (traits compris)
const VIEW = { x: 8.5, y: 9.4, w: 47, h: 45.2 };

// Hauteur de la surface du bleu dans l'alvéole ouverte (unités du viewBox)
const EMPTY_Y = 54.5;
const FULL_Y = 29;
const SEAL_DELAY = 650;
// Attraction vers le pointeur : rayon en px écran, déplacement max en unités du viewBox
const PULL_RADIUS = 240;
const PULL_MAX = 1.4;

// Vague de 12 unités de long, assez large pour couvrir l'alvéole pendant qu'elle glisse
const WAVE = "M8 0 Q11 -0.9 14 0 T20 0 T26 0 T32 0 T38 0 T44 0 T50 0 T56 0 T62 0 V30 H8 Z";

export default function HiveCell({ name }) {
  const trimmed = name.trim();
  const initial = trimmed.charAt(0).toUpperCase();
  const [arrived, setArrived] = useState(false);
  const [sealed, setSealed] = useState(Boolean(trimmed));
  const [seals, setSeals] = useState(0);
  const [pours, setPours] = useState(0);
  const firstRun = useRef(true);

  // Le bleu n'arrive qu'une fois le contour de l'alvéole dessiné
  useEffect(() => {
    const id = setTimeout(() => setArrived(true), 1500);
    return () => clearTimeout(id);
  }, []);

  // Écrire verse du bleu ; une courte pause scelle l'alvéole
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    setSealed(false);
    if (!trimmed) return undefined;
    setPours((n) => n + 1);
    const id = setTimeout(() => { setSealed(true); setSeals((n) => n + 1); }, SEAL_DELAY);
    return () => clearTimeout(id);
  }, [name, trimmed]);

  // Les alvéoles se penchent légèrement vers le pointeur (souris uniquement)
  const svgRef = useRef(null);
  const pullRefs = useRef({});
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    const onMove = (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = svg.getBoundingClientRect();
        const unit = box.width / VIEW.w;
        [...CELLS, OPEN].forEach(({ id, cx, cy }) => {
          const node = pullRefs.current[id];
          if (!node) return;
          const dx = event.clientX - (box.left + (cx - VIEW.x) * unit);
          const dy = event.clientY - (box.top + (cy - VIEW.y) * unit);
          const distance = Math.hypot(dx, dy) || 1;
          const strength = Math.max(0, 1 - distance / PULL_RADIUS) ** 2 * PULL_MAX;
          node.style.transform = `translate(${(dx / distance) * strength}px, ${(dy / distance) * strength}px)`;
        });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  let level = 0;
  if (arrived && trimmed) level = sealed ? 1 : Math.min(0.8, 0.3 + trimmed.length * 0.12);
  const surface = EMPTY_Y + (FULL_Y - EMPTY_Y) * level;
  const pull = (id) => (node) => { pullRefs.current[id] = node; };

  return (
    <svg
      ref={svgRef}
      className={`${classes.mark} ${level === 1 ? classes.isSealed : ""}`}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="hive-cell-open">
          <polygon points={OPEN_POINTS} />
        </clipPath>
      </defs>

      {CELLS.map(({ id, cx, cy, r }) => (
        <g key={id} ref={pull(id)} className={classes.pull}>
          <g className={`${classes.cell} ${classes[id]}`}>
            <polygon points={hex(cx, cy, r)} className={classes.full} />
          </g>
        </g>
      ))}

      <g ref={pull("open")} className={classes.pull}>
        <g className={classes.openCell}>
          <g clipPath="url(#hive-cell-open)">
            <g className={classes.level} style={{ transform: `translateY(${surface}px)` }}>
              {/* Deux noms d'animation qui alternent : relancer l'éclaboussure sans
                  remonter la vague (elle perdrait sa phase et sauterait) */}
              <g className={pours % 2 ? classes.splashA : pours ? classes.splashB : ""}>
                <path d={WAVE} className={classes.wave} />
              </g>
            </g>
            {/* Même couleur que le fond : invisible sur le vide, découpée dans le bleu */}
            {initial && <text key={initial} x={OPEN.cx} y={OPEN.cy} className={classes.initial}>{initial}</text>}
          </g>
          <polygon points={OPEN_POINTS} pathLength="1" className={classes.outline} />
          {seals > 0 && <polygon key={seals} points={OPEN_POINTS} className={classes.ripple} />}
        </g>
      </g>
    </svg>
  );
}
