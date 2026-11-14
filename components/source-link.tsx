import Link from "next/link";

/** Small "ⓘ source" link shown next to any number that comes from a source. */
export function SourceLink({ id, label = "source" }: { id: string; label?: string }) {
  return (
    <Link href={`/sources#${id}`} className="src-link" title={`Source: ${id}`} data-source={id}>
      ⓘ {label}
    </Link>
  );
}
