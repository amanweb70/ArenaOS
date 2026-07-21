"""Offline RDKit worker for ArenaOS ChemCraft.

One JSON request is read from stdin and one JSON response is written to stdout.
The worker never performs network requests and never reads challenge ground truth.
"""

from __future__ import annotations

import json
import math
import sys
import traceback
from typing import Any

from rdkit import Chem, DataStructs, rdBase
from rdkit.Chem import AllChem, Crippen, Descriptors, Lipinski, rdDepictor, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D


PATTERNS = {
    "alcohol": "[OX2H][CX4]",
    "phenol": "[OX2H]c",
    "ether": "[OD2]([#6])[#6]",
    "aldehyde": "[CX3H1](=O)[#6]",
    "ketone": "[#6][CX3](=O)[#6]",
    "carboxylic_acid": "[CX3](=O)[OX2H1]",
    "ester": "[CX3](=O)[OX2][#6]",
    "amide": "[NX3][CX3](=[OX1])",
    "amine": "[NX3;!$(N-C=O)]",
    "nitrile": "[CX2]#N",
    "nitro": "[$([NX3](=O)=O),$([NX3+](=O)[O-])]",
    "thiol": "[SX2H]",
    "sulfide": "[#16X2H0]",
    "sulfone": "S(=O)(=O)",
    "halide": "[F,Cl,Br,I]",
    "alkene": "C=C",
    "alkyne": "C#C",
    "aromatic_ring": "a1aaaaa1",
    "heteroaromatic_ring": "[a;!#6]",
}


def molecule(smiles: str) -> Chem.Mol:
    mol = Chem.MolFromSmiles(smiles, sanitize=True)
    if mol is None:
        raise ValueError("RDKit could not parse or sanitize the supplied SMILES.")
    if mol.GetNumAtoms() > 150:
        raise ValueError("Molecule exceeds the 150 atom ChemCraft limit.")
    return mol


def descriptors(mol: Chem.Mol) -> dict[str, Any]:
    return {
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "molecularWeight": round(Descriptors.MolWt(mol), 4),
        "exactMolecularWeight": round(Descriptors.ExactMolWt(mol), 4),
        "heavyAtomCount": int(Lipinski.HeavyAtomCount(mol)),
        "heteroatomCount": int(Lipinski.NumHeteroatoms(mol)),
        "ringCount": int(Lipinski.RingCount(mol)),
        "aromaticRingCount": int(Lipinski.NumAromaticRings(mol)),
        "rotatableBondCount": int(Lipinski.NumRotatableBonds(mol)),
        "hydrogenBondDonors": int(Lipinski.NumHDonors(mol)),
        "hydrogenBondAcceptors": int(Lipinski.NumHAcceptors(mol)),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 4),
        "fractionSp3": round(rdMolDescriptors.CalcFractionCSP3(mol), 4),
        "formalCharge": int(Chem.GetFormalCharge(mol)),
        "molarRefractivity": round(Crippen.MolMR(mol), 4),
        "calculatedLogP": round(Crippen.MolLogP(mol), 4),
        "stereocenterCount": len(Chem.FindMolChiralCenters(mol, includeUnassigned=True)),
        "unspecifiedStereocenterCount": len(
            [x for x in Chem.FindMolChiralCenters(mol, includeUnassigned=True) if x[1] == "?"]
        ),
    }


def fingerprint(mol: Chem.Mol):
    generator = AllChem.GetMorganGenerator(radius=2, fpSize=2048)
    return generator.GetFingerprint(mol)


def functional_groups(mol: Chem.Mol) -> list[dict[str, Any]]:
    found = []
    for name, smarts in PATTERNS.items():
        query = Chem.MolFromSmarts(smarts)
        matches = mol.GetSubstructMatches(query) if query is not None else ()
        if matches:
            found.append(
                {
                    "group": name,
                    "smarts": smarts,
                    "matchCount": len(matches),
                    "atomIndices": [list(match) for match in matches],
                    "patternLibrary": "chemcraft-functional-groups-v1",
                }
            )
    return found


