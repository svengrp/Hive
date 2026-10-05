import { Fragment, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Plus, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MapView from '../components/MapView';
import HowItWorks from '../components/HowItWorks';
import HeroNetwork from '../components/HeroNetwork';
import { useSeo } from '../lib/seo';
import classes from './Home.module.css';

function Home() {
  const { t } = useTranslation();
  useSeo({ path: '/' });
  const heroRef = useRef(null);
  const mainWords = t("home.titleMain").split(' ');
  const accentWords = t("home.titleAccent").split(' ');
  // Chaque mot remonte avec 70 ms d'écart ; le trait se dessine une fois
  // le dernier mot en place, puis le sous-titre et les boutons suivent.
  const accentDelay = 150 + (mainWords.length + accentWords.length) * 70 + 300;

  return (
    <div>
      <section className={classes.hero} ref={heroRef}>
        <HeroNetwork pointerTarget={heroRef} />
        <div className={classes.heroGlow1} />
        <div className={classes.heroGlow2} />

        <div className={classes.heroInner} style={{ '--accent-delay': `${accentDelay}ms` }}>
          <h1 className={classes.title}>
            <span className="sr-only">{t("home.titleMain")} {t("home.titleAccent")}</span>
            <span aria-hidden="true">
              {mainWords.map((word, index) => (
                <Fragment key={`${word}-${index}`}>
                  <span className={classes.mask}>
                    <span className={classes.word} style={{ '--i': index }}>{word}</span>
                  </span>{' '}
                </Fragment>
              ))}
            </span>
            <span className={classes.titleAccent} aria-hidden="true">
              {accentWords.map((word, index) => (
                <Fragment key={`${word}-${index}`}>
                  <span className={classes.mask}>
                    <span className={classes.word} style={{ '--i': mainWords.length + index }}>{word}</span>
                  </span>
                  {index < accentWords.length - 1 ? ' ' : null}
                </Fragment>
              ))}
            </span>
          </h1>

          <p className={classes.subtitle}>
            {t("home.subtitle")}
          </p>

          <div className={classes.actions}>
            <Link to="/projects" className={classes.primaryCta}>
              <Compass size={17} />
              {t("home.explore")}
            </Link>
            <Link to="/create-project" className={classes.secondaryCta}>
              <Plus size={17} />
              {t("home.createProject")}
            </Link>
          </div>

          <button
            type="button"
            className={classes.scrollCue}
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label={t("home.scrollCue")}
          >
            <ArrowDown size={20} />
          </button>
        </div>
      </section>

      <HowItWorks />

      <MapView />
    </div>
  );
}

export default Home;
