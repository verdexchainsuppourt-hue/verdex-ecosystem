// Static SVG fallback for mobile / no-WebGL environments
export function HeroFallback() {
  return (
    <div className="w-full h-full min-h-[360px] flex items-center justify-center">
      <div className="relative w-64 h-64">
        {/* Glow */}
        <div className="absolute inset-0 rounded-full bg-vdx-green/10 animate-pulse-glow blur-3xl" />

        {/* Orbit ring 1 */}
        <div className="absolute inset-4 rounded-full border border-vdx-green/25 animate-spin-slow" />
        {/* Orbit ring 2 */}
        <div className="absolute inset-10 rounded-full border border-vdx-cyan/20 animate-[spin_18s_linear_infinite_reverse]" />

        {/* Central diamond */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 100 160" className="w-24 h-24 drop-shadow-[0_0_24px_rgba(36,229,150,0.6)] animate-float">
            <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
            <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
            <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
            <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
          </svg>
        </div>

        {/* Satellite nodes */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <div
            key={deg}
            className="absolute w-2 h-2 rounded-full bg-vdx-green shadow-[0_0_8px_rgba(36,229,150,0.8)]"
            style={{
              top: `${50 + 40 * Math.sin((deg * Math.PI) / 180)}%`,
              left: `${50 + 40 * Math.cos((deg * Math.PI) / 180)}%`,
              transform: "translate(-50%,-50%)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
