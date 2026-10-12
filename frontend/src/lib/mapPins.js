/* Épingle d'un projet : goutte bleue, disque blanc, logo Hive (deux alvéoles pleines
   et une en contour) repris de favicon.svg à l'échelle 0,3.
   Utilisée par la carte de l'accueil et l'écran final du parcours de bienvenue. */
export const PROJECT_PIN_SVG = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ps" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#101828" flood-opacity="0.28"/>
    </filter>
  </defs>
  <g filter="url(#ps)">
    <path d="M17 2C9.82 2 4 7.82 4 15c0 9.45 11.2 20.84 12.45 22.08a.78.78 0 0 0 1.1 0C18.8 35.84 30 24.45 30 15 30 7.82 24.18 2 17 2Z" fill="#2459D6" stroke="#1C47B0" stroke-width="1"/>
    <circle cx="17" cy="15" r="9.2" fill="#FFFFFF"/>
    <g transform="translate(17 15) scale(0.3) translate(-32 -32)" stroke-linejoin="round">
      <polygon points="20.22,11.20 29.40,16.50 29.40,27.10 20.22,32.40 11.04,27.10 11.04,16.50" fill="#2459D6" stroke="#2459D6" stroke-width="3"/>
      <polygon points="43.78,11.20 52.96,16.50 52.96,27.10 43.78,32.40 34.60,27.10 34.60,16.50" fill="#2459D6" stroke="#2459D6" stroke-width="3"/>
      <polygon points="32.00,31.70 41.09,36.95 41.09,47.45 32.00,52.70 22.91,47.45 22.91,36.95" fill="none" stroke="#2459D6" stroke-width="3.6"/>
    </g>
  </g>
</svg>`;
