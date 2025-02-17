#!/bin/bash

# Add your custom file patterns
CUSTOM_PATTERNS=(
    "*.swp"       # Vim swap files
    "*.swo"       # Vim swap files
    "*.DS_Store"  # Mac files
    "*.idea"      # IntelliJ files
)

# Add custom size limits
MAX_FILE_SIZE="10M"  # Change to your preferred limit

# Add custom directories to ignore
IGNORE_DIRS=(
    "node_modules"
    "dist"
    "build"
    ".git"
)

# Generate ignore patterns for find command
IGNORE_PATTERN=$(printf " -not -path '*/%s/*'" "${IGNORE_DIRS[@]}")

# Update the find command in pre-commit hook
sed -i '' "s|find . -type f -size.*|find . -type f -size +$MAX_FILE_SIZE $IGNORE_PATTERN|g" .git/hooks/pre-commit 

# Create a test script
cat > test-hook.sh << 'EOF'
#!/bin/bash

echo "🧪 Testing pre-commit hook..."

# Test 1: Create empty directory
mkdir empty_test_dir
echo "Testing empty directory detection..."
git add .
git commit -m "test commit"  # Should fail

# Test 2: Create temp file
touch test.tmp
echo "Testing temporary file detection..."
git add .
git commit -m "test commit"  # Should fail

# Test 3: Create fake .env
echo "SECRET=test" > .env
echo "Testing .env detection..."
git add .
git commit -m "test commit"  # Should fail

# Cleanup
rm -rf empty_test_dir test.tmp .env
echo "🧹 Cleanup complete"
EOF

chmod +x test-hook.sh 

# Method 1: Direct installation
chmod +x .git/hooks/pre-commit

# Method 2: Version controlled installation
mkdir -p .github/hooks
mv .git/hooks/pre-commit .github/hooks/
ln -s ../../.github/hooks/pre-commit .git/hooks/pre-commit 

# Define colors for better visibility in terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check 1: Empty Directories
EMPTY_DIRS=$(find . -type d -empty -not -path "*/\.*" -not -path "*/node_modules/*")
# This finds:
# - All empty directories (type d and empty)
# - Excludes hidden directories (*/\.*)
# - Excludes node_modules

# Check 2: Temporary Files
TEMP_FILES=$(find . -type f \( -name "*.tmp" -o -name "*.log" -o -name "*.bak" \))
if [ ! -z "$TEMP_FILES" ]; then  # If $TEMP_FILES is not empty
    echo -e "${RED}Error: Temporary files found:${NC}"
    echo "$TEMP_FILES"
    exit 1  # Exit with error, preventing commit
fi

# Check 3: Large Files
LARGE_FILES=$(find . -type f -size +$MAX_FILE_SIZE $IGNORE_PATTERN)
if [ ! -z "$LARGE_FILES" ]; then  # If $LARGE_FILES is not empty
    echo -e "${RED}Error: Large files found:${NC}"
    echo "$LARGE_FILES"
    exit 1  # Exit with error, preventing commit
fi

# Check 4: .env Files
ENV_FILES=$(find . -type f -name ".env")
if [ ! -z "$ENV_FILES" ]; then  # If $ENV_FILES is not empty
    echo -e "${RED}Error: .env files found:${NC}"
    echo "$ENV_FILES"
    exit 1  # Exit with error, preventing commit
fi

# If all checks pass:
echo -e "${GREEN}All checks passed!${NC}"
exit 0  # Exit with success, allowing commit to proceed 

# Add to pre-commit hook
# Check for proper file naming
check_file_naming() {
    local files=$(git diff --cached --name-only)
    local invalid_files=()
    
    for file in $files; do
        if [[ ! $file =~ ^[a-zA-Z0-9_\-\/\.]+$ ]]; then
            invalid_files+=($file)
        fi
    done
    
    if [ ${#invalid_files[@]} -ne 0 ]; then
        echo -e "${RED}Error: Invalid file names found:${NC}"
        printf '%s\n' "${invalid_files[@]}"
        exit 1
    fi
}

# Check file permissions
check_permissions() {
    local script_files=$(find . -type f -name "*.sh")
    local invalid_perms=()
    
    for file in $script_files; do
        if [ ! -x "$file" ]; then
            invalid_perms+=($file)
        fi
    done
    
    if [ ${#invalid_perms[@]} -ne 0 ]; then
        echo -e "${YELLOW}Warning: Script files without execute permission:${NC}"
        printf '%s\n' "${invalid_perms[@]}"
        echo "Fixing permissions..."
        chmod +x "${invalid_perms[@]}"
    fi
} 