/**
 * Application Configuration
 * Centralized configuration management using environment variables
 */

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || 'localhost',
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'voice_task_creator',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  // API Configuration
  api: {
    version: process.env.API_VERSION || 'v1',
    rateLimit: parseInt(process.env.API_RATE_LIMIT, 10) || 100,
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};




module.exports = config;
