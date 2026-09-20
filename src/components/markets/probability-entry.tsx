/** The word for a number (docs/design.md 3.13). A band, never a verdict. */
export function band(percent: number): string {
  if (percent <= 0) return "Not a chance";
  if (percent <= 15) return "Doubt it";
  if (percent <= 40) return "Probably not";
  if (percent <= 59) return "Coin flip";
  if (percent <= 84) return "Probably";
  if (percent <= 99) return "Almost surely";
  return "Every single time";
}

