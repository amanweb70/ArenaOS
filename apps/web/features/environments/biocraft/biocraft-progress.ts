import type { BioCraftState } from "../../../lib/types.js";

export type BioCraftTask = {
  id: string;
  label: string;
  detail: string;
  icon: "sequence" | "alignment" | "variants" | "context" | "artifact" | "report";
  progress: number;
  status: "queued" | "active" | "completed";
};

export function buildBioCraftTasks(state: BioCraftState): BioCraftTask[] {
  const completed = (tool: string) =>
    state.toolHistory.filter(
      (invocation) => invocation.tool === tool && invocation.status === "completed"
    ).length;
  const candidateCount = state.biologicalAssets.candidateMutations.length;
  const definitions: Array<Omit<BioCraftTask, "status">> = [
    {
      id: "sequence",
      label: "Profile sequence",
      detail: "Physicochemical baseline",
      icon: "sequence",
      progress: Math.min(1, completed("biology.inspect_sequence"))
    },
    {
      id: "alignment",
      label: "Align homologs",
      detail: "Conservation evidence",
      icon: "alignment",
      progress: Math.min(1, completed("biology.align_sequences"))
    },
    {
      id: "variants",
      label: "Score variants",
      detail: `${Math.min(candidateCount, completed("biology.score_substitution"))}/${candidateCount} candidates`,
      icon: "variants",
      progress: candidateCount
        ? Math.min(1, completed("biology.score_substitution") / candidateCount)
        : 1
    },
    {
      id: "context",
      label: "Inspect context",
      detail: "Annotations + structure",
      icon: "context",
      progress: Math.min(
        1,
        (completed("biology.inspect_annotations") + completed("biology.inspect_structure")) / 2
      )
    },
    {
      id: "artifact",
      label: "Build artifact",
      detail: "Validated mutant FASTA",
      icon: "artifact",
      progress: Math.min(1, completed("biology.apply_mutation"))
    },
    {
      id: "report",
      label: "Submit report",
      detail: state.evaluation ? "Objectively evaluated" : "Evidence-linked ranking",
      icon: "report",
      progress: state.evaluation ? 1 : state.workspace.notes.length ? 0.5 : 0
    }
  ];
  const firstIncomplete = definitions.findIndex((task) => task.progress < 1);
  return definitions.map((task, index) => ({
    ...task,
    status:
      task.progress >= 1
        ? "completed"
        : index === (firstIncomplete === -1 ? definitions.length - 1 : firstIncomplete)
          ? "active"
          : "queued"
  }));
}
