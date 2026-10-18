export const BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5050/api";

// ---------------------------------------------------
// Fonction API générique
// ---------------------------------------------------

/* Erreur lisible (message du serveur) qui garde aussi le statut et le code renvoyés,
   ex. err.code === "email_not_verified" à la connexion. */
function apiError(res, data, fallback) {
  const err = new Error(data?.message || data?.error || fallback);
  err.status = res.status;
  err.code = data?.code;
  err.data = data;
  return err;
}

export async function api(path, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");

  const data = isJson ? await res.json().catch(() => null) : null;

  if (res.status === 401) {
    const onLoginPage = window.location.pathname === "/login";
    if (token && !onLoginPage) {
      // Session expirée depuis une autre page : on nettoie et on redirige
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    throw apiError(res, data, "Email ou mot de passe incorrect.");
  }

  if (!res.ok) {
    throw apiError(res, data, res.statusText);
  }

  return data;
}
