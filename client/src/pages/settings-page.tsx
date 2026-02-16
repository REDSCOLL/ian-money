import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { Wallet, CalendarDays, Save, Moon, Sun, Loader2, ArrowDownToLine } from "lucide-react";
import type { Settings } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [payDay, setPayDay] = useState("1");
  const [carryOver, setCarryOver] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settings) {
      setMonthlyBudget(String(settings.monthlyBudget));
      setPayDay(String(settings.payDay));
      setCarryOver(settings.carryOver);
    }
  }, [settings]);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    if (enabled) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/settings", {
        monthlyBudget: parseInt(monthlyBudget) || 0,
        payDay: parseInt(payDay) || 1,
        carryOver,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-period"] });
      toast({ title: "저장 완료", description: "설정이 업데이트되었습니다." });
    },
    onError: () => {
      toast({ title: "저장 실패", description: "다시 시도해주세요.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <h1 className="text-xl font-bold" data-testid="text-settings-title">설정</h1>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">예산 설정</h2>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">월 예산 금액 (원)</Label>
            <Input
              type="number"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              placeholder="예: 1000000"
              data-testid="input-monthly-budget"
            />
            {monthlyBudget && parseInt(monthlyBudget) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(parseInt(monthlyBudget))}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                급여일 (매월)
              </div>
            </Label>
            <Select value={payDay} onValueChange={setPayDay}>
              <SelectTrigger data-testid="select-pay-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {day}일
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              급여일부터 다음 급여일 전날까지가 예산 기간입니다
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                <ArrowDownToLine className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">이월잔액 합치기</p>
                <p className="text-[11px] text-muted-foreground">이전 기간 남은 금액을 다음 예산에 합산</p>
              </div>
            </div>
            <Switch
              checked={carryOver}
              onCheckedChange={setCarryOver}
              data-testid="switch-carry-over"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {darkMode ? (
                <div className="w-9 h-9 rounded-md bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">다크 모드</p>
                <p className="text-xs text-muted-foreground">어두운 테마를 사용합니다</p>
              </div>
            </div>
            <Switch
              checked={darkMode}
              onCheckedChange={toggleDarkMode}
              data-testid="switch-dark-mode"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
