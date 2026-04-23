import useRevealOnScroll from "../../hooks/useRevealOnScroll.js";

export default function Reveal({
  children,
  className = "",
  delay = 0,
  as: Component = "div",
  threshold,
  rootMargin,
  revealOnMount = false,
}) {
  const { ref, isRevealed } = useRevealOnScroll({ threshold, rootMargin, revealOnMount });

  return (
    <Component
      ref={ref}
      data-revealed={isRevealed}
      className={`reveal-base ${className}`.trim()}
      style={{ "--reveal-delay": `${delay}ms` }}
    >
      {children}
    </Component>
  );
}
