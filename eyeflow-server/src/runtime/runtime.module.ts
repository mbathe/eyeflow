/**
 * Runtime Module (NestJS)
 * Exports: SemanticVirtualMachine (SVM)
 */

import { Module } from '@nestjs/common';
import { SemanticVirtualMachine } from './semantic-vm.service';

@Module({
  providers: [SemanticVirtualMachine],
  exports: [SemanticVirtualMachine]
})
export class RuntimeModule {}
