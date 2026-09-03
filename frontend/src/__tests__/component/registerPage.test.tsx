import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const authApiMock = vi.hoisted(() => ({
  register: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ toast: { error: vi.fn() } }));

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return { ...actual, authApi: authApiMock };
});
vi.mock("sonner", () => toastMock);

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

async function renderRegister() {
  const { default: RegisterPage } = await import("@/pages/register");
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  },
) {
  return (async () => {
    if (values.username) {
      await user.type(screen.getByLabelText("Username"), values.username);
    }
    if (values.email) {
      await user.type(screen.getByLabelText("Email"), values.email);
    }
    if (values.password) {
      await user.type(screen.getByLabelText("Password"), values.password);
    }
    if (values.confirmPassword) {
      await user.type(
        screen.getByLabelText("Confirm password"),
        values.confirmPassword,
      );
    }
  })();
}

describe("RegisterPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.toast.error.mockReset();
    authApiMock.register.mockReset();
    authApiMock.register.mockResolvedValue("authenticated");
  });

  it("renders the registration form", async () => {
    await renderRegister();

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("validates email format", async () => {
    const user = userEvent.setup();
    await renderRegister();

    await fillForm(user, {
      username: "alice",
      email: "not-an-email",
      password: "supersecret",
      confirmPassword: "supersecret",
    });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(toastMock.toast.error).toHaveBeenCalledWith(
      "Please enter a valid email address.",
    );
    expect(authApiMock.register).not.toHaveBeenCalled();
  });

  it("validates the minimum password length", async () => {
    const user = userEvent.setup();
    await renderRegister();

    await fillForm(user, {
      username: "alice",
      email: "alice@example.com",
      password: "short",
      confirmPassword: "short",
    });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(toastMock.toast.error).toHaveBeenCalledWith(
      "Password must be at least 8 characters.",
    );
    expect(authApiMock.register).not.toHaveBeenCalled();
  });

  it("validates that passwords match", async () => {
    const user = userEvent.setup();
    await renderRegister();

    await fillForm(user, {
      username: "alice",
      email: "alice@example.com",
      password: "supersecret",
      confirmPassword: "different",
    });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(toastMock.toast.error).toHaveBeenCalledWith(
      "Passwords do not match.",
    );
    expect(authApiMock.register).not.toHaveBeenCalled();
  });

  it("submits the registration and navigates home on success", async () => {
    const user = userEvent.setup();
    await renderRegister();

    await fillForm(user, {
      username: "alice",
      email: "alice@example.com",
      password: "supersecret",
      confirmPassword: "supersecret",
    });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(authApiMock.register).toHaveBeenCalledWith({
        username: "alice",
        email: "alice@example.com",
        password: "supersecret",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
