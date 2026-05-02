import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  Query,
  QueryClient,
  focusManager,
  type QueryKey,
} from "@tanstack/react-query";
import { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";
import { AppState, AppStateStatus } from "react-native";
import { publicPersistQueryPrefixes } from "./queryKeys";

const QUERY_CACHE_BUSTER = "musika-mobile-query-v1";
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

const isTransientQueryError = (error: unknown) => {
  const status = Number((error as any)?.status || (error as any)?.code || 0);
  const message = String((error as any)?.message || "").toLowerCase();

  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("timed out")
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 30 * ONE_MINUTE_MS,
      refetchOnMount: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => failureCount < 1 && isTransientQueryError(error),
      staleTime: ONE_MINUTE_MS,
    },
    mutations: {
      retry: (failureCount, error) => failureCount < 1 && isTransientQueryError(error),
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  key: "musika-mobile-public-query-cache",
  storage: AsyncStorage,
  throttleTime: 2000,
});

const getQueryPrefix = (queryKey: QueryKey) => {
  const [prefix] = queryKey;
  return typeof prefix === "string" ? prefix : "";
};

const shouldPersistQuery = (query: Query) => {
  if (query.state.status !== "success") {
    return false;
  }

  if (query.meta?.persist === true) {
    return true;
  }

  return publicPersistQueryPrefixes.has(getQueryPrefix(query.queryKey));
};

export const persistQueryClientOptions: PersistQueryClientProviderProps["persistOptions"] = {
  buster: QUERY_CACHE_BUSTER,
  maxAge: 6 * ONE_HOUR_MS,
  persister: asyncStoragePersister,
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
  },
};

let focusManagerInitialized = false;

export const setupReactQueryFocusManager = () => {
  if (focusManagerInitialized) {
    return;
  }

  focusManagerInitialized = true;

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      handleFocus(state === "active");
    });

    return () => {
      subscription.remove();
    };
  });
};

export const resetPrivateQueryStateForAuthChange = async () => {
  await queryClient.cancelQueries();

  queryClient.removeQueries({
    predicate: (query) => !shouldPersistQuery(query),
  });
};
