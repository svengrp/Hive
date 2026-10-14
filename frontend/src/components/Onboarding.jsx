import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Compass, Pencil, Rocket, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { MAX_INTERESTS } from "../lib/interests";
import {
  GOALS, MAX_NAME_LENGTH, STEPS, STEP_PROGRESS, DEFAULT_COUNTRY, countryName, getCountries, hasAnswers,
  locatePlace, readOnboarding, shouldShowOnboarding, syncOnboarding, writeOnboarding,
} from "../lib/onboarding";
import logoHive from "../img/logoHive.svg";
import InterestPicker from "./InterestPicker";
import classes from "./Onboarding.module.css";

// Carte chargée seulement à l'écran final
const OnboardingMap = lazy(() => import("./OnboardingMap"));

const GOAL_ICONS = { join: Search, launch: Rocket, both: Compass };

// Nom de chaque langue écrit dans cette langue
const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

/* Parcours de bienvenue (premier passage, sans compte) : prénom, centres d'intérêt,
   pays, objectif, puis écran final sur la carte avec l'invitation à créer un compte.
   Chaque étape peut être passée. Les réponses sont envoyées au serveur dès que la
   personne est connectée. */
export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [state, setState] = useState(readOnboarding);
  // Décidé une seule fois, à l'arrivée sur le site
  const [open, setOpen] = useState(() => shouldShowOnboarding({ user, pathname, state: readOnboarding() }));
  const headingRef = useRef(null);
  const nameInputRef = useRef(null);

  const language = i18n.language?.startsWith("fr") ? "fr" : "en";
  const countries = useMemo(() => getCountries(language), [language]);
  const name = state.firstName.trim();

  useEffect(() => { writeOnboarding(state); }, [state]);

  // Filet de sécurité : session déjà ouverte avec des réponses pas encore envoyées
  // (l'envoi normal se fait pendant la connexion, voir AuthContext)
  useEffect(() => {
    if (!user || user.role === "admin" || state.synced || !hasAnswers(state)) return;
    let cancelled = false;
    syncOnboarding(language)
      .then((saved) => {
        if (cancelled) return;
        if (saved) updateUser({ ...user, ...saved });
        // Relu depuis le stockage : l'envoi a pu être fait ailleurs (connexion)
        setState(readOnboarding());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, state, language, updateUser]);

  // Connexion depuis un autre onglet : le parcours n'a plus lieu d'être
  useEffect(() => { if (user) setOpen(false); }, [user]);

  // Page figée derrière, Échap = « Plus tard »
  useEffect(() => {
    if (!open) return undefined;
    // iOS Safari ignore overflow:hidden sur body : on fige la page en position fixe,
    // sinon le doigt fait défiler l'accueil derrière et la barre d'adresse se replie
    const { body, documentElement: html } = document;
    const scrollY = window.scrollY;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    const onKey = (event) => { if (event.key === "Escape") skipAll(); };
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      html.style.overflow = previous.htmlOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      if (scrollY) window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKey);
    };
    // skipAll ne dépend que de setState/setOpen (stables)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clavier mobile : le parcours suit la zone réellement visible, pour que le titre
  // « Bonjour, … » et le bouton Continuer restent à l'écran pendant la saisie
  const overlayRef = useRef(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return undefined;
    const fit = () => {
      const node = overlayRef.current;
      if (!node) return;
      node.style.setProperty("--ob-height", `${viewport.height}px`);
      node.style.setProperty("--ob-top", `${viewport.offsetTop}px`);
      setCompact(viewport.height < 520);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [open]);

  // Contenu caché sous la barre du bas (petits écrans) : la barre prend une ombre
  const bodyRef = useRef(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const measureBody = useCallback(() => {
    const node = bodyRef.current;
    setMoreBelow(Boolean(node) && node.scrollHeight - node.scrollTop - node.clientHeight > 4);
  }, []);
  useEffect(() => {
    const node = bodyRef.current;
    if (!open || !node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measureBody);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [open, state.step, measureBody]);

  // Pays proposé d'office à l'étape Localisation
  useEffect(() => {
    if (open && state.step === "location" && !state.country) {
      setState((current) => ({ ...current, country: DEFAULT_COUNTRY }));
    }
  }, [open, state.step, state.country]);

  // Focus à chaque étape : le champ prénom au début, sinon le titre (lecteurs d'écran, clavier)
  useEffect(() => {
    if (!open) return;
    if (state.step === "name") nameInputRef.current?.focus();
    else headingRef.current?.focus();
  }, [open, state.step]);

  // ---------- Écran final : lieu et projets à montrer sur la carte ----------
  const isFinale = open && state.step === "account";
  const [target, setTarget] = useState(null);
  const [projects, setProjects] = useState([]);
  const [visibleCount, setVisibleCount] = useState(null);

  useEffect(() => {
    if (!isFinale) return undefined;
    let cancelled = false;
    setTarget(null);
    setVisibleCount(null);
    Promise.all([
      locatePlace({ city: state.city, countryCode: state.country, countryLabel: countryName(state.country, language) }),
      api("/projects?status=open").catch(() => []),
    ]).then(([place, list]) => {
      if (cancelled) return;
      setProjects(Array.isArray(list) ? list : []);
      setTarget(place);
      if (place) setState((current) => ({ ...current, view: place }));
    });
    return () => { cancelled = true; };
  }, [isFinale, state.city, state.country, language]);

  const handleCount = useCallback((count) => setVisibleCount(count), []);

  if (!open) return null;

  const update = (patch) => setState((current) => ({ ...current, ...patch }));
  const stepIndex = STEPS.indexOf(state.step);
  const progress = STEP_PROGRESS[state.step];
  const goTo = (step) => update({ step });
  const next = () => goTo(STEPS[stepIndex + 1]);
  const back = () => goTo(STEPS[Math.max(0, stepIndex - 1)]);
  const canGoBack = stepIndex > 0 && !isFinale;

  function skipAll() {
    setState((current) => ({ ...current, status: "skipped" }));
    setOpen(false);
  }

  const finish = (to) => {
    update({ status: "done" });
    setOpen(false);
    navigate(to);
  };

  const isStepDone = (step) => {
    if (step === "name") return Boolean(name);
    if (step === "interests") return state.interests.length === MAX_INTERESTS;
    if (step === "location") return Boolean(state.country);
    if (step === "goal") return Boolean(state.goal);
    return false;
  };

  const canContinue = isStepDone(state.step);
  // Centres d'intérêt : le bouton dit combien il en reste à choisir (« Encore 2 »)
  const remaining = MAX_INTERESTS - state.interests.length;
  let primaryLabel = t("onboarding.continue");
  if (state.step === "goal") primaryLabel = t("onboarding.finish");
  else if (state.step === "interests" && remaining > 0) primaryLabel = t("onboarding.interests.remaining", { count: remaining });
  const knownCodes = new Set([...countries.priority, ...countries.others].map((c) => c.code));
  const place = state.city.trim() || countryName(state.country, language);

  let finaleLead = t("onboarding.final.locating");
  if (visibleCount !== null) {
    finaleLead = visibleCount > 0
      ? t("onboarding.final.projectsNearby", { count: visibleCount })
      : t("onboarding.final.noProjects");
  }

  return (
    <div
      ref={overlayRef}
      className={`${classes.overlay} ${compact ? classes.compact : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <header className={classes.top}>
        {/* Sur mobile, le retour passe en haut à gauche : la barre du bas garde l'action principale */}
        {canGoBack && (
          <button type="button" className={classes.topBack} onClick={back} aria-label={t("onboarding.previous")}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        )}
        <span className={classes.brand}>
          <span className={classes.logo} style={{ "--logo-url": `url(${logoHive})` }} aria-hidden="true" />
          Hive
        </span>
        <div className={classes.lang} role="group" aria-label={t("nav.language")}>
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={`${classes.langBtn} ${language === code ? classes.langBtnActive : ""}`}
              aria-pressed={language === code}
              aria-label={label}
              onClick={() => i18n.changeLanguage(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" className={classes.later} onClick={skipAll}>
          {t("onboarding.later")}
        </button>
      </header>

      {!isFinale && (
        <div className={classes.progressArea}>
          <div className={classes.progressInner}>
            <div className={classes.progressHead}>
              <span>
                {t("onboarding.stepOf", { current: stepIndex + 1, total: STEPS.length })}
                <span className={classes.currentStep}> · {t(`onboarding.steps.${state.step}`)}</span>
              </span>
              <span className={classes.progressValue}>{t("onboarding.progress", { value: progress })}</span>
            </div>

            {/* Une barre en 5 segments, un par étape : la progression et les étapes
                ne font qu'un. Le premier segment est déjà à moitié plein (10 %). */}
            <div
              className={classes.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={t("onboarding.progressLabel")}
            >
              {STEPS.map((step, index) => {
                const fill = Math.min(1, Math.max(0, (progress - index * 20) / 20));
                return (
                  <span key={step} className={classes.segment}>
                    <span className={classes.segmentFill} style={{ transform: `scaleX(${fill})` }} />
                  </span>
                );
              })}
            </div>

            <ol className={classes.steps}>
              {STEPS.map((step, index) => {
                const done = index < stepIndex;
                const current = index === stepIndex;
                const content = (
                  <>
                    {done && <Check size={13} strokeWidth={2.75} aria-hidden="true" className={classes.stepCheck} />}
                    <span className={classes.stepLabel}>{t(`onboarding.steps.${step}`)}</span>
                  </>
                );
                return (
                  <li
                    key={step}
                    className={`${classes.step} ${done ? classes.stepDone : ""} ${current ? classes.stepCurrent : ""}`}
                    aria-current={current ? "step" : undefined}
                  >
                    {done ? (
                      <button type="button" className={classes.stepButton} onClick={() => goTo(step)}>{content}</button>
                    ) : (
                      <span className={classes.stepButton}>{content}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {isFinale ? (
        <main className={classes.finale}>
          <div className={classes.finaleMap}>
            <Suspense fallback={null}>
              <OnboardingMap target={target} projects={projects} onCount={handleCount} />
            </Suspense>
          </div>
          <div className={classes.scrim} aria-hidden="true" />

          <div className={classes.finalePanel}>
            <p className={`${classes.eyebrow} ${classes.reveal}`} style={{ "--d": "150ms" }}>
              <span className={classes.eyebrowCheck} aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
              {t("onboarding.final.eyebrow")}
            </p>

            <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={classes.finaleTitle}>
              <span className="sr-only">
                {name ? t("onboarding.final.titleNamed", { name }) : t("onboarding.final.title")}
              </span>
              <span aria-hidden="true">
                <span className={classes.line}>
                  <span className={classes.rise} style={{ "--d": "320ms" }}>
                    {name ? t("onboarding.final.welcomeComma") : t("onboarding.final.title")}
                  </span>
                </span>
                {name && (
                  <span className={classes.line}>
                    <span className={`${classes.rise} ${classes.finaleName}`} style={{ "--d": "460ms" }}>{name}.</span>
                  </span>
                )}
              </span>
            </h1>

            <p className={`${classes.finaleLead} ${classes.reveal}`} style={{ "--d": "900ms" }} aria-live="polite">
              {finaleLead}
              {place && visibleCount !== null && <span className={classes.finalePlace}> · {place}</span>}
            </p>

            {state.interests.length > 0 && (
              <div className={`${classes.finaleChipsRow} ${classes.reveal}`} style={{ "--d": "1000ms" }}>
                <ul className={classes.finaleChips} aria-label={t("onboarding.steps.interests")}>
                  {state.interests.map((key) => <li key={key}>{t(`interests.${key}`)}</li>)}
                </ul>
                <button
                  type="button"
                  className={classes.editLink}
                  onClick={() => goTo("interests")}
                  aria-label={t("onboarding.final.editInterests")}
                >
                  <Pencil size={13} aria-hidden="true" />
                  {t("onboarding.final.editAnswers")}
                </button>
              </div>
            )}

            <div className={`${classes.readiness} ${classes.reveal}`} style={{ "--d": "1100ms" }}>
              <div className={classes.readinessHead}>
                <span>{t("onboarding.final.readiness")}</span>
                <span className={classes.progressValue}>90 %</span>
              </div>
              <div className={classes.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={90} aria-label={t("onboarding.progressLabel")}>
                <span className={`${classes.barFill} ${classes.readinessFill}`} />
              </div>
              <p className={classes.readinessNote}>{t("onboarding.final.readinessNote")}</p>
            </div>

            <div className={`${classes.accountActions} ${classes.reveal}`} style={{ "--d": "1250ms" }}>
              <button type="button" className={classes.primary} onClick={() => finish("/register")}>
                {t("onboarding.account.create")}
              </button>
              <button type="button" className={`${classes.secondary} ${classes.loginAction}`} onClick={() => finish("/login")}>
                {t("onboarding.account.login")}
              </button>
              <button type="button" className={`${classes.textLink} ${classes.withoutAccount}`} onClick={() => finish("/projects")}>
                {t("onboarding.account.withoutAccount")}
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main className={classes.body} ref={bodyRef} onScroll={measureBody}>
          <div className={classes.panel} key={state.step}>
            {state.step === "name" && (
              <form
                className={classes.hello}
                onSubmit={(event) => { event.preventDefault(); if (name) next(); }}
              >
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={classes.helloTitle}>
                  <span className="sr-only">{name ? t("onboarding.name.helloNamed", { name }) : t("onboarding.name.hello")}</span>
                  <span aria-hidden="true">
                    <span className={classes.line}>
                      <span className={classes.rise} style={{ "--d": "80ms" }}>{t("onboarding.name.hello")}</span>
                    </span>
                    {name ? (
                      <>
                        <span className={classes.helloComma}>, </span>
                        <TypedName value={state.firstName.trimStart()} />
                      </>
                    ) : (
                      <span className={classes.caret} />
                    )}
                  </span>
                </h1>
                <p className={`${classes.lead} ${classes.reveal}`} style={{ "--d": "380ms" }}>{t("onboarding.name.lead")}</p>
                <label className={`${classes.field} ${classes.nameField} ${classes.reveal}`} style={{ "--d": "480ms" }}>
                  <span className={classes.fieldLabel}>{t("onboarding.name.label")}</span>
                  <input
                    ref={nameInputRef}
                    className={`${classes.input} ${classes.nameInput}`}
                    value={state.firstName}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="given-name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    spellCheck={false}
                    placeholder={t("onboarding.name.placeholder")}
                    onChange={(e) => update({ firstName: e.target.value })}
                  />
                </label>
              </form>
            )}

            {state.step === "interests" && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={classes.title}>
                  {name ? t("onboarding.interests.titleNamed", { name }) : t("onboarding.interests.title")}
                </h1>
                <p className={classes.lead}>{t("onboarding.interests.lead")}</p>
                <p className="sr-only" aria-live="polite">
                  {t("onboarding.interests.counter", { count: state.interests.length, max: MAX_INTERESTS })}
                </p>
                <div className={classes.picker}>
                  <InterestPicker
                    value={state.interests}
                    onChange={(interests) => update({ interests })}
                    labelledBy="onboarding-title"
                  />
                </div>
              </>
            )}

            {state.step === "location" && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={classes.title}>
                  {t("onboarding.location.title")}
                </h1>
                <p className={classes.lead}>{t("onboarding.location.lead")}</p>
                <div className={classes.fields}>
                  <label className={classes.field}>
                    <span className={classes.fieldLabel}>{t("onboarding.location.country")}</span>
                    <select
                      className={classes.input}
                      value={knownCodes.has(state.country) ? state.country : ""}
                      onChange={(e) => update({ country: e.target.value })}
                    >
                      <option value="" disabled>{t("onboarding.location.choose")}</option>
                      <optgroup label={t("onboarding.location.suggested")}>
                        {countries.priority.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </optgroup>
                      {countries.others.length > 0 && (
                        <optgroup label={t("onboarding.location.allCountries")}>
                          {countries.others.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span className={classes.fieldLabel}>
                      {t("onboarding.location.city")} <span className={classes.optional}>{t("onboarding.optional")}</span>
                    </span>
                    <input
                      className={classes.input}
                      value={state.city}
                      maxLength={80}
                      autoComplete="address-level2"
                      placeholder={t("onboarding.location.cityPlaceholder")}
                      onChange={(e) => update({ city: e.target.value })}
                    />
                  </label>
                </div>
              </>
            )}

            {state.step === "goal" && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={classes.title}>
                  {t("onboarding.goal.title")}
                </h1>
                <p className={classes.lead}>{t("onboarding.goal.lead")}</p>
                <div className={classes.choices} role="radiogroup" aria-labelledby="onboarding-title">
                  {GOALS.map((goal) => {
                    const Icon = GOAL_ICONS[goal];
                    const selected = state.goal === goal;
                    return (
                      <button
                        key={goal}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`${classes.choice} ${selected ? classes.choiceSelected : ""}`}
                        onClick={() => update({ goal })}
                      >
                        <span className={classes.choiceIcon} aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
                        <span className={classes.choiceText}>
                          <span className={classes.choiceTitle}>{t(`onboarding.goal.${goal}.title`)}</span>
                          <span className={classes.choiceDesc}>{t(`onboarding.goal.${goal}.desc`)}</span>
                        </span>
                        <span className={classes.radio} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </main>
      )}

      {!isFinale && (
        <footer className={`${classes.footer} ${moreBelow ? classes.footerRaised : ""}`}>
          <div className={classes.footerInner}>
            {stepIndex > 0 ? (
              <button type="button" className={classes.back} onClick={back}>
                <ArrowLeft size={16} aria-hidden="true" />
                {t("onboarding.back")}
              </button>
            ) : <span />}
            <div className={classes.footerRight}>
              <button type="button" className={classes.skipStep} onClick={next}>
                {t("onboarding.skipStep")}
              </button>
              <button type="button" className={`${classes.primary} ${classes.next}`} onClick={next} disabled={!canContinue}>
                {primaryLabel}
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

/* Prénom écrit en direct : chaque lettre arrive en douceur, les lettres d'un même mot
   restent groupées (pas de coupure au milieu d'un mot) et le curseur suit la dernière. */
function TypedName({ value }) {
  const parts = value.split(/(\s+)/).filter(Boolean);
  const endsWithSpace = /\s$/.test(value);
  let offset = 0;
  return (
    <span className={classes.helloName}>
      {parts.map((part, index) => {
        const start = offset;
        offset += part.length;
        if (/^\s+$/.test(part)) return " ";
        const isLast = index === parts.length - 1;
        return (
          <span key={start} className={classes.word}>
            {[...part].map((char, i) => (
              <span key={start + i} className={classes.char}>{char}</span>
            ))}
            {isLast && <span className={classes.caret} />}
          </span>
        );
      })}
      {endsWithSpace && <span className={classes.caret} />}
    </span>
  );
}
