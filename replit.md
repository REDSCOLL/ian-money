# Monthly Budget Tracker (월간 가계부)

## Overview
A mobile-optimized budget management app with AI-powered receipt scanning. Users set monthly budgets and track expenses by photographing receipts, which are automatically analyzed and categorized.

## Tech Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Express.js + TypeScript
- Database: PostgreSQL with Drizzle ORM
- AI: OpenAI (via Replit AI Integrations) for receipt image analysis
- Routing: wouter
- State: TanStack React Query

## Project Structure
```
client/src/
  pages/           - Dashboard, Scan, History, Report, Settings
  components/      - CategoryIcon, BottomNav, UI components
  lib/             - utils (formatCurrency, getCategoryLabel, etc.)
server/
  index.ts         - Express server entry
  routes.ts        - API endpoints
  storage.ts       - Database operations (IStorage interface)
  db.ts            - Drizzle DB connection
  seed.ts          - Seed data
shared/
  schema.ts        - Drizzle schemas, types, CATEGORIES constant
```

## Key Features
1. Pay-day-based budget cycles (e.g., 23일~22일) with custom period calculation
2. Carry-over balance: option to merge remaining budget from previous period
3. Receipt photo capture → AI analysis (GPT vision)
4. Expense tracking with 9 categories
5. Daily/category expense views
6. Monthly report with spending analytics
7. Dark mode support
8. Mobile-optimized bottom navigation
9. Multi-photo gallery selection with queue processing
10. Receipt cropping tool (drag-to-select)
11. PC bulk registration - select multiple files, edit each with form, save individually with receipt image
12. Receipt image thumbnails in history, full preview in detail dialog

## Budget Period System
- Budget periods are based on pay day, not calendar months
- Period runs from payDay of one month to payDay-1 of next month
- shared/budget-period.ts contains getBudgetPeriod(), getPreviousBudgetPeriod(), daysLeftInPeriod()
- Dashboard uses /api/budget-period endpoint for current period data
- Carry-over calculates previous period's remaining balance and adds to current budget

## API Routes
- GET/PUT /api/settings - Budget settings (includes carryOver boolean)
- GET /api/budgets/:month/:year - Monthly budget (legacy)
- GET /api/expenses/:month/:year - Monthly expenses (legacy, calendar-based)
- GET /api/budget-period - Current budget period with expenses, carry-over, daily budget
- GET /api/budget-period/navigate?month=&year=&day= - Navigate to specific period
- POST /api/expenses - Create expense
- DELETE /api/expenses/:id - Delete expense
- POST /api/receipts/analyze - AI receipt analysis

## Database Tables
- settings: monthlyBudget, payDay, currency, carryOver
- budgets: monthlyAmount, payDay, month, year
- expenses: storeName, amount, category, date, memo, receiptImage

## Categories
food, transport, shopping, entertainment, medical, education, utilities, cafe, etc

## Design
- Color theme: Teal/green primary (168°)
- Font: Plus Jakarta Sans
- Mobile-first with bottom navigation
- Light/dark mode support
