# -----------------------------------------------------------------------------
# Use platform-aware Node image so Docker chooses ARM on AWS and x86 on local.
# Debian-slim avoids Alpine's musl issues (bcrypt, sharp, native modules).
# -----------------------------------------------------------------------------
FROM --platform=$TARGETPLATFORM node:20-slim AS base

WORKDIR /app


COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Start in production mode on Render
CMD ["npm", "run", "start"]
