import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import { useAuth } from "./context/AuthContext";
import Home from "./pages/Home";
import Projects from "./pages/Projects";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CreateProject from "./pages/CreateProject";
import ProjectDetails from "./pages/ProjectDetails";
import UserProfile from "./pages/UserProfile";
import ManageUsers from "./pages/ManageUsers";
import MessagesPage from "./pages/MessagesPage";
import Abonnement from "./pages/Abonnement";
import OAuthCallback from "./pages/OAuthCallback";
import BottomNav from "./components/BottomNav";
import Footer from "./components/Footer";
import { PrivacyPolicy, Terms, Imprint } from "./pages/Legal";
import { useTranslation } from "react-i18next";
import { useSeo } from "./lib/seo";

import "./App.css";

/* 404 : jamais indexée */
function NotFound() {
  const { t } = useTranslation();
  useSeo({ title: t("seo.notFoundTitle"), noindex: true });
  return <h1>{t("seo.notFoundTitle")}</h1>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; 
  }
  return (
    <>
      <Header />
      <main style={{ paddingBottom: "var(--bottom-nav-height, 0px)" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element ={<Projects />} />
          <Route path="/abonnement" element={<Abonnement />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
          <Route path="/manage-users" element={user && user.role === 'admin' ? <ManageUsers /> : <Navigate to="/" replace />} />
          <Route path="/messages" element={user ? <MessagesPage /> : <Navigate to="/login" replace />} />

          <Route path="/login" element={user ? <Navigate to="/profile" replace /> : <Login />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/register" element={user ? <Navigate to="/profile" replace /> : <Register />} />
          <Route path="/create-project" element={user ? <CreateProject /> : <Navigate to="/login" replace />} />
          <Route path="/projects/:id/edit" element={user ? <CreateProject /> : <Navigate to="/login" replace />} />
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/users/:id" element={<UserProfile />} />
          <Route path="/forgotpassword" element={user ? <Navigate to="/profile" replace /> : <ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Pages légales (LPD / RGPD / LCD) */}
          <Route path="/confidentialite" element={<PrivacyPolicy />} />
          <Route path="/conditions" element={<Terms />} />
          <Route path="/mentions-legales" element={<Imprint />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </main>
      <BottomNav />
    </>
  );
}
