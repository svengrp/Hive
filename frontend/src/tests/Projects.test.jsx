// EF-06/EF-17/EF-18 — Liste des projets, recherche et filtres
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Projects from "../pages/Projects";

const mockApi = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("../lib/api", () => ({
  api: (...args) => mockApi(...args),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const fakeProjects = [
  {
    _id: "1",
    title: "Projet Alpha",
    description: "Application React pour les créateurs",
    status: "open",
    tags: ["React", "Node"],
    participants: [],
    maxParticipants: 5,
    minAge: 18,
    projectMeta: { city: "Genève", region: "Romandie" },
  },
  {
    _id: "2",
    title: "Projet Beta",
    description: "API Python pour la data science",
    status: "open",
    tags: ["Python"],
    participants: [],
    maxParticipants: 3,
    minAge: 16,
    projectMeta: { city: "Lausanne", region: "Vaud" },
  },
];

// Simule GET /projects paginé : le filtrage (q, tags, region) est fait côté serveur.
function fakeProjectsPage(path) {
  const params = new URLSearchParams(path.split("?")[1]);
  const q = (params.get("q") || "").toLowerCase();
  const tags = params.get("tags") ? params.get("tags").split(",") : [];
  const region = params.get("region") || "";
  const items = fakeProjects.filter((p) =>
    (!q || [p.title, p.description, ...p.tags].join(" ").toLowerCase().includes(q)) &&
    (tags.length === 0 || tags.some((tag) => p.tags.includes(tag))) &&
    (!region || p.projectMeta.region === region)
  );
  return { items, total: items.length, page: 1, hasMore: false };
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: null });
  mockApi.mockImplementation((path) => {
    if (path.startsWith("/projects?")) return Promise.resolve(fakeProjectsPage(path));
    if (path.startsWith("/projects/tags?popular")) return Promise.resolve(["React", "Node", "Python"]);
    if (path === "/projects/tags") return Promise.resolve(["React", "Node", "Python"]);
    if (path === "/projects/regions") return Promise.resolve(["Romandie", "Vaud"]);
    return Promise.resolve([]);
  });
});

test("EF-06 — affiche la liste complète des projets après chargement", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() =>
    expect(screen.getByText("Projet Alpha")).toBeInTheDocument()
  );
  expect(screen.getByText("Projet Beta")).toBeInTheDocument();
});

test("EF-06 — affiche le nombre de projets trouvés", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText(/2 projets/i)).toBeInTheDocument());
});

test("EF-17 — filtre les projets par recherche mot-clé sur le titre", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet Alpha"));

  await userEvent.type(screen.getByPlaceholderText(/rechercher/i), "Alpha");

  await waitFor(() => expect(screen.queryByText("Projet Beta")).not.toBeInTheDocument());
  expect(screen.getByText("Projet Alpha")).toBeInTheDocument();
  expect(screen.getByText(/1 projet/i)).toBeInTheDocument();
});

test("EF-17 — filtre les projets par recherche sur la description", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet Beta"));

  await userEvent.type(screen.getByPlaceholderText(/rechercher/i), "data science");

  await waitFor(() => expect(screen.queryByText("Projet Alpha")).not.toBeInTheDocument());
  expect(screen.getByText("Projet Beta")).toBeInTheDocument();
});

test("EF-18 — filtre les projets par tag de compétence", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet Alpha"));

  // Cliquer sur le filtre "Python" (bouton dans la section filtres)
  await userEvent.click(await screen.findByRole("button", { name: "Python" }));

  await waitFor(() => expect(screen.queryByText("Projet Alpha")).not.toBeInTheDocument());
  expect(screen.getByText("Projet Beta")).toBeInTheDocument();
});

test("EF-18 — efface tous les filtres avec le bouton de réinitialisation", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet Alpha"));

  await userEvent.type(screen.getByPlaceholderText(/rechercher/i), "Alpha");
  await waitFor(() => expect(screen.queryByText("Projet Beta")).not.toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /réinitialiser les filtres/i }));

  expect(await screen.findByText("Projet Beta")).toBeInTheDocument();
  expect(screen.getByText("Projet Alpha")).toBeInTheDocument();
});

