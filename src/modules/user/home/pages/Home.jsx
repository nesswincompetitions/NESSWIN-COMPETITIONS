import { useEffect, useState } from 'react';
import HeroSection from '@/modules/user/home/components/HeroSection';
import FeaturedCompetitions from '@/modules/user/home/components/FeaturedCompetitions';
import HowItWorks from '@/modules/user/home/components/HowItWorks';
import WinnersShowcase from '@/modules/user/home/components/WinnersShowcase';
import TrustSection from '@/modules/user/home/components/TrustSection';
import CTASection from '@/modules/user/home/components/CTASection';

export default function Home({ scrollTargetId = "" }) {
  const [isFeaturedLoaded, setIsFeaturedLoaded] = useState(false);

  useEffect(() => {
    if (!scrollTargetId || !isFeaturedLoaded) return;

    const frame = window.requestAnimationFrame(() => {
      // Small timeout to ensure DOM has painted the expanded cards
      setTimeout(() => {
        const target = document.getElementById(scrollTargetId);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scrollTargetId, isFeaturedLoaded]);

  return (
    <div className="min-h-screen bg-(--color-background)">
      <main>
        <HeroSection />
        <FeaturedCompetitions onLoadComplete={() => setIsFeaturedLoaded(true)} />
        <HowItWorks />
        <WinnersShowcase />
        <TrustSection />
        <CTASection />
      </main>
    </div>
  );
}
