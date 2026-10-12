import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../context/ThemeContext";
import { PROJECT_PIN_SVG } from "../lib/mapPins";
import { START_VIEW } from "../lib/onboarding";
import BaseMapLayers from "./BaseMapLayers";

const MAX_PINS = 60;

const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/* Épingle qui tombe en place, avec un léger décalage de l'une à l'autre (voir
   .hive-pin-drop dans Onboarding.module.css). */
const pinIcon = (delay) => L.divIcon({
  html: `<div class="hive-pin-drop" style="animation-delay:${delay}ms">${PROJECT_PIN_SVG}</div>`,
  className: "",
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

const hereIcon = L.divIcon({
  html: '<span class="hive-here" aria-hidden="true"></span>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function projectPosition(project) {
  const coords = project.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || (coords[0] === 0 && coords[1] === 0)) return null;
  return [coords[1], coords[0]];
}

/* Centre décalé pour que le lieu ne tombe pas sous le texte : à droite du panneau
   sur grand écran, au-dessus sur mobile. */
function offsetCenter(map, latLng, zoom) {
  const size = map.getSize();
  const shift = size.x > 900 ? L.point(-size.x * 0.2, 0) : L.point(0, size.y * 0.24);
  return map.unproject(map.project(latLng, zoom).add(shift), zoom);
}

/* Vol de la vue d'ensemble jusqu'au lieu choisi, puis signal d'arrivée. */
function CameraFlight({ target, onArrived }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return undefined;
    const [lat, lng, zoom] = target;
    const center = offsetCenter(map, L.latLng(lat, lng), zoom);

    if (prefersReducedMotion()) {
      map.setView(center, zoom, { animate: false });
      onArrived(map);
      return undefined;
    }

    const arrive = () => onArrived(map);
    // Laisse la carte apparaître avant de partir
    const timer = setTimeout(() => {
      map.once("moveend", arrive);
      map.flyTo(center, zoom, { duration: 3.2, easeLinearity: 0.12 });
    }, 500);
    return () => {
      clearTimeout(timer);
      map.off("moveend", arrive);
    };
  }, [map, target, onArrived]);

  return null;
}

/* Carte de l'écran final du parcours de bienvenue : non interactive, elle sert de
   décor vivant. Les projets ouverts apparaissent une fois arrivé, du plus proche
   au plus lointain. */
export default function OnboardingMap({ target, projects, onCount }) {
  const { theme } = useTheme();
  const [arrived, setArrived] = useState(false);

  const handleArrived = useCallback((map) => {
    const bounds = map.getBounds();
    const visible = projects.filter((project) => {
      const position = projectPosition(project);
      return position && bounds.contains(position);
    });
    onCount(visible.length);
    setArrived(true);
  }, [projects, onCount]);

  const pins = useMemo(() => {
    if (!arrived || !target) return [];
    const here = L.latLng(target[0], target[1]);
    return projects
      .map((project) => ({ project, position: projectPosition(project) }))
      .filter((item) => item.position)
      .sort((a, b) => here.distanceTo(a.position) - here.distanceTo(b.position))
      .slice(0, MAX_PINS);
  }, [arrived, projects, target]);

  return (
    <MapContainer
      center={START_VIEW.slice(0, 2)}
      zoom={START_VIEW[2]}
      zoomSnap={0}
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      style={{ height: "100%", width: "100%" }}
    >
      <BaseMapLayers theme={theme} />
      <CameraFlight target={target} onArrived={handleArrived} />
      {arrived && target && <Marker position={[target[0], target[1]]} icon={hereIcon} interactive={false} keyboard={false} />}
      {pins.map(({ project, position }, index) => (
        <Marker
          key={project._id}
          position={position}
          icon={pinIcon(Math.min(index * 70, 1400))}
          interactive={false}
          keyboard={false}
        />
      ))}
    </MapContainer>
  );
}
