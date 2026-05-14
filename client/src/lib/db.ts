import Dexie, { type Table } from 'dexie';
import { type Account, type Budget, type Expense, type Settings } from '@shared/schema';

export class MyDatabase extends Dexie {
  accounts!: Table<Account>;
  budgets!: Table<Budget>;
  expenses!: Table<Expense>;
  settings!: Table<Settings>;

  constructor() {
    super('MonthlyBudgetDB');
    this.version(2).stores({
      accounts: '++id, name, type',
      budgets: '++id, accountId, month, year',
      expenses: '++id, accountId, budgetId, type, category, date',
      settings: '++id'
    });
  }
}

export const db = new MyDatabase();

