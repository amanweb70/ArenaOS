import { RunWorkspace } from "@/components/run-workspace";

export default async function RunPage({
  params
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <div className="shell run-page">
      <RunWorkspace runId={runId} />
    </div>
  );
}
