/**
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │                               RATE LIMITER TABLE                               │
 * ├──────────────────────┬───────────────────────────┬─────────────────────────────┤
 * │      LIMITER NAME     │        LIMIT WINDOW       │            MAX REQUESTS     │
 * ├──────────────────────┼───────────────────────────┼─────────────────────────────┤
 * │ globalRateLimiter     │ 60 seconds                │ 300 requests per IP         │
 * │ signupLimiter         │ 1 hour                    │ 20 signups per IP           │
 * │ loginLimiter          │ 10 minutes                │ 50 logins per IP            │
 * │ messageLimiter        │ 60 seconds                │ 120 messages per IP         │
 * │ regenerateLimiter     │ 60 seconds                │ 40 regenerations per IP     │
 * │ searchLimiter         │ 60 seconds                │ 80 searches per IP          │
 * │ chatCreateLimiter     │ 1 hour                    │ 50 chat creations per IP    │
 * │ chatRenameLimiter     │ 1 hour                    │ 100 renames per IP          │
 * │ chatDeleteLimiter     │ 1 hour                    │ 30 deletes per IP           │
 * └──────────────────────┴───────────────────────────┴─────────────────────────────┘
 *
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │                               PURPOSE BREAKDOWN                                │
 * ├──────────────────────────────┬─────────────────────────────────────────────────┤
 * │ globalRateLimiter            │ Blocks heavy scraping / burst abuse             │
 * │ signupLimiter                │ Prevents mass fake account creation             │
 * │ loginLimiter                 │ Prevents brute-force login attack               │
 * │ messageLimiter               │ Controls LLM token cost & spam                  │
 * │ regenerateLimiter            │ Limits auto-regen spam                          │
 * │ searchLimiter                │ Protects vector DB / keyword search             │
 * │ chatCreateLimiter            │ Prevents bulk chat creation spam                │
 * │ chatRenameLimiter            │ Prevents UI rename abuse                        │
 * │ chatDeleteLimiter            │ Stops bulk deletions from scripts               │
 * └──────────────────────────────┴─────────────────────────────────────────────────┘
 */

const rateLimit = require('express-rate-limit')

const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(60),
    })
  },
})

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many signup attempts, please try again after an hour.',
})

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  message: 'Too many login attempts, please try again later.',
})

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many messages, please slow down.',
})

const regenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: 'Too many regeneration requests, please wait.',
})

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  message: 'Too many search requests, please try again later.',
})

const chatCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Too many chat creation requests, please try again later.',
})

const chatRenameLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: 'Too many rename requests, please try again later.',
})

const chatDeleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many delete requests, please try again later.',
})

module.exports = {
  globalRateLimiter,
  signupLimiter,
  loginLimiter,
  messageLimiter,
  regenerateLimiter,
  searchLimiter,
  chatCreateLimiter,
  chatRenameLimiter,
  chatDeleteLimiter,
}
