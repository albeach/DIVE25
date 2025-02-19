// Simple build location validation
const path = require('path');
const fs = require('fs');

const buildDir = path.join(__dirname, '..', 'dist');

// Check if we're in the correct directory
if (!fs.existsSync(path.join(__dirname, '..', 'package.json'))) {
    console.error('Error: Build must be run from the project root directory');
    process.exit(1);
}

// Create build directory if it doesn't exist
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

console.log('Build location validated'); 