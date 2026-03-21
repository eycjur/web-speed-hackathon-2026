import path from "node:path";

import { BM25 } from "bayesian-bm25";
import kuromoji, { type IpadicFeatures, type Tokenizer } from "kuromoji";
import { QaSuggestion } from "@web-speed-hackathon-2026/server/src/models";

const STOP_POS = new Set(["助詞", "助動詞", "記号"]);
const DICT_PATH = path.resolve(import.meta.dirname, "../../../public/dicts");

let tokenizerInstance: Tokenizer<IpadicFeatures> | null = null;
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;
let analyzeModulePromise: Promise<(tokens: IpadicFeatures[]) => number> | null = null;
let suggestionsPromise: Promise<string[]> | null = null;
let suggestionCandidates: string[] = [];
let tokenizedSuggestionCandidates: string[][] = [];

function extractTokens(tokens: IpadicFeatures[]): string[] {
  return tokens
    .filter((token) => token.surface_form !== "" && token.pos !== "" && !STOP_POS.has(token.pos))
    .map((token) => token.surface_form.toLowerCase());
}

async function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (tokenizerInstance != null) {
    return tokenizerInstance;
  }

  if (tokenizerPromise != null) {
    return tokenizerPromise;
  }

  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DICT_PATH }).build((error, tokenizer) => {
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

async function getAnalyzeModule(): Promise<(tokens: IpadicFeatures[]) => number> {
  if (analyzeModulePromise != null) {
    return analyzeModulePromise;
  }

  analyzeModulePromise = import("negaposi-analyzer-ja").then((module) => module.default);
  return analyzeModulePromise;
}

async function getSuggestionCandidates(): Promise<string[]> {
  if (suggestionsPromise != null) {
    return suggestionsPromise;
  }

  suggestionsPromise = Promise.all([
    getTokenizer(),
    QaSuggestion.findAll({
      attributes: ["question"],
      logging: false,
      raw: true,
    }),
  ]).then(([tokenizer, suggestions]) => {
    suggestionCandidates = suggestions.map((suggestion) => suggestion.question);
    tokenizedSuggestionCandidates = suggestionCandidates.map((candidate) =>
      extractTokens(tokenizer.tokenize(candidate)),
    );
    return suggestionCandidates;
  });

  return suggestionsPromise;
}

export async function getCrokSuggestions(): Promise<string[]> {
  return await getSuggestionCandidates();
}

export async function isNegativeSearchQuery(text: string): Promise<boolean> {
  const normalized = text.trim();
  if (normalized === "") {
    return false;
  }

  const [tokenizer, analyze] = await Promise.all([getTokenizer(), getAnalyzeModule()]);
  const score = analyze(tokenizer.tokenize(normalized));
  return score < -0.1;
}

export async function filterCrokSuggestions(query: string): Promise<string[]> {
  const normalized = query.trim();
  if (normalized === "") {
    return await getSuggestionCandidates();
  }

  const tokenizer = await getTokenizer();
  const candidates = await getSuggestionCandidates();
  const queryTokens = extractTokens(tokenizer.tokenize(normalized));

  if (queryTokens.length === 0) {
    return [];
  }

  const bm25 = new BM25({ k1: 1.2, b: 0.75 });
  bm25.index(tokenizedSuggestionCandidates);
  const scores = bm25.getScores(queryTokens);

  return candidates
    .map((text, idx) => ({ text, score: scores[idx] ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => a.score - b.score)
    .slice(-10)
    .map((entry) => entry.text);
}
