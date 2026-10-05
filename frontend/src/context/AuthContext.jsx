import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session
  useEffect(() => {
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }

    setLoading(false);
  }, []);

  // ------------------------
  // AUTH CLASSIQUE
  // ------------------------

  const register = async ({ email, password, acceptTerms }) => {
    return api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, acceptTerms }),
    });
  };

  const verifyEmail = async (email, code) => {
    return api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  };

  const resendVerificationEmail = async (email) => {
    return api("/auth/resend-verification-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  };

  const login = async ({ email, password, rememberMe = false }) => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, rememberMe }),
    });

    if (data?.token) {
      localStorage.setItem("token", data.token);
    }

    const u = data?.user || { email };
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);

    return data;
  };

  // Connexion Google/GitHub : le backend renvoie seulement un token, on récupère le profil avec /auth/me
  const loginWithToken = async (token) => {
    localStorage.setItem("token", token);
    try {
      const data = await api("/auth/me");
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (err) {
      localStorage.removeItem("token");
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  // ------------------------
  // RESET PASSWORD FLOW (OTP)
  // ------------------------

  // 1 Envoi du code par email
  const resetPassword = async (email) => {
    return api("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  };

  // 2 Vérification du code OTP
  const verifyResetCode = async (email, code) => {
    return api("/auth/verify-reset-code", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  };

  // 3 Reset final du mot de passe
  const confirmResetPassword = async (email, code, newPassword) => {
    return api("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        email,
        code,
        newPassword,
      }),
    });
  };

  // 4 Changements infos profile
  const updateUser = async (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    return updatedUser;
  };



  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        register,
        verifyEmail,
        resendVerificationEmail,
        login,
        loginWithToken,
        logout,
        resetPassword,
        verifyResetCode,
        confirmResetPassword,
        updateUser,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
