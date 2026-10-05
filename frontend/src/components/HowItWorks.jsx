import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './HowItWorks.module.css';
import discoverIcon from '../assets/steps/discover.png';
import joinIcon from '../assets/steps/join.png';
import launchIcon from '../assets/steps/launch.png';

// Découvrir, rejoindre, faire naître : icônes 3D (verre miel sur alvéole), même série.
const STEPS = [
  { id: 'discover', icon: discoverIcon, titleKey: 'howItWorks.step1Title', descriptionKey: 'howItWorks.step1Description' },
  { id: 'join', icon: joinIcon, titleKey: 'howItWorks.step2Title', descriptionKey: 'howItWorks.step2Description' },
  { id: 'launch', icon: launchIcon, titleKey: 'howItWorks.step3Title', descriptionKey: 'howItWorks.step3Description' },
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
            <div className={classes.cell} style={{ '--i': index }}>
              <img src={step.icon} alt="" width="96" height="96" className={classes.cellImage} loading="lazy" />
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
