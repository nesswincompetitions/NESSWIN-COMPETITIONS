import { useEffect } from "react";
import HeroSection from "../components/HeroSection.jsx";
import FeaturedCompetitions from "../components/FeaturedCompetitions.jsx";
import HowItWorks from "../components/HowItWorks.jsx";
import WinnersShowcase from "../components/WinnersShowcase.jsx";
import TrustSection from "../components/TrustSection.jsx";
import CTASection from "../components/CTASection.jsx";

export default function Home({ scrollTargetId = "" }) {
  useEffect(() => {
    if (!scrollTargetId) return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(scrollTargetId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scrollTargetId]);

  return (
    <div className="min-h-screen bg-(--color-background)">
      <main>
        <HeroSection />
        <FeaturedCompetitions />
        <HowItWorks />
        <WinnersShowcase />
        <TrustSection />
        <CTASection />
      </main>
    </div>
  );
}
