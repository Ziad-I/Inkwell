import { ActionCards } from "@/components/home/actionCards";
import { BraveShieldsNotice } from "@/components/home/braveWarning";
import { FeaturesSection } from "@/components/home/featureSection";
import { HeroSection } from "@/components/home/heroSection";

export default function HomePage() {
  return (
    <div>
      <div className="max-w-6xl mx-auto">
        <BraveShieldsNotice />
        <HeroSection />
        <ActionCards />
        <FeaturesSection />
      </div>
    </div>
  );
}
