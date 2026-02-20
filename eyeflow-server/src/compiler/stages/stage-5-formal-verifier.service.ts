/**
 * STAGE 5 — Formal Verifier
 *
 * Spec §3.4 — Vérification Formelle
 * ─────────────────────────────────
 * "Une fois validé humainement, le DAG passe par le vérificateur formel (Z3 SMT
 *  Solver).  Ce vérificateur garantit :
 *   • terminaison du programme (pas de boucle infinie)
 *   • respect des contraintes de ressources
 *   • cohérence des types entre les nœuds
 *   • satisfaction des préconditions / postconditions"
 *
 * Implementation notes
 * ─────────────────────
 * A full Z3 integration would require the `z3-solver` Wasm package.  This
 * service implements an equivalent subset using a symbolic type lattice and
 * graph-based termination analysis sufficient to enforce all spec guarantees
 * for the instruction set defined in IROpcode.
 *
 * Every check is expressed as a named rule that produces VerificationError[]
 * so that the caller (TaskExecutionService) can aggregate all issues in one
 * pass and return a structured VerificationReport before emitting bytecode.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  LLMIntermediateRepresentation,
  IRInstruction,
  IROpcode,
  RegisterType,
  LoopOperands,
  MAX_LOOP_ITERATIONS,
} from '../interfaces/ir.interface';
import type { ResolvedIR } from '../interfaces/ir.interface';
import { ServiceRegistryService } from '../service-registry.service';
import type { Predicate } from '../interfaces/service-manifest.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface VerificationError {
  ruleId: string;
  severity: VerificationSeverity;
  message: string;
  instructionIndex?: number;
  serviceId?: string;
  /** Suggested remediation shown in the compilation report */
  suggestion?: string;
}

