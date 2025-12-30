import json
import os
from typing import List
from datetime import datetime
import requests
from ragas import evaluate
from ragas.metrics import (
    context_precision,
    context_recall,
    faithfulness,
    answer_relevancy,
)
from datasets import Dataset
from langchain_community.chat_models import ChatOllama
from langchain_openai import ChatOpenAI

from config import config


def load_dataset(filepath: str) -> List[dict]:
    # Check if file is JSONL format
    if filepath.endswith('.jsonl'):
        with open(filepath, "r") as f:
            return [json.loads(line) for line in f if line.strip()]
    else:
        with open(filepath, "r") as f:
            return json.load(f)


def call_rag_api(mode: str, query: str) -> dict:
    headers = {"X-API-Key": config.eval_api_key}
    payload = {"mode": mode, "query": query}
    
    response = requests.post(
        f"{config.node_api_url}/eval/query",
        json=payload,
        headers=headers,
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["data"]


def get_llm_instance():
    """
    Get LLM instance based on configuration.
    
    Returns:
        ChatOllama or ChatOpenAI instance based on EVAL_LLM_PROVIDER env variable.
    """
    if config.llm_provider == "ollama":
        print(f"   Using Ollama: {config.ollama_base_url} / {config.ollama_model}")
        return ChatOllama(
            base_url=config.ollama_base_url,
            model=config.ollama_model,
            temperature=0,
        )
    elif config.llm_provider == "openai":
        print(f"   Using OpenAI: {config.openai_model}")
        return ChatOpenAI(
            api_key=config.openai_api_key,
            model=config.openai_model,
            temperature=config.openai_temperature,
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {config.llm_provider}")


def run_evaluation(mode: str, dataset_path: str) -> None:
    print(f"\n{'='*60}")
    print(f"RAGAS Evaluation: {mode.upper()} mode")
    print(f"{'='*60}\n")
    
    dataset = load_dataset(dataset_path)
    
    eval_samples = []
    
    for idx, sample in enumerate(dataset, 1):
        # Support both formats: 'id' for JSON and generated ID for JSONL
        sample_id = sample.get('id', f"query_{idx}")
        print(f"[{idx}/{len(dataset)}] Processing: {sample_id}")
        
        try:
            # For JSONL collected queries, skip API call since we already have the data
            if 'retrieved_contexts' in sample and 'response' in sample:
                result = sample
            else:
                result = call_rag_api(mode, sample["user_input"])
            
            eval_samples.append({
                "question": sample["user_input"],
                "contexts": result["retrieved_contexts"],
                "answer": result["response"],
                "ground_truth": sample["reference"],
            })
            
            print(f"  ✓ Retrieved {len(result['retrieved_contexts'])} contexts")
            
        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
            continue
    
    if not eval_samples:
        print("\n❌ No samples to evaluate")
        return
    
    print(f"\n📊 Running Ragas metrics on {len(eval_samples)} samples...")
    print(f"   LLM Provider: {config.get_provider_info()}")
    
    llm = get_llm_instance()
    
    ragas_dataset = Dataset.from_list(eval_samples)
    
    results = evaluate(
        ragas_dataset,
        metrics=[
            context_precision,
            context_recall,
            faithfulness,
            answer_relevancy,
        ],
        llm=llm,
    )
    
    print(f"\n{'='*60}")
    print(f"RESULTS: {mode.upper()} mode")
    print(f"{'='*60}")
    print(f"Context Precision:  {results['context_precision']:.2%}")
    print(f"Context Recall:     {results['context_recall']:.2%}")
    print(f"Faithfulness:       {results['faithfulness']:.2%}")
    print(f"Answer Relevancy:   {results['answer_relevancy']:.2%}")
    print(f"{'='*60}\n")
    
    save_results(mode, results, eval_samples)


def save_results(mode: str, metrics: dict, samples: List[dict]) -> None:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"results/{mode}_eval_{timestamp}.json"
    
    output = {
        "timestamp": timestamp,
        "mode": mode,
        "metrics": {
            "context_precision": float(metrics["context_precision"]),
            "context_recall": float(metrics["context_recall"]),
            "faithfulness": float(metrics["faithfulness"]),
            "answer_relevancy": float(metrics["answer_relevancy"]),
        },
        "sample_count": len(samples),
        "samples": samples,
    }
    
    with open(filename, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"💾 Results saved to: {filename}")


def main() -> None:
    import argparse
    
    parser = argparse.ArgumentParser(description="Run Ragas evaluation")
    parser.add_argument(
        "--mode",
        choices=["news", "law", "both"],
        default="both",
        help="Evaluation mode",
    )
    
    args = parser.parse_args()
    
    # Validate configuration
    is_valid, error_msg = config.validate()
    if not is_valid:
        print(f"❌ Configuration Error: {error_msg}")
        print("\n💡 Make sure to set the required environment variables:")
        print("   - EVAL_API_KEY (required)")
        print("   - EVAL_LLM_PROVIDER (default: ollama)")
        if config.llm_provider == "ollama":
            print("   - OLLAMA_BASE_URL (default: http://127.0.0.1:11434)")
            print("   - OLLAMA_MODEL (default: llama3.1:8b)")
        elif config.llm_provider == "openai":
            print("   - OPENAI_API_KEY (required)")
            print("   - OPENAI_MODEL (default: gpt-4o-mini)")
        return
    
    print(f"\n🔧 Configuration:")
    print(f"   LLM Provider: {config.llm_provider}")
    print(f"   Details: {config.get_provider_info()}")
    print(f"   API Endpoint: {config.node_api_url}")
    
    if args.mode in ["news", "both"]:
        run_evaluation("news", "datasets/news_eval.json")
    
    if args.mode in ["law", "both"]:
        run_evaluation("law", "datasets/collected_queries.jsonl")
    
    print("\n✅ Evaluation complete!")


if __name__ == "__main__":
    main()
