import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AxiosError } from "axios";

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
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

async function renderLogin() {
  const { default: LoginPage } = await import("@/pages/login");
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.toast.error.mockReset();
    authApiMock.login.mockReset();
    authApiMock.login.mockResolvedValue("authenticated");
  });

  it("renders email and password fields", async () => {
    await renderLogin();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows a toast when fields are empty", async () => {
    const user = userEvent.setup();
    await renderLogin();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(toastMock.toast.error).toHaveBeenCalledWith(
      "Please fill in your email and password.",
    );
    expect(authApiMock.login).not.toHaveBeenCalled();
  });

  it("submits credentials and navigates home on success", async () => {
    const user = userEvent.setup();
    await renderLogin();

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authApiMock.login).toHaveBeenCalledWith({
        email: "alice@example.com",
        password: "supersecret",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("shows the stable error message as a toast on failure", async () => {
    const apiError = new AxiosError(
      "Request failed with status code 401",
      "ERR_BAD_REQUEST",
      { url: "/auth/login", method: "post" } as never,
      undefined,
      {
        status: 401,
        data: { message: "alice@example.com: 3 failed sign-in attempts" },
      } as never,
    );
    authApiMock.login.mockRejectedValue(apiError);

    const user = userEvent.setup();
    await renderLogin();

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "badpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(toastMock.toast.error).toHaveBeenCalledWith(
        "Invalid email or password.",
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
