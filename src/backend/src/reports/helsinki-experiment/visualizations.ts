import { ChartJS } from 'chart.js';
import { TestResult } from '../../__tests__/helsinki/types';

export class HelsinkiVisualizations {
    private results: TestResult[];
    private charts: Map<string, ChartJS> = new Map();

    constructor(results: TestResult[]) {
        this.results = results;
    }

    generateAllVisualizations() {
        this.createSuccessRateDonut();
        this.createCategoryBreakdownBar();
        this.createTimeSeriesLine();
        this.createRiskMatrix();
        this.createPerformanceHeatmap();
    }

    private createSuccessRateDonut() {
        const data = {
            labels: ['Success', 'Denied', 'Limited', 'Audit'],
            datasets: [{
                data: this.calculateResultDistribution(),
                backgroundColor: [
                    '#4CAF50', // Success - Green
                    '#F44336', // Denied - Red
                    '#FFC107', // Limited - Yellow
                    '#2196F3'  // Audit - Blue
                ]
            }]
        };

        this.charts.set('successRate', new ChartJS('successRateChart', {
            type: 'doughnut',
            data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Test Results Distribution'
                    }
                }
            }
        }));
    }

    private createRiskMatrix() {
        // Implementation of risk matrix scatter plot
    }

    private createPerformanceHeatmap() {
        // Implementation of performance heatmap
    }

    exportCharts(format: 'PNG' | 'PDF' | 'SVG' = 'PNG') {
        this.charts.forEach((chart, name) => {
            chart.toFile(`${name}.${format.toLowerCase()}`);
        });
    }
} 