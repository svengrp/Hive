// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// API du navigateur absentes de jsdom (thème clair/sombre, mises en page responsive)
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Animations au défilement (HowItWorks) et réseau animé de l'accueil (canvas)
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext && !String(HTMLCanvasElement.prototype.getContext).includes('not implemented')
  ? HTMLCanvasElement.prototype.getContext
  : () => null;
