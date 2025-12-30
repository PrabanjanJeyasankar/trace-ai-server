"""
Configuration for RAGAS evaluation LLM selection.
Supports multiple LLM providers based on environment variables.
"""

import os
from typing import Literal

# Supported LLM providers
LLMProvider = Literal["ollama", "openai"]


class EvalConfig:
    """Configuration class for evaluation LLM settings."""
    
    def __init__(self):
        # API endpoints
        self.node_api_url = os.getenv("NODE_API_URL", "http://localhost:8000/api/v1")
        self.eval_api_key = os.getenv("EVAL_API_KEY", "")
        
        # LLM Provider selection (default to ollama if not specified)
        self.llm_provider: LLMProvider = os.getenv("EVAL_LLM_PROVIDER", "ollama").lower()
        
        # Ollama Configuration
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
        
        # OpenAI Configuration
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.openai_temperature = float(os.getenv("OPENAI_TEMPERATURE", "0"))
        
    def validate(self) -> tuple[bool, str]:
        """
        Validate configuration based on selected provider.
        
        Returns:
            tuple[bool, str]: (is_valid, error_message)
        """
        if not self.eval_api_key:
            return False, "EVAL_API_KEY is required"
        
        if self.llm_provider == "ollama":
            if not self.ollama_base_url:
                return False, "OLLAMA_BASE_URL is required when using Ollama"
            if not self.ollama_model:
                return False, "OLLAMA_MODEL is required when using Ollama"
        elif self.llm_provider == "openai":
            if not self.openai_api_key:
                return False, "OPENAI_API_KEY is required when using OpenAI"
            if not self.openai_model:
                return False, "OPENAI_MODEL is required when using OpenAI"
        else:
            return False, f"Unsupported LLM provider: {self.llm_provider}. Use 'ollama' or 'openai'"
        
        return True, ""
    
    def get_provider_info(self) -> str:
        """Get formatted string with current provider information."""
        if self.llm_provider == "ollama":
            return f"Ollama ({self.ollama_model}) at {self.ollama_base_url}"
        elif self.llm_provider == "openai":
            return f"OpenAI ({self.openai_model})"
        return f"Unknown provider: {self.llm_provider}"


# Global config instance
config = EvalConfig()
