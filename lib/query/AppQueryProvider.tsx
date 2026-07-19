"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * 02§6状態管理表「サーバ状態(進捗/提出/ノート) → TanStack Query(staleTime 60s、
 * 進捗mutationは楽観更新)」に対応するアプリ全体のQueryClientProvider(T-105)。
 * useStateの初期化関数でQueryClientをマウントごとに1つだけ生成する
 * (Reactの推奨パターン、再レンダー時の再生成を防ぐ)。
 */
export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
