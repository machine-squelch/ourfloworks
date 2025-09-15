/**
 * Commission Visualizer - Generate Charts for Discrepancies
 * 
 * Creates visual representations of commission shortfalls by state and product type
 */

class CommissionVisualizer {
    constructor() {
        this.chartColors = {
            shouldBePaid: '#00ffff',    // Cyan - what should be paid
            wasPaid: '#ff6b6b',        // Red - what was actually paid
            shortfall: '#ff4757',      // Bright red - shortfall amount
            newProduct: '#2ed573',     // Green - new product commission
            repeatProduct: '#ffa502',  // Orange - repeat product commission
            tierBonus: '#3742fa'       // Blue - tier bonus
        };
    }

    /**
     * Generate all visualization data
     * @param {Object} verificationResults - Results from commission verifier
     * @returns {Object} Chart data for frontend
     */
    generateVisualizationData(verificationResults) {
        const visualizations = {
            stateComparison: this.createStateComparisonChart(verificationResults),
            productTypeBreakdown: this.createProductTypeChart(verificationResults),
            shortfallAnalysis: this.createShortfallChart(verificationResults),
            tierAnalysis: this.createTierAnalysisChart(verificationResults),
            summary: this.createSummaryMetrics(verificationResults)
        };

        return visualizations;
    }

    /**
     * Create state-by-state comparison chart
     * @param {Object} results - Verification results
     * @returns {Object} Chart data
     */
    createStateComparisonChart(results) {
        const states = Object.keys(results.shouldBePaid.stateBreakdown);
        
        const chartData = {
            type: 'bar',
            title: 'Commission Comparison by State',
            subtitle: 'Should Be Paid vs Was Paid',
            data: {
                labels: states,
                datasets: [
                    {
                        label: 'Should Be Paid',
                        data: states.map(state => 
                            results.shouldBePaid.stateBreakdown[state].totalCommission
                        ),
                        backgroundColor: this.chartColors.shouldBePaid,
                        borderColor: this.chartColors.shouldBePaid,
                        borderWidth: 1
                    },
                    {
                        label: 'Was Paid',
                        data: states.map(state => 
                            results.breakdown.stateComparison[state]?.wasPaid || 0
                        ),
                        backgroundColor: this.chartColors.wasPaid,
                        borderColor: this.chartColors.wasPaid,
                        borderWidth: 1
                    },
                    {
                        label: 'Shortfall',
                        data: states.map(state => 
                            results.breakdown.stateComparison[state]?.difference || 0
                        ),
                        backgroundColor: this.chartColors.shortfall,
                        borderColor: this.chartColors.shortfall,
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Commission Discrepancies by State'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Commission Amount ($)'
                        }
                    }
                }
            }
        };

