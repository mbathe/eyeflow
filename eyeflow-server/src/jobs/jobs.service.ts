import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface Job {
  id: string;
  actionId: string;
  agentId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

@Injectable()
export class JobsService {
  private jobs = new Map<string, Job>();

  createJob(data: { actionId: string; agentId?: string }): Job {
    const job: Job = {
      id: uuidv4(),
      actionId: data.actionId,
      agentId: data.agentId,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    console.log(`✅ Job created: ${job.id}`);
    return job;
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateJob(id: string, data: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    Object.assign(job, data);
    if (data.status === 'running' && !job.startedAt) {
      job.startedAt = new Date();
    }
    if ((data.status === 'completed' || data.status === 'failed') && !job.completedAt) {
      job.completedAt = new Date();
    }
    return job;
  }

  deleteJob(id: string): boolean {
    return this.jobs.delete(id);
  }
}
