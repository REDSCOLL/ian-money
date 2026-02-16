import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, getCategoryLabel, getCategoryColor } from "@/lib/utils";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Expense, Budget } from "@shared/schema";
import { CATEGORIES } from "@shared/schema";

export default function ReportPage() {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const { data: expenses, isLoading: expLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", viewMonth, viewYear],
  });

  const { data: budget, isLoading: budgetLoading } = useQuery<Budget>({
    queryKey: ["/api/budgets", viewMonth, viewYear],
  });

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const isLoading = expLoading || budgetLoading;
  const totalBudget = budget?.monthlyAmount || 0;
  const totalSpent = expenses?.reduce((s, e) => s + e.amount, 0) || 0;
  const remaining = totalBudget - totalSpent;

  const categoryTotals: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  (expenses || []).forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  });

  const sortedCategories = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);
  const maxCategoryAmount = sortedCategories.length > 0 ? sortedCategories[0][1] : 0;

  const dailyTotals: Record<string, number> = {};
  (expenses || []).forEach((e) => {
    dailyTotals[e.date] = (dailyTotals[e.date] || 0) + e.amount;
  });
  const sortedDays = Object.entries(dailyTotals).sort(([a], [b]) => a.localeCompare(b));
  const maxDailyAmount = sortedDays.length > 0 ? Math.max(...sortedDays.map(([, v]) => v)) : 0;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
        <Skeleton className="h-8 w-40 mx-auto" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center justify-between gap-2">
        <Button size="icon" variant="ghost" onClick={prevMonth} data-testid="button-report-prev">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold" data-testid="text-report-month">
          {viewYear}년 {viewMonth}월 리포트
        </h1>
        <Button size="icon" variant="ghost" onClick={nextMonth} data-testid="button-report-next">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <Card data-testid="card-report-summary">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">예산</p>
              <p className="text-sm font-bold">{formatCurrency(totalBudget)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">지출</p>
              <p className="text-sm font-bold">{formatCurrency(totalSpent)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">잔액</p>
              <p className={`text-sm font-bold ${remaining >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>
          {totalBudget > 0 && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs">
              {totalSpent <= totalBudget * 0.7 ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5 text-primary" />
                  <span className="text-primary font-medium">절약 중</span>
                </>
              ) : totalSpent <= totalBudget ? (
                <>
                  <Minus className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-500 font-medium">주의 필요</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-destructive font-medium">예산 초과</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-category-breakdown">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3">항목별 분석</h2>
          {sortedCategories.length > 0 ? (
            <div className="space-y-3">
              {sortedCategories.map(([cat, amount]) => {
                const percent = totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CategoryIcon category={cat} size="sm" />
                      <span className="text-sm flex-1">{getCategoryLabel(cat)}</span>
                      <span className="text-xs text-muted-foreground">{categoryCounts[cat]}건</span>
                      <span className="text-sm font-semibold">{formatCurrency(amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-9">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${maxCategoryAmount > 0 ? (amount / maxCategoryAmount) * 100 : 0}%`,
                            backgroundColor: getCategoryColor(cat),
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground w-8 text-right">{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">데이터가 없습니다</p>
          )}
        </CardContent>
      </Card>

      {sortedDays.length > 0 && (
        <Card data-testid="card-daily-chart">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold mb-3">일별 지출</h2>
            <div className="space-y-1.5">
              {sortedDays.map(([date, amount]) => {
                const d = new Date(date + "T00:00:00");
                const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
                return (
                  <div key={date} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-10 text-right">{dayLabel}</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{
                          width: `${maxDailyAmount > 0 ? (amount / maxDailyAmount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-medium w-16 text-right">{formatCurrency(amount)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
