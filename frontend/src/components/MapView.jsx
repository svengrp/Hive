import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MagnifyingGlass } from 'react-loader-spinner';
import { MapPin, Users, Calendar, X, ArrowUp, Maximize2, Minimize2, LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import BaseMapLayers from './BaseMapLayers';
import ProjectCover from './ProjectCover';
import classes from './MapView.module.css';

/* Centre par défaut : Genève. Recalé sur la position réelle de l'utilisateur dès que la géolocalisation est disponible. */
const DEFAULT_CENTER = [46.2044, 6.1432];

/* Épingle d'un projet : goutte miel, disque crème, logo Hive (deux alvéoles pleines
   et une en contour) repris de favicon.svg à l'échelle 0,3. */
const PROJECT_PIN_SVG = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ps" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#1a1008" flood-opacity="0.28"/>
    </filter>
  </defs>
  <g filter="url(#ps)">
    <path d="M17 2C9.82 2 4 7.82 4 15c0 9.45 11.2 20.84 12.45 22.08a.78.78 0 0 0 1.1 0C18.8 35.84 30 24.45 30 15 30 7.82 24.18 2 17 2Z" fill="#F08C1E" stroke="#C2650E" stroke-width="1"/>
    <circle cx="17" cy="15" r="9.2" fill="#FFF8EC"/>
    <g transform="translate(17 15) scale(0.3) translate(-32 -32)" stroke-linejoin="round">
      <polygon points="20.22,11.20 29.40,16.50 29.40,27.10 20.22,32.40 11.04,27.10 11.04,16.50" fill="#B45309" stroke="#B45309" stroke-width="3"/>
      <polygon points="43.78,11.20 52.96,16.50 52.96,27.10 43.78,32.40 34.60,27.10 34.60,16.50" fill="#B45309" stroke="#B45309" stroke-width="3"/>
      <polygon points="32.00,31.70 41.09,36.95 41.09,47.45 32.00,52.70 22.91,47.45 22.91,36.95" fill="none" stroke="#B45309" stroke-width="3.6"/>
    </g>
  </g>
</svg>`;

const projectIcon = L.divIcon({
  html: PROJECT_PIN_SVG,
  className: "",
  iconSize: [34, 42],
  iconAnchor: [17, 42],
  popupAnchor: [0, -42],
});

// Sur écran tactile, le doigt bouge toujours de quelques pixels pendant un toucher.
// Avec la tolérance par défaut de Leaflet (3 px), ce micro-glissement est pris pour
// un déplacement de la carte et le clic sur le marqueur est annulé.
if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
  L.Draggable.mergeOptions({ clickTolerance: 12 });
}

// Une icône par taille de groupe, réutilisée : recréer l'icône à chaque rendu
// remplaçait l'élément DOM du marqueur, et un toucher en cours tombait dans le vide.
const clusterIconCache = new Map();

function createClusterIcon(count) {
  if (clusterIconCache.has(count)) return clusterIconCache.get(count);
  const icon = buildClusterIcon(count);
  clusterIconCache.set(count, icon);
  return icon;
}

function buildClusterIcon(count) {
  const size = count >= 20 ? 58 : count >= 10 ? 52 : 46;
  return L.divIcon({
    html: `
      <div class="${classes.clusterMarker}" style="width:${size}px;height:${size}px;">
        <div class="${classes.clusterMarkerInner}">
          <span>${count}</span>
        </div>
      </div>
    `,
    className: classes.clusterMarkerWrap,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function Recenter({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, 10, { animate: true });
    }
  }, [position, map]);

  return null;
}

function MapSizeInvalidator({ layoutKey }) {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [map, layoutKey]);

  return null;
}

/* Au doigt, dans la page : un doigt fait défiler la page (le glisser de la carte est
   coupé), deux doigts zooment et déplacent la carte, un toucher sélectionne un projet.
   En plein écran, la carte se manipule normalement à un doigt. */
function TouchGestureController({ enabled }) {
  const map = useMap();

  useEffect(() => {
    if (enabled) map.dragging.disable();
    else map.dragging.enable();
  }, [enabled, map]);

  return null;
}

// MapContainer ne crée l'instance Leaflet qu'une fois au montage : changer la prop
// scrollWheelZoom ensuite ne fait rien. Il faut activer/désactiver le handler
// directement sur l'instance existante.
function ScrollZoomController({ active }) {
  const map = useMap();

  useEffect(() => {
    if (active) {
      map.scrollWheelZoom.enable();
    } else {
      map.scrollWheelZoom.disable();
    }
  }, [active, map]);

  return null;
}

function PanToSelected({ project }) {
  const map = useMap();

  useEffect(() => {
    if (!project) return;
    const pos = getProjectPosition(project);
    if (!pos) return;
    if (window.innerWidth > 900) return;

    // La fiche occupe le bas de l'écran : on place le marqueur au quart supérieur de la
    // carte, dans la zone restée visible (centre = marqueur + 25 % de la hauteur).
    const containerPt = map.latLngToContainerPoint(pos);
    const shifted = L.point(containerPt.x, containerPt.y + map.getSize().y * 0.25);
    map.panTo(map.containerPointToLatLng(shifted), { animate: true, duration: 0.3 });
  }, [project, map]);

  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('fr-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatAgeLabel(project) {
  if (project.minAge && project.maxAge) return `${project.minAge}-${project.maxAge} ans`;
  if (project.minAge) return `${project.minAge}+`;
  if (project.maxAge) return `jusqu'à ${project.maxAge} ans`;
  return null;
}

