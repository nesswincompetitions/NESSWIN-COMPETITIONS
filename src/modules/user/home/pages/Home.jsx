import { useEffect } from 'react';
import HeroSection from '@/modules/user/home/components/HeroSection';
import FeaturedCompetitions from '@/modules/user/home/components/FeaturedCompetitions';
import HowItWorks from '@/modules/user/home/components/HowItWorks';
import WinnersShowcase from '@/modules/user/home/components/WinnersShowcase';
import TrustSection from '@/modules/user/home/components/TrustSection';
import CTASection from '@/modules/user/home/components/CTASection';

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
