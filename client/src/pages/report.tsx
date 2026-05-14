import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, getCategoryLabel, getCategoryColor } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Expense, Budget } from "@shared/schema";
import { CATEGORIES } from "@shared/schema";
import { 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Sparkles, 
  Brain, 
  Loader2,
  Printer, 
  Calendar as CalendarIcon 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ReportPage() {
  const { toast } = useToast();
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
  const totalSpent = expenses?.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0) || 0;
  const totalIncome = expenses?.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0) || 0;
  const remaining = totalBudget - totalSpent;

  const categoryTotals: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  (expenses || []).filter(e => e.type === "expense").forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  });

  const sortedCategories = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);
  const maxCategoryAmount = sortedCategories.length > 0 ? sortedCategories[0][1] : 0;

  const dailyTotals: Record<string, number> = {};
  (expenses || []).filter(e => e.type === "expense").forEach((e) => {
    dailyTotals[e.date] = (dailyTotals[e.date] || 0) + e.amount;
  });
  const sortedDays = Object.entries(dailyTotals).sort(([a], [b]) => a.localeCompare(b));
  const maxDailyAmount = sortedDays.length > 0 ? Math.max(...sortedDays.map(([, v]) => v)) : 0;
  const [aiReport, setAiReport] = useState<string | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/analyze", {
        month: viewMonth,
        year: viewYear,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setAiReport(data.report);
    },
    onError: () => {
      toast({ title: "분석 실패", description: "Ollama 서버 상태를 확인해주세요.", variant: "destructive" });
    },
  });

  const [printRange, setPrintRange] = useState({
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
    to: now.toISOString().split("T")[0]
  });
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  const handlePrint = async () => {
    try {
      const res = await fetch(`/api/expenses/range?from=${printRange.from}&to=${printRange.to}`);
      const data: Expense[] = await res.json();
      
      const total = data.reduce((s, e) => s + e.amount, 0);
      const categories: Record<string, number> = {};
      data.forEach(e => categories[e.category] = (categories[e.category] || 0) + e.amount);

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>지출 보고서 (${printRange.from} ~ ${printRange.to})</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body { font-family: 'Inter', sans-serif; color: #334155; padding: 40px; line-height: 1.5; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: 700; color: #1e293b; margin: 0; }
            .date-range { font-size: 14px; color: #64748b; margin-top: 5px; }
            
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
            .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; rounded: 8px; border-radius: 12px; }
            .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; }
            .summary-value { font-size: 20px; font-weight: 700; color: #0f172a; }

            .section-title { font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #1e293b; border-left: 4px solid #6366f1; padding-left: 12px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { text-align: left; background: #f1f5f9; padding: 12px; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
            td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
            .amount { text-align: right; font-weight: 600; }
            .category { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #e2e8f0; }

            @media print {
              body { padding: 20px; }
              .summary-card { border: 1px solid #e2e8f0 !important; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">지출 보고서</h1>
            <div class="date-range">${printRange.from} 부터 ${printRange.to} 까지</div>
          </div>

          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">총 지출액</div>
              <div class="summary-value">${total.toLocaleString()}원</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">총 지출 건수</div>
              <div class="summary-value">${data.length}건</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">일평균 지출</div>
              <div class="summary-value">${Math.round(total / (Math.max(1, (new Date(printRange.to).getTime() - new Date(printRange.from).getTime()) / (1000 * 60 * 60 * 24)) + 1)).toLocaleString()}원</div>
            </div>
          </div>

          <div class="section-title">항목별 요약</div>
          <table>
            <thead>
              <tr>
                <th>카테고리</th>
                <th>건수</th>
                <th style="text-align: right;">지출액</th>
                <th style="text-align: right;">비중</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(categories).sort(([, a], [, b]) => b - a).map(([cat, amount]) => `
                <tr>
                  <td>${getCategoryLabel(cat)}</td>
                  <td>${data.filter(e => e.category === cat).length}건</td>
                  <td class="amount">${amount.toLocaleString()}원</td>
                  <td style="text-align: right;">${Math.round((amount / total) * 100)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">상세 지출 내역</div>
          <table>
            <thead>
              <tr>
                <th style="width: 80px;">날짜</th>
                <th>사용처</th>
                <th>카테고리</th>
                <th>메모</th>
                <th style="text-align: right;">금액</th>
                <th style="text-align: center; width: 60px;">증빙</th>
              </tr>
            </thead>
            <tbody>
              ${data.sort((a, b) => b.date.localeCompare(a.date)).map(e => `
                <tr>
                  <td>${e.date}</td>
                  <td style="font-weight: 500;">${e.storeName}</td>
                  <td><span class="category">${getCategoryLabel(e.category)}</span></td>
                  <td style="color: #64748b; font-size: 11px;">${e.memo || '-'}</td>
                  <td class="amount">${e.amount.toLocaleString()}원</td>
                  <td style="text-align: center;">
                    ${e.receiptImage ? `<img src="${e.receiptImage}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;">` : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="text-align: center; color: #94a3b8; font-size: 11px; margin-top: 40px;">
            본 보고서는 가계부 매니저 앱에 의해 자동 생성되었습니다.
          </div>

          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                // window.close();
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
      setIsPrintDialogOpen(false);
    } catch (error) {
      console.error("Print error:", error);
      toast({ title: "출력 실패", description: "보고서를 생성하는 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

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
        <div className="flex items-center gap-1">
          <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost">
                <Printer className="w-5 h-5 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>보고서 출력 및 저장</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="from" className="text-right">시작일</Label>
                  <Input
                    id="from"
                    type="date"
                    className="col-span-3"
                    value={printRange.from}
                    onChange={(e) => setPrintRange({ ...printRange, from: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="to" className="text-right">종료일</Label>
                  <Input
                    id="to"
                    type="date"
                    className="col-span-3"
                    value={printRange.to}
                    onChange={(e) => setPrintRange({ ...printRange, to: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handlePrint} className="w-full">
                  전문 보고서 생성 및 출력
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="icon" variant="ghost" onClick={nextMonth} data-testid="button-report-next">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
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

      {/* AI Analysis button removed for local mode */}


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
