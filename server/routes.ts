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

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a receipt analyzer for a Korean expense tracking app. Analyze the receipt image and extract the following information in JSON format:
{
  "storeName": "store/restaurant name",
  "amount": total amount as integer (no decimals, in KRW),
  "category": one of ["food", "transport", "shopping", "entertainment", "medical", "education", "utilities", "cafe", "etc"],
  "date": "YYYY-MM-DD" format,
  "memo": "brief description of items purchased"
}

Rules:
- For the category, intelligently classify based on the store name and items
- If the store is a coffee shop or cafe, use "cafe"
- If it's a restaurant or food delivery, use "food"
- If it's a convenience store, use "shopping"
- If amount can't be determined, use 0
- If date can't be determined, use "${today}"
- Keep memo very brief (under 20 characters)
- Always respond with valid JSON only, no other text`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: image },
              },
              {
                type: "text",
                text: "이 영수증을 분석해주세요. JSON으로만 응답해주세요.",
              },
            ],
          },
        ],
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || "{}";
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
          memo: "",
        };
      }

      parsed.amount = parseInt(parsed.amount) || 0;
      if (!parsed.date || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        parsed.date = today;
      }

      res.json(parsed);
    } catch (error) {
      console.error("Error analyzing receipt:", error);
      res.status(500).json({ error: "Failed to analyze receipt" });
    }
  });

  return httpServer;
}
