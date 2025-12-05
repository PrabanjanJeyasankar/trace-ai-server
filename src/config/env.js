const dotenv = require('dotenv')
dotenv.config()

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    uri: process.env.MONGO_URI,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET,
  },
}
