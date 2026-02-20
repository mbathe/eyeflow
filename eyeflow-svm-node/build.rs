fn main() {
    // Compile llm_ir.proto so the SVM can decode LLM-IR binary artifacts
    // sent by the NestJS central node via WebSocket TLS (spec §8.2).
    prost_build::compile_protos(
        &["proto/llm_ir.proto"],
        &["proto/"],
    )
    .expect("prost_build failed — ensure proto/llm_ir.proto exists");
}
