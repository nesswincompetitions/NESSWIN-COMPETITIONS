import { useEffect, useRef, useState } from "react";

export default function useRevealOnScroll(options = {}) {
  const {
    threshold = 0.1,
    root = null,
    rootMargin = "0px 0px 12% 0px",
    revealOnMount = false,
  } = options;

  const ref = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    if (revealOnMount) {
      const timeoutId = window.setTimeout(() => {
        setIsRevealed(true);
      }, 220);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const node = ref.current;

    if (!node || isRevealed) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      const frame = window.requestAnimationFrame(() => {
        setIsRevealed(true);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold, root, rootMargin },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [isRevealed, revealOnMount, root, rootMargin, threshold]);

  return { ref, isRevealed };
}
