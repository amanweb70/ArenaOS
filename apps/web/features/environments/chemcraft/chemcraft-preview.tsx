export function ChemCraftPreview() {
  return (
    <div className="chemcraft-preview" aria-label="ChemCraft molecular workstation preview">
      <header><b>CHEMCRAFT</b><span>RDKIT / LOCAL</span></header>
      <div className="chem-preview-grid">
        <aside>
          <span>MOLECULES</span>
          {["LEAD", "C-01", "C-02", "C-03"].map((item, index) => (
            <i className={index === 1 ? "active" : ""} key={item}>{item}</i>
          ))}
        </aside>
        <div className="chem-preview-molecule">
          <span className="atom atom-o">O</span>
          <span className="atom atom-n">N</span>
          <span className="atom atom-c c1">C</span>
          <span className="atom atom-c c2">C</span>
          <span className="atom atom-c c3">C</span>
          <span className="atom atom-c c4">C</span>
          <span className="atom atom-c c5">C</span>
          <span className="atom atom-c c6">C</span>
          <i className="bond b1" /><i className="bond b2" /><i className="bond b3" />
          <i className="bond b4" /><i className="bond b5" /><i className="bond b6" />
          <i className="bond b7" /><i className="bond b8" />
          <b>ETKDG / MMFF94</b>
        </div>
        <aside className="chem-preview-readout">
          <span>DESCRIPTORS</span>
          <i>MW <b>163.22</b></i>
          <i>cLogP <b>1.663</b></i>
          <i>TPSA <b>29.10</b></i>
          <i>SIM <b>0.452</b></i>
        </aside>
      </div>
      <footer><span>NO NETWORK</span><b>VERIFIABLE CHEMISTRY</b></footer>
    </div>
  );
}