        return chartData;
    }

    /**
     * Create product type breakdown chart
     * @param {Object} results - Verification results
     * @returns {Object} Chart data
     */
    createProductTypeChart(results) {
        const states = Object.keys(results.shouldBePaid.stateBreakdown);
        
        const chartData = {
            type: 'bar',
            title: 'Commission by Product Type',
            subtitle: 'New vs Repeat Product Commission by State',
            data: {
                labels: states,
                datasets: [
                    {
                        label: 'New Product Commission',
                        data: states.map(state => 
                            results.shouldBePaid.stateBreakdown[state].newCommission
                        ),
                        backgroundColor: this.chartColors.newProduct,
                        borderColor: this.chartColors.newProduct,
                        borderWidth: 1
                    },
                    {
                        label: 'Repeat Product Commission',
                        data: states.map(state => 
                            results.shouldBePaid.stateBreakdown[state].repeatCommission
                        ),
                        backgroundColor: this.chartColors.repeatProduct,
                        borderColor: this.chartColors.repeatProduct,
                        borderWidth: 1
                    },
                    {
                        label: 'Tier Bonus',
                        data: states.map(state => 
                            results.shouldBePaid.stateBreakdown[state].tierBonus
                        ),
                        backgroundColor: this.chartColors.tierBonus,
                        borderColor: this.chartColors.tierBonus,
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Commission Breakdown by Product Type'
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Commission Amount ($)'
                        }
                    }
                }
            }
        };

        return chartData;
    }

    /**
     * Create shortfall analysis chart
     * @param {Object} results - Verification results
     * @returns {Object} Chart data
     */
    createShortfallChart(results) {
        const discrepancies = results.breakdown.discrepancies;
        
        if (discrepancies.length === 0) {
            return {
                type: 'message',
                title: 'No Discrepancies Found',
                message: 'All commission payments appear to be correct.'
            };
        }

        const chartData = {
            type: 'doughnut',
            title: 'Commission Shortfall Analysis',
            subtitle: `Total Shortfall: $${results.shortfall.toFixed(2)}`,
            data: {
                labels: discrepancies.map(d => `${d.state} (${d.type})`),
                datasets: [{
                    data: discrepancies.map(d => d.amount),
                    backgroundColor: discrepancies.map(d => 
                        d.type === 'underpaid' ? this.chartColors.shortfall : this.chartColors.wasPaid
                    ),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Shortfall Distribution by State'
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        };

        return chartData;
    }

    /**
     * Create tier analysis chart
     * @param {Object} results - Verification results
     * @returns {Object} Chart data
     */
    createTierAnalysisChart(results) {
        const stateData = results.shouldBePaid.stateBreakdown;
        const tierData = {};

        // Group states by tier
        Object.entries(stateData).forEach(([state, data]) => {
            if (!tierData[data.tier]) {
                tierData[data.tier] = {
                    states: [],
                    totalRevenue: 0,
                    totalCommission: 0,
                    count: 0
                };
            }
            tierData[data.tier].states.push(state);
            tierData[data.tier].totalRevenue += data.totalRevenue;
            tierData[data.tier].totalCommission += data.totalCommission;
            tierData[data.tier].count += 1;
        });

        const tiers = Object.keys(tierData);
        
        const chartData = {
            type: 'bar',
            title: 'Commission by Revenue Tier',
            subtitle: 'Revenue and Commission by Tier Level',
            data: {
                labels: tiers,
                datasets: [
                    {
                        label: 'Total Revenue',
                        data: tiers.map(tier => tierData[tier].totalRevenue),
                        backgroundColor: this.chartColors.shouldBePaid,
                        borderColor: this.chartColors.shouldBePaid,
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Total Commission',
                        data: tiers.map(tier => tierData[tier].totalCommission),
                        backgroundColor: this.chartColors.newProduct,
                        borderColor: this.chartColors.newProduct,
                        borderWidth: 1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Revenue vs Commission by Tier'
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Revenue ($)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Commission ($)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                }
            }
        };

        return chartData;
    }

    /**
     * Create summary metrics
     * @param {Object} results - Verification results
     * @returns {Object} Summary data
     */
    createSummaryMetrics(results) {
        const stateData = results.shouldBePaid.stateBreakdown;
        const totalStates = Object.keys(stateData).length;
        const underpaidStates = results.breakdown.discrepancies.filter(d => d.type === 'underpaid').length;
        
        return {
            totalShortfall: results.shortfall,
            shortfallPercentage: results.shortfallPercentage,
            totalStates: totalStates,
            underpaidStates: underpaidStates,
            correctStates: totalStates - underpaidStates,
            totalRevenue: Object.values(stateData).reduce((sum, state) => sum + state.totalRevenue, 0),
            totalCommissionDue: results.shouldBePaid.totalCommission,
            totalCommissionPaid: results.wasPaid,
            averageShortfallPerState: underpaidStates > 0 ? results.shortfall / underpaidStates : 0,
            worstState: this.findWorstState(results.breakdown.discrepancies),
            bestPerformingTier: this.findBestTier(stateData)
        };
    }

    /**
     * Find the state with the largest shortfall
     * @param {Array} discrepancies - Discrepancy data
     * @returns {Object} Worst state info
     */
    findWorstState(discrepancies) {
        if (discrepancies.length === 0) return null;
        
        const worst = discrepancies.reduce((max, current) => 
            current.amount > max.amount ? current : max
        );
        
        return {
            state: worst.state,
            shortfall: worst.amount,
            type: worst.type
        };
    }

    /**
     * Find the best performing tier
     * @param {Object} stateData - State breakdown data
     * @returns {Object} Best tier info
     */
    findBestTier(stateData) {
        const tierTotals = {};
        
        Object.values(stateData).forEach(state => {
            if (!tierTotals[state.tier]) {
                tierTotals[state.tier] = { revenue: 0, commission: 0, count: 0 };
            }
            tierTotals[state.tier].revenue += state.totalRevenue;
            tierTotals[state.tier].commission += state.totalCommission;
            tierTotals[state.tier].count += 1;
        });

        const bestTier = Object.entries(tierTotals).reduce((best, [tier, data]) => {
            const rate = data.commission / data.revenue;
            const bestRate = best.data.commission / best.data.revenue;
            return rate > bestRate ? { tier, data } : best;
        });

        return {
            tier: bestTier.tier,
            averageRate: ((bestTier.data.commission / bestTier.data.revenue) * 100).toFixed(2),
            totalRevenue: bestTier.data.revenue,
            totalCommission: bestTier.data.commission,
            stateCount: bestTier.data.count
        };
    }
}

module.exports = CommissionVisualizer;

