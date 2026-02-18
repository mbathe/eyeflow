import { Module } from '@nestjs/common';
import { WorkflowProvider } from './workflow.provider';

@Module({
  providers: [WorkflowProvider],
  exports: [WorkflowProvider],
})
export class WorkflowModule {}
