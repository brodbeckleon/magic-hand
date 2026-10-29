import de from "../src/i18n/de.json";
import en from "../src/i18n/en.json";

const keys = (o: object, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe("translations", () => {
  it("German and English have the same keys", () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it("use the same interpolation variables", () => {
    const vars = (o: object) =>
      Object.fromEntries(keys(o).map((k) => [k, String(k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)[p], o)).match(/{{\w+}}/g)?.sort() ?? []]));
    expect(vars(de)).toEqual(vars(en));
  });
});
