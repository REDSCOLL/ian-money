import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, getCategoryLabel } from "@/lib/utils";
import { Wallet, TrendingDown, CalendarDays, ArrowRight, Camera, ArrowDownToLine, TrendingUp, CreditCard } from "lucide-react";
import { useLocation } from "wouter";
import type { Expense } from "@shared/schema";
import type { BudgetPeriod } from "@shared/budget-period";
import { AccountSelector } from "@/components/account-selector";

interface BudgetPeriodData {
  accountType: "budget" | "ledger";
  accountName?: string;
  // Budget specific
  period: BudgetPeriod;
  monthlyBudget?: number;
  carryOver?: boolean;
  carryOverAmount?: number;
  effectiveBudget?: number;
  remaining?: number;
  daysLeft?: number;
  dailyBudget?: number;
  // Ledger specific
  balance?: number;
  totalIncome?: number;
  // Shared
  totalSpent: number;
  expenses: Expense[];
}

export default function Dashboard() {
  const [, setLocation] = useLocation();

  const { data: periodData, isLoading } = useQuery<BudgetPeriodData>({
    queryKey: ["/api/budget-period"],
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  const isBudget = periodData?.accountType === "budget";
  const expenses = periodData?.expenses || [];
  const period = periodData?.period;

  const categoryTotals = expenses.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const recentExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  ).slice(0, 5);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center justify-between gap-2">
        <AccountSelector />
        {isBudget && period && (
          <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full" data-testid="text-period-label">
            {period.label}
          </span>
        )}
      </div>

      {isBudget ? (
        <>
          <Card data-testid="card-budget-overview" className="bg-gradient-to-br from-background to-primary/5 border-primary/10">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">이번 달 예산</p>
                  <p className="text-lg font-bold" data-testid="text-total-budget">
                    {formatCurrency(periodData?.effectiveBudget || 0)}
                  </p>
                </div>
              </div>

              {(periodData?.carryOverAmount || 0) > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5" data-testid="card-carry-over">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">이월잔액</span>
                  <span className="text-xs font-semibold text-primary ml-auto">
                    +{formatCurrency(periodData?.carryOverAmount || 0)}
                  </span>
                </div>
              )}

              <Progress value={periodData?.effectiveBudget ? (periodData.totalSpent / periodData.effectiveBudget) * 100 : 0} className="h-2.5" />

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">사용</p>
                  <p className="text-sm font-semibold text-foreground" data-testid="text-total-spent">
                    {formatCurrency(periodData?.totalSpent || 0)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">남은 금액</p>
                  <p
                    className={`text-sm font-semibold ${(periodData?.remaining || 0) >= 0 ? "text-primary" : "text-destructive"}`}
                    data-testid="text-remaining"
                  >
                    {formatCurrency(periodData?.remaining || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">하루 사용 가능</p>
                  <p className="text-sm font-bold" data-testid="text-daily-budget">
                    {formatCurrency(Math.max(periodData?.dailyBudget || 0, 0))}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">남은 일수</p>
                  <p className="text-sm font-bold" data-testid="text-days-left">
                    {periodData?.daysLeft}일
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          <Card data-testid="card-balance-overview" className="bg-gradient-to-br from-background to-indigo-50 dark:to-indigo-950/20 border-indigo-200 dark:border-indigo-900">
            <CardContent className="p-6 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">현재 잔액</p>
                <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(periodData?.balance || 0)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-indigo-100 dark:border-indigo-900">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase">Income</span>
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(periodData?.totalIncome || 0)}</p>
                </div>
                <div className="space-y-1 text-right">
                  <div className="flex items-center gap-1.5 text-rose-600 justify-end">
                    <span className="text-[10px] font-bold uppercase">Spent</span>
                    <TrendingDown className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(periodData?.totalSpent || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              최근 거래 내역
            </h2>
          </div>
        </>
      )}

      {sortedCategories.length > 0 && (
        <Card data-testid="card-category-summary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold">항목별 지출</h2>
              <button
                onClick={() => setLocation("/report")}
                className="text-xs text-primary flex items-center gap-0.5"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2.5">
              {sortedCategories.map(([cat, amount]) => (
                <div key={cat} className="flex items-center gap-2.5">
                  <CategoryIcon category={cat} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{getCategoryLabel(cat)}</span>
                      <span className="text-sm font-semibold">{formatCurrency(amount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {recentExpenses.map((expense) => (
          <div 
            key={expense.id} 
            className="flex items-center gap-3 p-3 rounded-xl bg-card border shadow-sm"
          >
            <CategoryIcon category={expense.category} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{expense.storeName}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(expense.date + "T00:00:00").toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
              </p>
            </div>
            <p className={`text-sm font-bold whitespace-nowrap ${expense.type === "income" ? "text-emerald-600" : "text-foreground"}`}>
              {expense.type === "income" ? "+" : "-"}{formatCurrency(expense.amount)}
            </p>
          </div>
        ))}
      </div>

      {expenses.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Camera className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              기록된 내역이 없습니다.
            </p>
            <button
              onClick={() => setLocation("/scan")}
              className="text-sm text-primary font-bold mt-2"
            >
              첫 내역 기록하기
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

