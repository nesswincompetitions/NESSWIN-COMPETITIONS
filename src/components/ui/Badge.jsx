export default function Badge({ children, variant = "hot" }) {
  const variants = {
    hot: "bg-red-500/20 text-red-400 border-red-500/30",
    new: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-[0.15em] uppercase ${variants[variant]}`}
    >
      {children}
    </span>
  );
}