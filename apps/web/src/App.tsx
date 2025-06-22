import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "./utils/trpc";
import React, { Suspense } from "react";
import { router } from "./router";
import { RouterProvider } from "@tanstack/react-router";
import { AppRoot } from "@telegram-apps/telegram-ui";

const TanStackRouterDevtools =
  import.meta.env.PROD || import.meta.env.VITE_SHOW_DEVTOOLS !== "true"
    ? () => null
    : React.lazy(() =>
        import("@tanstack/react-router-devtools").then((res) => ({
          default: res.TanStackRouterDevtools,
        }))
      );

const App = () => {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppRoot platform="ios">
          <RouterProvider router={router} />
        </AppRoot>
        <Suspense>
          <TanStackRouterDevtools router={router} />
        </Suspense>
      </QueryClientProvider>
    </trpc.Provider>
  );
};

export default App;
