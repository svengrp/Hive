import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MapView from "../components/MapView";

const mockApi = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../lib/api", () => ({
  api: (...args) => mockApi(...args),
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

// Carte Leaflet factice : même objet à chaque rendu (sinon les effets de la carte se relancent sans fin)
const mockMap = {
  setView: jest.fn(),
  panTo: jest.fn(),
  flyTo: jest.fn(),
  getZoom: () => 12,
  on: jest.fn(),
  off: jest.fn(),
  invalidateSize: jest.fn(),
  latLngToContainerPoint: () => ({ x: 0, y: 0 }),
  containerPointToLatLng: () => ({ lat: 46.2, lng: 6.14 }),
  project: () => ({ x: 0, y: 0, subtract: () => ({ x: 0, y: 0 }), add: () => ({ x: 0, y: 0 }) }),
  unproject: () => ({ lat: 46.2, lng: 6.14 }),
  getSize: () => ({ x: 800, y: 600 }),
  getContainer: () => global.document.createElement("div"),
  scrollWheelZoom: { enable: jest.fn(), disable: jest.fn() },
  dragging: { enable: jest.fn(), disable: jest.fn() },
};

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-root">{children}</div>,
  TileLayer: () => null,
  Marker: ({ eventHandlers, children }) => (
    <button type="button" onClick={() => eventHandlers?.click?.()}>{children || "marker"}</button>
  ),
  useMap: () => mockMap,
}));

// Fond de carte vectoriel (WebGL) : absent de jsdom
jest.mock("../components/BaseMapLayers", () => () => null);

beforeEach(() => {
  mockApi.mockReset();
  mockNavigate.mockReset();
  global.navigator.geolocation = {
    getCurrentPosition: jest.fn((success) =>
      success({ coords: { latitude: 46.2, longitude: 6.14 } })
    ),
  };
  mockApi.mockResolvedValue([
    {
      _id: "project-1",
      title: "Club de foot",
      description: "Matchs tous les dimanches",
      tags: ["Sport"],
      location: { coordinates: [6.1432, 46.2044] },
      participants: [],
      maxParticipants: 20,
      minAge: 10,
      maxAge: 15,
      projectMeta: {
        city: "Genève",
        region: "Suisse",
        startDate: "2026-04-12",
      },
    },
  ]);
});

test("ouvre un panneau latéral quand on clique sur un projet sur la carte", async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MapView />
    </MemoryRouter>
  );

  await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/projects?status=open"));
  const markers = await screen.findAllByRole("button", { name: /marker/i });
  await userEvent.click(markers[0]);

  expect(await screen.findByText("Club de foot")).toBeInTheDocument();
  expect(screen.getByText(/matchs tous les dimanches/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /ouvrir le projet/i })).toBeInTheDocument();
});

test("ferme le panneau projet quand on clique sur fermer", async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MapView />
    </MemoryRouter>
  );

  await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/projects?status=open"));
  const markers = await screen.findAllByRole("button", { name: /marker/i });
  await userEvent.click(markers[0]);

  expect(await screen.findByText("Club de foot")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /fermer le panneau projet/i }));

  await waitFor(() =>
    expect(screen.queryByText("Club de foot")).not.toBeInTheDocument()
  );
});
