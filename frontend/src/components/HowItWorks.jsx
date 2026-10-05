import { useEffect, useRef } from 'react';
import { Compass, Handshake, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import classes from './HowItWorks.module.css';

// Découvrir, rejoindre, faire naître : une icône par geste, toutes dans la même alvéole.
const STEPS = [
  { id: 'discover', Icon: Compass, titleKey: 'howItWorks.step1Title', descriptionKey: 'howItWorks.step1Description' },
  { id: 'join', Icon: Handshake, titleKey: 'howItWorks.step2Title', descriptionKey: 'howItWorks.step2Description' },
  { id: 'launch', Icon: Sprout, titleKey: 'howItWorks.step3Title', descriptionKey: 'howItWorks.step3Description' },
];

/* Section "sales pitch" affichée entre le hero et la carte : présente le principe
   du site en 3 points, avec une apparition progressive au scroll (IntersectionObserver). */
function HowItWorks() {
  const { t } = useTranslation();
  const containerRef = useRef(null);

  useEffect(() => {
    const nodes = containerRef.current?.querySelectorAll(`.${classes.step}`);
    if (!nodes || nodes.length === 0) return undefined;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      nodes.forEach((node) => node.classList.add(classes.visible));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(classes.visible);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -60px 0px' }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <section className={classes.section} id="how-it-works" ref={containerRef}>
      <div className={classes.header}>
        <h2 className={classes.title}>{t("howItWorks.title")}</h2>
        <p className={classes.subtitle}>
          {t("howItWorks.subtitle")}
        </p>
      </div>

      <div className={classes.grid}>
        {STEPS.map((step, index) => (
          <div key={step.id} className={classes.step} style={{ transitionDelay: `${index * 100}ms` }}>
            <div className={classes.cell} style={{ '--i': index }} aria-hidden="true">
              <div className={classes.cellBody}>
                <span className={classes.cellFace}>
                  <step.Icon size={24} strokeWidth={1.9} className={classes.cellIcon} />
                </span>
              </div>
            </div>
            <h3 className={classes.stepTitle}>{t(step.titleKey)}</h3>
            <p className={classes.stepDescription}>{t(step.descriptionKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;
