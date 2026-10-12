import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import ProjectDetails from "../pages/ProjectDetails";

const mockApi = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../lib/api", () => ({
  api: (...args) => mockApi(...args),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { _id: "viewer-1" },
  }),
}));

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: jest.fn() }),
}));

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="project-map">{children}</div>,
  TileLayer: () => null,
  Marker: () => <div data-testid="project-marker" />,
  Popup: ({ children }) => <div>{children}</div>,
  // Le fond de carte (BaseMapLayers) accède à l'instance Leaflet via useMap.
  useMap: () => ({}),
}));

const fakeProject = {
  _id: "project-1",
  title: "Projet test",
  description: "Description",
  status: "open",
  participants: [],
  location: { coordinates: [6.1432, 46.2044] },
  ownerId: {
    _id: "owner-1",
    displayName: "Marie Dev",
    firstName: "Marie",
    lastName: "Dupont",
    bio: "Créatrice du projet",
    avatarUrl: "https://cdn.example.com/avatar.png",
    address: { city: "Genève", country: "Suisse" },
  },
  projectMeta: {
    city: "Genève",
    region: "Suisse",
    startDate: "2026-04-10",
    endDate: "2026-04-12",
  },
};

beforeEach(() => {
  mockApi.mockReset();
  mockNavigate.mockReset();
  mockApi.mockResolvedValue(fakeProject);
});

test("affiche le propriétaire du projet et permet d'ouvrir son profil", async () => {
  render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetails />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText("Marie Dev")).toBeInTheDocument());
  expect(screen.getByText(/créateur du projet/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /voir le profil/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /voir le profil/i }));
  expect(mockNavigate).toHaveBeenCalledWith("/users/owner-1");
});

test("affiche une mini carte avec la position du projet", async () => {
  render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetails />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByTestId("project-map")).toBeInTheDocument());
  expect(screen.getByTestId("project-marker")).toBeInTheDocument();
  expect(within(screen.getByText(/aperçu carte/i).closest("div")).getByText("Genève, Suisse")).toBeInTheDocument();
});

// TF-11 — envoi d'une demande de participation
test("TF-11 — ouvre le modal de demande et envoie la demande via l'API", async () => {
  mockApi.mockImplementation((path, opts) => {
    if (path === "/projects/project-1") return Promise.resolve(fakeProject);
    if (path === "/requests/project-1/mine") return Promise.resolve(null);
    if (path === "/requests/project-1/list") return Promise.resolve([]);
    if (path === "/requests/project-1") return Promise.resolve({ status: "pending" });
    return Promise.resolve(null);
  });

  render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetails />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText("Marie Dev")).toBeInTheDocument());

  // Ouvre le modal de demande
  const openBtn = await screen.findByRole("button", { name: /envoyer une demande/i });
  await userEvent.click(openBtn);

  // Soumet la demande dans le modal
  const submitBtn = await screen.findByRole("button", { name: /envoyer la demande/i });
  await userEvent.click(submitBtn);

  await waitFor(() =>
    expect(mockApi).toHaveBeenCalledWith(
      "/requests/project-1",
      expect.objectContaining({ method: "POST" })
    )
  );
});

// TF-12 — statut "en attente" si demande déjà envoyée
test("TF-12 — affiche le statut 'en attente' si une demande est déjà envoyée", async () => {
  mockApi.mockImplementation((path) => {
    if (path === "/projects/project-1") return Promise.resolve(fakeProject);
    if (path === "/requests/project-1/mine") return Promise.resolve({ status: "pending" });
    if (path === "/requests/project-1/list") return Promise.resolve([]);
    return Promise.resolve(null);
  });

  render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetails />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() =>
    expect(screen.getByText(/demande en attente/i)).toBeInTheDocument()
  );
  expect(screen.queryByRole("button", { name: /envoyer une demande/i })).not.toBeInTheDocument();
});

describe("partage d'un projet", () => {
  const renderProject = () => render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetails />} />
      </Routes>
    </MemoryRouter>
  );

  afterEach(() => {
    delete navigator.share;
    delete navigator.clipboard;
  });

  test("sur mobile : feuille de partage native avec le lien court /p/:id", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderProject();

    await userEvent.click(await screen.findByRole("button", { name: "Partager" }));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "Projet test",
      url: `${window.location.origin}/p/project-1`,
    }));
  });

  test("sans partage natif : le lien est copié et le bouton le confirme", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderProject();

    await userEvent.click(await screen.findByRole("button", { name: "Partager" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/project-1`);
    expect(await screen.findByRole("button", { name: "Lien copié" })).toBeInTheDocument();
  });
});
