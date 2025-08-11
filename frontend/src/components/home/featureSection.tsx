import { PenTool, Users, Zap, DoorOpen } from "lucide-react";

const features = [
  {
    icon: PenTool,
    title: "Intuitive Drawing",
    description: "Natural drawing experience with multiple brushes",
  },
  {
    icon: Users,
    title: "Real-time Sync",
    description:
      "See changes instantly as your team collaborates in real-time from anywhere",
  },
  {
    icon: DoorOpen,
    title: "No Sign Up Required",
    description:
      "Start collaborating instantly without the hassle of creating an account",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description:
      "Optimized performance ensures smooth drawing and instant collaboration",
  },
  {
    icon: PenTool,
    title: "Cross-Platform",
    description: "Works seamlessly across devices and platforms",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="mb-20">
      <div className="text-center mb-12">
        <h3 className="text-3xl font-bold text-foreground mb-4">
          Everything you need to collaborate
        </h3>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Powerful features designed to make remote collaboration seamless and
          productive
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <div key={index} className="text-center group">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
              <feature.icon className="w-8 h-8 text-primary" />
            </div>
            <h4 className="text-xl font-semibold mb-2">{feature.title}</h4>
            <p className="text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