def depict(mol: Chem.Mol, highlight_atoms: list[int] | None = None) -> str:
    copy = Chem.Mol(mol)
    rdDepictor.Compute2DCoords(copy)
    drawer = rdMolDraw2D.MolDraw2DSVG(480, 320)
    options = drawer.drawOptions()
    options.addAtomIndices = True
    drawer.DrawMolecule(copy, highlightAtoms=highlight_atoms or [])
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def conformer(mol: Chem.Mol, seed: int) -> dict[str, Any]:
    hydrogens = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = int(seed)
    params.useRandomCoords = False
    conformer_id = AllChem.EmbedMolecule(hydrogens, params)
    if conformer_id < 0:
        raise ValueError("RDKit ETKDGv3 failed to generate a conformer.")
    optimization = "UFF"
    converged = False
    energy = None
    if AllChem.MMFFHasAllMoleculeParams(hydrogens):
        optimization = "MMFF94"
        converged = AllChem.MMFFOptimizeMolecule(hydrogens, maxIters=300) == 0
        properties = AllChem.MMFFGetMoleculeProperties(hydrogens)
        force_field = AllChem.MMFFGetMoleculeForceField(hydrogens, properties)
        energy = force_field.CalcEnergy()
    else:
        converged = AllChem.UFFOptimizeMolecule(hydrogens, maxIters=300) == 0
        energy = AllChem.UFFGetMoleculeForceField(hydrogens).CalcEnergy()
    conf = hydrogens.GetConformer()
    atoms = []
    for atom in hydrogens.GetAtoms():
        point = conf.GetAtomPosition(atom.GetIdx())
        atoms.append(
            {
                "index": atom.GetIdx(),
                "element": atom.GetSymbol(),
                "x": round(point.x, 5),
                "y": round(point.y, 5),
                "z": round(point.z, 5),
            }
        )
    bonds = [
        {
            "begin": bond.GetBeginAtomIdx(),
            "end": bond.GetEndAtomIdx(),
            "order": float(bond.GetBondTypeAsDouble()),
        }
        for bond in hydrogens.GetBonds()
    ]
    return {
        "method": "ETKDGv3",
        "optimization": optimization,
        "converged": converged,
        "forceFieldEnergy": round(float(energy), 6),
        "energyUnits": "kcal/mol",
        "seed": seed,
        "atoms": atoms,
        "bonds": bonds,
        "molBlock": Chem.MolToMolBlock(hydrogens),
        "limitation": (
            "Force-field conformer energy for this generated conformer only; "
            "not an experimental energy or guaranteed global minimum."
        ),
    }


def validate(mol: Chem.Mol, constraints: dict[str, Any]) -> dict[str, Any]:
    checks = []
    allowed = set(constraints.get("allowedElements", []))
    elements = {atom.GetSymbol() for atom in mol.GetAtoms()}
    checks.append(
        {
            "id": "allowed-elements",
            "passed": not allowed or elements.issubset(allowed),
            "observed": sorted(elements),
        }
    )
    fragments = len(Chem.GetMolFrags(mol))
    checks.append(
        {
            "id": "fragment-count",
            "passed": fragments <= constraints.get("maxFragments", 1),
            "observed": fragments,
        }
    )
    charge = abs(Chem.GetFormalCharge(mol))
    checks.append(
        {
            "id": "formal-charge",
            "passed": charge <= constraints.get("maxFormalChargeMagnitude", 0),
            "observed": charge,
        }
    )
    for item in constraints.get("requiredSubstructures", []):
        query = Chem.MolFromSmarts(item["smarts"])
        match = mol.GetSubstructMatch(query) if query is not None else ()
        checks.append(
            {
                "id": item["id"],
                "passed": bool(match),
                "observed": list(match),
                "kind": "required-substructure",
            }
        )
    for item in constraints.get("forbiddenSubstructures", []):
        query = Chem.MolFromSmarts(item["smarts"])
        match = mol.GetSubstructMatch(query) if query is not None else ()
        checks.append(
            {
                "id": item["id"],
                "passed": not bool(match),
                "observed": list(match),
                "kind": "forbidden-substructure",
            }
        )
    values = descriptors(mol)
    for name, limits in constraints.get("descriptorRanges", {}).items():
        value = values[name]
        passed = (limits.get("min") is None or value >= limits["min"]) and (
            limits.get("max") is None or value <= limits["max"]
        )
        checks.append({"id": f"descriptor-{name}", "passed": passed, "observed": value})
    return {"passed": all(item["passed"] for item in checks), "checks": checks}


