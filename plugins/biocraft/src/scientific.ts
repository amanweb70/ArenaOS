import { createHash } from "node:crypto";

export const AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY";

const residueMass: Record<string, number> = {
  A: 89.09, R: 174.2, N: 132.12, D: 133.1, C: 121.16,
  E: 147.13, Q: 146.15, G: 75.07, H: 155.16, I: 131.17,
  L: 131.17, K: 146.19, M: 149.21, F: 165.19, P: 115.13,
  S: 105.09, T: 119.12, W: 204.23, Y: 181.19, V: 117.15
};

const hydropathy: Record<string, number> = {
  A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5,
  E: -3.5, Q: -3.5, G: -0.4, H: -3.2, I: 4.5,
  L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6,
  S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2
};

const residueVolume: Record<string, number> = {
  A: 88.6, R: 173.4, N: 114.1, D: 111.1, C: 108.5,
  E: 138.4, Q: 143.8, G: 60.1, H: 153.2, I: 166.7,
  L: 166.7, K: 168.6, M: 162.9, F: 189.9, P: 112.7,
  S: 89, T: 116.1, W: 227.8, Y: 193.6, V: 140
};

const residueClass: Record<string, string> = {
  A: "nonpolar", V: "nonpolar", L: "nonpolar", I: "nonpolar", M: "nonpolar",
  F: "aromatic", W: "aromatic", Y: "aromatic",
  S: "polar", T: "polar", N: "polar", Q: "polar", C: "polar",
  K: "positive", R: "positive", H: "positive",
  D: "negative", E: "negative", G: "special", P: "special"
};

const blosumOrder = "ARNDCQEGHILKMFPSTWYV";
const blosumRows = [
  [4,-1,-2,-2,0,-1,-1,0,-2,-1,-1,-1,-1,-2,-1,1,0,-3,-2,0],
  [-1,5,0,-2,-3,1,0,-2,0,-3,-2,2,-1,-3,-2,-1,-1,-3,-2,-3],
  [-2,0,6,1,-3,0,0,0,1,-3,-3,0,-2,-3,-2,1,0,-4,-2,-3],
  [-2,-2,1,6,-3,0,2,-1,-1,-3,-4,-1,-3,-3,-1,0,-1,-4,-3,-3],
  [0,-3,-3,-3,9,-3,-4,-3,-3,-1,-1,-3,-1,-2,-3,-1,-1,-2,-2,-1],
  [-1,1,0,0,-3,5,2,-2,0,-3,-2,1,0,-3,-1,0,-1,-2,-1,-2],
  [-1,0,0,2,-4,2,5,-2,0,-3,-3,1,-2,-3,-1,0,-1,-3,-2,-2],
  [0,-2,0,-1,-3,-2,-2,6,-2,-4,-4,-2,-3,-3,-2,0,-2,-2,-3,-3],
  [-2,0,1,-1,-3,0,0,-2,8,-3,-3,-1,-2,-1,-2,-1,-2,-2,2,-3],
  [-1,-3,-3,-3,-1,-3,-3,-4,-3,4,2,-3,1,0,-3,-2,-1,-3,-1,3],
  [-1,-2,-3,-4,-1,-2,-3,-4,-3,2,4,-2,2,0,-3,-2,-1,-2,-1,1],
  [-1,2,0,-1,-3,1,1,-2,-1,-3,-2,5,-1,-3,-1,0,-1,-3,-2,-2],
  [-1,-1,-2,-3,-1,0,-2,-3,-2,1,2,-1,5,0,-2,-1,-1,-1,-1,1],
  [-2,-3,-3,-3,-2,-3,-3,-3,-1,0,0,-3,0,6,-4,-2,-2,1,3,-1],
  [-1,-2,-2,-1,-3,-1,-1,-2,-2,-3,-3,-1,-2,-4,7,-1,-1,-4,-3,-2],
  [1,-1,1,0,-1,0,0,0,-1,-2,-2,0,-1,-2,-1,4,1,-3,-2,-2],
  [0,-1,0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1,1,5,-2,-2,0],
  [-3,-3,-4,-4,-2,-2,-3,-2,-2,-3,-2,-3,-1,1,-4,-3,-2,11,2,-3],
  [-2,-2,-2,-3,-2,-1,-2,-3,2,-1,-1,-2,-1,3,-3,-2,-2,2,7,-1],
  [0,-3,-3,-3,-1,-2,-2,-3,-3,3,1,-2,1,-1,-2,-2,0,-3,-1,4]
];

export type FastaRecord = { id: string; description: string; sequence: string };

export function parseFasta(contents: string): FastaRecord[] {
  const records: FastaRecord[] = [];
  let current: FastaRecord | undefined;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      const [id = "", ...description] = line.slice(1).split(/\s+/);
      current = { id, description: description.join(" "), sequence: "" };
      records.push(current);
      continue;
    }
    if (!current) throw new Error("FASTA sequence appeared before a header.");
    current.sequence += line.toUpperCase();
  }
  if (!records.length) throw new Error("FASTA document contained no records.");
  for (const record of records) validateProteinSequence(record.sequence);
  return records;
}

