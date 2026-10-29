import { localIsoTimestamp, toCsv } from "../../src/core/log/csv.ts";

describe("toCsv", () => {
  it("writes the prototype header and formatting", () => {
    const csv = toCsv([
      { zeit: "2026-10-29T10:00:00.123", ereignis: "calibrated" },
      { zeit: "2026-10-29T10:00:02.000", ereignis: "ausgeloest", richtung: "next", wischrichtung: "links",
        strecke: -2.71828, reaktionMs: 312.6, verarbeitungMs: 14.04 },
    ]);
    expect(csv).toBe(
      "zeit,ereignis,richtung,wischrichtung,strecke_handlaengen,reaktion_ms,verarbeitung_ms\r\n" +
      "2026-10-29T10:00:00.123,calibrated,,,,,\r\n" +
      "2026-10-29T10:00:02.000,ausgeloest,next,links,-2.72,313,14.0\r\n",
    );
  });

  it("appends the extended columns on request", () => {
    const csv = toCsv([{ zeit: "t", ereignis: "ausgeloest", person: 2, hand: "right", detectMs: 87.25 }], true);
    expect(csv.split("\r\n")[0]).toMatch(/,person,hand,detect_ms$/);
    expect(csv.split("\r\n")[1]).toBe("t,ausgeloest,,,,,,2,right,87.3");
  });

  it("quotes cells that contain separators", () => {
    expect(toCsv([{ zeit: 'a,"b"', ereignis: "pause" }])).toContain('"a,""b""",pause');
  });
});

describe("localIsoTimestamp", () => {
  it("matches Python isoformat(timespec='milliseconds')", () => {
    expect(localIsoTimestamp(new Date(2026, 0, 5, 7, 8, 9, 45))).toBe("2026-01-05T07:08:09.045");
  });
});
