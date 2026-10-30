# Smart Inventory & Operations System

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.4.3-black?style=flat&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19.3.0-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/Prisma-6.19.3-2D3748?style=flat&logo=prisma&logoColor=white" alt="Prisma 6" />
  <img src="https://img.shields.io/badge/Database-SQLite%20%7C%20PostgreSQL-003B57?style=flat&logo=sqlite&logoColor=white" alt="Database" />
  <img src="https://img.shields.io/badge/Testing-Vitest%20v5-6E9F18?style=flat&logo=vitest&logoColor=white" alt="Vitest 5" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="License: MIT" />
</p>

<p align="center">
  <img src="./screenshots/banner.png" alt="Smart Inventory & Operations System Banner" width="100%" />
</p>

Smart Inventory & Operations System is a multi-tenant enterprise ERP platform engineered for manufacturing operations, multi-warehouse logistics, and inventory management. Designed for fabrication workshops, assembly facilities, and light industrial plants, it eliminates the systemic vulnerabilities of conventional CRUD inventory tools: negative stock anomalies, unrecorded scrap and cutting waste, desynchronized multi-bin warehouses, and financial valuation discrepancies.

At its core, the platform operates on an ACID Inventory Engine that enforces atomic database transactions, process-level serialization mutexes, and zero negative stock tolerance. Every inventory transaction immediately posts to an immutable movement ledger, dynamically calculates moving weighted average costs (MAC) with 34-digit high-precision decimal arithmetic, tracks raw material reservations across multi-stage production orders, manages industrial scrap lifecycles, and reconciles physical stock opname variances through balanced journal entries.

---

## Features

- **ACID Inventory Engine & Atomic Transactions**: All inventory balance adjustments occur through serialized, atomic database transactions protected by execution mutexes. Enforces strict zero negative stock tolerance at posting time, validates real-time available stock against active production reservations, supports idempotency keys to eliminate duplicate requests, and provides compensating reversal transactions for non-destructive auditing.
- **Multi-Warehouse & Precision Storage Locations**: Supports multi-warehouse hierarchies with designated functional bin zones (`RAW`, `CUTTING`, `FINISHED`, `SCRAP`, and `GENERAL`). Tracks segregated On-Hand, Reserved, and Available stock balances for every SKU per storage bin.
- **Moving Weighted Average Cost (MAC) Valuation**: Automatically recalculates moving average unit costs upon every receipt or opening stock posting using arbitrary-precision decimal arithmetic (`decimal.js`), preventing financial rounding drift and valuation distortions.
- **Procurement & Goods Receipt Workflow**: Manages end-to-end purchase orders across six lifecycle stages (`DRAFT`, `SUBMITTED`, `APPROVED`, `PARTIALLY_RECEIVED`, `RECEIVED`, and `CANCELLED`). Goods receipt automatically generates inventory receipt transactions and updates valuation baselines.
- **Production Management & Work Orders**: Defines multi-level Bill of Materials (BOM) recipes with expected scrap allowance percentages. Confirming a work order automatically places raw materials on reserve, while execution tracks actual versus planned material consumption with real-time variance calculation and finished goods output logging.
- **Closed-Loop Scrap & By-Product Recovery**: Captures industrial off-cuts, turnings, and shavings directly from work orders or manual scrap intake into dedicated scrap bins without double-counting consumed raw materials. Implements a complete classification workflow (`Reusable`, `Saleable`, `Disposal`, and `Pending Assessment`) with estimated retained valuations and certified disposal documentation.
- **Physical Stock Opname & One-Click Reconciliation**: Freezes baseline system stock snapshots when initiating a count cycle, collects field counts, identifies physical variances, and reconciles discrepancies into balanced system adjustments with a single click.
- **Multi-Tenant Architecture & Role-Based Access Control**: Strict tenant data isolation with a granular RBAC matrix governing five distinct roles: `Owner`, `Operations Manager`, `Warehouse Staff`, `Production Staff`, and `Viewer / Auditor`.
- **Immutable Movement Ledger & Enterprise Audit Trail**: Maintains an append-only ledger of every stock movement with signed quantities, running balances, and monetary values. All authentication events, master data mutations, approvals, and reversals are recorded in an audit trail.
- **Bulk CSV Data Import & Operational Analytics**: Built-in CSV import pipeline with structural validation and staging for master item catalogs and opening balances. Real-time dashboards provide live inventory valuation, low-stock alerts, procurement status, production output metrics, and CSV report export.

---

## Preview & Demo

