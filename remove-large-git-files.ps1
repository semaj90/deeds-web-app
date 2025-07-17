# PowerShell script to remove large files from git history using git filter-repo (no Java required)
# Make sure you have git-filter-repo installed: pip install git-filter-repo

# Step 1: Remove large DLLs from git history
git filter-repo --path web-app/Ollama/lib/ollama/cuda_v12/ggml-cuda.dll --invert-paths
git filter-repo --path web-app/Ollama/lib/ollama/cuda_v12/cublasLt64_12.dll --invert-paths
git filter-repo --path web-app/Ollama/lib/ollama/cuda_v12/cublas64_12.dll --invert-paths

# Step 2: Clean up git history
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Step 3: Force push to remote
Write-Host "About to force push to origin/main. This will rewrite history."
git push --force
