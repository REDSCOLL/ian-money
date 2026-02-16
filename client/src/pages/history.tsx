import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, formatFullDate, getCategoryLabel, getCurrentMonth } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Trash2, ImageIcon } from "lucide-react";
import { CATEGORIES } from "@shared/schema";
import type { Expense } from "@shared/schema";

export default function HistoryPage() {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const { toast } = useToast();

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses", viewMonth, viewYear],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-period"] });
      setSelectedExpense(null);
      toast({ title: "삭제 완료" });
    },
  });

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const groupByDate = (list: Expense[]) => {
    const groups: Record<string, Expense[]> = {};
    list.forEach((e) => {
      if (!groups[e.date]) groups[e.date] = [];
      groups[e.date].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const groupByCategory = (list: Expense[]) => {
    const groups: Record<string, Expense[]> = {};
    list.forEach((e) => {
      if (!groups[e.category]) groups[e.category] = [];
      groups[e.category].push(e);
    });
    return Object.entries(groups).sort(
      ([, a], [, b]) =>
        b.reduce((s, e) => s + e.amount, 0) - a.reduce((s, e) => s + e.amount, 0)
    );
  };

  const totalSpent = expenses?.reduce((s, e) => s + e.amount, 0) || 0;

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center justify-between gap-2">
        <Button size="icon" variant="ghost" onClick={prevMonth} data-testid="button-prev-month">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold" data-testid="text-history-month">
          {viewYear}년 {viewMonth}월
        </h1>
        <Button size="icon" variant="ghost" onClick={nextMonth} data-testid="button-next-month">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <div className="text-center">
        <p className="text-xs text-muted-foreground">총 지출</p>
        <p className="text-2xl font-bold" data-testid="text-history-total">
          {formatCurrency(totalSpent)}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      ) : (
        <Tabs defaultValue="date">
          <TabsList className="w-full">
            <TabsTrigger value="date" className="flex-1" data-testid="tab-by-date">
              일별
            </TabsTrigger>
            <TabsTrigger value="category" className="flex-1" data-testid="tab-by-category">
              항목별
            </TabsTrigger>
          </TabsList>

          <TabsContent value="date" className="mt-3 space-y-3">
            {groupByDate(expenses || []).map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatFullDate(date)}
                  </span>
                  <span className="text-xs font-semibold">
                    {formatCurrency(items.reduce((s, e) => s + e.amount, 0))}
                  </span>
                </div>
                <Card>
                  <CardContent className="p-0 divide-y divide-border">
                    {items.map((expense) => (
                      <button
                        key={expense.id}
                        className="w-full flex items-center gap-2.5 p-3 text-left hover-elevate"
                        onClick={() => setSelectedExpense(expense)}
                        data-testid={`expense-row-${expense.id}`}
                      >
                        {expense.receiptImage ? (
                          <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                            <img src={expense.receiptImage} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <CategoryIcon category={expense.category} size="sm" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{expense.storeName}</p>
                          <div className="flex items-center gap-1">
                            <p className="text-[11px] text-muted-foreground">{getCategoryLabel(expense.category)}</p>
                            {expense.receiptImage && (
                              <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-semibold whitespace-nowrap">
                          -{formatCurrency(expense.amount)}
                        </p>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ))}
            {(!expenses || expenses.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-8">내역이 없습니다</p>
            )}
          </TabsContent>

          <TabsContent value="category" className="mt-3 space-y-3">
            {groupByCategory(expenses || []).map(([cat, items]) => (
              <Card key={cat}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2.5 mb-2">
                    <CategoryIcon category={cat} size="sm" />
                    <span className="text-sm font-semibold flex-1">{getCategoryLabel(cat)}</span>
                    <span className="text-sm font-bold">
                      {formatCurrency(items.reduce((s, e) => s + e.amount, 0))}
                    </span>
                  </div>
                  <div className="space-y-1.5 ml-9">
                    {items.map((expense) => (
                      <button
                        key={expense.id}
                        className="w-full flex items-center justify-between gap-2 text-left"
                        onClick={() => setSelectedExpense(expense)}
                        data-testid={`cat-expense-${expense.id}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm truncate">{expense.storeName}</p>
                          <p className="text-[11px] text-muted-foreground">{formatFullDate(expense.date)}</p>
                        </div>
                        <p className="text-sm font-medium whitespace-nowrap">
                          -{formatCurrency(expense.amount)}
                        </p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!expenses || expenses.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-8">내역이 없습니다</p>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!selectedExpense} onOpenChange={() => setSelectedExpense(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>지출 상세</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <CategoryIcon category={selectedExpense.category} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{selectedExpense.storeName}</p>
                  <p className="text-xs text-muted-foreground">{getCategoryLabel(selectedExpense.category)}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">금액</span>
                  <span className="font-bold">{formatCurrency(selectedExpense.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">날짜</span>
                  <span>{formatFullDate(selectedExpense.date)}</span>
                </div>
                {selectedExpense.memo && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">메모</span>
                    <span>{selectedExpense.memo}</span>
                  </div>
                )}
              </div>
              {selectedExpense.receiptImage && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    첨부 영수증
                  </p>
                  <img
                    src={selectedExpense.receiptImage}
                    alt="영수증"
                    className="w-full object-contain rounded-md bg-muted"
                    data-testid="img-detail-receipt"
                  />
                </div>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => deleteMutation.mutate(selectedExpense.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-expense"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                삭제
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
