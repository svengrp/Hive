import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Clair par défaut.
  // Le choix explicite de l'utilisateur (bouton du Header) reste mémorisé.
  const [theme, setTheme] = useState(() => localStorage.getItem("hive-theme") || "light");

  useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f6f7f9" : "#0c0d10");
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("hive-theme", next);
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
