import { SectionHeading } from "@/components/section-heading";
import { EnvironmentBuilder } from "@/components/environment-builder";

export const metadata = { title: "Build" };

export default function BuildPage() {
  return (
    <div className="shell page">
      <SectionHeading eyebrow="EXPERIMENTAL WORKBENCH" title="Build an environment plugin.">
        <p>
          Describe an interactive world. Codex builds it inside an isolated workspace;
          ArenaOS validates every lifecycle and replay contract before you can register it.
        </p>
      </SectionHeading>
      <EnvironmentBuilder />
    </div>
  );
}