export function validateProteinSequence(sequence: string): void {
  if (!sequence.length) throw new Error("Protein sequence is empty.");
  const invalid = [...new Set(sequence.split("").filter((residue) => !AMINO_ACIDS.includes(residue)))];
  if (invalid.length) throw new Error(`Unsupported amino-acid residues: ${invalid.join(", ")}.`);
}

export function inspectSequence(sequence: string) {
  validateProteinSequence(sequence);
  const composition = Object.fromEntries(
    [...AMINO_ACIDS].map((residue) => [
      residue,
      sequence.split(residue).length - 1
    ])
  );
  const molecularWeight =
    [...sequence].reduce((sum, residue) => sum + residueMass[residue]!, 0) -
    Math.max(0, sequence.length - 1) * 18.015;
  const aromaticCount = (composition.F ?? 0) + (composition.W ?? 0) + (composition.Y ?? 0);
  const meanHydropathy =
    [...sequence].reduce((sum, residue) => sum + hydropathy[residue]!, 0) /
    sequence.length;
  return {
    length: sequence.length,
    composition,
    molecularWeightDa: round(molecularWeight, 2),
    aromaticity: round(aromaticCount / sequence.length, 4),
    meanHydropathy: round(meanHydropathy, 4),
    estimatedChargeAtPh7: round(netCharge(sequence, 7), 3),
    estimatedIsoelectricPoint: round(estimatePI(sequence), 2),
    backend: "biocraft-ts-science",
    methods: {
      molecularWeight: "sum of average residue masses minus water released by peptide bonds",
      hydropathy: "Kyte-Doolittle mean",
      charge: "Henderson-Hasselbalch approximation",
      pI: "bisection over estimated net charge"
    }
  };
}

export function hydropathyProfile(sequence: string, window = 7) {
  const radius = Math.floor(window / 2);
  return [...sequence].map((_residue, index) => {
    const slice = sequence.slice(Math.max(0, index - radius), Math.min(sequence.length, index + radius + 1));
    return {
      position: index + 1,
      value: round([...slice].reduce((sum, residue) => sum + hydropathy[residue]!, 0) / slice.length, 3)
    };
  });
}

export function substitutionEvidence(reference: string, alternate: string) {
  const fromIndex = blosumOrder.indexOf(reference);
  const toIndex = blosumOrder.indexOf(alternate);
  if (fromIndex < 0 || toIndex < 0) throw new Error("Unknown substitution residue.");
  const fromClass = residueClass[reference]!;
  const toClass = residueClass[alternate]!;
  return {
    referenceResidue: reference,
    alternateResidue: alternate,
    blosum62: blosumRows[fromIndex]![toIndex]!,
    classification:
      fromClass === toClass || (["nonpolar", "aromatic"].includes(fromClass) && ["nonpolar", "aromatic"].includes(toClass))
        ? "conservative"
        : "radical",
    chargeChange: residueCharge(alternate) - residueCharge(reference),
    polarityChange: `${fromClass} -> ${toClass}`,
    volumeChangeAngstrom3: round(residueVolume[alternate]! - residueVolume[reference]!, 1),
    hydropathyChange: round(hydropathy[alternate]! - hydropathy[reference]!, 2),
    backend: "BLOSUM62 / physicochemical constants"
  };
}

export function applyMutation(sequence: string, mutation: string) {
  const match = /^([A-Z])(\d+)([A-Z])$/.exec(mutation);
  if (!match) throw new Error(`Malformed mutation "${mutation}".`);
  const [, expected, rawPosition, alternate] = match;
  const position = Number(rawPosition);
  if (position < 1 || position > sequence.length) {
    throw new Error(`Mutation position ${position} is outside sequence length ${sequence.length}.`);
  }
  if (!AMINO_ACIDS.includes(alternate!)) throw new Error(`Unsupported alternate residue "${alternate}".`);
  const actual = sequence[position - 1];
  if (actual !== expected) {
    throw new Error(`Mutation expected ${expected} at position ${position}, but reference contains ${actual}.`);
  }
  const mutated = `${sequence.slice(0, position - 1)}${alternate}${sequence.slice(position)}`;
  return {
    mutation,
    position,
    referenceResidue: expected!,
    alternateResidue: alternate!,
    sequence: mutated,
    sha256: createHash("sha256").update(mutated).digest("hex")
  };
}

