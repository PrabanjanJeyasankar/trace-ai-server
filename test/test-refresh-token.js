// Basic refresh token system test
// Steps validated:
// 1. Signup -> receives access token + refresh cookie
// 2. Access token works on protected route
// 3. Refresh endpoint issues new access token
// 4. New access token works
// 5. Logout invalidates refresh token
// 6. Refresh with invalidated token must fail
// 7. Refresh without cookie must fail

const axios = require('axios')

const BASE_URL = 'http://localhost:3000/api/v1'
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'test123456',
  name: 'Test User',
}

let accessToken = ''
let refreshTokenCookie = ''

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const GRAY = '\x1b[90m'
const RESET = '\x1b[0m'

const log = (step, message, data = '') => {
  console.log(`\n${GREEN}[PASS]${RESET} ${step}`)
  console.log(`${GRAY}    ${message}${RESET}`)
  if (data) console.log(`${GRAY}    ${data}${RESET}`)
}

const logError = (step, message) => {
  console.log(`\n${RED}[FAIL]${RESET} ${step}`)
  console.log(`${RED}    ${message}${RESET}`)
}
const extractCookie = (headers) => {
  const setCookie = headers['set-cookie']
  if (!setCookie) return null
  const refreshCookie = setCookie.find((c) => c.startsWith('refreshToken='))
  return refreshCookie ? refreshCookie.split(';')[0] : null
}

async function test() {
  console.log('\nTesting Refresh Token System\n')

  try {
    log('Step 1', 'Signup with new user', TEST_USER.email)
    const signupRes = await axios.post(`${BASE_URL}/auth/signup`, TEST_USER)
    accessToken = signupRes.data.data.accessToken
    refreshTokenCookie = extractCookie(signupRes.headers)

    if (!accessToken) throw new Error('Missing access token')
    if (!refreshTokenCookie) throw new Error('Missing refresh token cookie')

    log('Step 1', 'Signup successful')

    await new Promise((r) => setTimeout(r, 500))

    log('Step 2', 'Testing /me with access token')
    const meRes = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    log('Step 2', 'Access token accepted', meRes.data.data.user.email)

    await new Promise((r) => setTimeout(r, 500))

    log('Step 3', 'Testing refresh endpoint')
    const refreshRes = await axios.post(
      `${BASE_URL}/auth/refresh`,
      {},
      { headers: { Cookie: refreshTokenCookie } }
    )
    const newAccessToken = refreshRes.data.data.accessToken

    if (!newAccessToken) throw new Error('Missing new access token')
    accessToken = newAccessToken

    log('Step 3', 'Refresh successful')

    await new Promise((r) => setTimeout(r, 500))

    log('Step 4', 'Testing /me with new access token')
    const meRes2 = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    log('Step 4', 'New access token accepted', meRes2.data.data.user.email)

    await new Promise((r) => setTimeout(r, 500))

    log('Step 5', 'Testing logout')
    await axios.post(
      `${BASE_URL}/auth/logout`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Cookie: refreshTokenCookie,
        },
      }
    )
    log('Step 5', 'Logout successful')

    await new Promise((r) => setTimeout(r, 500))

    log('Step 6', 'Testing refresh after logout (should fail)')
    try {
      await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        { headers: { Cookie: refreshTokenCookie } }
      )
      logError('Step 6', 'Refresh succeeded but should fail')
      process.exit(1)
    } catch (err) {
      if (err.response?.status === 401) {
        log('Step 6', 'Refresh correctly rejected')
      } else {
        throw err
      }
    }

    await new Promise((r) => setTimeout(r, 500))

    log('Step 7', 'Testing refresh without cookie (should fail)')
    try {
      await axios.post(`${BASE_URL}/auth/refresh`, {})
      logError('Step 7', 'Refresh succeeded but should fail')
      process.exit(1)
    } catch (err) {
      if (err.response?.status === 401) {
        log('Step 7', 'No-cookie refresh correctly rejected')
      } else {
        throw err
      }
    }

    console.log('\nAll tests passed\n')
    process.exit(0)
  } catch (error) {
    logError('Test Failed', error.message)
    if (error.response) {
      console.log(`Status: ${error.response.status}`)
      console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`)
    }
    process.exit(1)
  }
}

test()
