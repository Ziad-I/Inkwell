import { ActionCards } from "@/components/home/actionCards";
import { BraveShieldsNotice } from "@/components/home/braveWarning";
import { FeaturesSection } from "@/components/home/featureSection";
import { Footer } from "@/components/home/footer";
import { Header } from "@/components/home/header";
import { HeroSection } from "@/components/home/heroSection";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <main className="container mx-auto px-4 py-12 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <BraveShieldsNotice />
          <HeroSection />
          <ActionCards />
          <FeaturesSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}
