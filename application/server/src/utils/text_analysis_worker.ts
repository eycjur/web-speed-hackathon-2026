import path from "node:path";
import { parentPort } from "node:worker_threads";

import { BM25 } from "bayesian-bm25";
import kuromoji, { type IpadicFeatures, type Tokenizer } from "kuromoji";

type WarmupMessage = {
  id: number;
  type: "warmup";
  payload: {
    suggestions: string[];
  };
};

type AnalyzeSentimentMessage = {
  id: number;
  type: "analyzeSentiment";
  payload: {
    text: string;
  };
};

type FilterSuggestionsMessage = {
  id: number;
  type: "filterSuggestions";
  payload: {
    query: string;
  };
};

type WorkerMessage = WarmupMessage | AnalyzeSentimentMessage | FilterSuggestionsMessage;

type WorkerResponse =
  | {
      id: number;
      ok: true;
      result: boolean | string[] | null;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

const STOP_POS = new Set(["助詞", "助動詞", "記号"]);
const DICT_PATH = path.resolve(import.meta.dirname, "../../../public/dicts");

let tokenizerInstance: Tokenizer<IpadicFeatures> | null = null;
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;
let analyzeModulePromise: Promise<(tokens: IpadicFeatures[]) => number> | null = null;
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

async function warmupSuggestions(suggestions: string[]): Promise<void> {
  const tokenizer = await getTokenizer();
  suggestionCandidates = suggestions;
  tokenizedSuggestionCandidates = suggestions.map((candidate) =>
    extractTokens(tokenizer.tokenize(candidate)),
  );
}

async function warmup(payload: WarmupMessage["payload"]): Promise<null> {
  await Promise.all([getTokenizer(), getAnalyzeModule()]);
  await warmupSuggestions(payload.suggestions);
  return null;
}

async function analyzeSentiment(text: string): Promise<boolean> {
  const normalized = text.trim();
  if (normalized === "") {
    return false;
  }

  const [tokenizer, analyze] = await Promise.all([getTokenizer(), getAnalyzeModule()]);
  const score = analyze(tokenizer.tokenize(normalized));
  return score < -0.1;
}

async function filterSuggestions(query: string): Promise<string[]> {
  const normalized = query.trim();
  if (normalized === "") {
    return suggestionCandidates;
  }

  const tokenizer = await getTokenizer();
  if (tokenizedSuggestionCandidates.length !== suggestionCandidates.length) {
    tokenizedSuggestionCandidates = suggestionCandidates.map((candidate) =>
      extractTokens(tokenizer.tokenize(candidate)),
    );
  }

  const queryTokens = extractTokens(tokenizer.tokenize(normalized));
  if (queryTokens.length === 0) {
    return [];
  }

  const bm25 = new BM25({ k1: 1.2, b: 0.75 });
  bm25.index(tokenizedSuggestionCandidates);
  const scores = bm25.getScores(queryTokens);

  return suggestionCandidates
    .map((text, idx) => ({ text, score: scores[idx] ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => a.score - b.score)
    .slice(-10)
    .map((entry) => entry.text);
}

async function handleMessage(message: WorkerMessage): Promise<WorkerResponse> {
  switch (message.type) {
    case "warmup":
      await warmup(message.payload);
      return { id: message.id, ok: true, result: null };
    case "analyzeSentiment":
      return { id: message.id, ok: true, result: await analyzeSentiment(message.payload.text) };
    case "filterSuggestions":
      return { id: message.id, ok: true, result: await filterSuggestions(message.payload.query) };
  }
}

if (parentPort == null) {
  throw new Error("text_analysis_worker must be run in a worker thread");
}

parentPort.on("message", (message: WorkerMessage) => {
  void handleMessage(message)
    .then((response) => {
      parentPort.postMessage(response);
    })
    .catch((error: unknown) => {
      parentPort.postMessage({
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse);
    });
});
