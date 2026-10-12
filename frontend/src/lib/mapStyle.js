// Fond de carte vectoriel : OpenFreeMap (gratuit, sans clé, données OpenStreetMap),
// affiché par MapLibre. Le texte reste net à tous les zooms et sur écran haute densité.
// Les styles publics « positron » (clair) et « dark » (sombre) sont retouchés aux
// couleurs de Hive (gris ardoise, eau bleutée) avant affichage.
const STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

export const MAP_ATTRIBUTION = [
  { label: 'OpenFreeMap', href: 'https://openfreemap.org' },
  { label: 'OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  { label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
];

// [identifiant de couche, propriété, valeur]. Une couche absente du style est ignorée.
const HIVE_PAINT = {
  light: [
    ['background', 'background-color', '#f3f4f6'],
    ['water', 'fill-color', '#d4dfea'],
    ['park', 'fill-color', '#e3ebe0'],
    ['landcover_wood', 'fill-color', '#dde5da'],
    ['landuse_residential', 'fill-color', '#eef0f3'],
    ['building', 'fill-color', '#e6e8ec'],
    ['boundary_2', 'line-color', '#b4bac4'],
    ['boundary_3', 'line-color', '#c8ccd3'],
    ['label_city', 'text-color', '#2a2f37'],
    ['label_city_capital', 'text-color', '#2a2f37'],
    ['label_town', 'text-color', '#3a404a'],
    ['label_village', 'text-color', '#535a66'],
    ['water_name_point_label', 'text-color', '#4f6b85'],
    ['water_name_line_label', 'text-color', '#4f6b85'],
  ],
  dark: [
    ['background', 'background-color', '#101215'],
    ['water', 'fill-color', '#16202b'],
    ['landuse_residential', 'fill-color', '#15171b'],
    ['landcover_wood', 'fill-color', '#13171a'],
    ['building', 'fill-color', '#191c21'],
  ],
};

// Couleur affichée pendant le chargement des tuiles (évite un flash blanc).
export const MAP_BACKGROUND = { light: '#f3f4f6', dark: '#101215' };

const cache = {};

export async function loadHiveMapStyle(theme) {
  const key = theme === 'light' ? 'light' : 'dark';
  if (!cache[key]) {
    cache[key] = fetch(STYLE_URLS[key])
      .then((res) => {
        if (!res.ok) throw new Error(`Style ${key} indisponible (${res.status})`);
        return res.json();
      })
      .then((style) => {
        const byId = new Map(style.layers.map((layer) => [layer.id, layer]));
        HIVE_PAINT[key].forEach(([id, prop, value]) => {
          const layer = byId.get(id);
          if (layer) layer.paint = { ...layer.paint, [prop]: value };
        });
        return style;
      })
      .catch((err) => {
        delete cache[key];
        throw err;
      });
  }
  return cache[key];
}

export function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
