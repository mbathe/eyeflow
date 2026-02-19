/**
 * Natural Language Parser Service
 * Transforms natural language input → Semantic Tree (AST)
 * 
 * Responsibilities:
 * 1. Tokenize and analyze natural language
 * 2. Extract actions, dependencies, parallelization hints
 * 3. Build semantic nodes
 * 4. Integrate with Capability Catalog (Layer 1)
 * 
 * @file src/compiler/frontend/services/nl-parser.service.ts
 */

import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'winston';
import { 
  SemanticNode, 
  SemanticTree, 
  VariableDeclaration, 
  ParseResult, 
  ParseError,
  ParseWarning,
  SemanticNodeGuards 
} from '../interfaces/semantic-node.interface';
import { ComponentRegistry, Capability } from '../../../common/extensibility/index';

/**
 * Action extracted from natural language
 */
interface ExtractedAction {
  verb: string;
  object: string;
  inputs: Record<string, unknown>;
  parallelizable: boolean;
  lineNumber: number;
  sourceText: string;
}

/**
 * Dependency relationship between actions
 */
interface ActionDependency {
  from: string; // action ID
  to: string; // action ID that depends on this
  inputVariable: string; // which input references the output
}

@Injectable()
export class NLParserService {
  private readonly logger: Logger;
  private actionCounter = 0;

  constructor(
    @Inject('LOGGER') logger: Logger,
    private readonly componentRegistry: ComponentRegistry,
  ) {
    this.logger = logger.child({ context: 'NLParserService' });
  }

  /**
   * Parse natural language workflow description
   * Returns AST and diagnostics
   */
  async parse(input: string, workflowName = 'Untitled'): Promise<ParseResult> {
    const startTime = performance.now();
    this.actionCounter = 0;

    try {
      // Line 1: Tokenize input into lines
      const lines = this.tokenizes(input);

      // Line 2: Extract actions from each line
      const actions = await this.extractActions(lines);

      if (actions.length === 0) {
        return {
          success: false,
          errors: [
            {
              code: 'NO_ACTIONS_FOUND',
              message: 'No executable actions found in input',
              lineNumber: 0,
              suggestions: ['Ensure your input contains action verbs like "read", "send", "generate"'],
            },
          ],
          warnings: [],
          metadata: {
            parsingTime: performance.now() - startTime,
            inputLength: input.length,
            nodeCount: 0,
          },
        };
      }

      // Line 3: Analyze dependencies between actions
      const dependencies = await this.analyzeDependencies(actions, lines);

      // Line 4: Build semantic tree
      const tree = await this.buildSemanticTree(actions, dependencies, workflowName);

      // Line 5: Validate tree against capabilities
      const errors = await this.validateAgainstCatalog(tree);

      const parseTime = performance.now() - startTime;

      if (errors.length > 0) {
        this.logger.warn('Parse completed with errors', {
          error_count: errors.length,
          parse_time: parseTime,
          workflow: workflowName,
        });
      } else {
        this.logger.info('Successfully parsed natural language workflow', {
          parse_time: parseTime,
          node_count: tree.operations.size,
          variable_count: tree.variables.size,
          workflow: workflowName,
        });
      }

      return {
        success: errors.length === 0,
        tree,
        errors,
        warnings: [],
        metadata: {
          parsingTime: parseTime,
          inputLength: input.length,
          nodeCount: tree.operations.size,
        },
      };
    } catch (error) {
      this.logger.error('Parse error', {
        error: error instanceof Error ? error.message : String(error),
        input_length: input.length,
      });

      return {
        success: false,
        errors: [
          {
            code: 'PARSE_EXCEPTION',
            message: `Parsing failed: ${error instanceof Error ? error.message : String(error)}`,
            lineNumber: 0,
          },
        ],
        warnings: [],
        metadata: {
          parsingTime: performance.now() - startTime,
          inputLength: input.length,
          nodeCount: 0,
        },
      };
    }
  }

