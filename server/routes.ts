import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { z } from "zod";
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
      const { monthlyBudget, payDay } = req.body;
      const s = await storage.upsertSettings({
        monthlyBudget: parseInt(monthlyBudget) || 0,
        payDay: parseInt(payDay) || 1,
      });

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      await storage.createOrUpdateBudget(month, year, s.monthlyBudget);

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

      const expense = await storage.createExpense({
        budgetId: budget.id,
        storeName,
        amount,
        category,
        date,
        memo: memo || null,
        receiptImage: receiptImage || null,
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

      let content: string;
      try {
        content = await analyzeWithModel("gpt-5");
      } catch (primaryError) {
        console.warn("Primary model failed, trying fallback:", primaryError);
        try {
          content = await analyzeWithModel("gpt-5-mini");
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

  return httpServer;
}
