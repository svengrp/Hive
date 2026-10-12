// Connexion : les réponses du parcours de bienvenue partent AVANT l'ouverture du profil
import { act, render } from "@testing-library/react";
import AuthProvider, { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

jest.mock("../lib/api", () => ({ api: jest.fn() }));

const STORAGE_KEY = "hive-onboarding";
let auth;

function Probe() {
  auth = useAuth();
  return null;
}

function renderProvider() {
  render(<AuthProvider><Probe /></AuthProvider>);
}

beforeEach(() => {
  localStorage.clear();
  api.mockReset();
});

test("à la connexion, les réponses sont rattachées au compte avant de rendre la main", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    status: "done", firstName: "Léa", interests: ["music", "design"], country: "CH", city: "Lausanne", goal: "join", synced: false,
  }));
  api.mockImplementation(async (path) => {
    if (path === "/auth/login") return { token: "t", user: { _id: "u1", email: "lea@example.com", interests: [] } };
    if (path === "/user/onboarding") return { _id: "u1", firstName: "Léa", interests: ["music", "design"] };
    return null;
  });
  renderProvider();

  await act(async () => { await auth.login({ email: "lea@example.com", password: "x" }); });

  expect(api.mock.calls.map(([path]) => path)).toEqual(["/auth/login", "/user/onboarding"]);
  expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({ firstName: "Léa", interests: ["music", "design"], city: "Lausanne" });
  expect(auth.user).toMatchObject({ firstName: "Léa", interests: ["music", "design"] });
  expect(JSON.parse(localStorage.getItem("user")).interests).toEqual(["music", "design"]);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).synced).toBe(true);
});

test("rien à envoyer : la connexion se fait sans appel supplémentaire", async () => {
  api.mockResolvedValue({ token: "t", user: { _id: "u1" } });
  renderProvider();
  await act(async () => { await auth.login({ email: "a@b.ch", password: "x" }); });
  expect(api).toHaveBeenCalledTimes(1);
});

test("un échec de l'envoi n'empêche pas la connexion", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: "done", firstName: "Léa", synced: false }));
  api.mockImplementation(async (path) => {
    if (path === "/auth/login") return { token: "t", user: { _id: "u1" } };
    throw new Error("réseau");
  });
  renderProvider();
  await act(async () => { await auth.login({ email: "a@b.ch", password: "x" }); });
  expect(auth.user).toMatchObject({ _id: "u1" });
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).synced).toBe(false);
});
