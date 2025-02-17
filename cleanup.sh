#!/bin/bash

echo "🧹 Cleaning up DIVE25 repository..."

# Remove empty directories
echo "Removing empty directories..."
find . -type d -empty -delete

# Remove temporary files
echo "Removing temporary files..."
find . -name "*.tmp" -o -name "*.log" -o -name "*.bak" -delete

# Remove old build artifacts
echo "Removing build artifacts..."
rm -rf dist/
rm -rf build/
rm -rf node_modules/

# Remove old scripts
echo "Removing deprecated scripts..."
rm -rf old_scripts/
rm -rf deprecated/

# Clean Docker artifacts
echo "Cleaning Docker artifacts..."
docker system prune -f

echo "✨ Cleanup complete!"
