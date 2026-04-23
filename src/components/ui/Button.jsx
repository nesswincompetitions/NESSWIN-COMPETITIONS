export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  onClick,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold tracking-wide rounded-md transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    primary:
      "bg-primary text-(--color-primary-foreground) hover:opacity-90 shadow-[0_0_35px_oklch(0.78_0.14_78/0.35)] hover:shadow-[0_0_50px_oklch(0.78_0.14_78/0.55)]",
    outline:
      "border border-border text-(--color-foreground) hover:border-[oklch(0.78_0.14_78/0.4)] hover:bg-[oklch(0.78_0.14_78/0.05)]",
  };

  const sizes = {
    sm: "text-sm px-4 py-2",
    md: "text-base px-8 py-3",
    lg: "text-base px-8 py-4",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}