#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Function to display menu
show_menu() {
    echo "DIVE25 Test Suite - v1.0.0"
    echo "----------------------------------------"
    echo "PROJECT SNOOZE CONTROL" 
    echo "----------------------------------------"
    echo "1) Run all tests"
    echo "2) Run tests with coverage report"
    echo "3) Run specific test suite"
    echo "4) View latest test report"
    echo "5) Exit"
    echo
}

# Add to package.json: 