function getProjectPosition(project) {
  const coords = project.location?.coordinates;
  if (!coords || coords.length !== 2) return null;
  if (coords[0] === 0 && coords[1] === 0) return null;
  return [coords[1], coords[0]];
}

function getClusterRadius(zoom) {
  if (zoom <= 6) return 110;
  if (zoom <= 8) return 85;
  if (zoom <= 10) return 65;
  return 0;
}

/* Gère le clustering manuel des markers Leaflet : regroupe les projets proches en fonction du zoom. */
function ProjectMarkers({ projects, onProjectClick }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    const syncClusters = () => {
      const nextZoom = map.getZoom();
      setZoom(nextZoom);

      const radius = getClusterRadius(nextZoom);
      if (radius === 0) {
        setClusters(projects.map((project) => ({
          type: 'project',
          id: project._id,
          position: getProjectPosition(project),
          project,
        })));
        return;
      }

      const grouped = new Map();

      projects.forEach((project) => {
        const position = getProjectPosition(project);
        if (!position) return;

        const point = map.project(L.latLng(position[0], position[1]), nextZoom);
        const key = `${Math.floor(point.x / radius)}:${Math.floor(point.y / radius)}`;

        if (!grouped.has(key)) {
          grouped.set(key, { projects: [], pointX: 0, pointY: 0 });
        }

        const cluster = grouped.get(key);
        cluster.projects.push(project);
        cluster.pointX += point.x;
        cluster.pointY += point.y;
      });

      const nextClusters = Array.from(grouped.values()).map((cluster, index) => {
        if (cluster.projects.length === 1) {
          const project = cluster.projects[0];
          return { type: 'project', id: project._id, position: getProjectPosition(project), project };
        }

        const averagePoint = L.point(cluster.pointX / cluster.projects.length, cluster.pointY / cluster.projects.length);
        const center = map.unproject(averagePoint, nextZoom);

        return {
          type: 'cluster',
          id: `cluster-${nextZoom}-${index}`,
          position: [center.lat, center.lng],
          projects: cluster.projects,
          count: cluster.projects.length,
        };
      });

      setClusters(nextClusters);
    };

    syncClusters();
    map.on('zoomend moveend', syncClusters);
    return () => { map.off('zoomend moveend', syncClusters); };
  }, [map, projects]);

  return (
    <>
      {clusters.map((entry) => {
        if (entry.type === 'cluster') {
          return (
            <Marker
              key={entry.id}
              position={entry.position}
              icon={createClusterIcon(entry.count)}
              eventHandlers={{
                click: () => { map.setView(entry.position, Math.min(zoom + 2, 12), { animate: true }); },
              }}
            />
          );
        }

        return (
          <Marker
            key={entry.id}
            position={entry.position}
            icon={projectIcon}
            eventHandlers={{ click: () => onProjectClick(entry.project._id) }}
          />
        );
      })}
    </>
  );
}

/* Vue principale de la carte : charge tous les projets, géolocalise l'utilisateur,
   et affiche un panneau latéral glissant au clic sur un marker. */
