import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type ChemMoleculeInput = {
  id: string;
  name: string;
  smiles: string;
  kind: "lead" | "candidate" | "generated";
};

export type ChemCraftManifest = {
  id: string;
  title: string;
  family: "molecular-optimization";
  version: string;
  difficulty: "easy" | "medium" | "hard";
  objective: string;
  scientificScope: string;
  limitations: string[];
  allowedTools: string[];
  maxToolCalls: number;
  maxComputeUnits: number;
  maxRuntimeMs: number;
  scoringProfile: string;
  seed: number;
};

export type ChemConstraints = {
  requiredSubstructures: Array<{
    id: string;
    smarts: string;
    description: string;
  }>;
  forbiddenSubstructures: Array<{
    id: string;
    smarts: string;
    description: string;
  }>;
  allowedElements: string[];
  maxFormalChargeMagnitude: number;
  maxFragments: number;
  descriptorRanges: Record<string, { min?: number; max?: number }>;
  minimumSimilarityToLead: {
    fingerprint: "morgan";
    metric: "tanimoto";
    threshold: number;
  };
};

export type ScoringProfile = {
  id: string;
  version: string;
  description: string;
  weights: Record<string, number>;
  normalization: Record<
    string,
    {
      best: number;
      worst?: number;
      tolerance?: number;
      direction: "minimize" | "maximize" | "target";
    }
  >;
};

export type ChemGroundTruth = {
  scoringProfile: string;
  methodology: string;
  ranking: string[];
  recommendedMoleculeId: string;
};

export type ChemCraftChallenge = {
  manifest: ChemCraftManifest;
  lead: ChemMoleculeInput;
  candidates: ChemMoleculeInput[];
  constraints: ChemConstraints;
  provenance: Record<string, unknown>;
  assetHashes: Record<string, string>;
};

const challengeDirectory = new URL(
  "../challenges/molecular-optimization/balanced-lead-001/",
  import.meta.url
);

export async function loadChemCraftChallenge(): Promise<ChemCraftChallenge> {
  const names = [
    "manifest.json",
    "molecules.json",
    "constraints.json",
    "provenance.json"
  ] as const;
  const [manifestText, moleculesText, constraintsText, provenanceText] =
    await Promise.all([
      readText("manifest.json"),
      readText("molecules.json"),
      readText("constraints.json"),
      readText("provenance.json")
    ]);
  const manifest = JSON.parse(manifestText) as ChemCraftManifest;
  const molecules = JSON.parse(moleculesText) as {
    lead: ChemMoleculeInput;
    candidates: ChemMoleculeInput[];
  };
  if (molecules.candidates.length < 5) {
    throw new Error("ChemCraft challenge requires at least five candidates.");
  }
  return {
    manifest,
    ...molecules,
    constraints: JSON.parse(constraintsText) as ChemConstraints,
    provenance: JSON.parse(provenanceText) as Record<string, unknown>,
    assetHashes: Object.fromEntries(
      names.map((name, index) => [
        name,
        createHash("sha256")
          .update([manifestText, moleculesText, constraintsText, provenanceText][index]!)
          .digest("hex")
      ])
    )
  };
}

export async function loadChemScoringProfile(): Promise<ScoringProfile> {
  return JSON.parse(await readText("scoring-profile.json")) as ScoringProfile;
}

export async function loadChemGroundTruth(): Promise<ChemGroundTruth> {
  return JSON.parse(await readText("ground-truth.json")) as ChemGroundTruth;
}

async function readText(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(name, challengeDirectory)), "utf8");
}