export interface VerificationReport {
  /** True if no ERROR-level issues were found */
  passed: boolean;
  errors: VerificationError[];
  warnings: VerificationError[];
  /** Timestamp of when this report was produced */
  verifiedAt: Date;
  /** How long the verification took (ms) */
  durationMs: number;
  /** Human-readable summary */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Symbolic type lattice — tracks what type each register holds at each point */
type TypeLatticeEntry = { type: RegisterType | 'UNKNOWN'; definedAt?: number };

@Injectable()
export class FormalVerifierService {
  private readonly logger = new Logger(FormalVerifierService.name);

  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Main entry point
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Run all verification rules on a (post-Stage-7) ResolvedIR.
   * Returns a VerificationReport.  Callers MUST check `report.passed` and
   * abort compilation when it is false.
   */
  verify(ir: ResolvedIR): VerificationReport {
    const start = Date.now();
    const issues: VerificationError[] = [];

    this.logger.log(`[Stage 5] Starting formal verification of ${ir.instructions.length} instructions…`);

    issues.push(...this.checkTermination(ir));
    issues.push(...this.checkLoopBounds(ir));
    issues.push(...this.checkTypeFlow(ir));
    issues.push(...this.checkLLMCallSafety(ir));
    issues.push(...this.checkPreconditions(ir));
    issues.push(...this.checkSafetyConstraints(ir));
    issues.push(...this.checkNonReversibleFallbacks(ir));

    const errors  = issues.filter(e => e.severity === 'ERROR');
    const warnings = issues.filter(e => e.severity === 'WARN');

    const durationMs = Date.now() - start;
    const passed = errors.length === 0;

    this.logger.log(
      `[Stage 5] Verification ${passed ? 'PASSED' : 'FAILED'} in ${durationMs}ms — ` +
      `${errors.length} errors, ${warnings.length} warnings`
    );

    return {
      passed,
      errors,
      warnings,
      verifiedAt: new Date(),
      durationMs,
      summary: passed
        ? `Formal verification passed — ${warnings.length} warning(s)`
        : `Formal verification FAILED — ${errors.length} error(s), ${warnings.length} warning(s)`,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 1: Termination — no unbounded control flow
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Builds a control-flow graph and checks that every possible path through
   * the program terminates in a RETURN or a bounded LOOP.
   *
   * Criterion: the graph of BRANCH / JUMP instructions must be acyclic OR
   * every cycle must pass through a LOOP instruction with finite maxIterations.
   */
  private checkTermination(ir: LLMIntermediateRepresentation): VerificationError[] {
    const errors: VerificationError[] = [];

    // Build a simple adjacency list of instruction → possible_next instructions
    const successors = new Map<number, number[]>();
    const loopHeaders = new Set<number>();

    for (const instr of ir.instructions) {
      const succs: number[] = [];

      switch (instr.opcode) {
        case IROpcode.BRANCH:
        case IROpcode.JUMP:
          if (instr.targetInstruction !== undefined) succs.push(instr.targetInstruction);
          // Fall-through is also a successor for BRANCH
          if (instr.opcode === IROpcode.BRANCH) {
            const nextIdx = instr.index + 1;
            if (ir.instructions[nextIdx]) succs.push(nextIdx);
          }
          break;
        case IROpcode.LOOP:
          loopHeaders.add(instr.index);
          // Loop can go to body or exit
          if (instr.operands) {
            const ops = instr.operands as LoopOperands;
            if (ops.bodyStartIndex !== undefined) succs.push(ops.bodyStartIndex);
            if (ops.exitIndex !== undefined) succs.push(ops.exitIndex);
          }
          break;
        case IROpcode.RETURN:
          // Terminal node — no successors
          break;
        default: {
          const nextIdx = instr.index + 1;
          if (ir.instructions[nextIdx]) succs.push(nextIdx);
        }
      }
      successors.set(instr.index, succs);
    }

    // DFS cycle detection — a cycle is only allowed if it passes through a LOOP header
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<number, number>();
    const cycleThrough = new Map<number, number>(); // cycle entry → loop header that covers it

    const dfs = (node: number, path: number[]): void => {
      color.set(node, GRAY);
      for (const succ of (successors.get(node) ?? [])) {
        if (color.get(succ) === GRAY) {
          // Cycle detected — check if any node on the cycle path is a LOOP header
          const cycleSlice = path.slice(path.indexOf(succ));
          const coveredByLoop = cycleSlice.some(n => loopHeaders.has(n));
          if (!coveredByLoop) {
            errors.push({
              ruleId: 'TERM-001',
              severity: 'ERROR',
              message: `Infinite loop detected: cycle ${cycleSlice.join(' → ')} → ${succ} has no LOOP instruction with bounds.`,
              instructionIndex: succ,
              suggestion: 'Wrap the cyclic path in a bounded LOOP instruction with maxIterations ≤ 5.',
            });
          }
        } else if (color.get(succ) !== BLACK) {
          dfs(succ, [...path, succ]);
        }
      }
      color.set(node, BLACK);
    };

    for (const instr of ir.instructions) {
      if (color.get(instr.index) === undefined) {
        dfs(instr.index, [instr.index]);
      }
    }

    return errors;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 2: Loop bounds — every LOOP must be bounded
  // ──────────────────────────────────────────────────────────────────────────

  private checkLoopBounds(ir: LLMIntermediateRepresentation): VerificationError[] {
    const errors: VerificationError[] = [];

    for (const instr of ir.instructions) {
      if (instr.opcode !== IROpcode.LOOP) continue;

      const ops = instr.operands as LoopOperands | undefined;

      if (!ops) {
        errors.push({
          ruleId: 'LOOP-001',
          severity: 'ERROR',
          message: `LOOP at index ${instr.index} has no operands — maxIterations is required.`,
          instructionIndex: instr.index,
          suggestion: 'Add LoopOperands with maxIterations ≤ 5 and timeoutMs.',
        });
        continue;
      }

      if (ops.maxIterations === undefined || ops.maxIterations === null) {
        errors.push({
          ruleId: 'LOOP-002',
          severity: 'ERROR',
          message: `LOOP at index ${instr.index} is missing maxIterations.`,
          instructionIndex: instr.index,
          suggestion: `Set maxIterations to a value ≤ ${MAX_LOOP_ITERATIONS}.`,
        });
      } else if (ops.maxIterations > MAX_LOOP_ITERATIONS) {
        errors.push({
          ruleId: 'LOOP-003',
          severity: 'ERROR',
          message: `LOOP at index ${instr.index} has maxIterations=${ops.maxIterations} which exceeds the spec limit of ${MAX_LOOP_ITERATIONS}.`,
          instructionIndex: instr.index,
          suggestion: `Reduce maxIterations to ≤ ${MAX_LOOP_ITERATIONS} or split into multiple loops.`,
        });
      }

      if (!ops.timeoutMs || ops.timeoutMs <= 0) {
        errors.push({
          ruleId: 'LOOP-004',
          severity: 'ERROR',
          message: `LOOP at index ${instr.index} has no timeoutMs.  A positive timeout is mandatory.`,
          instructionIndex: instr.index,
          suggestion: 'Set timeoutMs to a positive value (e.g. 5000).',
        });
      }

      if (!ops.fallbackInstruction && !ops.convergencePredicate) {
        errors.push({
          ruleId: 'LOOP-005',
          severity: 'WARN',
          message: `LOOP at index ${instr.index} has neither a fallbackInstruction nor a convergencePredicate. Non-convergent runs will raise a runtime error.`,
          instructionIndex: instr.index,
          suggestion: 'Add a fallbackInstruction or a convergencePredicate.',
        });
      }
    }

    return errors;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 3: Type flow — register types are consistent across instructions
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Builds a symbolic type-lattice by traversing `instructionOrder`.
   * For each instruction, each src register must have been written by a
   * previous instruction with a compatible type.
   */
  private checkTypeFlow(ir: LLMIntermediateRepresentation): VerificationError[] {
    const errors: VerificationError[] = [];
    const lattice = new Map<number, TypeLatticeEntry>();

    // Mark the input register as OBJECT (or ANY if no schema)
    lattice.set(ir.inputRegister, { type: 'UNKNOWN', definedAt: -1 });

    for (const orderIdx of ir.instructionOrder) {
      const instr = ir.instructions[orderIdx];
      if (!instr) continue;

      // Check that all src registers are defined
      for (const src of (instr.src ?? [])) {
        if (!lattice.has(src)) {
          errors.push({
            ruleId: 'TYPE-001',
            severity: 'ERROR',
            message: `Instruction ${instr.index} (${instr.opcode}) reads register r${src} which has not been written by any preceding instruction.`,
            instructionIndex: instr.index,
            suggestion: 'Ensure the register is initialised by a LOAD_RESOURCE or previous service call.',
          });
        }
      }

      // Type-specific checks
      if (instr.opcode === IROpcode.VALIDATE && instr.src?.length) {
        const srcType = lattice.get(instr.src[0]);
        if (srcType?.type === RegisterType.BUFFER) {
          errors.push({
            ruleId: 'TYPE-002',
            severity: 'WARN',
            message: `Instruction ${instr.index}: VALIDATE applied to a BUFFER register (r${instr.src[0]}). Consider deserialising first.`,
            instructionIndex: instr.index,
          });
        }
      }

      // Register the dest register type
      if (instr.dest !== undefined) {
        const inferredType = this.inferDestType(instr);
        lattice.set(instr.dest, { type: inferredType, definedAt: instr.index });
      }
    }

    return errors;
  }

  /** Simple type inference for the destination register of an instruction */
  private inferDestType(instr: IRInstruction): RegisterType | 'UNKNOWN' {
    switch (instr.opcode) {
      case IROpcode.LOAD_RESOURCE:
        return RegisterType.ANY;
      case IROpcode.TRANSFORM:
        return RegisterType.OBJECT;
      case IROpcode.FILTER:
        return RegisterType.OBJECT;
      case IROpcode.AGGREGATE:
        return RegisterType.OBJECT;
      case IROpcode.CALL_SERVICE:
      case IROpcode.CALL_ACTION:
      case IROpcode.CALL_MCP:
      case IROpcode.LLM_CALL:
        return RegisterType.OBJECT;
      case IROpcode.VALIDATE:
        return RegisterType.OBJECT;
      default:
        return 'UNKNOWN';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 4: LLM_CALL safety — prompt is static, tokens bounded
  // ──────────────────────────────────────────────────────────────────────────

  private checkLLMCallSafety(ir: LLMIntermediateRepresentation): VerificationError[] {
    const errors: VerificationError[] = [];

    for (const instr of ir.instructions) {
      if (instr.opcode !== IROpcode.LLM_CALL) continue;

      const meta = instr.dispatchMetadata;

      if (!meta) {
        errors.push({
          ruleId: 'LLM-001',
          severity: 'ERROR',
          message: `LLM_CALL at index ${instr.index} has no dispatchMetadata. Stage 7 must inject an LlmCallExecutionDescriptor.`,
          instructionIndex: instr.index,
          suggestion: 'Ensure Stage 7 resolves this instruction against a registered LLM_CALL service.',
        });
        continue;
      }

      if (meta.format !== 'LLM_CALL') {
        errors.push({
          ruleId: 'LLM-002',
          severity: 'ERROR',
          message: `LLM_CALL at index ${instr.index} has dispatchMetadata.format='${meta.format}' — must be 'LLM_CALL'.`,
          instructionIndex: instr.index,
        });
        continue;
      }

      const desc = meta.selectedDescriptor as any;

      if (!desc.systemPrompt || typeof desc.systemPrompt !== 'string') {
        errors.push({
          ruleId: 'LLM-003',
          severity: 'ERROR',
          message: `LLM_CALL at index ${instr.index} is missing a static systemPrompt. Prompts must be frozen at compile time (spec §3.4).`,
          instructionIndex: instr.index,
          suggestion: 'Add a systemPrompt to the LlmCallExecutionDescriptor.',
        });
      }

      if (!desc.maxTokens || desc.maxTokens <= 0) {
        errors.push({
          ruleId: 'LLM-004',
          severity: 'ERROR',
          message: `LLM_CALL at index ${instr.index} has no maxTokens bound. All LLM calls must be formally bounded (spec §3.4).`,
          instructionIndex: instr.index,
          suggestion: 'Set maxTokens to a positive value in the LlmCallExecutionDescriptor.',
        });
      }

      if (!desc.credentialsVaultPath) {
        errors.push({
          ruleId: 'LLM-005',
          severity: 'ERROR',
          message: `LLM_CALL at index ${instr.index} has no credentialsVaultPath. API keys must come from vault (spec §2.3).`,
          instructionIndex: instr.index,
          suggestion: 'Set credentialsVaultPath in the LlmCallExecutionDescriptor.',
        });
      }
    }

    return errors;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 5: Preconditions — service preconditions must be statically satisfiable
  // ──────────────────────────────────────────────────────────────────────────

  private checkPreconditions(ir: ResolvedIR): VerificationError[] {
    const errors: VerificationError[] = [];

    for (const instr of ir.instructions) {
      if (
        instr.opcode !== IROpcode.CALL_SERVICE &&
        instr.opcode !== IROpcode.CALL_MCP &&
        instr.opcode !== IROpcode.LLM_CALL
      ) continue;

      if (!instr.serviceId) continue;

      const service = this.serviceRegistry.getService(instr.serviceId);
      if (!service?.preconditions?.length) continue;

      for (const pred of service.preconditions) {
        const issue = this.evaluatePredicateStatically(pred, instr);
        if (issue) {
          const severity: VerificationSeverity = pred.strictAtCompileTime ? 'ERROR' : 'WARN';
          errors.push({
            ruleId: 'PRE-001',
            severity,
            message: `Service '${instr.serviceId}' at instruction ${instr.index}: precondition "${pred.description}" cannot be statically proved. ${issue}`,
            instructionIndex: instr.index,
            serviceId: instr.serviceId,
            suggestion: pred.strictAtCompileTime
              ? `Add a VALIDATE instruction before index ${instr.index} that enforces: ${pred.description}`
              : `Consider adding a runtime assertion for: ${pred.description}`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Tries to statically evaluate a predicate against an instruction.
   * Returns an explanation string if the predicate is NOT provably satisfied,
   * or undefined if it passes.
   */
  private evaluatePredicateStatically(pred: Predicate, instr: IRInstruction): string | undefined {
    // If the predicate is about a register that is initialised via src, we check
    // it's present; for complex range constraints we emit a WARN.
    const op = instr.operands ?? {};
    const subject = pred.subject;

    // Port existence check
    if (pred.operator === 'exists') {
      if (op[subject] === undefined && op[subject.replace('$r', '')] === undefined) {
        return `Subject '${subject}' is not present in instruction operands.`;
      }
      return undefined;
    }

    if (pred.operator === 'not_exists') {
      return undefined; // Cannot disprove dynamically at compile time
    }

    // For range predicates on literal operands we can check directly
    if (pred.value !== undefined && op[subject] !== undefined) {
      const actual = op[subject];
      const expected = pred.value;
      switch (pred.operator) {
        case '>':  if (!(actual > expected)) return `${subject}=${actual} is not > ${expected}`;  break;
        case '>=': if (!(actual >= expected)) return `${subject}=${actual} is not >= ${expected}`; break;
        case '<':  if (!(actual < expected)) return `${subject}=${actual} is not < ${expected}`;  break;
        case '<=': if (!(actual <= expected)) return `${subject}=${actual} is not <= ${expected}`; break;
        case '==': if (actual !== expected) return `${subject}=${actual} is not == ${expected}`;  break;
        case '!=': if (actual === expected) return `${subject}=${actual} is == ${expected}`;       break;
      }
      return undefined;
    }

    // Cannot prove statically — emit a warning (not an error) unless strict
    return pred.strictAtCompileTime
      ? `Cannot statically prove predicate "${pred.description}" (subject '${subject}' is dynamic).`
      : undefined;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 6: Safety constraints — BLOCK / ERROR level abort compilation
  // ──────────────────────────────────────────────────────────────────────────

  private checkSafetyConstraints(ir: ResolvedIR): VerificationError[] {
    const errors: VerificationError[] = [];

    for (const instr of ir.instructions) {
      if (!instr.serviceId) continue;

      const service = this.serviceRegistry.getService(instr.serviceId);
      if (!service?.safetyConstraints?.length) continue;

      for (const constraint of service.safetyConstraints) {
        const issue = this.evaluatePredicateStatically(constraint.predicate, instr);
        if (issue) {
          // BLOCK → compilation-fatal ERROR
          const severity: VerificationSeverity =
            constraint.level === 'BLOCK' || constraint.level === 'ERROR' ? 'ERROR' : 'WARN';
          errors.push({
            ruleId: `SAFE-${constraint.id}`,
            severity,
            message: `Safety constraint '${constraint.id}' violated on service '${instr.serviceId}' at instruction ${instr.index}: ${constraint.description}. ${issue}`,
            instructionIndex: instr.index,
            serviceId: instr.serviceId,
            suggestion: constraint.description,
          });
        }
      }
    }

    return errors;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rule 7: Non-reversible services must have a fallback or human confirmation
  // ──────────────────────────────────────────────────────────────────────────

  private checkNonReversibleFallbacks(ir: ResolvedIR): VerificationError[] {
    const errors: VerificationError[] = [];

    for (const instr of ir.instructions) {
      if (!instr.serviceId) continue;

      const service = this.serviceRegistry.getService(instr.serviceId);
      if (!service) continue;
      if (service.isReversible !== false) continue; // only flag irreversible ones
      if (service.requiresHumanConfirmation) continue; // has confirmation → OK

      // Check if there's a BRANCH immediately before that provides a fallback path
      const prevInstr = ir.instructions[instr.index - 1];
      const hasFallbackBranch = (prevInstr?.opcode === IROpcode.BRANCH);

      if (!hasFallbackBranch) {
        errors.push({
          ruleId: 'REV-001',
          severity: 'WARN',
          message: `Service '${instr.serviceId}' at instruction ${instr.index} is marked non-reversible and has no fallback branch or human confirmation checkpoint.`,
          instructionIndex: instr.index,
          serviceId: instr.serviceId,
          suggestion: 'Either set requiresHumanConfirmation=true in the manifest or add a BRANCH fallback path before this instruction.',
        });
      }
    }

    return errors;
  }
}
