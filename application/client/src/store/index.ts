import { combineReducers, legacy_createStore as createStore, type Dispatch, type Reducer, type UnknownAction } from "redux";
import type { FormAction, FormStateMap } from "redux-form";

// Dynamic reducer registry — initially empty (formReducer は遅延注入)
const asyncReducers: Record<string, Reducer> = {};

function buildRootReducer(): Reducer {
  const keys = Object.keys(asyncReducers);
  if (keys.length === 0) {
    return (state: RootState = {}) => state as RootState;
  }
  return combineReducers(asyncReducers) as Reducer;
}

export type RootState = {
  form?: FormStateMap;
};
export type AppDispatch = Dispatch<UnknownAction | FormAction>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const store = createStore(buildRootReducer() as any);

export function injectReducer(key: string, reducer: Reducer): void {
  if (key in asyncReducers) return;
  asyncReducers[key] = reducer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store.replaceReducer(buildRootReducer() as any);
}
