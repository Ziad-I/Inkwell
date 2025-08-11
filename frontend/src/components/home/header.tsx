import Logo from "@/components/home/logo";
import { ThemeToggle } from "@/components/home/themeToggle";

export function Header() {
  return (
    <header className="container mx-auto px-4 py-6 border-2 border-t-0 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative w-10 h-10">
            <Logo size={40} className="rounded-sm" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Inkwell</h1>
        </div>
        <nav className="hidden md:flex items-center space-x-6">
          {/* <a
            href="#features"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </a> */}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
