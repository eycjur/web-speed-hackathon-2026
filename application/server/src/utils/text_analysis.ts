import { Worker } from "node:worker_threads";

import { QaSuggestion } from "@web-speed-hackathon-2026/server/src/models";

type WarmupRequest = {
  type: "warmup";
  payload: {
    suggestions: string[];
  };
};

type AnalyzeSentimentRequest = {
  type: "analyzeSentiment";
  payload: {
    text: string;
  };
};

type FilterSuggestionsRequest = {
  type: "filterSuggestions";
  payload: {
    query: string;
  };
};

type WorkerRequest = WarmupRequest | AnalyzeSentimentRequest | FilterSuggestionsRequest;

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

let workerInstance: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<
  number,
  {
    reject: (error: Error) => void;
    resolve: (value: boolean | string[] | null) => void;
  }
>();

function getWorker(): Worker {
  if (workerInstance != null) {
    return workerInstance;
  }

  const worker = new Worker(new URL("./text_analysis_worker.ts", import.meta.url), {
    type: "module",
  });

  worker.on("message", (message: WorkerResponse) => {
    const pending = pendingRequests.get(message.id);
    if (pending == null) {
      return;
    }
    pendingRequests.delete(message.id);

    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new Error(message.error));
  });

  worker.on("error", (error) => {
    for (const { reject } of pendingRequests.values()) {
      reject(error);
    }
    pendingRequests.clear();
    workerInstance = null;
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      const error = new Error(`text analysis worker exited with code ${code}`);
      for (const { reject } of pendingRequests.values()) {
        reject(error);
      }
      pendingRequests.clear();
    }
    workerInstance = null;
  });

  workerInstance = worker;
  return worker;
}

function callWorker(request: WorkerRequest): Promise<boolean | string[] | null> {
  const worker = getWorker();
  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ ...request, id });
  });
}

export async function warmupTextAnalysis(): Promise<void> {
  const suggestions = await QaSuggestion.findAll({
    attributes: ["question"],
    logging: false,
    raw: true,
  });

  await callWorker({
    type: "warmup",
    payload: {
      suggestions: suggestions.map((suggestion) => suggestion.question),
    },
  });
}

export async function isNegativeSearchQuery(text: string): Promise<boolean> {
  const result = await callWorker({
    type: "analyzeSentiment",
    payload: { text },
  });

  return result === true;
}

export async function filterCrokSuggestions(query: string): Promise<string[]> {
  const result = await callWorker({
    type: "filterSuggestions",
    payload: { query },
  });

  return Array.isArray(result) ? result : [];
}
