 # AI Visibility Project -  Phrase Score Insight


A comprehensive AI-powered web application for analyzing domain visibility, keyword discovery, and competitive intelligence. This project helps businesses understand their online presence, discover relevant keywords, generate optimized phrases, and analyze competitor strategies using advanced AI models.

## 🚀 Features

### Core Functionality
- **Domain Analysis**: Submit and analyze websites for content extraction and context understanding
- **Keyword Discovery**: AI-powered keyword research with volume, difficulty, and CPC data
- **Phrase Generation**: Generate optimized phrases from discovered keywords
- **AI Query Analysis**: Test phrases against multiple AI models (GPT, Gemini, Claude)
- **Response Scoring**: Comprehensive scoring system for relevance, accuracy, and sentiment
- **Competitive Intelligence**: Analyze competitors and market positioning
- **Dashboard Analytics**: Visual insights and metrics for domain performance
- **User Authentication**: Secure user registration and login system
- **Version Control**: Track different versions of domain analyses over time

### Technical Features
- **Real-time Processing**: Live updates during analysis phases
- **Multi-Model AI Integration**: Support for OpenAI GPT, Google Gemini, and Anthropic Claude
- **Responsive Design**: Modern UI built with shadcn/ui and Tailwind CSS
- **Database Persistence**: PostgreSQL with Prisma ORM for data management
- **API-First Architecture**: RESTful backend with comprehensive endpoints
- **Onboarding Flow**: Guided setup process for new users

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **UI Library**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS for utility-first styling
- **State Management**: React Query for server state, Context API for auth
- **Routing**: React Router for navigation
- **Forms**: React Hook Form with Zod validation

### Backend (Node.js + Express)
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript for type safety
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **AI Integration**: OpenAI, Google Gemini, and Anthropic Claude APIs
- **Web Scraping**: Cheerio for content extraction
- **CORS**: Configured for secure cross-origin requests

### Database Schema
- **Users**: Authentication and user management
- **Domains**: Website information and analysis metadata
- **DomainVersions**: Version control for domain analyses
- **Keywords**: Discovered keywords with metrics
- **Phrases**: Generated phrases from keywords
- **AIQueryResults**: AI model responses and scoring
- **CrawlResults**: Web scraping results and content extraction
- **DashboardAnalyses**: Analytics and insights data
- **CompetitorAnalyses**: Competitive intelligence data
- **OnboardingProgress**: User onboarding state tracking

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+ and npm/pnpm
- PostgreSQL database
- API keys for:
  - OpenAI (GPT models)
  - Google Gemini
  - Anthropic Claude

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd phrase-score-insight
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   # or
   pnpm install
   ```

4. **Environment Configuration**

   Create `.env` files in both root and backend directories:

   **Root `.env`:**
   ```env
   VITE_API_BASE_URL=http://localhost:3002
   ```

   **Backend `.env`:**
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/ai_visibility_db"
   JWT_SECRET="your-jwt-secret-key"
   OPENAI_API_KEY="your-openai-api-key"
   GEMINI_API_KEY="your-gemini-api-key"
   ANTHROPIC_API_KEY="your-anthropic-api-key"
   NODE_ENV=development
   PORT=3002
   ```

5. **Database Setup**
   ```bash
   cd backend
   npx prisma generate
   npx prisma db push
   # or for production
   npx prisma migrate deploy
   ```

6. **Start Development Servers**

   **Backend:**
   ```bash
   cd backend
   npm run dev
   ```

   **Frontend:**
   ```bash
   # In a new terminal, from the root directory
   npm run dev
   ```

7. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3002
   - Health Check: http://localhost:3002/api/health

## 📖 Usage Guide

### Getting Started
1. **Register/Login**: Create an account or sign in to access the dashboard
2. **Submit Domain**: Enter a website URL to begin analysis
3. **Complete Onboarding**: Follow the 6-step guided process:
   - Domain Submission
   - Context Extraction
   - Keyword Discovery
   - Phrase Generation
   - AI Query Results
   - Response Scoring

### Dashboard Features
- **Overview**: View all analyzed domains with performance metrics
- **Domain Analysis**: Deep dive into specific domain insights
- **Competitor Analysis**: Compare against industry competitors
- **Keyword Management**: Review and manage discovered keywords
- **Phrase Optimization**: Analyze and score generated phrases

### API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

#### Domain Management
- `POST /api/domain` - Submit new domain
- `GET /api/domain/:id` - Get domain details
- `GET /api/domain` - List user domains

#### Analysis
- `POST /api/keywords/discover` - Discover keywords for domain
- `POST /api/phrases/generate` - Generate phrases from keywords
- `POST /api/ai-queries/analyze` - Analyze phrases with AI models
- `GET /api/dashboard/all` - Get all dashboard analyses

#### Competitor Analysis
- `POST /api/competitor/analyze` - Analyze competitors
- `GET /api/competitor/:domainId` - Get competitor analysis

## 🚀 Deployment

### Frontend Deployment (Vercel)
1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Backend Deployment (Render/Railway)
1. Connect your repository to your preferred platform
2. Set environment variables
3. Configure PostgreSQL database
4. Deploy the backend service

### Environment Variables for Production
```env
DATABASE_URL="your-production-database-url"
JWT_SECRET="your-production-jwt-secret"
OPENAI_API_KEY="your-openai-api-key"
GEMINI_API_KEY="your-gemini-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
NODE_ENV=production
PORT=3002
CORS_ORIGIN="https://your-frontend-domain.com"
```

## 🔧 Development

### Available Scripts

**Frontend:**
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

**Backend:**
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript
npm run start        # Start production server
npm run clean        # Clean build artifacts
```

### Database Management
```bash
npx prisma studio    # Open Prisma Studio for database management
npx prisma generate  # Generate Prisma client
npx prisma db push   # Push schema changes to database
npx prisma migrate dev # Create and apply migrations
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the API documentation at `/api/health` endpoint
- Review the database schema in `backend/prisma/schema.prisma`

## 🔮 Roadmap

- [ ] Advanced competitor analysis with market positioning
- [ ] SEO recommendations and optimization suggestions
- [ ] Content gap analysis
- [ ] Automated reporting and alerts
- [ ] Team collaboration features
- [ ] API rate limiting and usage analytics
- [ ] Mobile application
- [ ] Integration with Google Analytics and Search Console
- [ ] added dummy line dated 28-July-2025