function MapView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [userLocation, setUserLocation] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // La molette ne zoome la carte qu'après un clic dessus, pour ne pas
  // capturer le scroll de la page quand on la traverse simplement.
  const [mapActive, setMapActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showTwoFingers, setShowTwoFingers] = useState(false);
  const twoFingersTimer = useRef(null);
  const canvasRef = useRef(null);
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches),
    []
  );

  // Le scroll sur la carte zoome au lieu de faire défiler la page : ce bouton
  // permet de revenir en haut sans avoir à quitter la carte au clavier/trackpad.
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  useEffect(() => {
    api('/projects?status=open')
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch((err) => { console.error('Erreur chargement projets:', err); setProjects([]); })
      .finally(() => setLoadingProjects(false));
  }, []);

  // Position demandée seulement au clic sur « Autour de moi » (LPD / RGPD : information
  // préalable, pas de demande surprise). Elle sert à centrer la carte, n'est ni envoyée ni enregistrée.
  const [locateStatus, setLocateStatus] = useState(''); // '' | 'locating' | 'done' | 'denied'
  const locateMe = () => {
    if (!navigator.geolocation) { setLocateStatus('denied'); return; }
    setLocateStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setLocateStatus('done'); },
      () => setLocateStatus('denied'),
      { maximumAge: 300000, timeout: 10000 }
    );
  };

  // Plein écran : bloque le défilement de la page et se ferme avec Échap.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => { if (event.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  // Un doigt qui glisse sur la carte intégrée fait défiler la page : on explique
  // brièvement comment la déplacer.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !isTouch || fullscreen) return undefined;
    const onTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      setShowTwoFingers(true);
      clearTimeout(twoFingersTimer.current);
      twoFingersTimer.current = setTimeout(() => setShowTwoFingers(false), 1600);
    };
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('touchmove', onTouchMove);
      clearTimeout(twoFingersTimer.current);
    };
  }, [isTouch, fullscreen]);

  const { theme } = useTheme();

  const mappableProjects = useMemo(() => projects.filter((project) => getProjectPosition(project)), [projects]);
  const selectedProject = useMemo(() => mappableProjects.find((project) => project._id === selectedProjectId) || null, [mappableProjects, selectedProjectId]);
  const isBusy = !userLocation && loadingProjects;

  return (
    <section
      className={`${classes.mapShell} ${fullscreen ? classes.fullscreen : ''}`}
      aria-labelledby="map-title"
    >
      {showScrollTop && !fullscreen && (
        <button
          type="button"
          className={classes.scrollTopBtn}
          onClick={scrollToTop}
          aria-label={t("map.backToTop")}
          title={t("map.backToTop")}
        >
          <ArrowUp size={16} />
        </button>
      )}

      {isBusy && (
        <div className={classes.loadingOverlay}>
          <MagnifyingGlass
            visible
            height="80"
            width="80"
            ariaLabel="magnifying-glass-loading"
            wrapperStyle={{ position: 'absolute', inset: '50%', transform: 'translate(-50%, -50%)' }}
            wrapperClass="magnifying-glass-wrapper"
            glassColor="rgba(255, 255, 255, .1)"
            color="#707070"
          />
        </div>
      )}

      {/* Titre de la section posé sur la carte (la carte occupe tout l'écran) */}
      <div className={`${classes.mapIntro} ${selectedProject ? classes.mapIntroHidden : ''}`}>
        <h2 id="map-title" className={classes.mapTitle}>{t("home.mapTitle")}</h2>
        {showHint && (
          <p className={classes.mapIntroText}>
            {mappableProjects.length > 0 && (
              <span className={classes.mapCount}>{t("map.projectsCount", { count: mappableProjects.length })}</span>
            )}
            {t("map.hint")}
            <button
              type="button"
              className={classes.hintClose}
              onClick={() => setShowHint(false)}
              aria-label={t("map.closeHint")}
            >
              <X size={14} />
            </button>
          </p>
        )}
      </div>

      <div className={classes.locate}>
        {(locateStatus === 'denied' || locateStatus === '') && (
          <p className={classes.locateHint} role={locateStatus === 'denied' ? 'alert' : undefined}>
            {locateStatus === 'denied' ? t("map.locateDenied") : t("map.locateHint")}
          </p>
        )}
        <button
          type="button"
          className={classes.locateBtn}
          onClick={locateMe}
          disabled={locateStatus === 'locating'}
        >
          <LocateFixed size={16} aria-hidden="true" />
          {locateStatus === 'locating' ? t("map.locating") : t("map.locate")}
        </button>
      </div>

      {isTouch && (
        <button
          type="button"
          className={classes.fullscreenBtn}
          onClick={() => setFullscreen((value) => !value)}
          aria-label={fullscreen ? t("map.exitFullscreen") : t("map.fullscreen")}
          aria-pressed={fullscreen}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      )}

      {showTwoFingers && !fullscreen && (
        <div className={classes.twoFingers} role="status">
          {t("map.twoFingers")}
        </div>
      )}

      {mappableProjects.length === 0 && !loadingProjects && (
        <div className={classes.emptyState}>
          <strong>{t("map.noProjects")}</strong>
          {t("map.noProjectsHint")}
        </div>
      )}

      <div className={classes.panelWrap}>
        <aside className={`${classes.panel} ${selectedProject ? classes.panelOpen : ''}`}>
          <div className={classes.panelHandle} />
          {selectedProject && (
            <>
              {/* Image de couverture en bandeau, bouton de fermeture posé dessus */}
              <div className={classes.panelCoverWrap}>
                <ProjectCover project={selectedProject} size="full" showInitials={false} className={classes.panelCover} />
                <button
                  type="button"
                  className={`${classes.closeButton} ${classes.closeOnCover}`}
                  onClick={() => setSelectedProjectId(null)}
                  aria-label={t("map.closePanel")}
                >
                  <X size={18} />
                </button>
              </div>

              <div className={classes.panelHeader}>
                <div>
                  <div className={classes.panelMeta}>
                    <MapPin size={14} />
                    {t("map.projectOnMap")}
                  </div>
                  <h2 className={classes.panelTitle}>{selectedProject.title}</h2>
                </div>
              </div>

              <div className={classes.panelBody}>
                <div className={classes.metaRow}>
                  {selectedProject.projectMeta?.city && (
                    <span className={classes.metaPill}>
                      <MapPin size={13} />
                      {[selectedProject.projectMeta.city, selectedProject.projectMeta.region].filter(Boolean).join(', ')}
                    </span>
                  )}
                  <span className={classes.metaPill}>
                    <Users size={13} />
                    {selectedProject.participants?.length || 0}
                    {selectedProject.maxParticipants ? `/${selectedProject.maxParticipants}` : ''} {t("map.members")}
                  </span>
                  {formatAgeLabel(selectedProject) && (
                    <span className={classes.metaPill}>
                      <Users size={13} />
                      {formatAgeLabel(selectedProject)}
                    </span>
                  )}
                  {selectedProject.projectMeta?.startDate && (
                    <span className={classes.metaPill}>
                      <Calendar size={13} />
                      {formatDate(selectedProject.projectMeta.startDate)}
                      {selectedProject.projectMeta?.endDate
                        ? ` → ${formatDate(selectedProject.projectMeta.endDate)}`
                        : ` ${t("map.recurring")}`}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className={classes.sectionTitle}>{t("map.description")}</h3>
                  <p className={classes.description}>
                    {selectedProject.description || t("map.noDescription")}
                  </p>
                </div>

                {selectedProject.tags?.length > 0 && (
                  <div>
                    <h3 className={classes.sectionTitle}>{t("map.tags")}</h3>
                    <div className={classes.tagList}>
                      {selectedProject.tags.map((tag) => (
                        <span key={tag} className={classes.tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={classes.actions}>
                <button
                  type="button"
                  className={classes.primaryButton}
                  onClick={() => navigate(`/projects/${selectedProject._id}`)}
                >
                  {t("map.openProject")}
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      <div
        ref={canvasRef}
        className={classes.mapCanvasWrap}
        onClick={() => setMapActive(true)}
        onMouseLeave={() => setMapActive(false)}
      >
        {!mapActive && !isTouch && (
          <div className={classes.scrollHint}>{t("map.scrollHint")}</div>
        )}

        <MapContainer
          center={DEFAULT_CENTER}
          zoom={7}
          zoomControl={false}
          scrollWheelZoom={false}
          className={classes.mapCanvas}
        >
          <BaseMapLayers theme={theme} />
          <MapSizeInvalidator layoutKey={fullscreen} />
          <ScrollZoomController active={mapActive || fullscreen} />
          <TouchGestureController enabled={isTouch && !fullscreen} />
          <PanToSelected project={selectedProject} />
          {userLocation && <Recenter position={userLocation} />}
          <ProjectMarkers projects={mappableProjects} onProjectClick={setSelectedProjectId} />
        </MapContainer>
      </div>
    </section>
  );
}

export default MapView;