def prepare(payload: dict[str, Any]) -> dict[str, Any]:
    records = []
    lead = molecule(payload["lead"]["smiles"])
    lead_fp = fingerprint(lead)
    for record in [payload["lead"], *payload["candidates"]]:
        mol = molecule(record["smiles"])
        canonical = Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True)
        conf = conformer(mol, int(payload["seed"]))
        molecule_validation = None
        if payload.get("constraints"):
            molecule_validation = validate(mol, payload["constraints"])
            similarity = DataStructs.TanimotoSimilarity(lead_fp, fingerprint(mol))
            threshold = payload["constraints"]["minimumSimilarityToLead"]["threshold"]
            molecule_validation["checks"].append(
                {
                    "id": "minimum-similarity",
                    "passed": similarity >= threshold,
                    "observed": round(similarity, 6),
                }
            )
            molecule_validation["passed"] = all(
                item["passed"] for item in molecule_validation["checks"]
            )
        records.append(
            {
                **record,
                "canonicalSmiles": canonical,
                "atomCount": mol.GetNumAtoms(),
                "bondCount": mol.GetNumBonds(),
                "descriptors": descriptors(mol),
                "functionalGroups": functional_groups(mol),
                "similarityToLead": round(DataStructs.TanimotoSimilarity(lead_fp, fingerprint(mol)), 6),
                "depictionSvg": depict(mol),
                "conformer": conf,
                "validation": molecule_validation,
                "backend": "RDKit",
                "backendVersion": rdBase.rdkitVersion,
            }
        )
    return {"molecules": records}


def handle(request: dict[str, Any]) -> dict[str, Any]:
    method = request.get("method")
    payload = request.get("params", {})
    if method == "capabilities":
        return {
            "rdkit": {"available": True, "version": rdBase.rdkitVersion},
            "python": {"available": True, "version": sys.version.split()[0]},
            "openBabel": {"available": False},
            "xtb": {"available": False},
            "networkAccess": False,
        }
    if method == "prepare":
        return prepare(payload)
    mol = molecule(payload["smiles"])
    if method == "inspect":
        return {
            "canonicalSmiles": Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True),
            "atomCount": mol.GetNumAtoms(),
            "bondCount": mol.GetNumBonds(),
            "formula": rdMolDescriptors.CalcMolFormula(mol),
            "depictionSvg": depict(mol),
        }
    if method == "descriptors":
        return {"descriptors": descriptors(mol)}
    if method == "functional_groups":
        return {"groups": functional_groups(mol)}
    if method == "similarity":
        reference = molecule(payload["referenceSmiles"])
        return {
            "fingerprint": {"type": "Morgan", "radius": 2, "bits": 2048},
            "metric": "Tanimoto",
            "similarity": round(
                DataStructs.TanimotoSimilarity(fingerprint(reference), fingerprint(mol)), 6
            ),
        }
    if method == "validate":
        result = validate(mol, payload["constraints"])
        if payload.get("leadSmiles"):
            lead = molecule(payload["leadSmiles"])
            similarity = DataStructs.TanimotoSimilarity(fingerprint(lead), fingerprint(mol))
            threshold = payload["constraints"]["minimumSimilarityToLead"]["threshold"]
            result["checks"].append(
                {
                    "id": "minimum-similarity",
                    "passed": similarity >= threshold,
                    "observed": round(similarity, 6),
                }
            )
            result["passed"] = all(item["passed"] for item in result["checks"])
        return result
    if method == "conformer":
        return {"conformer": conformer(mol, int(payload["seed"]))}
    raise ValueError(f"Unknown ChemCraft worker method: {method}")


def main() -> None:
    request = json.loads(sys.stdin.read())
    try:
        result = handle(request)
        print(json.dumps({"id": request.get("id"), "ok": True, "result": result}))
    except Exception as error:
        print(
            json.dumps(
                {
                    "id": request.get("id"),
                    "ok": False,
                    "error": {
                        "type": type(error).__name__,
                        "message": str(error),
                        "trace": traceback.format_exc(limit=3),
                    },
                }
            )
        )


if __name__ == "__main__":
    main()
