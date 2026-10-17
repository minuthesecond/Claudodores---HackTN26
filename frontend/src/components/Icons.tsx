/** Brand mark: a solid block with a closed-mouth slit. */
export const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="logo">
    <rect width="24" height="24" fill="currentColor" />
    <rect x="5" y="11" width="14" height="2.5" fill="var(--accent)" />
  </svg>
)
