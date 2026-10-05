import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RegisterForm from "../components/RegisterForm";

const mockRegister = jest.fn();
const mockVerifyEmail = jest.fn();
const mockResendVerificationEmail = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    register: mockRegister,
    verifyEmail: mockVerifyEmail,
    resendVerificationEmail: mockResendVerificationEmail,
  }),
}));

beforeEach(() => {
  mockRegister.mockReset();
  mockVerifyEmail.mockReset();
});

// TF-01 — inscription
test("TF-01 — permet à un utilisateur de s'inscrire", async () => {
  mockRegister.mockResolvedValue({ message: "Compte créé." });

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RegisterForm />
    </MemoryRouter>
  );

  await userEvent.type(screen.getByLabelText("Email"), "newuser@mail.com");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "Password1!");
  await userEvent.type(screen.getByLabelText("Confirmer le mot de passe"), "Password1!");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));

  expect(mockRegister).toHaveBeenCalledWith({
    email: "newuser@mail.com",
    password: "Password1!",
    acceptTerms: true,
  });
});

// Consentement LPD / RGPD : impossible de s'inscrire sans accepter les conditions
test("inscription bloquée tant que les conditions ne sont pas acceptées", async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RegisterForm />
    </MemoryRouter>
  );

  await userEvent.type(screen.getByLabelText("Email"), "newuser@mail.com");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "Password1!");
  await userEvent.type(screen.getByLabelText("Confirmer le mot de passe"), "Password1!");

  const submitBtn = screen.getByRole("button", { name: /créer mon compte/i });
  expect(submitBtn).toBeDisabled();
  expect(screen.getByRole("link", { name: /conditions/i })).toHaveAttribute("href", "/conditions");
  expect(screen.getByRole("link", { name: /confidentialité/i })).toHaveAttribute("href", "/confidentialite");

  await userEvent.click(screen.getByRole("checkbox"));
  expect(submitBtn).not.toBeDisabled();
  expect(mockRegister).not.toHaveBeenCalled();
});

// TF-01 — étape OTP
test("TF-01 — affiche l'étape de vérification email après inscription réussie", async () => {
  mockRegister.mockResolvedValueOnce({ message: "Compte créé." });

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RegisterForm />
    </MemoryRouter>
  );

  await userEvent.type(screen.getByLabelText("Email"), "newuser@mail.com");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "Password1!");
  await userEvent.type(screen.getByLabelText("Confirmer le mot de passe"), "Password1!");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));

  await waitFor(() =>
    expect(screen.getByText(/vérification de l'email/i)).toBeInTheDocument()
  );
});

// TF-39 — entropie mot de passe
test("TF-39 — désactive le bouton si le mot de passe est trop faible (entropie < 36 bits)", async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RegisterForm />
    </MemoryRouter>
  );

  await userEvent.type(screen.getByLabelText("Mot de passe"), "abc");

  const submitBtn = screen.getByRole("button", { name: /créer mon compte/i });
  expect(submitBtn).toBeDisabled();
});

test("TF-39 — active le bouton si le mot de passe est suffisamment fort", async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RegisterForm />
    </MemoryRouter>
  );

  await userEvent.type(screen.getByLabelText("Mot de passe"), "Password1!");
  await userEvent.click(screen.getByRole("checkbox"));

  const submitBtn = screen.getByRole("button", { name: /créer mon compte/i });
  expect(submitBtn).not.toBeDisabled();
});