### Operational Dashboard & Real-Time Stock Positions

<p align="center">
  <img src="./screenshots/Smart%20Inventory%20%26%20Operations%20System%201.png" alt="Operational Dashboard, Stock Position per Item, and Stock Position per Location" width="100%" />
</p>

*Executive dashboard displaying total inventory valuation, active SKU counts, low stock alerts, open purchase orders, active work orders, 30-day material consumption, and segmented stock positions per item and warehouse bin.*

### Master Data Governance & Storage Bin Mapping

<p align="center">
  <img src="./screenshots/Smart%20Inventory%20%26%20Operations%20System%202.png" alt="Master Item Catalog, Multi-Warehouse Storage Locations, Categories, and Unit of Measure Conversions" width="100%" />
</p>

*Master data catalog managing item classifications (Raw Materials, Consumables, WIP, Finished Goods, Scrap), multi-warehouse storage location zoning, item categories, and exact unit of measure (UoM) conversion factors.*

### Business Partners & Inventory Transaction Engine

<p align="center">
  <img src="./screenshots/Smart%20Inventory%20%26%20Operations%20System%203.png" alt="Supplier Directory, Customer Directory, Inventory Transactions List, and Document Detail" width="100%" />
</p>

*Supplier and customer partner registries alongside multi-type inventory transaction logs (Receipt, Issue, Internal Transfer, Adjustment, Reversal) with detailed document lines and valuation breakdowns.*

### Immutable Movement Ledger, Purchase Orders & Production Work Orders

<p align="center">
  <img src="./screenshots/Smart%20Inventory%20%26%20Operations%20System%204.png" alt="Movement Ledger History, Purchase Orders Lifecycle, Goods Receipt Detail, and Work Order Schedule" width="100%" />
</p>

*Permanent audit ledger tracking signed transaction quantities, running balances, purchase order lifecycles with goods receipt history, and manufacturing work order assignments.*

### Production Execution, Bill of Materials (BOM) & Scrap Recovery

<p align="center">
  <img src="./screenshots/Smart%20Inventory%20%26%20Operations%20System%205.png" alt="Work Order Material Consumption Variance, Multi-Level Bill of Materials, Scrap Management, and Stock Opname Planning" width="100%" />
</p>

*Production execution tracking planned versus actual material consumption variances, Bill of Materials (BOM) multi-component recipes with scrap allowances, and closed-loop scrap classification workflows.*

### Physical Stock Opname Reconciliation, Analytics & Audit Trail

<p align="center">
  <img src="./screenshots/Smart%20Inventory%20%26%20Operations%20System%206.png" alt="Stock Opname Variance Reconciliation, Moving Average Valuation Report, Bulk CSV Importer, and System Audit Trail" width="100%" />
</p>

*Stock opname reconciliation screen with automatic adjustment posting, executive inventory valuation reports, bulk CSV data importer, and enterprise audit trails.*

### Demo Credentials

The seeded demo environment provides pre-configured role-specific accounts for testing:

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Owner** | `demo@demo.com` | `demo1234` | Full organizational access, team management, billing, and settings |
| **Operations Manager** | `manager@demo.com` | `demo1234` | Master data, inventory transactions, purchase orders, production, reports |
| **Warehouse Staff** | `gudang@demo.com` | `demo1234` | Stock transactions, purchase order receipts, stock opname counts |
| **Production Staff** | `produksi@demo.com` | `demo1234` | Work orders, BOM recipes, material consumption, output, and scrap intake |
| **Viewer / Auditor** | `auditor@demo.com` | `demo1234` | Read-only access to dashboards, ledger, reports, and audit trails |

---

## Tech Stack

