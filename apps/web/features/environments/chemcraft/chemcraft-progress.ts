import type { ChemCraftState } from "../../../lib/types.js";

export type ChemCraftTask = {
  id: string;
  label: string;
  detail: string;
  icon: "molecule" | "measure" | "groups" | "compare" | "shield" | "cube" | "note" | "report";
  status: "queued" | "active" | "completed" | "failed";
  progress: number;
};

const tools = [
  ["chemistry.inspect_molecule", "Parse lead", "Sanitize the lead graph", "molecule"],
  ["chemistry.calculate_descriptors", "Measure library", "Calculate comparable descriptors", "measure"],
  ["chemistry.inspect_functional_groups", "Map groups", "Match versioned SMARTS patterns", "groups"],
  ["chemistry.calculate_similarity", "Compare analogues", "Morgan / Tanimoto similarity", "compare"],
  ["chemistry.validate_molecule", "Validate constraints", "Check every hard molecular rule", "shield"],
  ["chemistry.generate_conformers", "Build 3D conformer", "Seeded ETKDG force-field geometry", "cube"]
] as const;

export function buildChemCraftTasks(state: ChemCraftState): ChemCraftTask[] {
  const completed = new Set(
    state.toolHistory.filter((item) => item.status === "completed").map((item) => item.tool)
  );
  const failed = new Set(
    state.toolHistory.filter((item) => item.status === "failed").map((item) => item.tool)
  );
  const base = tools.map(([id, label, detail, icon], index) => {
    const status = completed.has(id)
      ? "completed"
      : failed.has(id)
        ? "failed"
        : tools.slice(0, index).every(([previous]) => completed.has(previous))
          ? "active"
          : "queued";
    return {
      id,
      label,
      detail,
      icon,
      status,
      progress: status === "completed" ? 1 : status === "active" ? 0.35 : 0
    } satisfies ChemCraftTask;
  });
  const noteStatus = state.workspace.notes.length
    ? "completed"
    : completed.size >= tools.length
      ? "active"
      : "queued";
  const reportStatus = state.evaluation
    ? "completed"
    : state.submission || noteStatus === "completed"
      ? "active"
      : "queued";
  return [
    ...base,
    {
      id: "chemistry.write_note",
      label: "Record evidence",
      detail: "Link observations to tool outputs",
      icon: "note",
      status: noteStatus,
      progress: noteStatus === "completed" ? 1 : noteStatus === "active" ? 0.35 : 0
    },
    {
      id: "chemistry.submit",
      label: "Submit ranking",
      detail: "Evaluate the evidence-linked report",
      icon: "report",
      status: reportStatus,
      progress: reportStatus === "completed" ? 1 : reportStatus === "active" ? 0.35 : 0
    }
  ];
}
