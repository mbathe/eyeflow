import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  createJob(@Body() data: { actionId: string; agentId?: string }) {
    const job = this.jobsService.createJob(data);
    return {
      success: true,
      message: 'Job created successfully',
      job,
    };
  }

  @Get()
  getAllJobs() {
    const jobs = this.jobsService.getAllJobs();
    return {
      total: jobs.length,
      jobs,
    };
  }

  @Get(':id')
  getJob(@Param('id') id: string) {
    const job = this.jobsService.getJob(id);
    if (!job) {
      return { error: 'Job not found' };
    }
    return job;
  }
}
