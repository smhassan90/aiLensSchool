import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { AiHealthService } from './ai/ai-health.service';

@ApiTags('Health')
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly aiHealth: AiHealthService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'sms-backend',
      commit: process.env.BUILD_SHA ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  /** Asks each configured model for a one-word reply. A missing key or unpaid bill shows up here. */
  @Public()
  @Get('ai')
  ai() {
    return this.aiHealth.check();
  }
}
