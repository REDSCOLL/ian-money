import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, getCurrentMonth, getCategoryLabel } from "@/lib/utils";
import { CATEGORIES } from "@shared/schema";
import { Camera, Upload, Loader2, Check, X, ImageIcon, ReceiptText } from "lucide-react";
import { useLocation } from "wouter";

interface AnalysisResult {
  storeName: string;
  amount: number;
  category: string;
  date: string;
  memo: string;
}

export default function ScanPage() {
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const saveMutation = useMutation({
    mutationFn: async (data: AnalysisResult & { receiptImage?: string }) => {
      const { month, year } = getCurrentMonth();
      const res = await apiRequest("POST", "/api/expenses", {
        ...data,
        month,
        year,
        receiptImage: image,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "저장 완료", description: "지출이 기록되었습니다." });
      resetState();
      setLocation("/");
    },
    onError: () => {
      toast({ title: "저장 실패", description: "다시 시도해주세요.", variant: "destructive" });
    },
  });

  const resetState = () => {
    setImage(null);
    setResult(null);
    setEditMode(false);
    setEditData(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setImage(base64);
      await analyzeReceipt(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const analyzeReceipt = async (base64Image: string) => {
    setAnalyzing(true);
    try {
      const res = await apiRequest("POST", "/api/receipts/analyze", {
        image: base64Image,
      });
      const data = await res.json();
      setResult(data);
      setEditData(data);
    } catch {
      toast({
        title: "분석 실패",
        description: "영수증을 인식하지 못했습니다. 다시 촬영해주세요.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = () => {
    const data = editMode ? editData : result;
    if (!data) return;
    saveMutation.mutate(data);
  };

  const handleManualEntry = () => {
    const today = new Date().toISOString().split("T")[0];
    setResult({ storeName: "", amount: 0, category: "etc", date: today, memo: "" });
    setEditData({ storeName: "", amount: 0, category: "etc", date: today, memo: "" });
    setEditMode(true);
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <h1 className="text-xl font-bold" data-testid="text-scan-title">
        영수증 등록
      </h1>

      {!image && !result && (
        <>
          <Card className="hover-elevate cursor-pointer" onClick={() => cameraInputRef.current?.click()}>
            <CardContent className="p-6 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">영수증 촬영</p>
                <p className="text-xs text-muted-foreground mt-0.5">카메라로 영수증을 촬영하세요</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <CardContent className="p-6 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">갤러리에서 선택</p>
                <p className="text-xs text-muted-foreground mt-0.5">저장된 사진에서 선택하세요</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={handleManualEntry}>
            <CardContent className="p-6 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ReceiptText className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">직접 입력</p>
                <p className="text-xs text-muted-foreground mt-0.5">수동으로 지출을 기록하세요</p>
              </div>
            </CardContent>
          </Card>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-camera"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-gallery"
          />
        </>
      )}

      {analyzing && (
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">영수증을 분석하고 있어요...</p>
          </CardContent>
        </Card>
      )}

      {image && !analyzing && (
        <Card>
          <CardContent className="p-3">
            <img
              src={image}
              alt="영수증"
              className="w-full max-h-48 object-contain rounded-md bg-muted"
              data-testid="img-receipt-preview"
            />
          </CardContent>
        </Card>
      )}

      {result && !analyzing && (
        <Card data-testid="card-analysis-result">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {editMode ? "지출 정보 수정" : "분석 결과"}
              </h2>
              {!editMode && (
                <Button size="sm" variant="ghost" onClick={() => setEditMode(true)} data-testid="button-edit">
                  수정
                </Button>
              )}
            </div>

            {editMode && editData ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">가게 이름</Label>
                  <Input
                    value={editData.storeName}
                    onChange={(e) => setEditData({ ...editData, storeName: e.target.value })}
                    data-testid="input-store-name"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">금액 (원)</Label>
                  <Input
                    type="number"
                    value={editData.amount || ""}
                    onChange={(e) => setEditData({ ...editData, amount: parseInt(e.target.value) || 0 })}
                    data-testid="input-amount"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">카테고리</Label>
                  <Select
                    value={editData.category}
                    onValueChange={(v) => setEditData({ ...editData, category: v })}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">날짜</Label>
                  <Input
                    type="date"
                    value={editData.date}
                    onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                    data-testid="input-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">메모</Label>
                  <Input
                    value={editData.memo}
                    onChange={(e) => setEditData({ ...editData, memo: e.target.value })}
                    placeholder="선택사항"
                    data-testid="input-memo"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <CategoryIcon category={result.category} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{result.storeName || "알 수 없음"}</p>
                    <p className="text-xs text-muted-foreground">{getCategoryLabel(result.category)}</p>
                  </div>
                  <p className="text-lg font-bold">{formatCurrency(result.amount)}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>날짜: {result.date}</span>
                  {result.memo && <span>메모: {result.memo}</span>}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={resetState} data-testid="button-cancel">
                <X className="w-4 h-4 mr-1" />
                취소
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                저장
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
