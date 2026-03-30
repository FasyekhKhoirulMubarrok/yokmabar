# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Buat non-root user untuk keamanan
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# ─── Stage 2: Build dependencies ──────────────────────────────────────────────
FROM base AS build-deps

# Copy package files dulu untuk cache layer npm install
COPY package*.json ./
COPY prisma ./prisma/

# Install semua dependencies (termasuk devDependencies untuk build)
RUN npm ci && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# ─── Stage 3: Build ───────────────────────────────────────────────────────────
FROM build-deps AS build

# Copy source code
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript
RUN npm run build

# ─── Stage 4: Production dependencies ─────────────────────────────────────────
FROM base AS deps

COPY package*.json ./
COPY prisma ./prisma/

# Install hanya production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Generate Prisma client untuk production
RUN npx prisma generate

# ─── Stage 5: Production ──────────────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production

# Copy production node_modules
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy compiled output
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Copy static assets (landing page images, dll)
COPY --chown=nodejs:nodejs public ./public

# Copy prisma schema (dibutuhkan untuk migrate saat startup)
COPY --from=deps --chown=nodejs:nodejs /app/prisma ./prisma

# Copy package.json (dibutuhkan Node.js untuk resolve module)
COPY --chown=nodejs:nodejs package.json ./

# Buat folder logs dengan permission yang benar
RUN mkdir -p logs && chown -R nodejs:nodejs logs

USER nodejs

EXPOSE 4000

# Health check menggunakan native Node.js fetch
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
