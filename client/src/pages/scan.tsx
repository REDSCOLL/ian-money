import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, getCurrentMonth, getCategoryLabel } from "@/lib/utils";
import { CATEGORIES } from "@shared/schema";
import { Camera, Loader2, Check, X, ImageIcon, ReceiptText, ChevronLeft, ChevronRight, Crop, FolderOpen, Monitor, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

interface AnalysisResult {
  storeName: string;
  amount: number;
  category: string;
  date: string;
  memo: string;
}

interface QueueItem {
  image: string;
  result: AnalysisResult | null;
  editData: AnalysisResult | null;
  status: "pending" | "analyzing" | "ready" | "failed" | "saved";
}

interface BulkItem {
  id: number;
  image: string;
  fileName: string;
  data: AnalysisResult;
  status: "editing" | "saving" | "saved";
  expanded: boolean;
}

export default function ScanPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [pendingCropImage, setPendingCropImage] = useState<string | null>(null);
  const [pcBulkMode, setPcBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkPreviewImage, setBulkPreviewImage] = useState<string | null>(null);
  const pcFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const current = queue[currentIndex] || null;
  const totalInQueue = queue.length;
  const savedCount = queue.filter((q) => q.status === "saved").length;

  const savingIndexRef = useRef(0);

  const saveMutation = useMutation({
    mutationFn: async (data: AnalysisResult & { receiptImage: string; _saveIndex: number }) => {
      savingIndexRef.current = data._saveIndex;
      const { month, year } = getCurrentMonth();
      const { _saveIndex, ...rest } = data;
      const res = await apiRequest("POST", "/api/expenses", {
        ...rest,
        month,
        year,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-period"] });
      toast({ title: "저장 완료", description: "지출이 기록되었습니다." });
      const savedIdx = savingIndexRef.current;

      setQueue((prev) => {
        const updated = [...prev];
        updated[savedIdx] = { ...updated[savedIdx], status: "saved" };
        const nextUnsaved = updated.findIndex((q, i) => i > savedIdx && q.status !== "saved");
        if (nextUnsaved >= 0) {
          setCurrentIndex(nextUnsaved);
        } else {
          setTimeout(() => {
            setQueue([]);
            setCurrentIndex(0);
            setLocation("/");
          }, 300);
        }
        return updated;
      });
      setEditMode(false);
    },
    onError: () => {
      toast({ title: "저장 실패", description: "다시 시도해주세요.", variant: "destructive" });
    },
  });

  const resetState = () => {
    setQueue([]);
    setCurrentIndex(0);
    setEditMode(false);
    setCropMode(false);
    setCropStart(null);
    setCropEnd(null);
    setPendingCropImage(null);
  };

  const resizeImage = (file: File, maxWidth = 1536, quality = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        const contrast = 1.3;
        const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
        for (let i = 0; i < d.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            let val = factor * (d[i + c] - 128) + 128;
            d[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  };

  const analyzeReceipt = async (base64Image: string, queueIdx: number, retryCount = 0) => {
    setQueue((prev) => {
      const updated = [...prev];
      if (updated[queueIdx]) updated[queueIdx] = { ...updated[queueIdx], status: "analyzing" };
      return updated;
    });
    try {
      const res = await apiRequest("POST", "/api/receipts/analyze", { image: base64Image });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      if (data.amount === 0 && data.storeName === "알 수 없음" && retryCount === 0) {
        return await analyzeReceipt(base64Image, queueIdx, 1);
      }
      setQueue((prev) => {
        const updated = [...prev];
        if (updated[queueIdx]) {
          updated[queueIdx] = { ...updated[queueIdx], result: data, editData: data, status: "ready" };
        }
        return updated;
      });
    } catch {
      if (retryCount === 0) return await analyzeReceipt(base64Image, queueIdx, 1);
      setQueue((prev) => {
        const updated = [...prev];
        if (updated[queueIdx]) updated[queueIdx] = { ...updated[queueIdx], status: "failed" };
        return updated;
      });
    }
  };

  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const base64 = await resizeImage(files[i]);
        newItems.push({ image: base64, result: null, editData: null, status: "pending" });
      } catch {
        // skip failed images
      }
    }
    e.target.value = "";
    if (newItems.length === 0) return;

    setQueue(newItems);
    setCurrentIndex(0);
    setEditMode(false);

    for (let i = 0; i < newItems.length; i++) {
      analyzeReceipt(newItems[i].image, i);
    }
  };

  const handleCameraSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await resizeImage(file);
      setPendingCropImage(base64);
      setCropMode(true);
    } catch {
      toast({ title: "이미지 오류", description: "사진을 불러오지 못했습니다.", variant: "destructive" });
    }
    e.target.value = "";
  };

  const applyCrop = useCallback(() => {
    if (!pendingCropImage || !cropStart || !cropEnd || !cropContainerRef.current) {
      if (pendingCropImage) {
        const item: QueueItem = { image: pendingCropImage, result: null, editData: null, status: "pending" };
        setQueue([item]);
        setCurrentIndex(0);
        setCropMode(false);
        setPendingCropImage(null);
        setCropStart(null);
        setCropEnd(null);
        analyzeReceipt(pendingCropImage, 0);
      }
      return;
    }

    const container = cropContainerRef.current;
    const imgEl = container.querySelector("img");
    if (!imgEl) return;

    const rect = imgEl.getBoundingClientRect();
    const scaleX = imgEl.naturalWidth / rect.width;
    const scaleY = imgEl.naturalHeight / rect.height;

    const x1 = Math.min(cropStart.x, cropEnd.x) - rect.left + container.scrollLeft;
    const y1 = Math.min(cropStart.y, cropEnd.y) - rect.top + container.scrollTop;
    const cw = Math.abs(cropEnd.x - cropStart.x);
    const ch = Math.abs(cropEnd.y - cropStart.y);

    if (cw < 20 || ch < 20) {
      const item: QueueItem = { image: pendingCropImage, result: null, editData: null, status: "pending" };
      setQueue([item]);
      setCurrentIndex(0);
      setCropMode(false);
      setPendingCropImage(null);
      setCropStart(null);
      setCropEnd(null);
      analyzeReceipt(pendingCropImage, 0);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = cw * scaleX;
    canvas.height = ch * scaleY;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tempImg = new Image();
    tempImg.onload = () => {
      ctx.drawImage(tempImg, x1 * scaleX, y1 * scaleY, cw * scaleX, ch * scaleY, 0, 0, canvas.width, canvas.height);
      const cropped = canvas.toDataURL("image/jpeg", 0.9);
      const item: QueueItem = { image: cropped, result: null, editData: null, status: "pending" };
      setQueue([item]);
      setCurrentIndex(0);
      setCropMode(false);
      setPendingCropImage(null);
      setCropStart(null);
      setCropEnd(null);
      analyzeReceipt(cropped, 0);
    };
    tempImg.src = pendingCropImage;
  }, [pendingCropImage, cropStart, cropEnd]);

  const skipCrop = () => {
    if (!pendingCropImage) return;
    const item: QueueItem = { image: pendingCropImage, result: null, editData: null, status: "pending" };
    setQueue([item]);
    setCurrentIndex(0);
    setCropMode(false);
    setPendingCropImage(null);
    setCropStart(null);
    setCropEnd(null);
    analyzeReceipt(pendingCropImage, 0);
  };

  const handleManualEntry = () => {
    const today = new Date().toISOString().split("T")[0];
    const item: QueueItem = {
      image: "",
      result: { storeName: "", amount: 0, category: "etc", date: today, memo: "" },
      editData: { storeName: "", amount: 0, category: "etc", date: today, memo: "" },
      status: "ready",
    };
    setQueue([item]);
    setCurrentIndex(0);
    setEditMode(true);
  };

  const handleSave = () => {
    if (!current) return;
    const data = editMode ? current.editData : current.result;
    if (!data) return;
    saveMutation.mutate({ ...data, receiptImage: current.image, _saveIndex: currentIndex });
  };

  const handleSwitchToManual = () => {
    if (!current) return;
    const today = new Date().toISOString().split("T")[0];
    setQueue((prev) => {
      const updated = [...prev];
      updated[currentIndex] = {
        ...updated[currentIndex],
        result: { storeName: "", amount: 0, category: "etc", date: today, memo: "" },
        editData: { storeName: "", amount: 0, category: "etc", date: today, memo: "" },
        status: "ready",
      };
      return updated;
    });
    setEditMode(true);
  };

  const updateEditData = (field: string, value: string | number) => {
    setQueue((prev) => {
      const updated = [...prev];
      if (updated[currentIndex]?.editData) {
        updated[currentIndex] = {
          ...updated[currentIndex],
          editData: { ...updated[currentIndex].editData!, [field]: value },
        };
      }
      return updated;
    });
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setCropStart({ x: clientX, y: clientY });
    setCropEnd({ x: clientX, y: clientY });
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!cropStart) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setCropEnd({ x: clientX, y: clientY });
  };

  const handleTouchEnd = () => {};

  const handlePcBulkSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const newItems: BulkItem[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const base64 = await resizeImage(files[i]);
        newItems.push({
          id: Date.now() + i,
          image: base64,
          fileName: files[i].name,
          data: { storeName: "", amount: 0, category: "etc", date: today, memo: "" },
          status: "editing",
          expanded: false,
        });
      } catch {
        // skip
      }
    }
    e.target.value = "";
    if (newItems.length === 0) {
      toast({ title: "파일 없음", description: "이미지 파일을 선택해주세요.", variant: "destructive" });
      return;
    }
    setBulkItems((prev) => {
      const combined = [...prev, ...newItems];
      const hasExpanded = combined.some((b) => b.expanded && b.status === "editing");
      if (!hasExpanded && newItems.length > 0) {
        const firstNewIdx = combined.findIndex((b) => b.id === newItems[0].id);
        combined[firstNewIdx] = { ...combined[firstNewIdx], expanded: true };
      }
      return combined;
    });
    toast({ title: `${newItems.length}장 추가 완료`, description: "각 영수증 정보를 입력 후 저장하세요." });
  };

  const updateBulkItem = (id: number, field: string, value: string | number) => {
    setBulkItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, data: { ...item.data, [field]: value } } : item
      )
    );
  };

  const toggleBulkExpand = (id: number) => {
    setBulkItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, expanded: !item.expanded } : item
      )
    );
  };

  const saveBulkItem = async (id: number) => {
    const item = bulkItems.find((b) => b.id === id);
    if (!item) return;
    if (!item.data.storeName || item.data.amount <= 0) {
      toast({ title: "입력 확인", description: "가게 이름과 금액을 입력해주세요.", variant: "destructive" });
      return;
    }
    setBulkItems((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "saving" as const } : b))
    );
    try {
      const { month, year } = getCurrentMonth();
      await apiRequest("POST", "/api/expenses", {
        ...item.data,
        receiptImage: item.image,
        month,
        year,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget-period"] });
      setBulkItems((prev) => {
        const updated = prev.map((b) =>
          b.id === id ? { ...b, status: "saved" as const, expanded: false } : b
        );
        const remaining = updated.filter((b) => b.status !== "saved");
        if (remaining.length > 0 && !remaining[0].expanded) {
          return updated.map((b) =>
            b.id === remaining[0].id ? { ...b, expanded: true } : b
          );
        }
        return updated;
      });
      toast({ title: "저장 완료" });
    } catch {
      setBulkItems((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "editing" as const } : b))
      );
      toast({ title: "저장 실패", description: "다시 시도해주세요.", variant: "destructive" });
    }
  };

  const removeBulkItem = (id: number) => {
    setBulkItems((prev) => prev.filter((b) => b.id !== id));
  };

  const bulkSavedCount = bulkItems.filter((b) => b.status === "saved").length;
  const bulkAllDone = bulkItems.length > 0 && bulkSavedCount === bulkItems.length;

  if (pcBulkMode) {
    return (
      <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { setPcBulkMode(false); setBulkItems([]); setBulkPreviewImage(null); }}
            data-testid="button-bulk-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold" data-testid="text-bulk-title">PC 일괄 등록</h1>
            {bulkItems.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {bulkSavedCount}/{bulkItems.length} 저장 완료
              </p>
            )}
          </div>
          {!bulkAllDone && (
            <Button
              variant="secondary"
              onClick={() => pcFileInputRef.current?.click()}
              data-testid="button-bulk-add-more"
            >
              <FolderOpen className="w-4 h-4 mr-1.5" />
              파일 추가
            </Button>
          )}
        </div>

        <input
          ref={pcFileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePcBulkSelect}
          data-testid="input-pc-bulk"
        />

        {bulkItems.length === 0 && (
          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => pcFileInputRef.current?.click()}
          >
            <CardContent className="p-12 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <FolderOpen className="w-9 h-9 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold">폴더에서 영수증 사진 선택</p>
                <p className="text-sm text-muted-foreground">
                  여러 파일을 한 번에 선택할 수 있습니다
                </p>
                <p className="text-xs text-muted-foreground">
                  Ctrl+A로 전체 선택 가능
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {bulkPreviewImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setBulkPreviewImage(null)}
          >
            <div className="relative max-w-3xl max-h-[90vh]">
              <img
                src={bulkPreviewImage}
                alt="영수증 미리보기"
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
                data-testid="img-bulk-preview"
              />
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={() => setBulkPreviewImage(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {bulkItems.length > 0 && (
          <div className="space-y-3">
            {bulkItems.map((item, idx) => (
              <Card
                key={item.id}
                className={item.status === "saved" ? "opacity-60" : ""}
                data-testid={`bulk-item-${idx}`}
              >
                <CardContent className="p-0">
                  <button
                    className="w-full p-3 flex items-center gap-3 text-left"
                    onClick={() => item.status !== "saved" && toggleBulkExpand(item.id)}
                    data-testid={`bulk-toggle-${idx}`}
                  >
                    <img
                      src={item.image}
                      alt={item.fileName}
                      className="w-14 h-14 object-cover rounded-md bg-muted flex-shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBulkPreviewImage(item.image);
                      }}
                      data-testid={`bulk-thumb-${idx}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.fileName}</p>
                      {item.data.storeName ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.data.storeName} &middot; {item.data.amount > 0 ? formatCurrency(item.data.amount) : "금액 미입력"}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">정보 미입력</p>
                      )}
                    </div>
                    {item.status === "saved" ? (
                      <div className="flex items-center gap-1 text-primary">
                        <Check className="w-4 h-4" />
                        <span className="text-xs font-medium">완료</span>
                      </div>
                    ) : item.status === "saving" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${item.expanded ? "rotate-90" : ""}`} />
                    )}
                  </button>

                  {item.expanded && item.status === "editing" && (
                    <div className="px-3 pb-3 space-y-3 border-t">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                        <div className="sm:col-span-2 flex gap-3">
                          <img
                            src={item.image}
                            alt={item.fileName}
                            className="w-32 h-40 object-contain rounded-md bg-muted flex-shrink-0 cursor-pointer"
                            onClick={() => setBulkPreviewImage(item.image)}
                          />
                          <div className="flex-1 space-y-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">가게 이름</Label>
                              <Input
                                value={item.data.storeName}
                                onChange={(e) => updateBulkItem(item.id, "storeName", e.target.value)}
                                placeholder="가게 이름 입력"
                                data-testid={`bulk-store-${idx}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">금액 (원)</Label>
                              <Input
                                type="number"
                                value={item.data.amount || ""}
                                onChange={(e) => updateBulkItem(item.id, "amount", parseInt(e.target.value) || 0)}
                                placeholder="금액 입력"
                                data-testid={`bulk-amount-${idx}`}
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">카테고리</Label>
                          <Select
                            value={item.data.category}
                            onValueChange={(v) => updateBulkItem(item.id, "category", v)}
                          >
                            <SelectTrigger data-testid={`bulk-category-${idx}`}>
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
                            value={item.data.date}
                            onChange={(e) => updateBulkItem(item.id, "date", e.target.value)}
                            data-testid={`bulk-date-${idx}`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">메모</Label>
                          <Input
                            value={item.data.memo}
                            onChange={(e) => updateBulkItem(item.id, "memo", e.target.value)}
                            placeholder="선택사항"
                            data-testid={`bulk-memo-${idx}`}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => removeBulkItem(item.id)}
                          data-testid={`bulk-remove-${idx}`}
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          제외
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => saveBulkItem(item.id)}
                          data-testid={`bulk-save-${idx}`}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          저장
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {bulkAllDone && (
              <Card>
                <CardContent className="p-6 flex flex-col items-center gap-3">
                  <Check className="w-12 h-12 text-primary" />
                  <p className="font-semibold">전체 저장 완료!</p>
                  <p className="text-sm text-muted-foreground">{bulkItems.length}건의 지출이 등록되었습니다</p>
                  <Button onClick={() => setLocation("/")} data-testid="button-bulk-done">
                    대시보드로 이동
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <h1 className="text-xl font-bold" data-testid="text-scan-title">
        영수증 등록
      </h1>

      {queue.length === 0 && !cropMode && (
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
                <p className="text-xs text-muted-foreground mt-0.5">여러 장을 선택할 수 있어요</p>
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

          <Card className="hover-elevate cursor-pointer" onClick={() => setPcBulkMode(true)}>
            <CardContent className="p-6 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Monitor className="w-7 h-7 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">PC 일괄 등록</p>
                <p className="text-xs text-muted-foreground mt-0.5">폴더의 영수증 사진을 한 번에 등록</p>
              </div>
            </CardContent>
          </Card>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraSelect}
            data-testid="input-camera"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGallerySelect}
            data-testid="input-gallery"
          />
        </>
      )}

      {cropMode && pendingCropImage && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Crop className="w-4 h-4" />
                영수증 영역 선택
              </h2>
              <p className="text-xs text-muted-foreground">드래그로 영수증 부분을 선택하세요</p>
            </div>
            <div
              ref={cropContainerRef}
              className="relative touch-none select-none"
              onMouseDown={handleTouchStart}
              onMouseMove={handleTouchMove}
              onMouseUp={handleTouchEnd}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <img
                src={pendingCropImage}
                alt="촬영된 사진"
                className="w-full rounded-md"
                draggable={false}
              />
              {cropStart && cropEnd && (
                <div
                  className="absolute border-2 border-primary bg-primary/10 rounded-sm pointer-events-none"
                  style={{
                    left: Math.min(cropStart.x, cropEnd.x) - (cropContainerRef.current?.getBoundingClientRect().left || 0),
                    top: Math.min(cropStart.y, cropEnd.y) - (cropContainerRef.current?.getBoundingClientRect().top || 0),
                    width: Math.abs(cropEnd.x - cropStart.x),
                    height: Math.abs(cropEnd.y - cropStart.y),
                  }}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={skipCrop} data-testid="button-skip-crop">
                전체 사진 사용
              </Button>
              <Button className="flex-1" onClick={applyCrop} data-testid="button-apply-crop">
                <Crop className="w-4 h-4 mr-1" />
                선택 영역 사용
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {queue.length > 0 && !cropMode && (
        <>
          {totalInQueue > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Button
                size="icon"
                variant="ghost"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                data-testid="button-prev-receipt"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2 overflow-x-auto flex-1 px-1">
                {queue.map((q, i) => (
                  <button
                    key={i}
                    className={`relative w-10 h-10 rounded-md overflow-hidden border-2 transition-colors flex-shrink-0 ${
                      i === currentIndex ? "border-primary" : "border-transparent opacity-60"
                    } ${q.status === "saved" ? "opacity-40" : ""}`}
                    onClick={() => setCurrentIndex(i)}
                    data-testid={`thumbnail-${i}`}
                  >
                    {q.image ? (
                      <img src={q.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ReceiptText className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    {q.status === "saved" && (
                      <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={currentIndex === totalInQueue - 1}
                onClick={() => setCurrentIndex((i) => Math.min(totalInQueue - 1, i + 1))}
                data-testid="button-next-receipt"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}

          {totalInQueue > 1 && (
            <p className="text-xs text-center text-muted-foreground" data-testid="text-queue-progress">
              {savedCount}/{totalInQueue} 완료 &middot; {currentIndex + 1}번째 보는 중
            </p>
          )}

          {current?.status === "analyzing" && (
            <Card>
              <CardContent className="p-6 flex flex-col items-center gap-4">
                {current.image && (
                  <img src={current.image} alt="영수증" className="w-full max-h-40 object-contain rounded-md bg-muted" />
                )}
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm font-medium">영수증을 분석하고 있어요...</p>
                  <p className="text-xs text-muted-foreground">AI가 가게명, 금액, 카테고리를 자동 인식합니다</p>
                </div>
              </CardContent>
            </Card>
          )}

          {current?.status === "failed" && (
            <Card>
              <CardContent className="p-6 flex flex-col items-center gap-4">
                {current.image && (
                  <img src={current.image} alt="영수증" className="w-full max-h-40 object-contain rounded-md bg-muted" />
                )}
                <p className="text-sm text-muted-foreground text-center">영수증을 인식하지 못했습니다</p>
                <div className="flex gap-2 w-full">
                  <Button variant="secondary" className="flex-1" onClick={resetState} data-testid="button-retry-cancel">
                    취소
                  </Button>
                  <Button className="flex-1" onClick={handleSwitchToManual} data-testid="button-manual-fallback">
                    직접 입력
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {current?.status === "saved" && (
            <Card>
              <CardContent className="p-6 flex flex-col items-center gap-3">
                <Check className="w-10 h-10 text-primary" />
                <p className="text-sm font-medium">저장 완료</p>
              </CardContent>
            </Card>
          )}

          {current && (current.status === "ready" || current.status === "pending") && current.result && (
            <>
              {current.image && (
                <Card>
                  <CardContent className="p-3">
                    <img
                      src={current.image}
                      alt="영수증"
                      className="w-full max-h-48 object-contain rounded-md bg-muted"
                      data-testid="img-receipt-preview"
                    />
                  </CardContent>
                </Card>
              )}

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

                  {editMode && current.editData ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">가게 이름</Label>
                        <Input
                          value={current.editData.storeName}
                          onChange={(e) => updateEditData("storeName", e.target.value)}
                          data-testid="input-store-name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">금액 (원)</Label>
                        <Input
                          type="number"
                          value={current.editData.amount || ""}
                          onChange={(e) => updateEditData("amount", parseInt(e.target.value) || 0)}
                          data-testid="input-amount"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">카테고리</Label>
                        <Select
                          value={current.editData.category}
                          onValueChange={(v) => updateEditData("category", v)}
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
                          value={current.editData.date}
                          onChange={(e) => updateEditData("date", e.target.value)}
                          data-testid="input-date"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">메모</Label>
                        <Input
                          value={current.editData.memo}
                          onChange={(e) => updateEditData("memo", e.target.value)}
                          placeholder="선택사항"
                          data-testid="input-memo"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <CategoryIcon category={current.result!.category} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{current.result!.storeName || "알 수 없음"}</p>
                          <p className="text-xs text-muted-foreground">{getCategoryLabel(current.result!.category)}</p>
                        </div>
                        <p className="text-lg font-bold">{formatCurrency(current.result!.amount)}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>날짜: {current.result!.date}</span>
                        {current.result!.memo && <span>메모: {current.result!.memo}</span>}
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
                      {totalInQueue > 1 ? `저장 (${currentIndex + 1}/${totalInQueue})` : "저장"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
