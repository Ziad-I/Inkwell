import { Link } from "react-router";
import Logo from "@/components/home/logo";
import { ThemeToggle } from "@/components/home/themeToggle";
import { UserMenu } from "@/components/auth/userMenu";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";

export function Header() {
  const status = useAuthStore((s) => s.status);

  return (
    <header className="px-4 py-2 border-2 border-t-0 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative w-10 h-10">
            <Logo size={40} className="rounded-sm" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Inkwell</h1>
        </div>
        <nav className="hidden md:flex items-center space-x-6" />
        <div className="flex items-center space-x-2">
          {status === "unauthenticated" && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="default" size="sm">
                <Link to="/register">Create account</Link>
              </Button>
            </>
          )}
          {status === "authenticated" && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">My Boards</Link>
            </Button>
          )}
          <UserMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
