// Navigation — état connecté vs non connecté + badges + thème + langue
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "../components/Header";

const mockUseAuth = jest.fn();
const mockApi = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: jest.fn() }),
}));

jest.mock("../lib/api", () => ({
  api: (...args) => mockApi(...args),
}));

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: null, logout: jest.fn() });
  mockApi.mockResolvedValue({ count: 0 });
});

test("affiche les liens de navigation principaux", () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

  expect(screen.getAllByRole("link", { name: /accueil/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: /projets/i }).length).toBeGreaterThan(0);
});

test("affiche Connexion et Inscription si l'utilisateur n'est pas connecté", () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

  expect(screen.getAllByRole("link", { name: /connexion/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: /inscription/i }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: /déconnexion/i })).not.toBeInTheDocument();
});

test("affiche Déconnexion si l'utilisateur est connecté", () => {
  mockUseAuth.mockReturnValue({
    user: { _id: "u1", email: "user@test.com" },
    logout: jest.fn(),
  });

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

  expect(screen.getAllByRole("button", { name: /déconnexion/i }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: /^connexion$/i })).not.toBeInTheDocument();
});

// TF-28 — Badge messages non lus
test("TF-28 — affiche un badge numérique si des messages directs non lus existent", async () => {
  mockUseAuth.mockReturnValue({
    user: { _id: "u1", email: "user@test.com" },
    logout: jest.fn(),
  });
  mockApi.mockImplementation((path) => {
    if (path === "/messages/unread") return Promise.resolve({ count: 3 });
    if (path === "/messages/notifications") return Promise.resolve([]);
    return Promise.resolve({});
  });

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getAllByText("3").length).toBeGreaterThan(0));
});

// TF-31 — Bouton toggle thème
test("TF-31 — l'interrupteur de thème est présent", () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

  // Interrupteur « Mode sombre » (case à cocher au rôle switch)
  expect(screen.getAllByRole("switch", { name: /mode sombre|dark mode|nav\.darkMode/i }).length).toBeGreaterThan(0);
});

// TF-32 — Bouton langue
test("TF-32 — le bouton de changement de langue affiche EN quand la langue est FR", () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

  expect(screen.getAllByText("EN").length).toBeGreaterThan(0);
});
