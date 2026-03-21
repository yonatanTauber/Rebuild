import Link from "next/link";

type LogoProps = {
  compact?: boolean;
};

export function RebuildLogo({ compact = false }: LogoProps) {
  return (
    <Link href="/today" className="brand" aria-label="Rebuild home">
      <span className="brick" aria-hidden>
        <span className="stud" />
        <span className="stud" />
        <span className="stud" />
      </span>
      {!compact && <span className="wordmark">Rebuild</span>}
    </Link>
  );
}
