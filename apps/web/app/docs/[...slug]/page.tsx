import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs-layout";
import { docs, findDoc } from "@/lib/docs";

export function generateStaticParams() {
  return docs.map((doc) => ({ slug: [doc.slug] }));
}

export default async function DocPage({
  params
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const doc = findDoc(slug.join("/"));
  if (!doc) notFound();
  const index = docs.findIndex((entry) => entry.slug === doc.slug);
  const previous = docs[index - 1];
  const next = docs[index + 1];
  return (
    <DocsLayout active={doc.slug}>
      <header className="doc-hero">
        <span className="doc-eyebrow">{doc.eyebrow}</span>
        <h1>{doc.title}</h1>
        <p className="doc-intro">{doc.intro}</p>
        {doc.badges && (
          <div className="doc-badges">
            {doc.badges.map((badge) => <span key={badge}>{badge}</span>)}
          </div>
        )}
      </header>
      {doc.image && doc.imageAlt && (
        <figure className="doc-world-image">
          <Image src={doc.image} alt={doc.imageAlt} width={1265} height={712} priority />
          <figcaption>
            <span>LIVE ENVIRONMENT / AUTHENTIC LOCAL CAPTURE</span>
            {doc.worldHref && <Link href={doc.worldHref}>Open world <span aria-hidden="true">↗</span></Link>}
          </figcaption>
        </figure>
      )}
      <div className="doc-sections">
        {doc.sections.map((section, sectionIndex) => (
          <section key={section.title}>
            <span className="doc-section-number">{String(sectionIndex + 1).padStart(2, "0")}</span>
            <h2>{section.title}</h2>
          <p>{section.body}</p>
          {section.code && <pre><code>{section.code}</code></pre>}
          </section>
        ))}
      </div>
      <nav className="doc-pagination" aria-label="Documentation pages">
        {previous ? (
          <Link href={`/docs/${previous.slug}`}>
            <span>Previous</span>
            <strong>← {previous.title}</strong>
          </Link>
        ) : <span />}
        {next && (
          <Link href={`/docs/${next.slug}`}>
            <span>Next</span>
            <strong>{next.title} →</strong>
          </Link>
        )}
      </nav>
    </DocsLayout>
  );
}
