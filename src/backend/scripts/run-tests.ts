import { spawn } from 'child_process';
import open from 'open';
import ora from 'ora';
import chalk from 'chalk';

async function runTests() {
    const spinner = ora('Running tests...').start();

    try {
        // Run tests with coverage
        const testProcess = spawn('npm', ['run', 'test:coverage'], {
            stdio: 'inherit'
        });

        await new Promise((resolve, reject) => {
            testProcess.on('close', code => {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(new Error(`Tests failed with code ${code}`));
                }
            });
        });

        spinner.succeed('Tests completed successfully!');

        // Open coverage report
        await open('coverage/lcov-report/index.html');

    } catch (error) {
        spinner.fail('Tests failed');
        console.error(error);
        process.exit(1);
    }
}

runTests(); 