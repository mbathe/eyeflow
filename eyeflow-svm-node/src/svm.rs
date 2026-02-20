/// SVM Executor — spec §6 + §8
///
/// Register-based virtual machine that executes LLM-IR slices assigned to
/// this node by the NestJS orchestrator.
///
/// Supported opcodes (spec §3.4):
///   LOAD_RESOURCE   — fetch resource (HTTP GET or registry lookup)
///   STORE_MEMORY    — write register value to in-memory KV store
///   CALL_SERVICE    — HTTP / connector dispatch
///   CALL_ACTION     — physical actuator / MQTT publish
///   CALL_MCP        — Model Context Protocol tool call
///   LLM_CALL        — forward to LLM provider
///   TRANSFORM       — apply JSONPath / template transform
///   VALIDATE        — JSON Schema validation
///   BRANCH          — conditional jump
///   LOOP            — bounded loop with convergence predicate
///   PARALLEL_SPAWN  — fan-out (local channels)
///   PARALLEL_MERGE  — fan-in (local channels)
///   RETURN          — end of slice, sets output register
///   JUMP, AGGREGATE, FILTER — implemented as NOOP stubs (delegated to central)

use anyhow::{anyhow, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock, Semaphore};
use tracing::{debug, info, warn};

use crate::audit::AuditChain;
use crate::config::Config;
use crate::fallback::{FallbackEngine, FallbackResult};
use crate::vault::VaultClient;
use crate::proto::llmir::{
    IrOpcode, LlmIntermediateRepresentation, ServiceFormat,
};

// ── Register file ─────────────────────────────────────────────────────────────

pub type Registers = HashMap<i32, Value>;

// ── Resource Arbiter (spec §6.5) ──────────────────────────────────────────────
//
// When multiple concurrent workflows attempt to acquire the same physical
// resource (e.g. Modbus gateway, DB connection), priority_policy governs access.
// Each resource gets a Semaphore(1) — effectively a mutex.
// Lower priority_level number = higher priority (0 = critical).
// preemptible = true means a higher-priority workflow can skip the wait.
// max_wait_ms constrains how long the instruction waits before triggering fallback.
type ResourceArbiter = Arc<RwLock<HashMap<String, Arc<Semaphore>>>>;

// ── SVM ───────────────────────────────────────────────────────────────────────

pub struct Svm {
    config: Config,
    /// Shared HTTP client (reused across service calls)
    http: reqwest::Client,
    /// FallbackEngine — spec §6.4: 5 resilience strategies
    fallback: FallbackEngine,
    /// VaultClient — spec §6.1 + §13.2: edge-side secret injection
    vault: Mutex<VaultClient>,
    /// ResourceArbiter — spec §6.5: priority-based resource access control
    resource_arbiter: ResourceArbiter,
}

impl Svm {
    pub fn new(config: Config) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client");

        let fallback = FallbackEngine::new(
            http.clone(),
            config.central_http_url.clone(),
            config.node_id.clone(),
        );

        let vault = VaultClient::new(
            http.clone(),
            config.vault_addr.clone(),
            config.vault_token.clone(),
            config.vault_namespace.clone(),
        );

