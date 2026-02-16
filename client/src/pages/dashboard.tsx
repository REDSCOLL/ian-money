import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, getCategoryLabel, getCurrentMonth } from "@/lib/utils";
import { Wallet, TrendingDown, CalendarDays, ArrowRight, Camera } from "lucide-react";
import { useLocation } from "wouter";
import type { Budget, Expense, Settings } from "@shared/schema";

export default function Dashboard() {
  const { month, year } = getCurrentMonth();
  const [, setLocation] = useLocation();

  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: budget, isLoading: budgetLoading } = useQuery<Budget>({
    queryKey: ["/api/budgets", month, year],
  });

  const { data: expenses, isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", month, year],
  });

  const isLoading = settingsLoading || budgetLoading || expensesLoading;

  const totalBudget = budget?.monthlyAmount || settings?.monthlyBudget || 0;
  const totalSpent = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const remaining = totalBudget - totalSpent;
  const usagePercent = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  const categoryTotals = (expenses || []).reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const recentExpenses = [...(expenses || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  ).slice(0, 5);

  const today = new Date();
  const daysLeft = new Date(year, month, 0).getDate() - today.getDate();
  const dailyBudget = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0;

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

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold" data-testid="text-dashboard-title">
          {month}월 가계부
        </h1>
        <span className="text-sm text-muted-foreground">{year}년</span>
      </div>

      <Card data-testid="card-budget-overview">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">이번 달 예산</p>
              <p className="text-lg font-bold" data-testid="text-total-budget">
                {formatCurrency(totalBudget)}
              </p>
            </div>
          </div>

          <Progress value={usagePercent} className="h-2.5" />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground">사용</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-total-spent">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">남은 금액</p>
              <p
                className={`text-sm font-semibold ${remaining >= 0 ? "text-primary" : "text-destructive"}`}
                data-testid="text-remaining"
              >
                {formatCurrency(remaining)}
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
                {formatCurrency(Math.max(dailyBudget, 0))}
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
                {daysLeft}일
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {sortedCategories.length > 0 && (
        <Card data-testid="card-category-summary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold">항목별 지출</h2>
              <button
                onClick={() => setLocation("/report")}
                className="text-xs text-primary flex items-center gap-0.5"
                data-testid="link-view-report"
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
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{
                          width: `${totalBudget > 0 ? (amount / totalBudget) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentExpenses.length > 0 && (
        <Card data-testid="card-recent-expenses">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold">최근 지출</h2>
              <button
                onClick={() => setLocation("/history")}
                className="text-xs text-primary flex items-center gap-0.5"
                data-testid="link-view-history"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {recentExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center gap-2.5" data-testid={`expense-item-${expense.id}`}>
                  <CategoryIcon category={expense.category} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{expense.storeName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(expense.date + "T00:00:00").getMonth() + 1}/{new Date(expense.date + "T00:00:00").getDate()}
                    </p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">
                    -{formatCurrency(expense.amount)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(!expenses || expenses.length === 0) && totalBudget > 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Camera className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              아직 이번 달 지출 내역이 없어요
            </p>
            <button
              onClick={() => setLocation("/scan")}
              className="text-sm text-primary font-medium mt-1"
              data-testid="link-add-first"
            >
              영수증 촬영하기
            </button>
          </CardContent>
        </Card>
      )}

      {totalBudget === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-1">
              먼저 이번 달 예산을 설정해주세요
            </p>
            <button
              onClick={() => setLocation("/settings")}
              className="text-sm text-primary font-medium"
              data-testid="link-setup-budget"
            >
              예산 설정하기
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
