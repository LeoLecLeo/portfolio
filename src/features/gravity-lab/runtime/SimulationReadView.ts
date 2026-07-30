import { SimulationEngine } from "./SimulationEngine";

export type MutablePosition3 = {
  x: number;
  y: number;
  z: number;
};

export class SimulationReadView {
  readonly #engine: SimulationEngine;
  readonly #positionsM: Float64Array;
  readonly #bodyIds: readonly string[];
  readonly #bodyIndexById: ReadonlyMap<string, number>;

  constructor(engine: SimulationEngine) {
    this.#engine = engine;
    this.#bodyIds = engine.copyBodyIds();
    this.#bodyIndexById = new Map(
      this.#bodyIds.map((bodyId, bodyIndex) => [
        bodyId,
        bodyIndex,
      ])
    );
    this.#positionsM = new Float64Array(engine.bodyCount * 3);
    this.sync();
  }

  get bodyCount(): number {
    return this.#bodyIds.length;
  }

  get bodyIds(): readonly string[] {
    return this.#bodyIds;
  }

  bodyIndexOf(bodyId: string): number | null {
    return this.#bodyIndexById.get(bodyId) ?? null;
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

  writePositionMById(bodyId: string, target: MutablePosition3): void {
    const bodyIndex = this.bodyIndexOf(bodyId);

    if (bodyIndex === null) {
      throw new RangeError(
        `Body "${bodyId}" is outside the read view.`
      );
    }

    this.writePositionM(bodyIndex, target);
  }
}