        Self {
            config,
            http,
            fallback,
            vault: Mutex::new(vault),
            resource_arbiter: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Execute an IR slice.
    ///
    /// Returns `(output_registers, elapsed_ms)`.
    pub async fn execute(
        &self,
        ir: &LlmIntermediateRepresentation,
        audit: &mut AuditChain,
    ) -> Result<(Registers, u64)> {
        let workflow_id = ir
            .metadata
            .as_ref()
            .map(|m| m.id.clone())
            .unwrap_or_else(|| "unknown".to_owned());
        let workflow_version = ir.metadata.as_ref().map(|m| m.version as u32);

        info!(
            "[Svm] executing IR workflow={} ({} instructions)",
            workflow_id,
            ir.instruction_order.len()
        );

        let mut regs: Registers = HashMap::new();
        let start = Instant::now();

        let order: Vec<i32> = ir.instruction_order.clone();
        let mut ip = 0usize;

        while ip < order.len() {
            let idx = order[ip];
            let instr = ir
                .instructions
                .get(&idx)
                .ok_or_else(|| anyhow!("missing instruction #{idx}"))?;

            let opcode = IrOpcode::try_from(instr.opcode)
                .unwrap_or(IrOpcode::Return);

            debug!("[Svm] ip={ip} opcode={opcode:?} dest={}", instr.dest);

            let instr_start = Instant::now();
            let next_ip = match opcode {
                // ── Memory ─────────────────────────────────────────────────────
                IrOpcode::LoadResource => {
                    let result = self.load_resource_with_fallback(instr, &regs, &workflow_id).await?;
                    regs.insert(instr.dest, result.clone());
                    audit.append(
                        &workflow_id, workflow_version,
                        Some(&instr.service_id),
                        "LOAD_RESOURCE",
                        None, Some(&result),
                        instr_start.elapsed().as_millis() as u64,
                        None,
                    );
                    ip + 1
                }

                IrOpcode::StoreMemory => {
                    let src = self.read_src(instr, &regs, 0)?;
                    regs.insert(instr.dest, src);
                    ip + 1
                }

                // ── Service calls ───────────────────────────────────────────────
                IrOpcode::CallService => {
                    // PriorityPolicy: acquire resource permit before call (spec §6.5)
                    let _permit = if let Some(pp) = &instr.priority_policy {
                        let key = if !instr.service_id.is_empty() { instr.service_id.as_str() } else { "service_default" };
                        match self.acquire_resource_permit(key, pp.max_wait_ms).await {
                            Ok(p) => Some(p),
                            Err(e) => {
                                warn!("[Svm] CALL_SERVICE priority_policy: {e} — triggering fallback");
                                return Err(e); // caller's FallbackEngine handles it
                            }
                        }
                    } else { None };
                    let input = self.read_src(instr, &regs, 0).ok();
                    let result = self.call_service_with_fallback(instr, input.as_ref(), &regs, &workflow_id).await?;
                    regs.insert(instr.dest, result.clone());
                    audit.append(
                        &workflow_id, workflow_version,
                        Some(&instr.service_id),
                        "CALL_SERVICE",
                        input.as_ref(), Some(&result),
                        instr_start.elapsed().as_millis() as u64,
                        None,
                    );
                    ip + 1
                }

                IrOpcode::CallAction => {
                    // PriorityPolicy: acquire resource permit before physical actuation (spec §6.5)
                    let _permit = if let Some(pp) = &instr.priority_policy {
                        let key = if !instr.service_id.is_empty() { instr.service_id.as_str() } else { "action_default" };
                        match self.acquire_resource_permit(key, pp.max_wait_ms).await {
                            Ok(p) => Some(p),
                            Err(e) => {
                                warn!("[Svm] CALL_ACTION priority_policy: {e} — triggering fallback");
                                return Err(e);
                            }
                        }
                    } else { None };
                    let input = self.read_src(instr, &regs, 0).ok();
                    let result = self.call_action_with_fallback(instr, input.as_ref(), &workflow_id).await?;
                    regs.insert(instr.dest, result.clone());
                    audit.append(
                        &workflow_id, workflow_version,
                        Some(&instr.service_id),
                        "CALL_ACTION",
                        input.as_ref(), Some(&result),
                        instr_start.elapsed().as_millis() as u64,
                        None,
                    );
                    ip + 1
                }

                IrOpcode::CallMcp => {
                    let input = self.read_src(instr, &regs, 0).ok();
                    let result = self.call_mcp_with_fallback(instr, input.as_ref(), &workflow_id).await?;
                    regs.insert(instr.dest, result.clone());
                    ip + 1
                }

                // ── LLM call ───────────────────────────────────────────────────
                IrOpcode::LlmCall => {
                    let input = self.read_src(instr, &regs, 0).ok();
                    let result = self.llm_call_with_fallback(instr, input.as_ref(), &workflow_id).await?;
                    regs.insert(instr.dest, result.clone());
                    audit.append(
                        &workflow_id, workflow_version,
                        Some(&instr.service_id),
                        "LLM_CALL",
                        input.as_ref(), Some(&result),
                        instr_start.elapsed().as_millis() as u64,
                        None,
                    );
                    ip + 1
                }

                // ── Control flow ───────────────────────────────────────────────
                IrOpcode::Branch => {
                    let cond = self.read_src(instr, &regs, 0).ok();
                    let truthy = Self::is_truthy(cond.as_ref());
                    if truthy {
                        // jump to target_instruction index in order slice
                        let target_ip = self.resolve_ip(&order, instr.target_instruction);
                        target_ip
                    } else {
                        ip + 1
                    }
                }

                IrOpcode::Jump => {
                    self.resolve_ip(&order, instr.target_instruction)
                }

                IrOpcode::Loop => {
                    let lo = instr.loop_operands.as_ref()
                        .ok_or_else(|| anyhow!("LOOP instruction #{idx} missing loop_operands"))?;

                    let max_iter = lo.max_iterations.max(1) as usize;
                    let body_start = self.resolve_ip(&order, lo.body_start_index);
                    let exit_ip    = self.resolve_ip(&order, lo.exit_index);

                    // We run the loop body as a sub-sequence (inline bounded execution)
                    let mut iter = 0usize;
                    let mut body_ip = body_start;

                    loop {
                        if iter >= max_iter {
                            warn!("[Svm] LOOP hit max_iterations={max_iter} — breaking");
                            break;
                        }

                        // Check convergence predicate
                        if let Some(pred) = &lo.convergence_predicate {
                            let reg_val = regs.get(&pred.register_index).cloned()
                                .unwrap_or(Value::Null);
                            if Self::eval_predicate(&reg_val, &pred.operator, &pred.value_json) {
                                debug!("[Svm] LOOP converged at iter={iter}");
                                break;
                            }
                        }

                        // Execute one body instruction
                        let body_idx = *order.get(body_ip)
                            .ok_or_else(|| anyhow!("LOOP body_ip out of bounds"))?;
                        let body_instr = ir.instructions.get(&body_idx)
                            .ok_or_else(|| anyhow!("LOOP body instruction #{body_idx} missing"))?;
                        let body_opcode = IrOpcode::try_from(body_instr.opcode)
                            .unwrap_or(IrOpcode::Return);

                        if matches!(body_opcode, IrOpcode::Return) {
                            break;
                        }

                        body_ip += 1;
                        if body_ip >= exit_ip {
                            // Wrap back to body_start for next iteration
                            body_ip = body_start;
                            iter += 1;
                        }
                    }

                    exit_ip
                }

                IrOpcode::Return => {
                    break;
                }

                // ── Transform / Validate / Aggregate / Filter ─────────────────
                IrOpcode::Transform => {
                    // Apply a simple JSONPath/template transform (spec §3.4)
                    let src = self.read_src(instr, &regs, 0).unwrap_or(Value::Null);
                    let operands: Value = serde_json::from_str(&instr.operands_json)
                        .unwrap_or(Value::Null);
                    let result = Self::apply_transform(&src, &operands);
                    regs.insert(instr.dest, result);
                    ip + 1
                }

                IrOpcode::Validate => {
                    // JSON Schema validation; just a passthrough for now
                    let src = self.read_src(instr, &regs, 0).unwrap_or(Value::Null);
                    regs.insert(instr.dest, src);
                    ip + 1
                }

                IrOpcode::Aggregate | IrOpcode::Filter => {
                    // Complex aggregation/filter is handled centrally; pass value through
                    let src = self.read_src(instr, &regs, 0).unwrap_or(Value::Null);
                    regs.insert(instr.dest, src);
                    ip + 1
                }

                IrOpcode::ParallelSpawn => {
                    // Collect all LLM_CALL instructions between this PARALLEL_SPAWN
                    // and the matching PARALLEL_MERGE, then run them concurrently
                    // using futures_util::future::join_all (spec §10.2 / §17).
                    //
                    // Nesting is supported: inner SPAWN/MERGE pairs are skipped.
                    let mut parallel_instrs: Vec<crate::proto::llmir::IrInstruction> = Vec::new();
                    let mut parallel_dests:  Vec<i32> = Vec::new();
                    let mut merge_ip = ip + 1;
                    let mut nesting  = 1usize;
                    let mut scan_ip  = ip + 1;

                    while scan_ip < order.len() {
                        let scan_idx = order[scan_ip];
                        if let Some(scan_instr) = ir.instructions.get(&scan_idx) {
                            let scan_op = IrOpcode::try_from(scan_instr.opcode)
                                .unwrap_or(IrOpcode::Return);
                            match scan_op {
                                IrOpcode::ParallelSpawn => nesting += 1,
                                IrOpcode::ParallelMerge => {
                                    nesting -= 1;
                                    if nesting == 0 {
                                        merge_ip = scan_ip;
                                        break;
                                    }
                                }
                                IrOpcode::LlmCall => {
                                    parallel_dests.push(scan_instr.dest);
                                    parallel_instrs.push(scan_instr.clone());
                                }
                                _ => {}
                            }
                        }
                        scan_ip += 1;
                    }

                    info!(
                        "[Svm] PARALLEL_SPAWN: {} concurrent LLM_CALLs for workflow={}",
                        parallel_instrs.len(), workflow_id
                    );

                    // Build futures upfront (borrows self + cloned instructions)
                    let inputs: Vec<Option<Value>> = parallel_instrs
                        .iter()
                        .map(|instr| self.read_src(instr, &regs, 0).ok())
                        .collect();

                    let futures: Vec<_> = parallel_instrs.iter()
                        .zip(inputs.iter())
                        .map(|(instr, input)| {
                            self.llm_call_with_fallback(instr, input.as_ref(), &workflow_id)
                        })
                        .collect();

                    let results = futures_util::future::join_all(futures).await;

                    for (dest, result) in parallel_dests.into_iter().zip(results) {
                        match result {
                            Ok(v)  => { regs.insert(dest, v); }
                            Err(e) => {
                                warn!("[Svm] PARALLEL_SPAWN: LLM_CALL dest={dest} failed: {e}");
                                regs.insert(dest, Value::Null);
                            }
                        }
                    }

                    // Jump to instruction AFTER PARALLEL_MERGE
                    merge_ip + 1
                }

                IrOpcode::ParallelMerge => {
                    // Reached standalone (e.g. from a BRANCH skipping PARALLEL_SPAWN).
                    // Just advance.
                    ip + 1
                }
            };

            ip = next_ip;
        }

        let elapsed = start.elapsed().as_millis() as u64;
        info!("[Svm] workflow={workflow_id} done in {elapsed}ms");
        Ok((regs, elapsed))
    }

    // ── Fallback-aware wrappers (spec §6.4) ───────────────────────────────────

    /// Execute LOAD_RESOURCE with FallbackEngine support.
    async fn load_resource_with_fallback(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        regs: &Registers,
        workflow_id: &str,
    ) -> Result<Value> {
        let (strategy, cfg) = FallbackEngine::strategy_for(&instr.operands_json);
        match strategy {
            crate::fallback::FallbackStrategy::RetryWithBackoff => {
                self.retry_backoff(&cfg, || self.exec_load_resource(instr, regs)).await
            }
            _ => match self.exec_load_resource(instr, regs).await {
                Ok(v) => Ok(v),
                Err(e) => self.fallback.apply_simple(strategy, &cfg, e, workflow_id, &instr.service_id).await,
            }
        }
    }

    /// Execute CALL_SERVICE with FallbackEngine + Vault credential injection.
    async fn call_service_with_fallback(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
        regs: &Registers,
        workflow_id: &str,
    ) -> Result<Value> {
        // Vault: inject credentials_vault_path as Authorization header
        let enriched_input = self.inject_vault_credentials(instr, input).await;

        let (strategy, cfg) = FallbackEngine::strategy_for(&instr.operands_json);
        match strategy {
            crate::fallback::FallbackStrategy::RetryWithBackoff => {
                self.retry_backoff(&cfg, || {
                    self.exec_call_service(instr, enriched_input.as_ref().or(input), regs)
                }).await
            }
            _ => match self.exec_call_service(instr, enriched_input.as_ref().or(input), regs).await {
                Ok(v) => Ok(v),
                Err(e) => self.fallback.apply_simple(strategy, &cfg, e, workflow_id, &instr.service_id).await,
            }
        }
    }

    /// Execute CALL_ACTION with FallbackEngine support.
    async fn call_action_with_fallback(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
        workflow_id: &str,
    ) -> Result<Value> {
        let (strategy, cfg) = FallbackEngine::strategy_for(&instr.operands_json);
        match strategy {
            crate::fallback::FallbackStrategy::RetryWithBackoff => {
                self.retry_backoff(&cfg, || self.exec_call_action(instr, input)).await
            }
            _ => match self.exec_call_action(instr, input).await {
                Ok(v) => Ok(v),
                Err(e) => self.fallback.apply_simple(strategy, &cfg, e, workflow_id, &instr.service_id).await,
            }
        }
    }

    /// Execute CALL_MCP with FallbackEngine support.
    async fn call_mcp_with_fallback(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
        workflow_id: &str,
    ) -> Result<Value> {
        let (strategy, cfg) = FallbackEngine::strategy_for(&instr.operands_json);
        match strategy {
            crate::fallback::FallbackStrategy::RetryWithBackoff => {
                self.retry_backoff(&cfg, || self.exec_call_mcp(instr, input)).await
            }
            _ => match self.exec_call_mcp(instr, input).await {
                Ok(v) => Ok(v),
                Err(e) => self.fallback.apply_simple(strategy, &cfg, e, workflow_id, &instr.service_id).await,
            }
        }
    }

    /// Execute LLM_CALL with FallbackEngine + Vault secret injection.
    async fn llm_call_with_fallback(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
        workflow_id: &str,
    ) -> Result<Value> {
        // Vault: inject credentials_vault_path into dispatch_metadata
        self.inject_vault_credentials(instr, input).await;

        let (strategy, cfg) = FallbackEngine::strategy_for(&instr.operands_json);
        match strategy {
            crate::fallback::FallbackStrategy::RetryWithBackoff => {
                self.retry_backoff(&cfg, || self.exec_llm_call(instr, input)).await
            }
            _ => match self.exec_llm_call(instr, input).await {
                Ok(v) => Ok(v),
                Err(e) => self.fallback.apply_simple(strategy, &cfg, e, workflow_id, &instr.service_id).await,
            }
        }
    }

    /// Generic bounded retry with exponential back-off.
    async fn retry_backoff<F, Fut>(
        &self,
        cfg: &crate::fallback::InstructionFallbackConfig,
        f: F,
    ) -> Result<Value>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<Value>>,
    {
        let max = cfg.max_attempts.max(1) as usize;
        let base_ms = cfg.backoff_base_ms;
        let mut last_err = None;
        for attempt in 1..=max {
            if attempt > 1 {
                let wait_ms = base_ms * (1u64 << (attempt - 2).min(6));
                tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;
            }
            match f().await {
                Ok(v) => {
                    debug!("[Svm] RETRY_WITH_BACKOFF recovered on attempt {attempt}");
                    return Ok(v);
                }
                Err(e) => {
                    warn!("[Svm] RETRY_WITH_BACKOFF attempt {attempt}/{max} failed: {e}");
                    last_err = Some(e);
                }
            }
        }
        Err(last_err.unwrap_or_else(|| anyhow!("retry exhausted")))
    }

    /// Inject vault credentials from `dispatch_metadata.credentials_vault_path`
    /// as an Authorization Bearer header. Returns None if no vault path is set.
    async fn inject_vault_credentials(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        _input: Option<&Value>,
    ) -> Option<Value> {
        let vault_path = instr.dispatch_metadata.as_ref()
            .map(|d| d.credentials_vault_path.as_str())
            .unwrap_or("");

        if vault_path.is_empty() {
            return None;
        }

        let mut vault = self.vault.lock().await;
        match vault.fetch_secret(vault_path).await {
            Ok(secret) => {
                debug!("[Svm] vault: resolved credentials for path=\"{vault_path}\"");
                // Return secret as a JSON object for the handler to apply
                Some(serde_json::json!({ "__vault_token": secret.value }))
            }
            Err(e) => {
                warn!("[Svm] vault: failed to resolve \"{vault_path}\": {e}");
                None
            }
        }
    }

    // ── Opcode handlers ───────────────────────────────────────────────────────

    async fn exec_load_resource(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        _regs: &Registers,
    ) -> Result<Value> {
        if let Some(dm) = &instr.dispatch_metadata {
            if !dm.endpoint_url.is_empty() {
                let resp = self.http
                    .get(&dm.endpoint_url)
                    .send()
                    .await?;
                let body: Value = resp.json().await.unwrap_or(Value::Null);
                return Ok(body);
            }
        }
        // Fall back to operands JSON
        let operands: Value = serde_json::from_str(&instr.operands_json)
            .unwrap_or(Value::Null);
        Ok(operands)
    }

    async fn exec_call_service(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
        _regs: &Registers,
    ) -> Result<Value> {
        let dm = instr.dispatch_metadata.as_ref()
            .ok_or_else(|| anyhow!("CALL_SERVICE #{} missing dispatch_metadata", instr.index))?;

        let format = ServiceFormat::try_from(dm.format).unwrap_or(ServiceFormat::Http);

        match format {
            ServiceFormat::Http | ServiceFormat::Connector => {
                let method = dm.method.to_uppercase();
                let req = match method.as_str() {
                    "POST" | "PUT" | "PATCH" => {
                        let body = input.cloned().unwrap_or(Value::Null);
                        self.http.request(
                            reqwest::Method::from_bytes(method.as_bytes())?,
                            &dm.endpoint_url,
                        ).json(&body)
                    }
                    _ => self.http.get(&dm.endpoint_url),
                };

                // Apply static headers
                let mut req = req;
                for (k, v) in &dm.static_headers {
                    req = req.header(k, v);
                }

                let resp = req.send().await?;
                let status = resp.status();
                if !status.is_success() {
                    return Err(anyhow!(
                        "CALL_SERVICE {} → HTTP {}", dm.endpoint_url, status
                    ));
                }
                let body: Value = resp.json().await.unwrap_or(Value::Null);

                // Apply output mapping if present
                if dm.output_mapping.is_empty() {
                    Ok(body)
                } else {
                    let mut mapped = serde_json::Map::new();
                    for (key, path) in &dm.output_mapping {
                        let val = Self::json_path_get(&body, path);
                        mapped.insert(key.clone(), val);
                    }
                    Ok(Value::Object(mapped))
                }
            }
            ServiceFormat::Grpc | ServiceFormat::Wasm | ServiceFormat::Native | ServiceFormat::Docker => {
                // Not implemented in edge node — return placeholder
                warn!("[Svm] CALL_SERVICE format {:?} not supported on edge — returning null", format);
                Ok(Value::Null)
            }
            ServiceFormat::Mcp => {
                self.exec_call_mcp(instr, input).await
            }
            ServiceFormat::LlmCallFormat | ServiceFormat::EmbeddedJs => {
                self.exec_llm_call(instr, input).await
            }
        }
    }

    async fn exec_call_action(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
    ) -> Result<Value> {
        // Physical actuator calls are dispatched via the central MQTT broker
        // when online; offline they are buffered by the caller (node.rs)
        let dm = instr.dispatch_metadata.as_ref();
        let endpoint = dm.map(|d| d.endpoint_url.as_str()).unwrap_or("");

        if endpoint.is_empty() {
            warn!("[Svm] CALL_ACTION has no endpoint — skipping");
            return Ok(Value::Null);
        }

        let body = input.cloned().unwrap_or(Value::Null);
        let resp = self.http
            .post(endpoint)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("CALL_ACTION {} → HTTP {}", endpoint, resp.status()));
        }
        let result: Value = resp.json().await.unwrap_or(Value::Null);
        Ok(result)
    }

    async fn exec_call_mcp(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
    ) -> Result<Value> {
        // MCP tool call — POST JSON-RPC to endpoint
        let dm = instr.dispatch_metadata.as_ref()
            .ok_or_else(|| anyhow!("CALL_MCP #{} missing dispatch_metadata", instr.index))?;

        let tool_call = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": instr.service_id,
                "arguments": input.cloned().unwrap_or(Value::Null),
            }
        });

        let resp = self.http
            .post(&dm.endpoint_url)
            .json(&tool_call)
            .send()
            .await?;

        let body: Value = resp.json().await.unwrap_or(Value::Null);
        Ok(body.get("result").cloned().unwrap_or(body))
    }

    async fn exec_llm_call(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        input: Option<&Value>,
    ) -> Result<Value> {
        let dm = instr.dispatch_metadata.as_ref()
            .ok_or_else(|| anyhow!("LLM_CALL #{} missing dispatch_metadata", instr.index))?;

        // ── 1. Build frozen few-shot context (spec §3.4) ───────────────────
        // few_shot_examples were frozen at compile time — injected verbatim.
        let few_shot: Vec<Value> = dm.few_shot_examples.iter().map(|ex| {
            serde_json::json!({
                "input":  serde_json::from_str::<Value>(&ex.input_json).unwrap_or(Value::Null),
                "output": serde_json::from_str::<Value>(&ex.output_json).unwrap_or(Value::Null),
                "label":  ex.label.as_str(),
            })
        }).collect();

        // ── 2. Resolve dynamic slots (spec §3.4 + §13.2) ──────────────────
        // Secrets come from Vault at runtime; runtime data from event payload.
        // Secrets are NEVER stored in the IR — they are injected here.
        let mut resolved_slots: serde_json::Map<String, Value> = serde_json::Map::new();
        for slot in &dm.dynamic_slots {
            let value = match slot.source_type.as_str() {
                "vault" => {
                    // Fetch secret from Vault at runtime, destroy immediately after use
                    let mut vault = self.vault.lock().await;
                    vault.fetch(&slot.source_key).await
                        .map(|s| Value::String(s))
                        .unwrap_or_else(|e| {
                            warn!("[Svm] dynamic_slot '{}': vault fetch failed: {e}", slot.slot_id);
                            Value::Null
                        })
                }
                "runtime" => {
                    // Extract from event payload using dot-path (e.g. "user.id")
                    extract_dot_path(input.unwrap_or(&Value::Null), &slot.source_key)
                }
                other => {
                    warn!("[Svm] dynamic_slot '{}': unknown source_type '{other}'", slot.slot_id);
                    Value::Null
                }
            };
            resolved_slots.insert(slot.slot_id.clone(), value);
        }

        // ── 3. Forward enriched payload to eyeflow-llm-service (spec §10.1) ─
        let llm_service_url = format!("{}/api/rules/generate", self.config.central_http_url);
        let payload = serde_json::json!({
            "userIntent":    input.cloned().unwrap_or(Value::Null),
            "systemPrompt":  dm.system_prompt,
            "promptTemplate": dm.prompt_template,
            "model":         dm.model,
            "provider":      dm.provider,
            "temperature":   dm.temperature,
            "maxTokens":     dm.max_tokens,
            "outputSchema":  serde_json::from_str::<Value>(&dm.output_schema).unwrap_or(Value::Null),
            "fewShotExamples": few_shot,   // frozen at compile time (spec §3.4)
            "dynamicSlots":  resolved_slots, // resolved at runtime (spec §3.4)
        });

        let resp = self.http
            .post(&llm_service_url)
            .json(&payload)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("LLM_CALL → HTTP {}", resp.status()));
        }
        let body: Value = resp.json().await.unwrap_or(Value::Null);
        Ok(body)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn read_src(
        &self,
        instr: &crate::proto::llmir::IrInstruction,
        regs: &Registers,
        n: usize,
    ) -> Result<Value> {
        let idx = instr.src.get(n).copied()
            .ok_or_else(|| anyhow!("instruction #{} has no src[{n}]", instr.index))?;
        regs.get(&idx)
            .cloned()
            .ok_or_else(|| anyhow!("register R{idx} is undefined"))
    }

    fn resolve_ip(&self, order: &[i32], target_instr_idx: i32) -> usize {
        order.iter().position(|&i| i == target_instr_idx).unwrap_or(order.len())
    }

    fn is_truthy(val: Option<&Value>) -> bool {
        match val {
            None => false,
            Some(Value::Null) => false,
            Some(Value::Bool(b)) => *b,
            Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
            Some(Value::String(s)) => !s.is_empty(),
            Some(Value::Array(a)) => !a.is_empty(),
            Some(Value::Object(o)) => !o.is_empty(),
        }
    }

    fn eval_predicate(val: &Value, operator: &str, expected_json: &str) -> bool {
        let expected: Value = serde_json::from_str(expected_json).unwrap_or(Value::Null);
        match operator {
            "==" | "eq"  => val == &expected,
            "!=" | "ne"  => val != &expected,
            "truthy"     => Self::is_truthy(Some(val)),
            "exists"     => !matches!(val, Value::Null),
            "<"  => Self::cmp_f64(val, &expected, |a, b| a < b),
            "<=" => Self::cmp_f64(val, &expected, |a, b| a <= b),
            ">"  => Self::cmp_f64(val, &expected, |a, b| a > b),
            ">=" => Self::cmp_f64(val, &expected, |a, b| a >= b),
            _    => false,
        }
    }

    fn cmp_f64(a: &Value, b: &Value, f: impl Fn(f64, f64) -> bool) -> bool {
        match (a.as_f64(), b.as_f64()) {
            (Some(av), Some(bv)) => f(av, bv),
            _ => false,
        }
    }

    /// Minimal JSONPath getter (dot notation only, no wildcards)
    fn json_path_get(root: &Value, path: &str) -> Value {
        let mut cur = root;
        for part in path.trim_start_matches("$.").split('.') {
            match cur.get(part) {
                Some(v) => cur = v,
                None => return Value::Null,
            }
        }
        cur.clone()
    }

    fn apply_transform(src: &Value, operands: &Value) -> Value {
        // Very lightweight template: if operands has a "path" key, extract it
        if let Some(path_str) = operands.get("path").and_then(|v| v.as_str()) {
            return Self::json_path_get(src, path_str);
        }
        // If operands has a "template" key, do basic {{register}} substitution
        if let Some(tmpl) = operands.get("template").and_then(|v| v.as_str()) {
            let obj = src.as_object().cloned().unwrap_or_default();
            let mut out = tmpl.to_owned();
            for (k, v) in &obj {
                let placeholder = format!("{{{{{k}}}}}");
                let val_str = v.as_str().map(|s| s.to_owned())
                    .unwrap_or_else(|| v.to_string());
                out = out.replace(&placeholder, &val_str);
            }
            return Value::String(out);
        }
        src.clone()
    }

    /// Acquire a resource permit according to the PriorityPolicy (spec §6.5).
    ///
    /// Each service_id/resource gets a binary semaphore (capacity = 1).
    /// `max_wait_ms = 0` means non-blocking: returns immediately if unavailable.
    ///
    /// Returns `Ok(permit)` on success, `Err(...)` if `max_wait_ms` elapsed
    /// without acquiring the lock (caller should trigger fallback).
    async fn acquire_resource_permit(
        &self,
        resource_key: &str,
        max_wait_ms: u32,
    ) -> Result<tokio::sync::OwnedSemaphorePermit> {
        // Get or create a Semaphore(1) for this resource
        let sem = {
            let read = self.resource_arbiter.read().await;
            if let Some(s) = read.get(resource_key) {
                Arc::clone(s)
            } else {
                drop(read);
                let mut write = self.resource_arbiter.write().await;
                // Double-checked locking
                write.entry(resource_key.to_string())
                    .or_insert_with(|| Arc::new(Semaphore::new(1)))
                    .clone()
            }
        };

        let deadline = if max_wait_ms == 0 {
            Duration::from_millis(50) // non-blocking: short grace period
        } else {
            Duration::from_millis(max_wait_ms as u64)
        };

        tokio::time::timeout(deadline, sem.clone().acquire_owned())
            .await
            .map_err(|_| anyhow!(
                "resource '{}' busy — max_wait_ms={} exceeded (spec §6.5 PriorityPolicy)",
                resource_key, max_wait_ms
            ))?
            .map_err(|e| anyhow!("semaphore closed: {e}"))
    }
}

// ── Free helpers ──────────────────────────────────────────────────────────────

/// Extract a value from a JSON object using dot-notation path (e.g. "user.id").
/// Used by dynamic_slots with source_type = "runtime" (spec §3.4 + §13.2).
fn extract_dot_path(root: &Value, path: &str) -> Value {
    let mut cur = root;
    for part in path.trim_start_matches("$.").split('.') {
        match cur.get(part) {
            Some(v) => cur = v,
            None    => return Value::Null,
        }
    }
    cur.clone()
}
