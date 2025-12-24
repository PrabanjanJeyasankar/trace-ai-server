# -----------------------------------------------------------------------------
# Use platform-aware Node image so Docker chooses ARM on AWS and x86 on local.
# Debian-slim avoids Alpine's musl issues (bcrypt, sharp, native modules).
# -----------------------------------------------------------------------------
FROM --platform=$TARGETPLATFORM node:20-slim AS base

WORKDIR /app


COPY package*.json ./
RUN npm ci

# Development: Install nodemon globally
RUN npm install -g nodemon

COPY . .

EXPOSE 3000

# Use nodemon in development for auto-reload
CMD ["npm", "run", "dev"]