test("EF-06 — affiche le bouton 'Créer un projet' uniquement si connecté", async () => {
  mockUseAuth.mockReturnValue({ user: { email: "user@test.com" } });

  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet Alpha"));

  expect(
    screen.getByRole("button", { name: /créer un projet/i })
  ).toBeInTheDocument();
});

test("EF-06 — n'affiche pas le bouton 'Créer un projet' si non connecté", async () => {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet Alpha"));

  expect(
    screen.queryByRole("button", { name: /créer un projet/i })
  ).not.toBeInTheDocument();
});

test("EF-06 — charge la page suivante avec « Voir plus »", async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({
    ...fakeProjects[0],
    _id: `p${i}`,
    title: `Projet ${i + 1}`,
  }));
  mockApi.mockImplementation((path) => {
    if (path.startsWith("/projects?")) {
      const params = new URLSearchParams(path.split("?")[1]);
      const page = Number(params.get("page"));
      const limit = Number(params.get("limit"));
      const items = many.slice((page - 1) * limit, page * limit);
      return Promise.resolve({ items, total: many.length, page, hasMore: page * limit < many.length });
    }
    return Promise.resolve([]);
  });

  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText("Projet 12"));
  expect(screen.queryByText("Projet 13")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /voir plus/i }));

  expect(await screen.findByText("Projet 14")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /voir plus/i })).not.toBeInTheDocument();
});

describe("Pour toi : centres d'intérêt", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApi.mockImplementation((path) => {
      if (path.startsWith("/projects?")) {
        const params = new URLSearchParams(path.split("?")[1]);
        const items = fakeProjects.map((p) => ({ ...p, matchedInterests: p._id === "1" ? ["tech"] : [] }));
        const shown = params.get("forYou") === "1" ? items.filter((p) => p.matchedInterests.length) : items;
        return Promise.resolve({ items: shown, total: shown.length, page: 1, hasMore: false });
      }
      return Promise.resolve([]);
    });
  });

  afterEach(() => localStorage.clear());

  const projectRequests = () => mockApi.mock.calls.map(([path]) => path).filter((path) => path.startsWith("/projects?"));

  test("visiteur passé par le parcours : ses centres d'intérêt partent avec la liste, badge sur les cartes", async () => {
    localStorage.setItem("hive-onboarding", JSON.stringify({ status: "done", interests: ["tech", "music"] }));
    render(<MemoryRouter><Projects /></MemoryRouter>);

    expect(await screen.findByText("Pour toi · Tech & dev")).toBeInTheDocument();
    expect(projectRequests().at(-1)).toContain("interests=tech%2Cmusic");
    expect(projectRequests().at(-1)).not.toContain("forYou");
    expect(screen.getByText(/Selon tes centres d'intérêt : Tech & dev, Musique/)).toBeInTheDocument();
  });

  test("l'onglet « Pour toi » ne garde que les projets correspondants", async () => {
    localStorage.setItem("hive-onboarding", JSON.stringify({ status: "done", interests: ["tech"] }));
    render(<MemoryRouter><Projects /></MemoryRouter>);
    await screen.findByText("Projet Beta");

    await userEvent.click(screen.getByRole("button", { name: "Pour toi" }));

    await waitFor(() => expect(screen.queryByText("Projet Beta")).not.toBeInTheDocument());
    expect(screen.getByText("Projet Alpha")).toBeInTheDocument();
    expect(projectRequests().at(-1)).toContain("forYou=1");
    expect(screen.getByRole("button", { name: "Pour toi" })).toHaveAttribute("aria-pressed", "true");
  });

  test("compte connecté : ses centres d'intérêt à lui, pas ceux du navigateur", async () => {
    localStorage.setItem("hive-onboarding", JSON.stringify({ status: "done", interests: ["music"] }));
    mockUseAuth.mockReturnValue({ user: { _id: "u1", interests: ["photo"] } });
    render(<MemoryRouter><Projects /></MemoryRouter>);
    await screen.findByText("Projet Alpha");
    expect(projectRequests().at(-1)).toContain("interests=photo");
  });

  test("sans centres d'intérêt : pas d'onglet, rien d'envoyé", async () => {
    render(<MemoryRouter><Projects /></MemoryRouter>);
    await screen.findByText("Projet Alpha");
    expect(screen.queryByRole("button", { name: "Pour toi" })).not.toBeInTheDocument();
    expect(projectRequests().at(-1)).not.toContain("interests");
  });
});
