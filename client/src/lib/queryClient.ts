import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { clientStorage } from "./storage";

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
): Promise<any> {
  // Simple Mock Router
  if (url === "/api/settings" && (method === "PUT" || method === "PATCH")) {
    return await clientStorage.upsertSettings(data);
  }

  if (url === "/api/expenses" && method === "POST") {
    return await clientStorage.createExpense(data);
  }

  if (url === "/api/accounts" && method === "POST") {
    return await clientStorage.createAccount(data);
  }

  if (url.startsWith("/api/expenses/") && method === "DELETE") {

    const id = parseInt(url.split("/").pop() || "0");
    await clientStorage.deleteExpense(id);
    return { success: true };
  }

  throw new Error(`Method ${method} on ${url} not implemented in local mode`);
}

export const getQueryFn: <T>(options: {
  on401: "returnNull" | "throw";
}) => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    const url = queryKey.join("/");
    
    if (url === "api/settings") {
      return await clientStorage.getSettings() as any;
    }

    if (url === "api/accounts") {
      return await clientStorage.getAccounts() as any;
    }

    if (url === "api/accounts/current") {
      return await clientStorage.getCurrentAccount() as any;
    }

    if (url === "api/budget-period") {

      return await clientStorage.getBudgetPeriodData() as any;
    }

    if (url.startsWith("api/budget-period/navigate")) {
      const fullUrl = new URL(url, "http://localhost");
      const month = parseInt(fullUrl.searchParams.get("month") || "0");
      const year = parseInt(fullUrl.searchParams.get("year") || "0");
      const day = parseInt(fullUrl.searchParams.get("day") || "1");
      const refDate = new Date(year, month - 1, day);
      return await clientStorage.getBudgetPeriodData(refDate) as any;
    }

    if (url.startsWith("api/expenses/range")) {
      const fullUrl = new URL(url, "http://localhost");
      const from = fullUrl.searchParams.get("from") || "";
      const to = fullUrl.searchParams.get("to") || "";
      return await clientStorage.getExpensesByDateRange(from, to) as any;
    }

    if (url.startsWith("api/expenses/")) {
      const parts = url.split("/");
      const month = parseInt(parts[2]);
      const year = parseInt(parts[3]);
      return await clientStorage.getExpenses(month, year) as any;
    }

    if (url.startsWith("api/budgets/")) {
      const parts = url.split("/");
      const month = parseInt(parts[2]);
      const year = parseInt(parts[3]);
      return await clientStorage.getBudget(month, year) as any;
    }

    throw new Error(`GET ${url} not implemented in local mode`);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

