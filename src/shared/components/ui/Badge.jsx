export default function Badge({ children, variant = "hot" }) {
  const variants = {
    hot: "bg-red-500/30 text-red-100 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]",
    featured: "bg-orange-600/35 text-white border-orange-500/50 shadow-[0_0_12px_rgba(234,88,12,0.3)]",
    popular: "bg-amber-500/30 text-white border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
    new: "bg-emerald-600/35 text-white border-emerald-400/50 shadow-[0_0_12px_rgba(5,150,105,0.3)]",
    success: "bg-green-600/35 text-white border-green-400/50 shadow-[0_0_12px_rgba(22,163,74,0.3)]",
    warning: "bg-orange-500/30 text-white border-orange-400/50",
    neutral: "bg-gray-600/40 text-gray-100 border-gray-500/50",
    danger: "bg-red-600/35 text-white border-red-400/50 shadow-[0_0_12px_rgba(220,38,38,0.3)]",
    ended: "bg-zinc-800/80 text-zinc-400 border-zinc-700/50 grayscale",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-[0.15em] uppercase backdrop-blur-md ${variants[variant] || variants.neutral}`}
    >
      {children}
    </span>
  );
}
