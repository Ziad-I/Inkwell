import { Header } from "@/components/home/header";
import { Footer } from "@/components/home/footer";
import { Outlet } from "react-router";

function AppLayout() {
  return (
    <div className="bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      <Header />

      <main className="container mx-auto px-4 py-4 lg:py-20 flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

export default AppLayout;
