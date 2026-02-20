/**
 * Runtime Module (NestJS)
 * Exports: SemanticVirtualMachine (SVM)
 *
 * Imports NodesModule so the SVM can optionally inject
 * NodeDispatcherService and NodeRegistryService for distributed execution.
 */

import { Module } from '@nestjs/common';
import { SemanticVirtualMachine } from './semantic-vm.service';
import { ExecutorRegistryService } from './executor-registry.service';
import { WasmExecutor } from './executors/wasm.executor';
import { NativeExecutor } from './executors/native.executor';
import { HttpExecutor } from './executors/http.executor';
import { DockerExecutor } from './executors/docker.executor';
import { McpExecutor } from './executors/mcp.executor';
import { EmbeddedJsExecutor } from './executors/embedded-js.executor';
import { GrpcExecutor } from './executors/grpc.executor';
import { ConnectorExecutor } from './executors/connector.executor';
import { LlmCallExecutor } from './executors/llm-call.executor';
import { VaultService } from './vault.service';
import { PhysicalControlService } from './physical-control.service';
import { CryptoAuditChainService } from './crypto-audit-chain.service';
import { OfflineBufferService } from './offline-buffer.service';
import { CancellationBusService } from './cancellation-bus.service';
import { NodesModule } from '../nodes/nodes.module';

const EXECUTORS = [
  WasmExecutor,
  NativeExecutor,
  HttpExecutor,
  DockerExecutor,
  McpExecutor,
  EmbeddedJsExecutor,
  GrpcExecutor,
  ConnectorExecutor,
  LlmCallExecutor,
];

@Module({
  imports: [NodesModule],
  providers: [
    ...EXECUTORS,
    ExecutorRegistryService,
    SemanticVirtualMachine,
    VaultService,
    PhysicalControlService,
    CryptoAuditChainService,
    OfflineBufferService,
    CancellationBusService,
  ],
  exports: [
    ExecutorRegistryService,
    SemanticVirtualMachine,
    VaultService,
    PhysicalControlService,
    CryptoAuditChainService,
    OfflineBufferService,
    CancellationBusService,
  ],
})
export class RuntimeModule {}

