import { TestRunner } from './test-runner';
import { getTestsByCategory } from './test-matrix';
import { TestDataGenerator } from './test-data-generator';

describe('Helsinki Authentication Tests', () => {
    let testRunner: TestRunner;
    let testData: TestDataGenerator;

    beforeAll(() => {
        testRunner = new TestRunner();
        testData = new TestDataGenerator();
    });

    describe('Basic Authentication', () => {
        const authTests = getTestsByCategory('AUTH');

        authTests.forEach(testCase => {
            it(`${testCase.id}: ${testCase.scenario}`, async () => {
                const result = await testRunner.runTest(testCase);
                expect(result.actualCode).toBe(testCase.resultCode);
                expect(result.actualResult).toBe(testCase.expectedResult);
            });
        });
    });

    describe('Multi-IdP Authentication', () => {
        const multiIdpTests = getTestsByCategory('IDP');

        multiIdpTests.forEach(testCase => {
            it(`${testCase.id}: ${testCase.scenario}`, async () => {
                const result = await testRunner.runTest(testCase);
                expect(result.actualCode).toBe(testCase.resultCode);
                expect(result.actualResult).toBe(testCase.expectedResult);
            });
        });
    });
}); 