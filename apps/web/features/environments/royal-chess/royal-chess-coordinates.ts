export const ROYAL_SQUARE_SIZE = 1.06;

export function squareToBoardPosition(square: string): [number, number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return [
    (file - 3.5) * ROYAL_SQUARE_SIZE,
    0.1,
    (4.5 - rank) * ROYAL_SQUARE_SIZE
  ];
}

export function boardPointToSquare(x: number, z: number): string | undefined {
  const file = Math.round(x / ROYAL_SQUARE_SIZE + 3.5);
  const rank = Math.round(4.5 - z / ROYAL_SQUARE_SIZE);
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return undefined;
  return `${String.fromCharCode(97 + file)}${rank}`;
}
