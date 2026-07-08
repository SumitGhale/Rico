import {rateLimit, ipKeyGenerator} from 'express-rate-limit';

// ─── Rate Limiter Middleware ─────────────────────────────────────────────────
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 75, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
    keyGenerator: (req) => {
        // Prefer the authenticated user id; fall back to IP. Route the IP through
        // ipKeyGenerator so IPv6 addresses collapse to their /56 subnet (see ipv6Subnet
        // above) and can't be rotated to bypass the limit.
        return req.user?.id || ipKeyGenerator(req.ip, 56);
    }
})

export default limiter;