  /**
   * Tokenize input into lines
   * Removes comments, normalizes whitespace
   */
  private tokenizes(input: string): string[] {
    return input
      .split('\n')
      .map((line) => {
        // Remove comments
        const beforeComment = line.split(/\/\/|#/)[0];
        return beforeComment.trim();
      })
      .filter((line) => line.length > 0);
  }

  /**
   * Extract actions from lines
   * Identifies: verb, object, inputs, parallelizable hint
   */
  private async extractActions(lines: string[]): Promise<ExtractedAction[]> {
    const actions: ExtractedAction[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect parallelization hint
      const isParallel = /^@parallel|in parallel|simultaneously/i.test(line);

      // Extract verb (read, send, generate, analyze, etc.)
      const verbMatch = line.match(/^(read|send|generate|analyze|extract|transform|fetch|create|delete|update|process)/i);
      if (!verbMatch) {
        continue; // Skip lines without recognized verbs
      }

      const verb = verbMatch[1].toLowerCase();

      // Extract object (file, email, report, etc.)
      const objectMatch = line.match(new RegExp(`${verb}\\s+(?:the\\s+)?([a-zA-Z0-9_\\-.\\/\\s]+?)(?:\\s+(?:from|to|using|with|at)|$)`, 'i'));
      const object = objectMatch ? objectMatch[1].trim() : 'unknown';

      // Extract parameters (e.g., "from path/to/file.xlsx" or "to user@example.com")
      const inputs = this.extractInputs(line);

      actions.push({
        verb,
        object,
        inputs,
        parallelizable: isParallel,
        lineNumber: i + 1,
        sourceText: line,
      });
    }

    return actions;
  }

  /**
   * Extract input parameters from a line
   * Handles patterns like: from X, to Y, using Z, with PARAM=VALUE
   */
  private extractInputs(line: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    // Extract "from" parameter
    const fromMatch = line.match(/from\s+([^\s]+(?:\s+[^\s]+)*?)(?:\s+to\s+|$|[\n;])/i);
    if (fromMatch) inputs.from = fromMatch[1].trim();

    // Extract "to" parameter
    const toMatch = line.match(/to\s+([^\s@]+@?[^\s]*|[^\s]+)(?:\s+|$)/i);
    if (toMatch) inputs.to = toMatch[1].trim();

    // Extract "using" parameter
    const usingMatch = line.match(/using\s+([^\s]+)(?:\s+|$)/i);
    if (usingMatch) inputs.using = usingMatch[1].trim();

    // Extract "with" parameters (KEY=VALUE)
    const withMatches = line.matchAll(/with\s+(\w+)=([^\s]+)(?:\s+|$)/gi);
    for (const match of withMatches) {
      inputs[match[1]] = match[2];
    }

    return inputs;
  }

  /**
   * Analyze dependencies between actions
   * Determines which actions depend on outputs of other actions
   */
  private async analyzeDependencies(actions: ExtractedAction[], lines: string[]): Promise<ActionDependency[]> {
    const dependencies: ActionDependency[] = [];

    for (let i = 1; i < actions.length; i++) {
      const current = actions[i];
      const previous = actions[i - 1];

      // Check if current action uses result of previous action
      // Heuristics:
      // 1. Use explicit "result of" references
      // 2. Detect implicit data flow (e.g., "read X then send X")
      // 3. Detect reference patterns like "$0", "$1", etc.

      if (
        current.sourceText.includes(`result of`) ||
        current.sourceText.includes(`from ${previous.object}`) ||
        current.sourceText.includes(`$${i - 1}`)
      ) {
        dependencies.push({
          from: `action_${i - 1}`,
          to: `action_${i}`,
          inputVariable: 'data',
        });
      }

      // If not parallel, assume sequential dependency
      if (!current.parallelizable && i === actions.length) {
        dependencies.push({
          from: `action_${i - 1}`,
          to: `action_${i}`,
          inputVariable: 'data',
        });
      }
    }

    return dependencies;
  }

  /**
   * Build semantic tree from extracted actions and dependencies
   */
  private async buildSemanticTree(
    actions: ExtractedAction[],
    dependencies: ActionDependency[],
    workflowName: string,
  ): Promise<SemanticTree> {
    const operations = new Map<string, SemanticNode>();
    const variables = new Map<string, VariableDeclaration>();
    const nodes: SemanticNode[] = [];

    // Create operation nodes for each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionId = `action_${i}`;

      // Map verb to capability ID
      const capabilityId = this.verbToCapabilityId(action.verb);

      const node: SemanticNode = {
        type: 'operation',
        id: actionId,
        description: action.sourceText,
        operation: {
          capabilityId,
          inputs: action.inputs,
          outputVariable: `${action.verb}_${i}_result`,
        },
        metadata: {
          parallelizable: action.parallelizable,
          dependencies: dependencies
            .filter((d) => d.to === actionId)
            .map((d) => d.from),
          sourceLineNumber: action.lineNumber,
          estimatedDuration: 1000, // Default estimate
        },
      };

      operations.set(actionId, node);
      nodes.push(node);

      // Create variable for output
      if (node.operation?.outputVariable) {
        variables.set(node.operation.outputVariable, {
          name: node.operation.outputVariable,
          type: 'computed',
          dataClassification: 'RUNTIME_DYNAMIC',
          producedBy: actionId,
          sourceLineNumber: action.lineNumber,
        });
      }
    }

    // Build root node
    // If multiple nodes with no dependencies, wrap in parallel
    // Otherwise, chain sequentially
    let root: SemanticNode;

    if (nodes.length === 1) {
      root = nodes[0];
    } else {
      // Check if any nodes are independent (parallelizable)
      const independentNodes = nodes.filter((n) => !n.metadata?.dependencies || n.metadata.dependencies.length === 0);

      if (independentNodes.length > 1 && actions.some((a) => a.parallelizable)) {
        root = {
          type: 'parallel',
          id: 'root_parallel',
          parallel: {
            branches: independentNodes,
            mergeStrategy: 'all',
          },
        };
      } else {
        // Sequential execution
        for (let i = 0; i < nodes.length - 1; i++) {
          // Chain nodes via implicit dependencies
        }
        root = nodes[0]; // For now, use first node as root
      }
    }

    return {
      root,
      operations,
      variables,
      inputs: new Map(),
      metadata: {
        name: workflowName,
        createdAt: new Date(),
        parserVersion: '1.0.0',
        source: 'natural_language',
      },
    };
  }

