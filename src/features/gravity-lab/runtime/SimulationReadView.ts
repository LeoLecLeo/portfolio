import { SimulationEngine } from "./SimulationEngine";

export type MutablePosition3 = {
  x: number;
  y: number;
  z: number;
};

export class SimulationReadView {
  readonly #engine: SimulationEngine;
  readonly #positionsM: Float64Array;

  constructor(engine: SimulationEngine) {
    this.#engine = engine;
    this.#positionsM = new Float64Array(engine.bodyCount * 3);
    this.sync();
  }

  get bodyCount(): number {
    return this.#engine.bodyCount;
  }

  sync(): void {
    this.#engine.copyPositionsTo(this.#positionsM);
  }

  writePositionM(bodyIndex: number, target: MutablePosition3): void {
    if (
      !Number.isInteger(bodyIndex) ||
      bodyIndex < 0 ||
      bodyIndex >= this.bodyCount
    ) {
      throw new RangeError(`Body index ${bodyIndex} is outside the read view.`);
    }

    const offset = bodyIndex * 3;
    target.x = this.#positionsM[offset];
    target.y = this.#positionsM[offset + 1];
    target.z = this.#positionsM[offset + 2];
  }
}
