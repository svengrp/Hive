import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Plus, ArrowDown, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MapView from '../components/MapView';
import HowItWorks from '../components/HowItWorks';
import HeroNetwork from '../components/HeroNetwork';
import { useAuth } from '../context/AuthContext';
import { ONBOARDING_EVENT, isKnownVisitor, readOnboarding } from '../lib/onboarding';
import { useSeo } from '../lib/seo';
import classes from './Home.module.css';

/* Réponses du parcours de bienvenue, tenues à jour quand elles changent */
function useOnboardingAnswers() {
  const [answers, setAnswers] = useState(readOnboarding);
  useEffect(() => {
    const refresh = () => setAnswers(readOnboarding());
    window.addEventListener(ONBOARDING_EVENT, refresh);
    return () => window.removeEventListener(ONBOARDING_EVENT, refresh);
  }, []);
  return answers;
}

/* Accueil d'une personne que Hive connaît déjà (compte, ou parcours fait) :
   pas de présentation du site, on la salue et on va droit aux projets.
   Réductible en une fine barre (choix mémorisé sur l'appareil) pour laisser la place à la carte. */
const WELCOME_COLLAPSED_KEY = 'hive-welcome-collapsed';

function Welcome({ user, answers }) {
  const { t } = useTranslation();
  const name = (user?.firstName || answers.firstName || '').trim();
  const place = answers.city.trim() || user?.address?.city || '';
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(WELCOME_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed((value) => {
    try { localStorage.setItem(WELCOME_COLLAPSED_KEY, value ? '0' : '1'); } catch { /* stockage indisponible */ }
    return !value;
  });
  const hello = name
    ? <>{t('home.welcome.hello')}, <span className={classes.welcomeName}>{name}</span>.</>
    : t('home.welcome.helloAnonymous');

  if (collapsed) {
    return (
      <section className={classes.welcomeBar}>
        <div className={classes.welcomeBarInner}>
          <p className={classes.welcomeBarTitle}>{hello}</p>
          <div className={classes.welcomeBarActions}>
            <Link to="/projects" className={`${classes.primaryCta} ${classes.ctaSmall}`}>
              <Compass size={16} />
              <span className={classes.ctaLabel}>{t('home.explore')}</span>
            </Link>
            <Link to="/create-project" className={`${classes.secondaryCta} ${classes.ctaSmall}`} aria-label={t('home.createProject')}>
              <Plus size={16} />
              <span className={classes.ctaLabel}>{t('home.createProject')}</span>
            </Link>
            <button type="button" className={classes.collapseBtn} onClick={toggle} aria-expanded="false" aria-label={t('home.welcome.expand')} title={t('home.welcome.expand')}>
              <ChevronDown size={18} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={classes.welcome}>
      <button type="button" className={`${classes.collapseBtn} ${classes.collapseCorner}`} onClick={toggle} aria-expanded="true" aria-label={t('home.welcome.collapse')} title={t('home.welcome.collapse')}>
        <ChevronUp size={18} />
        <span className={classes.collapseLabel}>{t('home.welcome.collapse')}</span>
      </button>
      <div className={classes.welcomeInner}>
        <div className={classes.welcomeMain}>
          <h1 className={classes.welcomeTitle}>{hello}</h1>
          <p className={classes.welcomeLead}>
            {place ? t('home.welcome.leadPlace', { place }) : t('home.welcome.lead')}
          </p>

          <div className={classes.welcomeActions}>
            <Link to="/projects" className={classes.primaryCta}>
              <Compass size={17} />
              {t('home.explore')}
            </Link>
            <Link to="/create-project" className={classes.secondaryCta}>
              <Plus size={17} />
              {t('home.createProject')}
            </Link>
          </div>
        </div>

        {/* Sans compte : le profil reste à 90 %, il ne manque qu'une étape */}
        {!user && (
          <Link to="/register" className={classes.finishCard}>
            <span className={classes.finishText}>
              <span className={classes.finishTitle}>{t('home.welcome.finishTitle')}</span>
              <span className={classes.finishNote}>{t('home.welcome.finishNote')}</span>
            </span>
            <span className={classes.finishBar} aria-hidden="true"><span /></span>
            <span className={classes.finishCta}>
              {t('home.welcome.finishCta')}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}

function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const answers = useOnboardingAnswers();
  useSeo({ path: '/' });
  const heroRef = useRef(null);
  const known = Boolean(user) || isKnownVisitor(answers);
  const mainWords = t("home.titleMain").split(' ');
  const accentWords = t("home.titleAccent").split(' ');
  // Chaque mot remonte avec 70 ms d'écart ; le trait se dessine une fois
  // le dernier mot en place, puis le sous-titre et les boutons suivent.
  const accentDelay = 150 + (mainWords.length + accentWords.length) * 70 + 300;

  if (known) {
    return (
      <div>
        <Welcome user={user} answers={answers} />
        <MapView initialView={answers.view} />
      </div>
    );
  }

  return (
    <div>
      <section className={classes.hero} ref={heroRef}>
        <HeroNetwork pointerTarget={heroRef} />

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
