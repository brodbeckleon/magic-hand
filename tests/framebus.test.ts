import { FrameBus } from "../src/app/engine/FrameBus.ts";

describe("FrameBus", () => {
  it("replays the latest value to new subscribers by default (state)", () => {
    const bus = new FrameBus<number>();
    bus.publish(1);
    const got: number[] = [];
    bus.subscribe((v) => got.push(v));
    bus.publish(2);
    expect(got).toEqual([1, 2]);
  });

  it("does not replay for event streams", () => {
    const bus = new FrameBus<number>({ replay: false });
    bus.publish(1);
    const got: number[] = [];
    bus.subscribe((v) => got.push(v));
    bus.publish(2);
    expect(got).toEqual([2]);
  });

  it("unsubscribes", () => {
    const bus = new FrameBus<number>();
    const got: number[] = [];
    const off = bus.subscribe((v) => got.push(v));
    off();
    bus.publish(3);
    expect(got).toEqual([]);
  });
});
