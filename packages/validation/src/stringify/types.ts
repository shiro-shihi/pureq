type DepthTable = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Decrement<Depth extends number> = DepthTable[Depth] extends number ? DepthTable[Depth] : 0;

export type DeniedDrop<T, Depth extends number = 6> = Depth extends 0
  ? T
  : T extends readonly (infer U)[]
    ? DeniedDrop<U, Decrement<Depth>>[]
    : T extends object
      ? { [K in keyof T]?: DeniedDrop<T[K], Decrement<Depth>> }
      : T;

export type StringifyOptions = {
  scope?: readonly string[];
  maxDepth?: number;
};