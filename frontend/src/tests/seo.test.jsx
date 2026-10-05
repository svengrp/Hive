// SEO — titre, description, canonical et robots mis à jour par page puis restaurés
import { render } from "@testing-library/react";
import { useSeo, toMetaDescription } from "../lib/seo";

const meta = (selector, attr = "content") => document.head.querySelector(selector)?.getAttribute(attr);

function Page(props) {
  useSeo(props);
  return null;
}

beforeAll(() => {
  document.head.innerHTML = `
    <title>Hive — défaut</title>
    <meta name="description" content="Description par défaut" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://hive-app.ch/" />
    <meta property="og:title" content="Hive — défaut" />
    <meta property="og:description" content="Description par défaut" />
    <meta property="og:url" content="https://hive-app.ch/" />
    <meta name="twitter:title" content="Hive — défaut" />
    <meta name="twitter:description" content="Description par défaut" />`;
});

test("met à jour les balises de la page puis restaure les valeurs par défaut", () => {
  const { unmount } = render(<Page title="Festival des Vignes" description="On cherche des bénévoles." path="/projects/42" />);

  expect(document.title).toBe("Festival des Vignes — Hive");
  expect(meta('meta[name="description"]')).toBe("On cherche des bénévoles.");
  expect(meta('meta[property="og:title"]')).toBe("Festival des Vignes — Hive");
  expect(meta('link[rel="canonical"]', "href")).toBe(`${window.location.origin}/projects/42`);
  expect(meta('meta[name="robots"]')).toBe("index, follow");

  unmount();
  expect(document.title).toBe("Hive — défaut");
  expect(meta('meta[name="description"]')).toBe("Description par défaut");
  expect(meta('link[rel="canonical"]', "href")).toBe("https://hive-app.ch/");
});

test("noindex est posé puis retiré", () => {
  const { unmount } = render(<Page title="Profil" noindex />);
  expect(meta('meta[name="robots"]')).toBe("noindex, nofollow");
  unmount();
  expect(meta('meta[name="robots"]')).toBe("index, follow");
});

test("toMetaDescription coupe à 160 caractères sur un mot", () => {
  expect(toMetaDescription("  court\n texte ")).toBe("court texte");
  const long = toMetaDescription("mot ".repeat(80));
  expect(long.length).toBeLessThanOrEqual(160);
  expect(long.endsWith("mot…")).toBe(true);
});
