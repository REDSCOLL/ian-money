import { db } from "./db";
import { 
  type Account, type Budget, type Expense, type Settings, 
  type InsertAccount, type InsertBudget, type InsertExpense, type InsertSettings 
} from "@shared/schema";
import { getBudgetPeriod, getPreviousBudgetPeriod, daysLeftInPeriod } from "@shared/budget-period";

export const clientStorage = {
  // Accounts
  async getAccounts(): Promise<Account[]> {
    const accs = await db.accounts.toArray();
    if (accs.length === 0) {
      // Create default salary account
      const defaultAcc: InsertAccount = { name: "급여/생활비", type: "budget", initialBalance: 0, color: "#0d9488" };
      const id = await db.accounts.add(defaultAcc as Account);
      const acc = { ...defaultAcc, id };
      await this.upsertSettings({ currentAccountId: id });
      return [acc];
    }
    return accs;
  },

  async createAccount(insert: InsertAccount): Promise<Account> {
    const id = await db.accounts.add(insert as Account);
    return { ...insert, id };
  },

  async getCurrentAccount(): Promise<Account | undefined> {
    const s = await this.getSettings();
    if (!s?.currentAccountId) {
      const accs = await this.getAccounts();
      return accs[0];
    }
    return await db.accounts.get(s.currentAccountId);
  },

  // Settings
  async getSettings(): Promise<Settings | undefined> {
    const s = await db.settings.toCollection().first();
    if (!s) {
      return await this.upsertSettings({ monthlyBudget: 0, payDay: 1, currency: "KRW", carryOver: false, ollamaModel: "llama3" });
    }
    return s;
  },

  async upsertSettings(insert: Partial<InsertSettings>): Promise<Settings> {
    const existing = await db.settings.toCollection().first();
    if (existing) {
      const updated = { ...existing, ...insert };
      await db.settings.update(existing.id, updated);
      
      if (insert.monthlyBudget !== undefined || insert.payDay !== undefined) {
        const acc = await this.getCurrentAccount();
        if (acc && acc.type === "budget") {
          const period = getBudgetPeriod(updated.payDay);
          await this.createOrUpdateBudget(period.periodMonth, period.periodYear, updated.monthlyBudget);
        }
      }
      return updated;
    } else {
      const newSettings: Settings = {
        id: 1,
        currentAccountId: insert.currentAccountId || null,
        monthlyBudget: insert.monthlyBudget || 0,
        payDay: insert.payDay || 1,
        currency: insert.currency || "KRW",
        carryOver: insert.carryOver || false,
        ollamaModel: insert.ollamaModel || "llama3"
      };
      await db.settings.add(newSettings);
      return newSettings;
    }
  },

  // Budgets
  async getBudget(month: number, year: number): Promise<Budget | undefined> {
    const acc = await this.getCurrentAccount();
    if (!acc) return undefined;
    return await db.budgets.where({ accountId: acc.id, month, year }).first();
  },

  async createOrUpdateBudget(month: number, year: number, amount: number): Promise<Budget> {
    const acc = await this.getCurrentAccount();
    if (!acc) throw new Error("No current account");
    const existing = await db.budgets.where({ accountId: acc.id, month, year }).first();
    if (existing) {
      await db.budgets.update(existing.id, { monthlyAmount: amount });
      return { ...existing, monthlyAmount: amount };
    } else {
      const budget: Budget = { id: 0 as any, accountId: acc.id, monthlyAmount: amount, month, year, payDay: 1 };
      const id = await db.budgets.add(budget);
      return { ...budget, id };
    }
  },

  // Expenses/Transactions
  async getExpenses(month: number, year: number): Promise<Expense[]> {
    const acc = await this.getCurrentAccount();
    if (!acc) return [];
    
    if (acc.type === "budget") {
      const budget = await this.getBudget(month, year);
      if (!budget) return [];
      return await db.expenses.where({ accountId: acc.id, budgetId: budget.id }).toArray();
    } else {
      // Ledger type: filter by date month/year
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = `${year}-${String(month).padStart(2, '0')}-31`;
      return await db.expenses
        .where('accountId').equals(acc.id)
        .and(item => item.date >= start && item.date <= end)
        .toArray();
    }
  },

  async getExpensesByDateRange(from: string, to: string): Promise<Expense[]> {
    const acc = await this.getCurrentAccount();
    if (!acc) return [];
    return await db.expenses
      .where('accountId').equals(acc.id)
      .and(item => item.date >= from && item.date <= to)
      .toArray();
  },

  async createExpense(insert: InsertExpense & { month?: number, year?: number }): Promise<Expense> {
    const acc = await this.getCurrentAccount();
    if (!acc) throw new Error("No current account");

    let budgetId: number | null = null;
    if (acc.type === "budget") {
      const month = insert.month || new Date().getMonth() + 1;
      const year = insert.year || new Date().getFullYear();
      let budget = await this.getBudget(month, year);
      if (!budget) {
        const s = await this.getSettings();
        budget = await this.createOrUpdateBudget(month, year, s?.monthlyBudget || 0);
      }
      budgetId = budget.id;
    }

    const { month, year, ...expenseData } = insert;
    const newExpense = {
      ...expenseData,
      accountId: acc.id,
      budgetId: budgetId,
      type: insert.type || (insert.category === "income" ? "income" : "expense")
    } as Expense;

    const id = await db.expenses.add(newExpense);
    return { ...newExpense, id };
  },

  async deleteExpense(id: number): Promise<void> {
    await db.expenses.delete(id);
  },

  // Budget Period (Complex Logic)
  async getBudgetPeriodData(refDate?: Date) {
    const acc = await this.getCurrentAccount();
    if (!acc) return null;

    const s = await this.getSettings();
    const payDay = s?.payDay || 1;
    const monthlyBudget = s?.monthlyBudget || 0;
    const carryOver = s?.carryOver || false;

    const period = getBudgetPeriod(payDay, refDate);
    const expenses = await this.getExpensesByDateRange(period.startDate, period.endDate);
    
    if (acc.type === "budget") {
      const totalSpent = expenses.filter(e => e.type === "expense").reduce((sum, e) => sum + e.amount, 0);
      let carryOverAmount = 0;
      if (carryOver) {
        const prevPeriod = getPreviousBudgetPeriod(payDay, period);
        const prevExpenses = await this.getExpensesByDateRange(prevPeriod.startDate, prevPeriod.endDate);
        const prevSpent = prevExpenses.filter(e => e.type === "expense").reduce((sum, e) => sum + e.amount, 0);
        carryOverAmount = Math.max(0, monthlyBudget - prevSpent);
      }
      const effectiveBudget = monthlyBudget + carryOverAmount;
      const remaining = effectiveBudget - totalSpent;
      const daysLeft = daysLeftInPeriod(period.endDate);
      const dailyBudget = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0;

      return {
        accountType: "budget",
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
      };
    } else {
      // Ledger logic
      const allTransactions = await db.expenses.where({ accountId: acc.id }).toArray();
      const totalIncome = allTransactions.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
      const totalExpense = allTransactions.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);
      const balance = acc.initialBalance + totalIncome - totalExpense;
      
      const periodIncome = expenses.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
      const periodExpense = expenses.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);

      return {
        accountType: "ledger",
        accountName: acc.name,
        balance,
        totalIncome: periodIncome,
        totalSpent: periodExpense,
        expenses,
        period,
      };
    }
  }
};

