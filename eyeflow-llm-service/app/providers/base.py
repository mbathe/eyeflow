from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple
import json


class ILLMProvider(ABC):
    """
    Base interface for all LLM providers.
    Each provider implements this interface to support:
    - Rule generation from natural language intent
    - Condition evaluation with context
    - Multi-turn conversation for refinement
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (openai, anthropic, github, google)"""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Model identifier"""
        pass

    @abstractmethod
    async def generate_rules(
        self,
        aggregated_context: Dict[str, Any],
        user_intent: str,
    ) -> Tuple[Dict[str, Any], int]:
        """
        Generate workflow rules from natural language intent.

        Args:
            aggregated_context: Complete system capabilities (40+ types)
            user_intent: Natural language description of desired workflow

        Returns:
            Tuple[workflow_rules_dict, tokens_used]

        Raises:
            Exception: If generation fails after retries
        """
        pass

    @abstractmethod
    async def generate_rules_batch(
        self,
        aggregated_context: Dict[str, Any],
        intents: List[str],
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Generate multiple rules efficiently in batch.

        Args:
            aggregated_context: Complete system capabilities
            intents: List of natural language descriptions

        Returns:
            Tuple[list_of_rules, total_tokens_used]
        """
        pass

    @abstractmethod
    async def evaluate_condition(
        self,
        condition: str,
        context: Dict[str, Any],
    ) -> bool:
        """
        Dynamically evaluate a condition expression with given context.

        Args:
            condition: Condition expression (e.g., "$metrics.cpu > 80 AND $status == running")
            context: Runtime context variables

        Returns:
            Boolean result

        Raises:
            Exception: If evaluation fails
        """
        pass

    @abstractmethod
    async def refine_rules(
        self,
        current_rules: Dict[str, Any],
        feedback: str,
        aggregated_context: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], int]:
        """
        Refine previously generated rules based on user feedback.

        Args:
            current_rules: Previously generated rules
            feedback: User feedback for improvement
            aggregated_context: System capabilities

        Returns:
            Tuple[refined_rules, tokens_used]
        """
        pass

    def _build_system_prompt(self, aggregated_context: Dict[str, Any]) -> str:
        """
        Build comprehensive system prompt with all available capabilities.
        This is shared across all providers for consistency.
        """
        conditions_text = self._format_conditions(aggregated_context)
        actions_text = self._format_actions(aggregated_context)
        variables_text = self._format_variables(aggregated_context)
        triggers_text = self._format_triggers(aggregated_context)
        patterns_text = self._format_patterns(aggregated_context)
        examples_text = self._format_examples(aggregated_context)
        best_practices = self._format_best_practices(aggregated_context)

        return f"""You are an expert enterprise workflow automation engine powering a sophisticated LLM-driven task management system.

## 🎯 YOUR MISSION
Generate production-ready workflow rules that orchestrate complex business processes across 4+ enterprise modules.
Every rule generated must be:
- Type-safe and validated against available capabilities
- Executable without modification
- Following all enterprise best practices
- Resilient to failures with proper error handling

---

## 📋 AVAILABLE CONDITIONS (IF statements)
These are the 20+ condition types you can use to build conditional logic:

{conditions_text}

**Rules for using conditions:**
- Each condition evaluates to true/false
- Combine multiple conditions with AND/OR operators
- Always reference $variables from the context variables section
- Conditions must use exact condition types listed above


---

## ⚡ AVAILABLE ACTIONS (THEN statements)
These are the 20+ action types that execute when conditions match:

{actions_text}

**Rules for using actions:**
- Actions execute in sequence (top to bottom) unless wrapped in EXECUTE_PARALLEL
- Some actions are async (wait for completion), others are sync (fire-and-forget)
- Each action has specific parameters shown above - use only those
- Complex workflows can chain multiple actions together
- Include resilience configuration for each action


---

## 📦 CONTEXT VARIABLES (Reference in conditions)
These 15+ variables are available during rule execution:

{variables_text}

**Usage guidelines:**
- Reference them as $variable_name (e.g., $metrics.cpu, $workflow_state.status)
- Read-only variables: use only in conditions
- Writable variables: can be updated in actions to maintain state
- Type matters - respect the data structure shown in examples


---

## 🔔 TRIGGERS (When rules fire)
Rules are triggered by these 20+ events:

{triggers_text}

**Best practices:**
- Use multiple triggers to make rules fire in different scenarios
- Chain triggers together for complex workflows
- ON_WORKFLOW_START is most common entry point
- Use task-specific triggers to react to business events


---

## 🛡️ RESILIENCE PATTERNS (Advanced error handling)
Use these patterns to build robust, production-grade workflows:

{patterns_text}

**Most important:**
- ALWAYS include resilience for operations that touch external systems
- Use CIRCUIT_BREAKER when failure rate matters
- Use STEP_TIMEOUT to prevent hanging workflows
- Compensation logic is critical for data-modifying operations


---

## 📚 REAL-WORLD EXAMPLES
Study these real production patterns - your rules should follow similar structure:

{examples_text}

**Learn from examples:**
- Notice how complex workflows chain conditions and actions
- Pay attention to resilience patterns used
- See how compensation logic handles failures
- Multiple triggers allow workflows to restart from different events


---

## 🏆 BEST PRACTICES (MUST FOLLOW)
Always follow these enterprise patterns:

{best_practices}

**Critical:**
- Validate every condition against available types
- Use only documented action parameters
- Include error handling in every workflow
- Test conditions with sample context before production
- Document complex decision logic inline


---

## 📝 REQUIRED RESPONSE FORMAT

Generate workflow rules as valid JSON matching this schema:

{{
  "workflow_name": "descriptive-kebab-case-name",
  "description": "Clear description of what this workflow does",
  "version": "1.0.0",
  "trigger": "ON_WORKFLOW_START",  // Must be from triggerTypes list
  "rules": [
    {{
      "name": "rule-1-descriptive-name",
      "description": "What this rule does",
      "condition": "($trigger.priority == high) AND ($workflow_state.status == running)",
      "then": [
        {{
          "action": "EXECUTE_STEP",  // Must be from actionTypes list
          "params": {{
            // ONLY use parameters shown in actionTypes specification
            "step_name": "validate_resources",
            "timeout_seconds": 60,
            "on_failure": "retry"
          }}
        }},
        {{
          "action": "ALERT_ON_ANOMALY",
          "params": {{
            "severity": "high",
            "notification_channels": ["email", "slack"]
          }}
        }}
      ],
      "resilience": {{
        "retry": {{
          "max_attempts": 3,
          "backoff_factor": 2,
          "on_errors": ["timeout", "connection_error"]
        }},
        "timeout_seconds": 300,
        "fallback_action": "escalate"
      }},
      "compensation": {{
        "enabled": true,
        "steps": [
          {{
            "action": "EXECUTE_COMPENSATION",
            "params": {{
              "compensation_steps": [
                {{"name": "revert_changes", "connector": "db"}}
              ]
            }}
          }}
        ]
      }}
    }}
  ],
  "metadata": {{
    "tags": ["automation", "monitoring"],
    "owner": "platform-team",
    "sla_response_minutes": 5
  }}
}}


---

## ✅ VALIDATION CHECKLIST (BEFORE RESPONDING)

Before returning your response, verify:

□ All condition types exist in AVAILABLE CONDITIONS list above
□ All action types exist in AVAILABLE ACTIONS list above
□ All $variables exist in CONTEXT VARIABLES list above
□ All triggers exist in TRIGGERS list above
□ All parameters match specification exactly
□ JSON is valid and parseable
□ Max 10 rules per workflow
□ Max 5 actions per rule
□ Max 3 retries for resilience
□ Compensation logic included for state-modifying actions
□ Response is ONLY the JSON object (no markdown, no explanation)


---

## ⚠️ CRITICAL REQUIREMENTS

1. Your response MUST be valid JSON only
2. The JSON must be parseable by JSON.parse()
3. Follow the exact schema shown above
4. Reference only documented conditions/actions/variables
5. Include inline comments explaining complex decision logic (in JSON comments)
6. Assume the system will execute exactly what you generate
7. Test your JSON: {{}} brackets match, strings quoted, no trailing commas
8. If generation requires multiple rules, create separate rule objects
9. DO NOT add markdown formatting or explanations
10. DO NOT apologize or explain - just provide the JSON

Now generate the workflow rules:
"""

    def _format_conditions(self, context: Dict[str, Any]) -> str:
        """Format condition types with full details"""
        text = ""
        if "condition_types" in context and context["condition_types"]:
            for i, cond in enumerate(context["condition_types"], 1):
                text += f"""
### {i}. {cond.get('type', 'UNKNOWN')} ({cond.get('category', 'N/A')})
**Description:** {cond.get('description', 'No description')}
**Example usage:**
```json
{json.dumps(cond.get('example', {}), indent=2)}
```
"""
        return text

    def _format_actions(self, context: Dict[str, Any]) -> str:
        """Format action types with full details"""
        text = ""
        if "action_types" in context and context["action_types"]:
            for i, action in enumerate(context["action_types"], 1):
                async_status = "Async (waits for completion)" if action.get("async", False) else "Sync (fire-and-forget)"
                text += f"""
### {i}. {action.get('type', 'UNKNOWN')} - {async_status}
**Category:** {action.get('category', 'N/A')}
**Description:** {action.get('description', 'No description')}
**Example:**
```json
{json.dumps(action.get('example', {}), indent=2)}
```
"""
        return text

    def _format_variables(self, context: Dict[str, Any]) -> str:
        """Format context variables with full details"""
        text = ""
        if "context_variables" in context and context["context_variables"]:
            for i, (var_name, var_def) in enumerate(context["context_variables"].items(), 1):
                read_only = "🔒 Read-only" if var_def.get("isReadOnly", False) else "📝 Writable"
                text += f"""
### {i}. ${var_name} - {read_only}
**Description:** {var_def.get('description', 'No description')}
**Type:** {var_def.get('type', 'object')}
**Example:**
```json
{json.dumps(var_def.get('example', {}), indent=2)}
```
"""
        return text

    def _format_triggers(self, context: Dict[str, Any]) -> str:
        """Format trigger types"""
        text = ""
        if "trigger_types" in context and context["trigger_types"]:
            for i, trigger in enumerate(context["trigger_types"], 1):
                text += f"""
### {i}. {trigger.get('type', 'UNKNOWN')}
**Description:** {trigger.get('description', 'No description')}
**Example:**
```json
{json.dumps(trigger.get('example', {}), indent=2)}
```
"""
        return text

    def _format_patterns(self, context: Dict[str, Any]) -> str:
        """Format resilience patterns"""
        text = ""
        if "resilience_patterns" in context and context["resilience_patterns"]:
            for i, pattern in enumerate(context["resilience_patterns"], 1):
                text += f"""
### {i}. {pattern.get('type', 'UNKNOWN')}
**Description:** {pattern.get('description', 'No description')}
**Applicable to:** {', '.join(pattern.get('applicableTo', []))}
**Configuration example:**
```json
{json.dumps(pattern.get('example', {}), indent=2)}
```
"""
        return text

    def _format_examples(self, context: Dict[str, Any]) -> str:
        """Format real-world examples"""
        text = ""
        if "examples" in context and context["examples"]:
            for i, example in enumerate(context["examples"], 1):
                text += f"""
#### Example {i}: {example.get('name', 'Example')}
**Type:** {example.get('category', 'workflow')} | **Complexity:** {example.get('complexity', 'N/A')}
**Description:** {example.get('description', 'No description')}

**Real implementation:**
```json
{json.dumps(example.get('content', {}), indent=2)}
```
"""
        return text

    def _format_best_practices(self, context: Dict[str, Any]) -> str:
        """Format best practices from all providers"""
        practices = []

        if "best_practices" in context and context["best_practices"]:
            practices.extend(context["best_practices"])

        text = ""
        for i, practice in enumerate(practices, 1):
            text += f"**{i}.** {practice}\n"

        return text
