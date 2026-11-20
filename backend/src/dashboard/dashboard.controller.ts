import { Controller, Get, Query } from '@nestjs/common'
import { DashboardService } from './dashboard.service.js'
import { ListDashboardAttentionQueryDto } from './dto/list-dashboard-attention-query.dto.js'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary() {
    return this.dashboardService.getSummary()
  }

  @Get('attention')
  findAttention(@Query() query: ListDashboardAttentionQueryDto) {
    return this.dashboardService.findAttention(query)
  }
}
