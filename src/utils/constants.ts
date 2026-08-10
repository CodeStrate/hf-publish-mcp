import { homedir } from "node:os";
import { join } from "node:path";

const HF_MCP_DIR = process.env.HF_MCP_DIR ?? join(homedir(), ".hf_mcp");
const JOBS_FILE = join(HF_MCP_DIR, "hf-mcp-jobs.json");

const REQUIRED_FILES = [
  "config.json",
  "tokenizer_config.json",
  "tokenizer.json",
] as const;

const MODEL_WEIGHTS = [
  ".safetensors", // includes mlx too
  ".gguf",
  ".pt", // pytorch
  ".bin" //old format compatibility
]

const LORA_UNSLOTH_PYTHON_SCRIPT = 
`
import sys
from unsloth import FastLanguageModel

try:
    if len(sys.argv) != 5:
        sys.stderr.write("Usage: script.py <base_model> <adapter_source> <output_dir> <hf_token>\n")
        sys.exit(1)

    base_model, adapter_source, output_dir, hf_token = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

    print(f"Loading model from {adapter_source}...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=adapter_source,
        token=hf_token,
    )

    print(f"Merging and saving to {output_dir}...")
    model.save_pretrained_merged(
        output_dir,
        tokenizer,
        save_method="merged_16bit",
    )

    print("Successfully merged and saved.")
    sys.exit(0)
except Exception as e:
    sys.stderr.write(f"Error: {str(e)}\n")
    sys.exit(1)
`;

const LORA_PEFT_PYTHON_SCRIPT = 
`
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

try:
    if len(sys.argv) != 5:
        sys.stderr.write("Usage: script.py <base_model> <adapter_source> <output_dir> <hf_token>\n")
        sys.exit(1)

    base_model, adapter_source, output_dir, hf_token = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

    print(f"Loading base model from {base_model}...")
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.bfloat16,
        token=hf_token,
    )

    print(f"Loading adapter from {adapter_source}...")
    model = PeftModel.from_pretrained(model, adapter_source, token=hf_token)

    print("Merging adapter into base model...")
    model = model.merge_and_unload()

    print(f"Saving to {output_dir}...")
    model.save_pretrained(output_dir)
    AutoTokenizer.from_pretrained(adapter_source, token=hf_token).save_pretrained(output_dir)

    print("Successfully merged and saved.")
    sys.exit(0)
except Exception as e:
    sys.stderr.write(f"Error: {str(e)}\n")
    sys.exit(1)
`;

export {
    HF_MCP_DIR,
    JOBS_FILE,
    MODEL_WEIGHTS,
    REQUIRED_FILES,
    LORA_UNSLOTH_PYTHON_SCRIPT,
    LORA_PEFT_PYTHON_SCRIPT
}