### Core Architecture & Frontend
- **Framework**: [Next.js 16.4.3](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **Library**: [React 19.3.0](https://react.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with Turbopack integration
- **Class Utilities**: `clsx`

### Backend, Database & Engine
- **ORM**: [Prisma ORM 6.19.3](https://www.prisma.io/)
- **Database**: SQLite (default for development/testing) / PostgreSQL (production target)
- **High-Precision Arithmetic**: [Decimal.js 10.6.0](https://mikemcl.github.io/decimal.js/) (34-digit arbitrary-precision calculation)
- **Authentication**: Stateless session cookies using [jose 6.2.13](https://github.com/panva/jose) (HS256 JWT)
- **Password Hashing**: `bcryptjs 3.0.3`
- **Schema Validation**: [Zod 4.6.7](https://zod.dev/)

### Quality & Tooling
- **Testing**: [Vitest 5.0.5](https://vitest.dev/)
- **Linting**: ESLint 9 with `eslint-config-next`
- **Execution**: `tsx` (TypeScript execute for seed scripts)

---

## Prerequisites

Ensure the following tools are installed on your workstation:

- **Node.js**: `v20.x` or higher (tested on Node.js `v26.x`)
- **Package Manager**: `npm` `v10.x` or higher
- **Database Engine**: SQLite3 (bundled automatically) or PostgreSQL (optional for production)

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/weztcy/Smart-Inventory-Operations-System.git
   cd Smart-Inventory-Operations-System
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Run database migrations**:
   ```bash
   npm run db:migrate
   ```

5. **Seed demo industrial data**:
   ```bash
   npm run db:seed
   ```

---

## Environment Variables

The application relies on the following environment variables configured in `.env`:

| Variable | Required | Description | Synthetic Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | Connection URL for SQLite (development) or PostgreSQL (production) | `file:./dev.db` |
| `AUTH_SECRET` | **Yes** | 32+ character random secret used by `jose` to sign session JWTs | `a9f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4...` |
| `NODE_ENV` | No | Current runtime environment (`development` or `production`) | `development` |

Generate a cryptographically secure `AUTH_SECRET` using Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Usage / Running the Project

1. **Start the local development server**:
   ```bash
   npm run dev
   ```

2. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

3. **Authenticate**:
   Log in using one of the pre-configured accounts (e.g., `demo@demo.com` with password `demo1234`) or explore the interactive demo flow directly from the landing page.

4. **Example: Querying the Current Authenticated Session via API**:
   ```bash
   curl -X GET http://localhost:3000/api/auth/me \
     -H "Cookie: sio_session=<YOUR_SESSION_TOKEN>"
   ```

---

## Available Scripts / Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server on `http://localhost:3000` |
| `npm run build` | Compiles the production build with TypeScript check and bundle optimization |
| `npm run start` | Launches the compiled production application |
| `npm run lint` | Runs ESLint 9 static code analysis across source files |
| `npm run db:migrate` | Runs pending Prisma migrations in development (`prisma migrate dev`) |
| `npm run db:seed` | Populates the database with industrial demonstration data (`tsx prisma/seed.ts`) |
| `npm run db:reset` | Wipes the database and executes migrations from scratch (`prisma migrate reset --force`) |
| `npm run test` | Executes unit and integration test suites using Vitest (`vitest run`) |
| `npm run test:watch` | Runs Vitest in interactive watch mode for active development |

---

## API Reference / Documentation

All API routes are served under `/api` and require valid session authentication with appropriate role permissions unless otherwise noted.

### Authentication & Session

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user and create an organization tenant | Public |
| `POST` | `/api/auth/login` | Authenticate user credentials and establish session cookie | Public |
| `POST` | `/api/auth/logout` | Clear the session cookie and invalidate login | Authenticated |
| `GET` | `/api/auth/me` | Fetch active user profile, tenant details, and role permissions | Authenticated |
| `POST` | `/api/auth/switch-org` | Switch active organization tenant for multi-org users | Authenticated |

### Master Data Management

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/items` | List inventory items with filters (type, category, active status) | `item.view` |
| `POST` | `/api/items` | Create a new master inventory item SKU | `item.manage` |
| `GET` | `/api/items/:id` | Retrieve item details, base UoM, and location balance breakdown | `item.view` |
| `GET` | `/api/warehouses` | List warehouses and mapped storage locations | `item.view` |
| `POST` | `/api/warehouses/locations` | Create a designated storage bin location | `master.manage` |
| `GET` | `/api/categories` | List product categories | `item.view` |
| `GET` | `/api/uoms` | List units of measure and registered conversion ratios | `item.view` |
| `GET` | `/api/suppliers` | List registered suppliers | `po.view` |
| `GET` | `/api/customers` | List registered customers | `tx.view` |

### Inventory Transactions & Ledger

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/transactions` | Query inventory transaction documents with status and date filters | `tx.view` |
| `POST` | `/api/transactions` | Draft an inventory transaction (`RECEIPT`, `ISSUE`, `TRANSFER`, etc.) | `tx.create` |
| `POST` | `/api/transactions/:id/post` | Atomically post transaction, validate stock, update MAC, write ledger | `tx.post` |
| `POST` | `/api/transactions/:id/cancel` | Cancel an unposted draft transaction | `tx.create` |
| `POST` | `/api/transactions/:id/reverse` | Create and post a compensating reversal transaction | `tx.reverse` |

### Procurement (Purchase Orders)

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/purchase-orders` | List purchase orders with status filtering | `po.view` |
| `POST` | `/api/purchase-orders` | Create a draft purchase order with line items and pricing | `po.manage` |
| `POST` | `/api/purchase-orders/:id/submit` | Submit draft purchase order for review | `po.manage` |
| `POST` | `/api/purchase-orders/:id/approve` | Approve submitted purchase order | `po.manage` |
| `POST` | `/api/purchase-orders/:id/receive` | Process full or partial receipt, creating receipt transactions | `tx.post` |
| `POST` | `/api/purchase-orders/:id/cancel` | Cancel an unfulfilled purchase order | `po.manage` |

### Manufacturing & Production

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/boms` | List Bill of Materials specifications | `bom.view` |
| `POST` | `/api/boms` | Create a Bill of Materials recipe with component scrap allowances | `bom.manage` |
| `GET` | `/api/production-orders` | List manufacturing work orders | `production.view` |
| `POST` | `/api/production-orders` | Create a production order referencing a BOM recipe | `production.manage` |
| `POST` | `/api/production-orders/:id/confirm` | Confirm order and reserve required component stock | `production.manage` |
| `POST` | `/api/production-orders/:id/start` | Transition confirmed order to in-progress | `production.manage` |
| `POST` | `/api/production-orders/:id/consume` | Record actual raw material consumption against reservation | `production.manage` |
| `POST` | `/api/production-orders/:id/output` | Record finished goods production output into destination bin | `production.manage` |
| `POST` | `/api/production-orders/:id/complete` | Finalize work order and verify reservation release | `production.manage` |

### Scrap & Waste Management

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/scrap` | List scrap records and pending material assessments | `scrap.view` |
| `POST` | `/api/scrap` | Record newly generated scrap or off-cuts from operations | `scrap.manage` |
| `POST` | `/api/scrap/:id/classify` | Classify scrap as `REUSABLE`, `SALEABLE`, or `DISPOSAL` | `scrap.manage` |
| `POST` | `/api/scrap/dispose` | Execute certified disposal transaction removing scrap from inventory | `scrap.manage` |

### Stock Opname & Reconciliation

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stock-counts` | List stock counting events | `opname.manage` |
| `POST` | `/api/stock-counts` | Initiate a stock count and freeze baseline system balances | `opname.manage` |
| `POST` | `/api/stock-counts/:id/counts` | Save field counted physical quantities | `opname.manage` |
| `POST` | `/api/stock-counts/:id/reconcile` | Reconcile count variance by posting adjustment transactions | `opname.manage` |

---

## Testing

The project uses [Vitest](https://vitest.dev/) for unit and integration testing.

### Test Execution

Run the complete test suite:

```bash
npm run test
```

Run tests in interactive watch mode:

```bash
npm run test:watch
```

### Test Scope & Coverage

- **Unit Tests (`tests/unit/decimal.test.ts`)**: Validates arbitrary-precision calculations using `decimal.js`, including moving weighted average cost formulas, quantity conversions, string serializations, and zero-tolerance boundary conditions.
- **Integration Tests (`tests/integration/engine.test.ts`, `tests/integration/workflows.test.ts`)**: Verifies multi-tenant isolation, atomic transaction execution, negative stock prevention, reservation enforcement, partial receipt workflows, and reversal balancing using an isolated test database (`test.db`).

---

## Build & Deployment

### Production Build

Create an optimized production bundle:

```bash
npm run build
```

Run the compiled application:

```bash
npm run start
```

### Production Database Configuration

For production deployments, migrate the database from SQLite to PostgreSQL:

1. Update the datasource provider in [prisma/schema.prisma](./prisma/schema.prisma):
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Set the production database connection string in your `.env` file:
   ```env
   DATABASE_URL="postgresql://username:password@db-host:5432/smart_inventory?schema=public"
   ```

3. Deploy database schema migrations:
   ```bash
   npx prisma migrate deploy
   ```

---

## License

Please see the [LICENSE](./LICENSE) file for the terms and conditions governing the use, modification, and distribution of this project.

## Author & Contact

**Yohanes Dimas Pratama**

- GitHub: [github.com/weztcy](https://github.com/weztcy)
- Portfolio: [dimaspratama.vercel.app](https://dimaspratama.vercel.app)
- LinkedIn: [linkedin.com/in/yohanes-dimas](https://www.linkedin.com/in/yohanes-dimas)

