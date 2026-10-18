/**
 * Latar animasi untuk seluruh halaman. Murni CSS (lihat .backdrop di
 * styles.css) sehingga tidak memakan CPU server maupun baterai HP;
 * animasinya mati sendiri bila sistem meminta prefers-reduced-motion.
 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="blob one" />
      <span className="blob two" />
      <span className="blob three" />
    </div>
  );
}
