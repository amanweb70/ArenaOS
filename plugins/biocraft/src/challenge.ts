import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  parseFasta,
  parsePdbAlphaCarbons,
  type FastaRecord,
  type StructureResidue
} from "./scientific.js";

export type MutationCandidate = {
  mutation: string;
  position: number;
  referenceResidue: string;
  alternateResidue: string;
};

export type BioAnnotation = {
  id: string;
  type: string;
  label: string;
  start: number;
  end: number;
  source: string;
};

export type BioCraftManifest = {
  id: string;
  version: string;
  title: string;
  family: "protein-mutation";
  difficulty: "easy" | "medium" | "hard";
  objective: string;
  allowedTools: string[];
  maxToolCalls: number;
  maxRuntimeMs: number;
  scoringProfile: string;
};

export type BioCraftGroundTruth = {
  labelType: string;
  methodology: string;
  rankedCandidates: string[];
  recommendedMutation: string;
  criticalAnnotations: Record<string, string>;
};

export type BioCraftChallenge = {
  manifest: BioCraftManifest;
  reference: FastaRecord;
  homologs: FastaRecord[];
  structure: StructureResidue[];
  structurePdb: string;
  annotations: BioAnnotation[];
  candidates: MutationCandidate[];
  provenance: Record<string, unknown>;
};

const challengeDirectory = new URL(
  "../challenges/protein-mutation/ubiquitin-preservation-001/",
  import.meta.url
);

export async function loadBioCraftChallenge(): Promise<BioCraftChallenge> {
  const [
    manifest,
    referenceFasta,
    homologsFasta,
    structurePdb,
    annotations,
    candidates,
    provenance
  ] = await Promise.all([
    readJson<BioCraftManifest>("manifest.json"),
    readText("reference.fasta"),
    readText("homologs.fasta"),
    readText("structure.pdb"),
    readJson<BioAnnotation[]>("annotations.json"),
    readJson<MutationCandidate[]>("candidates.json"),
    readJson<Record<string, unknown>>("provenance.json")
  ]);
  const references = parseFasta(referenceFasta);
  const homologs = parseFasta(homologsFasta);
  const structure = parsePdbAlphaCarbons(structurePdb);
  if (references.length !== 1) throw new Error("BioCraft challenge requires one reference sequence.");
  if (structure.length < 70) throw new Error("Bundled 1UBQ structure did not parse correctly.");
  for (const candidate of candidates) {
    const actual = references[0]!.sequence[candidate.position - 1];
    if (actual !== candidate.referenceResidue) {
      throw new Error(
        `Candidate ${candidate.mutation} does not match reference residue ${actual}.`
      );
    }
  }
  return {
    manifest,
    reference: references[0]!,
    homologs,
    structure,
    structurePdb,
    annotations,
    candidates,
    provenance
  };
}

export async function loadBioCraftGroundTruth(): Promise<BioCraftGroundTruth> {
  return readJson<BioCraftGroundTruth>("ground-truth.json");
}

async function readText(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(name, challengeDirectory)), "utf8");
}

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readText(name)) as T;
}
