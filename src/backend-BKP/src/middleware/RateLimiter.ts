import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';

export class RateLimiter {
    private static instance: RateLimiter;
    private readonly redis: Redis;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private readonly RATE_LIMIT_CONFIG = {
        WINDOW_MS: 60000, // 1 minute
        MAX_REQUESTS: 100, // max requests per window
        BLOCK_DURATION: 300, // 5 minutes block for exceeding limit
    };

    private constructor() {
        this.redis = new Redis(config.redis);
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();

        this.redis.on('error', (error) => {
            this.logger.error('Rate limiter Redis error:', error);
        });
    }

    public static getInstance(): RateLimiter {
        if (!RateLimiter.instance) {
            RateLimiter.instance = new RateLimiter();
        }
        return RateLimiter.instance;
    }

    public limit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const key = this.getKey(req);

        try {
            // Check if IP is blocked
            const isBlocked = await this.redis.get(`blocked:${key}`);
            if (isBlocked) {
                this.metrics.recordOperationMetrics('rate_limit_blocked', {
                    duration: 0,
                    success: false
                });

                res.status(429).json({
                    error: 'Too Many Requests',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: await this.redis.ttl(`blocked:${key}`)
                });
                return;
            }

            // Get current request count
            const requests = await this.redis.incr(key);

            // Set expiry for first request
            if (requests === 1) {
                await this.redis.expire(key, this.RATE_LIMIT_CONFIG.WINDOW_MS / 1000);
            }

            // Check if limit exceeded
            if (requests > this.RATE_LIMIT_CONFIG.MAX_REQUESTS) {
                // Block the IP
                await this.redis.setex(
                    `blocked:${key}`,
                    this.RATE_LIMIT_CONFIG.BLOCK_DURATION,
                    '1'
                );

                this.logger.warn('Rate limit exceeded', {
                    ip: req.ip,
                    requests,
                    path: req.path
                });

                this.metrics.recordOperationMetrics('rate_limit_exceeded', {
                    duration: 0,
                    success: false
                });

                res.status(429).json({
                    error: 'Too Many Requests',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: this.RATE_LIMIT_CONFIG.BLOCK_DURATION
                });
                return;
            }

            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', this.RATE_LIMIT_CONFIG.MAX_REQUESTS);
            res.setHeader('X-RateLimit-Remaining', this.RATE_LIMIT_CONFIG.MAX_REQUESTS - requests);
            res.setHeader('X-RateLimit-Reset', await this.redis.ttl(key));

            next();
        } catch (error) {
            this.logger.error('Rate limiter error:', error);
            // Fail open - allow request if rate limiter fails
            next();
        }
    };

    private getKey(req: Request): string {
        // Use IP and path for rate limiting
        // You might want to use different strategies based on your needs
        return `ratelimit:${req.ip}:${req.path}`;
    }
}

export default RateLimiter.getInstance(); 