export function conservationProfile(records: FastaRecord[]) {
  if (records.length < 2) throw new Error("At least two sequences are required.");
  const width = records[0]!.sequence.length;
  if (records.some((record) => record.sequence.length !== width)) {
    throw new Error("Bundled multiple alignment contains unequal sequence lengths.");
  }
  return Array.from({ length: width }, (_, index) => {
    const residues = records.map((record) => record.sequence[index]!);
    const counts = new Map<string, number>();
    for (const residue of residues) counts.set(residue, (counts.get(residue) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const entropy = -[...counts.values()].reduce((sum, count) => {
      const probability = count / records.length;
      return sum + probability * Math.log2(probability);
    }, 0);
    return {
      position: index + 1,
      consensus: sorted[0]![0],
      conservation: round(sorted[0]![1] / records.length, 4),
      entropy: round(entropy, 4),
      residues
    };
  });
}

export function globalAlignment(first: string, second: string) {
  const gap = -2;
  const rows = first.length + 1;
  const columns = second.length + 1;
  const score = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  const trace = Array.from({ length: rows }, () => Array<string>(columns).fill(""));
  for (let i = 1; i < rows; i += 1) { score[i]![0] = i * gap; trace[i]![0] = "up"; }
  for (let j = 1; j < columns; j += 1) { score[0]![j] = j * gap; trace[0]![j] = "left"; }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const diagonal = score[i - 1]![j - 1]! + (first[i - 1] === second[j - 1] ? 2 : -1);
      const up = score[i - 1]![j]! + gap;
      const left = score[i]![j - 1]! + gap;
      const best = Math.max(diagonal, up, left);
      score[i]![j] = best;
      trace[i]![j] = best === diagonal ? "diagonal" : best === up ? "up" : "left";
    }
  }
  let i = first.length;
  let j = second.length;
  let alignedFirst = "";
  let alignedSecond = "";
  while (i || j) {
    const direction = trace[i]![j];
    if (direction === "diagonal") {
      alignedFirst = first[i - 1] + alignedFirst;
      alignedSecond = second[j - 1] + alignedSecond;
      i -= 1; j -= 1;
    } else if (direction === "up") {
      alignedFirst = first[i - 1] + alignedFirst;
      alignedSecond = `-${alignedSecond}`;
      i -= 1;
    } else {
      alignedFirst = `-${alignedFirst}`;
      alignedSecond = second[j - 1] + alignedSecond;
      j -= 1;
    }
  }
  const compared = alignedFirst.length;
  const identities = [...alignedFirst].filter((residue, index) => residue === alignedSecond[index]).length;
  const gaps = [...alignedFirst].filter((residue, index) => residue === "-" || alignedSecond[index] === "-").length;
  return {
    alignedFirst,
    alignedSecond,
    score: score[first.length]![second.length]!,
    identity: round(identities / compared, 4),
    gaps,
    backend: "Needleman-Wunsch global alignment"
  };
}

export type StructureResidue = {
  position: number;
  name: string;
  chain: string;
  x: number;
  y: number;
  z: number;
};

export function parsePdbAlphaCarbons(contents: string): StructureResidue[] {
  return contents
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ATOM") && line.slice(12, 16).trim() === "CA")
    .map((line) => ({
      name: line.slice(17, 20).trim(),
      chain: line.slice(21, 22).trim(),
      position: Number(line.slice(22, 26).trim()),
      x: Number(line.slice(30, 38).trim()),
      y: Number(line.slice(38, 46).trim()),
      z: Number(line.slice(46, 54).trim())
    }))
    .filter((residue) => Number.isFinite(residue.position) && Number.isFinite(residue.x));
}

export function inspectStructure(residues: StructureResidue[], position: number, radius = 8) {
  const target = residues.find((residue) => residue.position === position && residue.chain === "A");
  if (!target) throw new Error(`Structure contains no chain A residue ${position}.`);
  const neighbors = residues
    .filter((residue) => residue !== target)
    .map((residue) => ({ ...residue, distanceAngstroms: round(distance(target, residue), 3) }))
    .filter((residue) => residue.distanceAngstroms <= radius)
    .sort((left, right) => left.distanceAngstroms - right.distanceAngstroms);
  const packingNeighbors = residues.filter(
    (residue) => residue !== target && distance(target, residue) <= 10
  ).length;
  return {
    target,
    radiusAngstroms: radius,
    neighbors,
    localPackingCount10A: packingNeighbors,
    exposureApproximation: packingNeighbors >= 14 ? "buried" : packingNeighbors >= 9 ? "partially_exposed" : "exposed",
    approximationNotice: "Exposure is a documented C-alpha neighborhood approximation, not a solvent-accessible surface calculation.",
    backend: "RCSB 1UBQ PDB C-alpha parser"
  };
}

function netCharge(sequence: string, ph: number): number {
  const count = (residue: string) => sequence.split(residue).length - 1;
  const positive =
    1 / (1 + 10 ** (ph - 9.69)) +
    count("K") / (1 + 10 ** (ph - 10.5)) +
    count("R") / (1 + 10 ** (ph - 12.4)) +
    count("H") / (1 + 10 ** (ph - 6));
  const negative =
    1 / (1 + 10 ** (2.34 - ph)) +
    count("D") / (1 + 10 ** (3.86 - ph)) +
    count("E") / (1 + 10 ** (4.25 - ph)) +
    count("C") / (1 + 10 ** (8.33 - ph)) +
    count("Y") / (1 + 10 ** (10.07 - ph));
  return positive - negative;
}

function estimatePI(sequence: string): number {
  let low = 0;
  let high = 14;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    if (netCharge(sequence, middle) > 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function residueCharge(residue: string): number {
  if (residue === "K" || residue === "R" || residue === "H") return 1;
  if (residue === "D" || residue === "E") return -1;
  return 0;
}

function distance(first: StructureResidue, second: StructureResidue): number {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
