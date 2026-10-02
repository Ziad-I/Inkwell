import Logo from "@/components/home/logo";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center space-x-3 mb-4 md:mb-0">
            <Logo size={24} className="rounded-sm" />
            <span className="font-semibold">Inkwell</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 Inkwell. Built for creative collaboration.
          </p>
        </div>
      </div>
    </footer>
  );
}
