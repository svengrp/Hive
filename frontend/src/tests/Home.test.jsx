// Accueil : présentation de Hive pour un inconnu, salutation directe pour quelqu'un de connu
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "../pages/Home";

let mockUser = null;

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockMapView = jest.fn();
jest.mock("../components/MapView", () => (props) => {
  mockMapView(props);
  return <div data-testid="map" />;
});
jest.mock("../components/HeroNetwork", () => () => null);

const STORAGE_KEY = "hive-onboarding";

// jsdom n'a ni matchMedia ni IntersectionObserver (section « Trois étapes »)
beforeAll(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  mockUser = null;
  mockMapView.mockReset();
});

test("un nouveau visiteur voit la présentation de Hive", () => {
  renderHome();
  expect(screen.getByRole("heading", { level: 1, name: /Trouve les bonnes personnes/ })).toBeInTheDocument();
  expect(screen.getByText("Trois étapes pour donner vie à ton projet")).toBeInTheDocument();
});

test("après le parcours, l'accueil salue et ouvre la carte sur sa ville", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    status: "done", firstName: "Léa", interests: ["music"], country: "CH", city: "Lausanne", view: [46.52, 6.63, 11],
  }));
  renderHome();

  expect(screen.getByRole("heading", { level: 1, name: /^Bonjour, Léa ?\.$/ })).toBeInTheDocument();
  expect(screen.getByText(/autour de Lausanne/)).toBeInTheDocument();
  expect(screen.queryByText("Trois étapes pour donner vie à ton projet")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Profil prêt à 90/ })).toHaveAttribute("href", "/register");
  expect(mockMapView).toHaveBeenCalledWith(expect.objectContaining({ initialView: [46.52, 6.63, 11] }));
});

test("parcours mis de côté sans aucune réponse : la présentation reste", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: "skipped" }));
  renderHome();
  expect(screen.getByRole("heading", { level: 1, name: /Trouve les bonnes personnes/ })).toBeInTheDocument();
});

test("un compte connecté est salué par son prénom, sans invitation à s'inscrire", () => {
  mockUser = { _id: "u1", firstName: "Sam" };
  renderHome();
  expect(screen.getByRole("heading", { level: 1, name: /^Bonjour, Sam ?\.$/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Profil prêt/ })).not.toBeInTheDocument();
});
