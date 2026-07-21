const sequence = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG";
const candidates = new Set([13, 44, 48, 58, 76]);

export function BioCraftPreview() {
  return (
    <div className="biocraft-preview" aria-label="BioCraft protein analysis preview">
      <header><span>BIOCRAFT / 1UBQ</span><b>OFFLINE</b></header>
      <div className="bio-preview-helix" aria-hidden="true">
        {Array.from({ length: 22 }, (_, index) => <i key={index} />)}
      </div>
      <div className="bio-preview-sequence">
        {sequence.split("").map((residue, index) => (
          <span className={candidates.has(index + 1) ? "candidate" : ""} key={index}>
            {residue}
          </span>
        ))}
      </div>
      <footer>
        <span>5 CANDIDATES</span>
        <span>12 TOOL CALLS</span>
        <span>VERIFIABLE</span>
      </footer>
    </div>
  );
}
