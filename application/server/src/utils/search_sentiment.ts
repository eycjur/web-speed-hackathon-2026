import path from "node:path";

import kuromoji, { type IpadicFeatures, type Tokenizer } from "kuromoji";

let tokenizerInstance: Tokenizer<IpadicFeatures> | null = null;
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;

async function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (tokenizerInstance != null) {
    return tokenizerInstance;
  }

  if (tokenizerPromise != null) {
    return tokenizerPromise;
  }

  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.resolve(import.meta.dirname, "../../../public/dicts") })
      .build((error, tokenizer) => {
        if (error != null) {
          tokenizerPromise = null;
          reject(error);
          return;
        }

        tokenizerInstance = tokenizer;
        resolve(tokenizer);
      });
  });

  return tokenizerPromise;
}

export async function isNegativeSearchQuery(text: string): Promise<boolean> {
  const normalized = text.trim();
  if (normalized === "") {
    return false;
  }

  const [{ default: analyze }, tokenizer] = await Promise.all([
    import("negaposi-analyzer-ja"),
    getTokenizer(),
  ]);

  const score = analyze(tokenizer.tokenize(normalized));
  return score < -0.1;
}