  /**
   * Map action verb to Capability ID from Catalog
   * read -> connector.excel.read
   * send -> action.sendEmail
   * generate -> action.generateReport
   * etc.
   */
  private verbToCapabilityId(verb: string): string {
    const mappings: Record<string, string> = {
      read: 'connector.excel.read',
      send: 'action.sendEmail',
      generate: 'action.generateReport',
      analyze: 'service.openai.analyze',
      extract: 'action.extractData',
      transform: 'action.transformData',
      fetch: 'connector.http.get',
      create: 'action.createFile',
      delete: 'action.deleteFile',
      update: 'action.updateData',
      process: 'action.processData',
    };

    return mappings[verb] || `action.${verb}`;
  }

  /**
   * Validate semantic tree against Capability Catalog
   * Ensures all referenced capabilities exist and inputs match schemas
   */
  private async validateAgainstCatalog(tree: SemanticTree): Promise<ParseError[]> {
    const errors: ParseError[] = [];

    for (const [id, node] of tree.operations) {
      if (!SemanticNodeGuards.isOperationNode(node)) continue;

      const { capabilityId, inputs } = node.operation;

      // Check if capability exists in catalog
      try {
        const capability = await this.componentRegistry.getCapability(capabilityId);
        if (!capability) {
          errors.push({
            code: 'UNKNOWN_CAPABILITY',
            message: `Unknown capability: ${capabilityId}`,
            lineNumber: node.metadata?.sourceLineNumber ?? 0,
            context: `Action: ${id}`,
            suggestions: [`Check if capability is registered in ComponentRegistry`],
          });
          continue;
        }

        // Validate input parameters against capability schema
        const inputErrors = this.validateInputs(capability, inputs, node.metadata?.sourceLineNumber ?? 0);
        errors.push(...inputErrors);
      } catch (error) {
        errors.push({
          code: 'CAPABILITY_LOOKUP_ERROR',
          message: `Failed to lookup capability: ${capabilityId}`,
          lineNumber: node.metadata?.sourceLineNumber ?? 0,
        });
      }
    }

    return errors;
  }

  /**
   * Validate inputs against capability parameters
   */
  private validateInputs(capability: Capability, inputs: Record<string, unknown>, lineNumber: number): ParseError[] {
    const errors: ParseError[] = [];

    for (const param of capability.inputs) {
      if (param.required && !(param.name in inputs)) {
        errors.push({
          code: 'MISSING_REQUIRED_INPUT',
          message: `Missing required input: ${param.name}`,
          lineNumber,
          suggestions: [`Provide value for ${param.name}`],
        });
      }
    }

    return errors;
  }
}
