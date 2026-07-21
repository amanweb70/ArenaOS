import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="ArenaOS home">
      <span className="brand-grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </span>
      <span>
        ARENA<span>OS</span>
      </span>
    </Link>
  );
}
