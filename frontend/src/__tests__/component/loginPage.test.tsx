import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AxiosError } from "axios";

const authStoreMock = vi.hoisted(() => ({
  setSession: vi.fn(),
}));

const apiMock = vi.hoisted(() => ({
  default: { post: vi.fn() },
  apiErrorMessage: (err: unknown, fallback: string) => {
    if (err instanceof AxiosError) {
      const message = (err.response?.data as { message?: string } | undefined)
        ?.message;
      if (message) return message;
    }
    return fallback;
  },
}));

const toastMock = vi.hoisted(() => ({ toast: { error: vi.fn() } }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: null,
      status: "idle",
      setSession: authStoreMock.setSession,
    }),
}));
vi.mock("@/lib/api", () => apiMock);
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
    authStoreMock.setSession.mockReset();
    apiMock.default.post.mockReset();
    apiMock.default.post.mockResolvedValue({
      data: { user: { id: "u1" }, accessToken: "access-1" },
    });
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
    expect(apiMock.default.post).not.toHaveBeenCalled();
  });

  it("submits credentials and navigates home on success", async () => {
    const user = userEvent.setup();
    await renderLogin();

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(apiMock.default.post).toHaveBeenCalledWith("/auth/login", {
        email: "alice@example.com",
        password: "supersecret",
      });
    });
    expect(authStoreMock.setSession).toHaveBeenCalledWith(
      { id: "u1" },
      "access-1",
    );
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("shows the server error message as a toast on failure", async () => {
    const apiError = new AxiosError(
      "Request failed with status code 401",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 401,
        data: { message: "Invalid email or password" },
      } as never,
    );
    apiMock.default.post.mockRejectedValue(apiError);

    const user = userEvent.setup();
    await renderLogin();

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "badpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(toastMock.toast.error).toHaveBeenCalledWith(
        "Invalid email or password",
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
