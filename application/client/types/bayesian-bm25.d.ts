declare module "bayesian-bm25" {
  export class BM25 {
    constructor(options?: { b?: number; k1?: number });
    getScores(queryTokens: string[]): number[];
    index(documents: string[][]): void;
  }
}
