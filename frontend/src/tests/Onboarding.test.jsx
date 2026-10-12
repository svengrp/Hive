// Parcours de bienvenue : « Bonjour, <prénom> », étapes, écran final, envoi des réponses une fois connecté
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Onboarding from "../components/Onboarding";
import { api } from "../lib/api";

let mockUser = null;
const mockUpdateUser = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, updateUser: mockUpdateUser }),
}));

jest.mock("../lib/api", () => ({ api: jest.fn() }));

// La carte (Leaflet / WebGL) n'existe pas dans jsdom : on la remplace par un témoin
jest.mock("../components/OnboardingMap", () => ({ onCount }) => {
  const { useEffect } = require("react");
  useEffect(() => { onCount(4); }, [onCount]);
  return <div data-testid="onboarding-map" />;
});

// Pas d'appel réseau au géocodage
jest.mock("../lib/onboarding", () => ({
  ...jest.requireActual("../lib/onboarding"),
  locatePlace: jest.fn(async () => [46.52, 6.63, 11]),
}));

const STORAGE_KEY = "hive-onboarding";
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
      <Routes>
        <Route path="/register" element={<p>Page inscription</p>} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>
  );
}

const click = (name) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  localStorage.clear();
  mockUser = null;
  mockUpdateUser.mockReset();
  api.mockReset();
});

const typeName = (value) => fireEvent.change(screen.getByPlaceholderText("Ton prénom"), { target: { value } });

test("s'ouvre à l'arrivée sur l'accueil, déjà à 10 %, sur « Bonjour »", () => {
  renderAt("/");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bonjour" })).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  expect(screen.getByText("Étape 1 sur 5")).toBeInTheDocument();
});

test("le prénom s'affiche en direct à côté de « Bonjour » et personnalise la suite", () => {
  renderAt("/");
  const continuer = screen.getByRole("button", { name: "Continuer" });
  expect(continuer).toBeDisabled();

  typeName("Léa");
  expect(screen.getByRole("heading", { name: "Bonjour, Léa" })).toBeInTheDocument();
  expect(continuer).toBeEnabled();

  click("Continuer");
  expect(screen.getByText("Qu'est-ce qui t'intéresse, Léa ?")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
});

test("ne s'ouvre pas sur un lien direct, ni pour un compte connecté, ni une fois passé", () => {
  const { unmount } = renderAt("/projects/abc123");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  unmount();

  mockUser = { _id: "u1", role: "user" };
  const second = renderAt("/");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  second.unmount();

  mockUser = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: "skipped" }));
  renderAt("/");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("3 centres d'intérêt au maximum, Continuer actif seulement à 3", () => {
  renderAt("/");
  click("Passer");
  const continuer = screen.getByRole("button", { name: "Continuer" });
  expect(continuer).toBeDisabled();

  click(/Musique/);
  click(/Design/);
  expect(continuer).toBeDisabled();
  click(/Photo/);

  expect(continuer).toBeEnabled();
  expect(screen.getByRole("button", { name: /Sport/ })).toBeDisabled();
  expect(screen.getByText("3 sur 3 sélectionnés")).toBeInTheDocument();
});

test("« Plus tard » ferme le parcours et le retient", () => {
  renderAt("/");
  click("Passer");
  click(/Musique/);
  click("Plus tard");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(saved().status).toBe("skipped");
  expect(saved().interests).toEqual(["music"]);
});

test("parcours complet : écran final sur la carte puis création de compte", async () => {
  api.mockResolvedValue([]);
  renderAt("/");
  typeName("Léa");
  click("Continuer");
  click(/Musique/);
  click(/Design/);
  click(/Photo/);
  click("Continuer");

  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "CH" } });
  fireEvent.change(screen.getByPlaceholderText("Ex. Lausanne"), { target: { value: "Lausanne" } });
  click("Continuer");

  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "70");
  fireEvent.click(screen.getByRole("radio", { name: /Lancer mon projet/ }));
  click("Terminer");

  expect(screen.getByRole("heading", { name: "Bienvenue sur Hive, Léa." })).toBeInTheDocument();
  expect(await screen.findByTestId("onboarding-map")).toBeInTheDocument();
  expect(await screen.findByText(/4 projets ouverts dans ta zone/)).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "90");
  expect(api).toHaveBeenCalledWith("/projects?status=open");

  click("Créer mon compte");
  expect(screen.getByText("Page inscription")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(saved()).toMatchObject({
    status: "done", firstName: "Léa", interests: ["music", "design", "photo"], country: "CH", city: "Lausanne", goal: "launch",
  });
});

test("une étape peut être passée sans répondre", () => {
  renderAt("/");
  click("Passer");
  click("Passer");
  expect(screen.getByText("Où es-tu basé·e ?")).toBeInTheDocument();
  click("Retour");
  expect(screen.getByText("Qu'est-ce qui t'intéresse ?")).toBeInTheDocument();
});

test("une fois connecté, les réponses sont envoyées une seule fois au compte", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    status: "done", firstName: "Léa", interests: ["music", "inconnu"], country: "CH", city: "Lausanne", goal: "both", synced: false,
  }));
  mockUser = { _id: "u1", role: "user", email: "lea@example.com" };
  api.mockResolvedValue({ _id: "u1", interests: ["music"] });

  await act(async () => { renderAt("/profile"); });

  await waitFor(() => expect(saved().synced).toBe(true));
  expect(api).toHaveBeenCalledTimes(1);
  const [path, options] = api.mock.calls[0];
  expect(path).toBe("/user/onboarding");
  expect(JSON.parse(options.body)).toMatchObject({ firstName: "Léa", interests: ["music"], city: "Lausanne", goal: "both" });
  expect(JSON.parse(options.body).country).toBeTruthy();
  expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ interests: ["music"] }));
});
