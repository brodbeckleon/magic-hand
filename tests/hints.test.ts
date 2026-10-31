import { HINTS, learnedKey, mayShow, shownKey } from "../src/app/hints/registry.ts";

describe("hint registry", () => {
  it("shows a hint at most maxShows times", () => {
    const max = HINTS.focus.maxShows;
    expect(mayShow("focus", { [shownKey("focus")]: max - 1 }, undefined, 0)).toBe(true);
    expect(mayShow("focus", { [shownKey("focus")]: max }, undefined, 0)).toBe(false);
  });

  it("never again once learned", () => {
    expect(mayShow("present", { [learnedKey("present")]: 1 }, undefined, 0)).toBe(false);
  });

  it("respects the cooldown between showings", () => {
    expect(mayShow("noHand", {}, 100, 100 + HINTS.noHand.cooldown - 1)).toBe(false);
    expect(mayShow("noHand", {}, 100, 100 + HINTS.noHand.cooldown)).toBe(true);
  });
});
