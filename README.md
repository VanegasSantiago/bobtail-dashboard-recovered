# Bobtail Collections

AI-powered payment collection campaign manager built with Next.js and HappyRobot.

## Overview

Bobtail Collections is a bulk calling campaign management system designed to automate payment collection calls. It integrates with [HappyRobot](https://happyrobot.ai) to trigger AI-powered voice calls and track outcomes.

### Key Features

- **Campaign Management** - Create and manage multiple collection campaigns
- **CSV Import** - Bulk import debtors and invoices from CSV files
- **Intelligent Grouping** - Automatically groups invoices by debtor for consolidated calls
- **Concurrent Call Control** - Process up to 25 concurrent calls with automatic throttling
- **Real-time Dashboard** - Monitor campaign progress, contact rates, and promise rates
- **Call History** - Complete audit trail of all call attempts and outcomes
- **Dark/Light Mode** - Full theme support

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **UI**: React 19 + Tailwind CSS v4 + shadcn/ui components
- **State**: TanStack Query + React hooks
- **Voice AI**: HappyRobot API integration

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- HappyRobot account with API access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/bobtail-collections.git
cd bobtail-collections
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Configure your `.env` file with:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/bobtail_collections"

# HappyRobot API
HAPPYROBOT_API_KEY="your-api-key"
HAPPYROBOT_ENDPOINT="https://platform.happyrobot.ai/api/v1/workflows/YOUR_WORKFLOW_ID/trigger"
HAPPYROBOT_ORG_ID="your-org-id"

# Public config (for UI links to HappyRobot runs)
NEXT_PUBLIC_HAPPYROBOT_ORG_SLUG="your-org-slug"
NEXT_PUBLIC_HAPPYROBOT_WORKFLOW_ID="your-workflow-id"
```

5. Initialize the database:
```bash
npm run db:push
```

6. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Main application pages
│   │   ├── page.tsx        # Dashboard
│   │   ├── campaigns/      # Campaign management
│   │   ├── debtors/        # Debtor browser
│   │   ├── history/        # Call history
│   │   └── active/         # Active calls monitor
│   └── api/                # API routes
│       ├── campaign/       # Campaign control (start/pause/status)
│       ├── campaigns/      # Campaign CRUD
│       ├── calls/          # Call data queries
│       ├── debtors/        # Debtor data queries
│       ├── upload/         # CSV upload handler
│       ├── stats/          # Dashboard statistics
│       └── health/         # Health check endpoint
├── components/
│   ├── layout/             # App shell, nav rail, active calls bar
│   ├── charts/             # Sankey diagram for call flow
│   └── ui/                 # shadcn/ui components
├── lib/
│   ├── prisma.ts           # Database client
│   ├── worker-manager.ts   # Background call processor
│   └── utils.ts            # Utility functions
└── prisma/
    └── schema.prisma       # Database schema
```

## CSV Format

Upload CSV files with the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| Debtor Name | Yes | Company/person name |
| Phone Number | Yes | Contact phone number |
| Amount | Yes | Invoice amount |
| Load Number | Yes | Invoice/load reference |
| Debtor MC | No | Motor Carrier number |
| Debtor DOT | No | DOT number |
| Debtor Email | No | Email address |
| Carrier Name | No | Associated carrier |
| Client MC | No | Client MC number |
| Client DOT | No | Client DOT number |
| Timezone | No | Debtor timezone |
| Email Only | No | TRUE to skip calling |

Rows are automatically grouped by Debtor Name, creating one debtor record with multiple invoices.

## Call Outcomes

The system tracks the following call outcomes:

| Outcome | Description |
|---------|-------------|
| `PAYMENT_PROMISED` | Debtor agreed to pay |
| `DECLINED` | Debtor refused to pay |
| `DISPUTED` | Debtor disputes the debt |
| `CALLBACK_REQUESTED` | Debtor requested callback |
| `NO_ANSWER` | No answer after ringing |
| `VOICEMAIL` | Left voicemail |
| `WRONG_NUMBER` | Invalid/wrong number |

## Deployment

### Railway

This project is configured for Railway deployment:

1. Create a new project on Railway
2. Add a PostgreSQL database service
3. Connect your GitHub repository
4. Add environment variables in Railway settings
5. Deploy - Railway will automatically:
   - Run `prisma migrate deploy`
   - Build the Next.js app
   - Start the server with health checks

The `railway.json` configuration handles:
- Automatic database migrations
- Health check endpoint (`/api/health`)
- Restart policy on failure

### Environment Variables for Production

```env
DATABASE_URL=           # Provided by Railway PostgreSQL
HAPPYROBOT_API_KEY=     # Your HappyRobot API key
HAPPYROBOT_ENDPOINT=    # Workflow trigger endpoint
HAPPYROBOT_ORG_ID=      # Organization ID
NEXT_PUBLIC_HAPPYROBOT_ORG_SLUG=    # For UI links
NEXT_PUBLIC_HAPPYROBOT_WORKFLOW_ID= # For UI links
MAX_CONCURRENT_CALLS=25 # Optional, default 25
```

## API Reference

### Campaign Control

- `POST /api/campaign/start` - Start/resume the active campaign
- `POST /api/campaign/pause` - Pause the active campaign
- `GET /api/campaign/status` - Get current campaign status
- `GET /api/campaign/worker` - Get worker status

### Data Endpoints

- `GET /api/campaigns` - List all campaigns
- `GET /api/campaigns/[id]` - Get campaign details
- `GET /api/debtors` - List debtors with pagination
- `GET /api/calls` - List calls with filtering
- `GET /api/stats/dashboard` - Dashboard statistics

### Health Check

- `GET /api/health` - System health status (database, worker)

## Architecture Notes

### Polling Strategy

The dashboard uses **activity-based polling** - it only polls the server when there's an active campaign running:

- **When idle**: No polling. Data is fetched once on page load.
- **When campaign is active**: Polls every 2-10 seconds depending on the view.

This design is intentional because:
1. Users visit the dashboard occasionally to start campaigns and check results
2. No need for real-time updates when nothing is happening
3. Reduces server load and database queries significantly

If you need fresh data when idle, simply refresh the page.

### Worker Manager

The background worker (`worker-manager.ts`) processes calls with:
- **Circuit breaker**: Stops after 5 consecutive API errors to prevent runaway failures
- **Exponential backoff**: Increases delay between retries on errors
- **Concurrency control**: Respects `MAX_CONCURRENT_CALLS` limit (default 25)
- **Graceful shutdown**: Completes in-flight calls before stopping

### Error Handling

- API errors are logged but don't crash the server
- Failed calls are marked as `FAILED` with error details stored
- Health check endpoint (`/api/health`) reports worker and database status

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm run start

# Lint code
npm run lint

# Open Prisma Studio
npm run db:studio
```

## License

Proprietary - Bobtail/HappyRobot
