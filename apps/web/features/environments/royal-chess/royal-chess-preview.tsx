const formation = [
  "rnbqkbnr",
  "pppppppp",
  "........",
  "........",
  "........",
  "........",
  "PPPPPPPP",
  "RNBQKBNR"
];

const labels: Record<string, string> = {
  p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
  P: "♙", R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔"
};

export function RoyalChessPreview() {
  return (
    <div className="royal-preview" aria-label="Royal Chess board preview">
      <div className="royal-preview-board">
        {formation.flatMap((rank, y) =>
          [...rank].map((piece, x) => (
            <span className={(x + y) % 2 ? "dark" : "light"} key={`${x}-${y}`}>
              {piece !== "." && (
                <b className={piece === piece.toUpperCase() ? "ivory" : "obsidian"}>
                  {labels[piece]}
                </b>
              )}
            </span>
          ))
        )}
      </div>
      <i className="royal-preview-plaque">CROWN PROTOCOL / MATCH READY</i>
    </div>
  );
}
