
// Populate summary cards
document.addEventListener('DOMContentLoaded', function() {
    // Format numbers as Brazilian Real
    function formatCurrency(num) {
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    document.getElementById('saldoFinalValue').textContent = formatCurrency(totals.saldo_final_total);
    document.getElementById('saldoInicialValue').textContent = formatCurrency(totals.saldo_inicial_total);
    document.getElementById('variacaoValue').textContent = formatCurrency(totals.variacao_total);

    // Initialize Chart.js line chart
    const ctx = document.getElementById('lineChart').getContext('2d');
    const lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: chartDatasets
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#c9d1d9'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.parsed.y;
                            return context.dataset.label + ': ' + value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#c9d1d9'
                    },
                    grid: {
                        color: '#21262d'
                    }
                },
                y: {
                    ticks: {
                        color: '#c9d1d9',
                        callback: function(value) {
                            return 'R$ ' + value.toLocaleString('pt-BR');
                        }
                    },
                    grid: {
                        color: '#21262d'
                    }
                }
            }
        }
    });

    // Populate details table
    const tableBody = document.querySelector('#detailsTable tbody');
    detailsTable.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.empresa}</td>
            <td>${row.periodo}</td>
            <td>R$ ${row.saldo_final.toLocaleString('pt-BR')}</td>
            <td>R$ ${row.variacao.toLocaleString('pt-BR')}</td>
            <td>${row.variacao_percent.toLocaleString('pt-BR')}%</td>
        `;
        tableBody.appendChild(tr);
    });

    // Initialize DataTable
    $('#detailsTable').DataTable({
        pageLength: 10,
        order: [[1, 'asc']],
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json'
        }
    });
});
