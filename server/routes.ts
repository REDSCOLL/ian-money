import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { getBudgetPeriod, getPreviousBudgetPeriod, daysLeftInPeriod } from "@shared/budget-period";
const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
}) : null;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const saveReceiptImage = async (base64Image: string, date: string, storeName: string, amount: number) => {
    try {
      if (!base64Image || !base64Image.includes("base64,")) {
        return base64Image;
      }

      // Ensure date is folder-friendly (replace dots with dashes)
      const safeDate = date.replace(/\./g, "-");
      const baseDir = path.resolve(process.cwd(), "attached_assets", "receipts");
      const dateDir = path.join(baseDir, safeDate);
      
      console.log(`[OCR-SAVE] Attempting to save to: ${dateDir}`);
      
      if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
      }

      const parts = base64Image.split("base64,");
      const base64Data = parts[1];
      
      // Clean store name for filename
      const safeStoreName = storeName.replace(/[\\/:*?"<>|]/g, "").trim() || "unknown";
      const fileName = `${safeStoreName}_${amount}_${Date.now()}.jpg`;
      const filePath = path.join(dateDir, fileName);
      
      fs.writeFileSync(filePath, base64Data, 'base64');
      console.log(`[OCR-SAVE] SUCCESS: Saved to ${filePath}`);
      
      // Return the public URL path
      return `/uploads/receipts/${safeDate}/${fileName}`;
    } catch (err) {
      console.error("[OCR-SAVE] ERROR:", err);
      return base64Image;
    }
  };

  // Settings
  app.get("/api/settings", async (_req, res) => {
    try {
      let s = await storage.getSettings();
      if (!s) {
        s = await storage.upsertSettings({ monthlyBudget: 0, payDay: 1 });
      }
      res.json(s);
    } catch (error) {
      console.error("Error getting settings:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const { monthlyBudget, payDay, carryOver, ollamaModel } = req.body;
      const s = await storage.upsertSettings({
        monthlyBudget: parseInt(monthlyBudget) || 0,
        payDay: parseInt(payDay) || 1,
        carryOver: carryOver === true || carryOver === "true",
        ollamaModel: ollamaModel || "llama3",
      });

      const period = getBudgetPeriod(s.payDay);
      await storage.createOrUpdateBudget(period.periodMonth, period.periodYear, s.monthlyBudget);

      res.json(s);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Budgets
  app.get("/api/budgets/:month/:year", async (req, res) => {
    try {
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      let budget = await storage.getBudget(month, year);
      if (!budget) {
        const s = await storage.getSettings();
        if (s && s.monthlyBudget > 0) {
          budget = await storage.createOrUpdateBudget(month, year, s.monthlyBudget);
        } else {
          return res.json({ monthlyAmount: 0, payDay: 1, month, year });
        }
      }
      res.json(budget);
    } catch (error) {
      console.error("Error getting budget:", error);
      res.status(500).json({ error: "Failed to get budget" });
    }
  });

  app.get("/api/expenses/range", async (req, res) => {
    try {
      const { from, to } = req.query;
      if (typeof from !== "string" || typeof to !== "string") {
        return res.status(400).json({ error: "from and to dates are required" });
      }
      const expenses = await storage.getExpensesByDateRange(from, to);
      res.json(expenses);
    } catch (error) {
      console.error("Error getting expenses by range:", error);
      res.status(500).json({ error: "Failed to get expenses" });
    }
  });

  // Expenses
  app.get("/api/expenses/:month/:year", async (req, res) => {
    try {
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      const exps = await storage.getExpenses(month, year);
      res.json(exps);
    } catch (error) {
      console.error("Error getting expenses:", error);
      res.status(500).json({ error: "Failed to get expenses" });
    }
  });

  const createExpenseSchema = z.object({
    storeName: z.string().min(1).default("알 수 없음"),
    amount: z.coerce.number().int().min(0),
    category: z.string().default("etc"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(new Date().toISOString().split("T")[0]),
    memo: z.string().nullable().optional(),
    receiptImage: z.string().nullable().optional(),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
  });

  app.post("/api/expenses", async (req, res) => {
    try {
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.issues });
      }
      const { storeName, amount, category, date, memo, receiptImage, month, year } = parsed.data;

      let budget = await storage.getBudget(month, year);
      if (!budget) {
        const s = await storage.getSettings();
        budget = await storage.createOrUpdateBudget(month, year, s?.monthlyBudget || 0);
      }

      let finalReceiptImage = receiptImage || null;
      if (finalReceiptImage && finalReceiptImage.startsWith("data:image")) {
        finalReceiptImage = await saveReceiptImage(finalReceiptImage, date, storeName, amount);
      }

      const expense = await storage.createExpense({
        budgetId: budget.id,
        storeName,
        amount,
        category,
        date,
        memo: memo || null,
        receiptImage: finalReceiptImage,
      });
      res.json(expense);
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExpense(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  app.get("/api/budget-period", async (req, res) => {
    try {
      const s = await storage.getSettings();
      const payDay = s?.payDay || 1;
      const monthlyBudget = s?.monthlyBudget || 0;
      const carryOver = s?.carryOver || false;

      const period = getBudgetPeriod(payDay);
      const expenses = await storage.getExpensesByDateRange(period.startDate, period.endDate);
      const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

      let carryOverAmount = 0;
      if (carryOver) {
        const prevPeriod = getPreviousBudgetPeriod(payDay, period);
        const prevExpenses = await storage.getExpensesByDateRange(prevPeriod.startDate, prevPeriod.endDate);
        const prevSpent = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
        carryOverAmount = Math.max(0, monthlyBudget - prevSpent);
      }

      const effectiveBudget = monthlyBudget + carryOverAmount;
      const remaining = effectiveBudget - totalSpent;
      const daysLeft = daysLeftInPeriod(period.endDate);
      const dailyBudget = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0;

      res.json({
        period,
        monthlyBudget,
        carryOver,
        carryOverAmount,
        effectiveBudget,
        totalSpent,
        remaining,
        daysLeft,
        dailyBudget,
        expenses,
      });
    } catch (error) {
      console.error("Error getting budget period:", error);
      res.status(500).json({ error: "Failed to get budget period" });
    }
  });

  app.get("/api/budget-period/navigate", async (req, res) => {
    try {
      const s = await storage.getSettings();
      const payDay = s?.payDay || 1;
      const monthlyBudget = s?.monthlyBudget || 0;
      const carryOver = s?.carryOver || false;

      const refMonth = parseInt(req.query.month as string);
      const refYear = parseInt(req.query.year as string);
      const refDay = parseInt(req.query.day as string) || payDay;

      if (isNaN(refMonth) || isNaN(refYear) || refMonth < 1 || refMonth > 12 || refYear < 2000 || refYear > 2100) {
        return res.status(400).json({ error: "Invalid month or year parameters" });
      }

      const refDate = new Date(refYear, refMonth - 1, refDay);
      const period = getBudgetPeriod(payDay, refDate);
      const expenses = await storage.getExpensesByDateRange(period.startDate, period.endDate);
      const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

      let carryOverAmount = 0;
      if (carryOver) {
        const prevPeriod = getPreviousBudgetPeriod(payDay, period);
        const prevExpenses = await storage.getExpensesByDateRange(prevPeriod.startDate, prevPeriod.endDate);
        const prevSpent = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
        carryOverAmount = Math.max(0, monthlyBudget - prevSpent);
      }

      const effectiveBudget = monthlyBudget + carryOverAmount;
      const remaining = effectiveBudget - totalSpent;
      const daysLeft = daysLeftInPeriod(period.endDate);
      const dailyBudget = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0;

      res.json({
        period,
        monthlyBudget,
        carryOver,
        carryOverAmount,
        effectiveBudget,
        totalSpent,
        remaining,
        daysLeft,
        dailyBudget,
        expenses,
      });
    } catch (error) {
      console.error("Error navigating budget period:", error);
      res.status(500).json({ error: "Failed to navigate budget period" });
    }
  });

  // Receipt Analysis
  app.post("/api/receipts/analyze", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const today = new Date().toISOString().split("T")[0];

      const systemPrompt = `You are an expert Korean receipt OCR analyzer. Your task is to extract structured data from receipt images with high accuracy.

IMPORTANT INSTRUCTIONS:
1. Look very carefully at ALL text in the image. Receipts can be blurry, tilted, wrinkled, or partially obscured.
2. The image might be a Korean receipt (영수증), credit card slip (카드전표), bank transfer confirmation, delivery receipt, or any proof of payment.
3. Read EVERY line of text systematically from top to bottom.

EXTRACTION RULES:
- storeName: The business/store name. Usually at the TOP of the receipt in large text. Look for 상호, 가맹점, or the first prominent text. Common patterns: "스타벅스", "CU", "GS25", "배달의민족", "쿠팡이츠", etc.
- amount: The TOTAL payment amount (합계, 총액, 결제금액, 총합계, 합계금액, 카드결제). This is usually near the BOTTOM. Extract as integer in KRW (no commas, no decimals). If multiple amounts shown, use the final total/payment amount.
- date: Transaction date (거래일시, 일시, 날짜). Format as YYYY-MM-DD. Look for patterns like 2025.01.15, 2025/01/15, 25.01.15, or 2025년 1월 15일.
- memo: Brief summary of main items purchased (2-3 key items max, under 20 chars). Look at item lines between store name and total.
- category: Classify based on store type AND items:
  * "food" - 식당, 레스토랑, 배달음식, 분식, 치킨, 피자, 한식/중식/일식/양식
  * "cafe" - 카페, 커피숍 (스타벅스, 투썸플레이스, 이디야, 메가커피, 빽다방, 할리스 etc.)
  * "transport" - 택시, 버스, 지하철, 주유소, 주차장, 톨게이트, 카카오T
  * "shopping" - 편의점(CU, GS25, 세븐일레븐), 마트(이마트, 홈플러스, 롯데마트), 백화점, 온라인쇼핑, 의류
  * "entertainment" - 영화관, 노래방, PC방, 게임, 놀이공원, 스포츠
  * "medical" - 병원, 약국, 의원, 치과, 한의원
  * "education" - 학원, 서점, 교재, 강의, 도서
  * "utilities" - 통신비, 전기, 수도, 가스, 관리비, 보험
  * "etc" - 위 카테고리에 해당하지 않는 경우

OUTPUT: Respond with ONLY valid JSON, no markdown, no explanation:
{"storeName":"가게이름","amount":금액,"category":"카테고리","date":"YYYY-MM-DD","memo":"메모"}

If you cannot read the receipt at all, respond: {"storeName":"알 수 없음","amount":0,"category":"etc","date":"${today}","memo":"인식 불가"}`;

      const analyzeWithModel = async (model: string) => {
        if (!openai) throw new Error("OpenAI API key not configured");
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: image, detail: "high" },
                },
                {
                  type: "text",
                  text: "이 영수증/결제 내역을 꼼꼼히 읽고 정보를 추출해주세요. 반드시 JSON만 응답하세요.",
                },
              ],
            },
          ],
          max_completion_tokens: 800,
        });
        return response.choices[0]?.message?.content || "{}";
      };

      const analyzeWithOllama = async (base64Image: string) => {
        const s = await storage.getSettings();
        // Use a vision model like llava or moondream
        const model = "llava"; 
        
        // Remove data:image/jpeg;base64, prefix if present
        const pureBase64 = base64Image.split(",")[1] || base64Image;

        const response = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          body: JSON.stringify({
            model,
            prompt: systemPrompt + "\n\n이 영수증 이미지를 분석해서 JSON으로만 응답해줘.",
            images: [pureBase64],
            stream: false,
            format: "json"
          }),
        });

        if (!response.ok) throw new Error("Ollama vision failed");
        const data = await response.json() as { response: string };
        return data.response;
      };

      let content: string;
      try {
        if (openai) {
          content = await analyzeWithModel("gpt-4o-mini");
        } else {
          content = await analyzeWithOllama(image);
        }
      } catch (primaryError) {
        console.warn("Primary model failed, trying Ollama fallback:", primaryError);
        try {
          content = await analyzeWithOllama(image);
        } catch (fallbackError) {
          console.warn("Fallback model also failed:", fallbackError);
          return res.json({
            storeName: "알 수 없음",
            amount: 0,
            category: "etc",
            date: today,
            memo: "인식 불가",
          });
        }
      }

      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        parsed = {
          storeName: "알 수 없음",
          amount: 0,
          category: "etc",
          date: today,
          memo: "인식 불가",
        };
      }

      const validCategories = ["food", "transport", "shopping", "entertainment", "medical", "education", "utilities", "cafe", "etc"];
      parsed.amount = parseInt(String(parsed.amount).replace(/[,원\s]/g, "")) || 0;
      if (!parsed.date || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        parsed.date = today;
      }
      if (!parsed.storeName || parsed.storeName.trim() === "") {
        parsed.storeName = "알 수 없음";
      }
      if (!validCategories.includes(parsed.category)) {
        parsed.category = "etc";
      }
      if (!parsed.memo) {
        parsed.memo = "";
      }

      res.json(parsed);
    } catch (error) {
      console.error("Error analyzing receipt:", error);
      const today = new Date().toISOString().split("T")[0];
      res.json({
        storeName: "알 수 없음",
        amount: 0,
        category: "etc",
        date: today,
        memo: "인식 불가",
      });
    }
  });

  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const { month, year } = req.body;
      const expenses = await storage.getExpenses(parseInt(month), parseInt(year));
      const s = await storage.getSettings();
      const model = s?.ollamaModel || "llama3";

      if (expenses.length === 0) {
        return res.json({ report: "분석할 지출 내역이 없습니다." });
      }

      const summary = expenses.map(e => `- ${e.date}: ${e.storeName} (${e.amount}원, ${e.category})`).join("\n");
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);

      const prompt = `당신은 전문 자산 관리자이자 금융 분석가입니다. 다음은 사용자의 한 달 지출 내역입니다.
총 지출: ${total}원
상세 내역:
${summary}

이 데이터를 바탕으로 전문적인 재무 분석 보고서를 작성해주세요. 다음 구조를 포함해야 합니다:
1. 소비 패턴 요약
2. 긍정적인 점 및 개선이 필요한 점
3. 구체적인 절약 팁 및 행동 지침
4. 종합 재무 건강도 평가 (100점 만점)

전문적이면서도 친절한 어조로 한국어로 작성해주세요.`;

      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Ollama connection failed");
      }

      const data = await response.json() as { response: string };
      res.json({ report: data.response });
    } catch (error) {
      console.error("AI Analysis error:", error);
      res.status(500).json({ error: "AI 분석 중 오류가 발생했습니다. Ollama가 실행 중인지 확인하세요." });
    }
  });

  app.post("/api/ai/parse-voice", async (req, res) => {
    try {
      const { text } = req.body;
      const s = await storage.getSettings();
      const model = s?.ollamaModel || "llama3";
      const today = new Date().toISOString().split("T")[0];

      const prompt = `사용자의 음성 입력에서 가계부 지출 정보를 추출해 주세요.
입력: "${text}"
오늘 날짜: ${today}

반드시 다음 JSON 형식으로만 응답하세요 (설명 없이 JSON만):
{"storeName":"가게명","amount":금액(숫자),"category":"food|transport|shopping|entertainment|medical|education|utilities|cafe|etc","date":"YYYY-MM-DD","memo":"간단한 메모"}

만약 정보를 추출할 수 없다면 기본값을 채워주세요.`;

      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json"
        }),
      });

      const data = await response.json() as { response: string };
      const parsed = JSON.parse(data.response);
      res.json(parsed);
    } catch (error) {
      console.error("AI Voice Parse error:", error);
      res.status(500).json({ error: "음성 분석 중 오류가 발생했습니다." });
    }
  });

  return httpServer;
}
