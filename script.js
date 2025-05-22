let maintenanceData = [
            { tag: 'EQ-001', entrada: '2024-01-15', previsao: '2024-01-17', motivo: 'Manutenção Preventiva', turma: 'A', status: 'Em Andamento' },
            { tag: 'EQ-002', entrada: '2024-01-16', previsao: '2024-01-18', motivo: 'Falha Mecânica', turma: 'B', status: 'Concluído' },
            { tag: 'EQ-003', entrada: '2024-01-16', previsao: '2024-01-19', motivo: 'Manutenção Corretiva', turma: 'C', status: 'Em Andamento' },
            { tag: 'EQ-004', entrada: '2024-01-17', previsao: '2024-01-20', motivo: 'Troca de Peças', turma: 'D', status: 'Planejado' },
            { tag: 'EQ-005', entrada: '2024-01-17', previsao: '2024-01-18', motivo: 'Manutenção Preventiva', turma: 'A', status: 'Em Andamento' },
            { tag: 'EQ-006', entrada: '2024-01-18', previsao: '2024-01-21', motivo: 'Falha Elétrica', turma: 'B', status: 'Em Andamento' },
        ];

        let selectedTurma = 'Todos';
        let turmaChart, motivoChart;
        let firebaseReady = false;

        // Inicialização
        document.addEventListener('DOMContentLoaded', function() {
            updateDateTime();
            setupEventListeners();
            initializeFirebase();
            updateDashboard();
        });

        function updateDateTime() {
            const now = new Date();
            document.getElementById('currentDate').textContent = now.toLocaleDateString('pt-BR');
            document.getElementById('currentDateTime').textContent = now.toLocaleString('pt-BR');
        }

        function setupEventListeners() {
            document.getElementById('turmaSelect').addEventListener('change', function(e) {
                selectedTurma = e.target.value;
                updateDashboard();
            });

            document.getElementById('fileInput').addEventListener('change', handleFileUpload);
        }

        async function initializeFirebase() {
            try {
                // Aguarda o Firebase estar disponível
                let attempts = 0;
                while (!window.firebase && attempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                if (window.firebase) {
                    firebaseReady = true;
                    updateFirebaseStatus('Conectado ao Firebase', 'firebase-connected');
                    await loadDataFromFirebase();
                } else {
                    throw new Error('Firebase não carregou');
                }
            } catch (error) {
                console.error('Erro ao conectar com Firebase:', error);
                updateFirebaseStatus('Erro de conexão - Modo offline', 'firebase-error');
            }
        }

        function updateFirebaseStatus(message, className) {
            const statusDiv = document.getElementById('firebaseStatus');
            statusDiv.innerHTML = message;
            statusDiv.className = `firebase-status ${className}`;
        }

        async function loadDataFromFirebase() {
            if (!firebaseReady) return;

            try {
                const { db, doc, getDoc } = window.firebase;
                const docRef = doc(db, 'maintenance', 'current-data');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    maintenanceData = data.equipments || [];
                    updateDashboard();
                    console.log('Dados carregados do Firebase:', maintenanceData.length, 'equipamentos');
                }
            } catch (error) {
                console.error('Erro ao carregar dados do Firebase:', error);
            }
        }

        async function saveDataToFirebase(data) {
            if (!firebaseReady) return;

            try {
                const { db, doc, setDoc } = window.firebase;
                const docRef = doc(db, 'maintenance', 'current-data');
                
                await setDoc(docRef, {
                    equipments: data,
                    lastUpdate: new Date().toISOString(),
                    updatedBy: 'Dashboard'
                });
                
                console.log('Dados salvos no Firebase:', data.length, 'equipamentos');
                updateFirebaseStatus('Dados salvos no Firebase', 'firebase-connected');
            } catch (error) {
                console.error('Erro ao salvar no Firebase:', error);
                updateFirebaseStatus('Erro ao salvar - Dados locais', 'firebase-error');
            }
        }

        function parseExcelDate(excelDate) {
            if (!excelDate) return null;
            
            // Se já é uma string de data válida
            if (typeof excelDate === 'string') {
                // Tenta vários formatos
                const formats = [
                    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
                    /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
                    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
                ];
                
                for (let format of formats) {
                    if (format.test(excelDate)) {
                        let date;
                        if (excelDate.includes('/')) {
                            const [day, month, year] = excelDate.split('/');
                            date = new Date(year, month - 1, day);
                        } else if (excelDate.includes('-')) {
                            if (excelDate.indexOf('-') === 4) {
                                // YYYY-MM-DD
                                date = new Date(excelDate);
                            } else {
                                // DD-MM-YYYY
                                const [day, month, year] = excelDate.split('-');
                                date = new Date(year, month - 1, day);
                            }
                        }
                        
                        if (date && !isNaN(date.getTime())) {
                            return date.toISOString().split('T')[0];
                        }
                    }
                }
            }
            
            // Se é um número (data serial do Excel)
            if (typeof excelDate === 'number') {
                // Excel data serial (dias desde 1900-01-01, com correção para bug do Excel)
                const excelEpoch = new Date(1900, 0, 1);
                const days = excelDate - 2; // Correção para o bug do Excel com anos bissextos
                const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
                return date.toISOString().split('T')[0];
            }
            
            // Tenta converter diretamente
            try {
                const date = new Date(excelDate);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0];
                }
            } catch (e) {
                console.warn('Não foi possível converter a data:', excelDate);
            }
            
            return null;
        }

        async function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            updateFirebaseStatus('Processando arquivo...', 'firebase-connected');

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { raw: false });
                    
                    console.log('Dados brutos do Excel:', json);
                    
                    maintenanceData = json.map(row => {
                        // Normaliza os nomes das colunas (remove espaços e converte para lowercase)
                        const normalizedRow = {};
                        Object.keys(row).forEach(key => {
                            const normalizedKey = key.trim().toLowerCase()
                                .replace(/ã/g, 'a')
                                .replace(/ç/g, 'c')
                                .replace(/[áàâ]/g, 'a')
                                .replace(/[éêë]/g, 'e')
                                .replace(/[íî]/g, 'i')
                                .replace(/[óôõ]/g, 'o')
                                .replace(/[úû]/g, 'u');
                            normalizedRow[normalizedKey] = row[key];
                        });

                        const entrada = parseExcelDate(
                            normalizedRow.entrada || 
                            normalizedRow.data_entrada || 
                            normalizedRow['data entrada'] ||
                            row.Entrada || 
                            row['Data Entrada'] ||
                            row.entrada
                        );

                        const previsao = parseExcelDate(
                            normalizedRow.previsao || 
                            normalizedRow.previsão || 
                            normalizedRow.data_previsao ||
                            normalizedRow['data previsao'] ||
                            row.Previsao || 
                            row.Previsão || 
                            row['Data Previsão'] ||
                            row.previsao
                        );

                        return {
                            tag: normalizedRow.tag || row.Tag || row.tag || '',
                            entrada: entrada,
                            previsao: previsao,
                            motivo: normalizedRow.motivo || row.Motivo || row.motivo || 'Não informado',
                            turma: (normalizedRow.turma || row.Turma || row.turma || '').toString().toUpperCase(),
                            status: normalizedRow.status || row.Status || row.status || 'Em Andamento'
                        };
                    }).filter(item => item.tag); // Remove itens sem tag
                    
                    console.log('Dados processados:', maintenanceData);
                    
                    // Salva no Firebase
                    await saveDataToFirebase(maintenanceData);
                    
                    updateDashboard();
                    updateFirebaseStatus(`${maintenanceData.length} equipamentos carregados`, 'firebase-connected');
                    
                } catch (error) {
                    console.error('Erro ao processar arquivo:', error);
                    updateFirebaseStatus('Erro ao processar arquivo', 'firebase-error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function getFilteredData() {
            return selectedTurma === 'Todos' 
                ? maintenanceData 
                : maintenanceData.filter(item => item.turma === selectedTurma);
        }

        function calculateMetrics() {
            const filteredData = getFilteredData();
            const hoje = new Date();
            
            return {
                total: filteredData.length,
                emAndamento: filteredData.filter(item => item.status === 'Em Andamento').length,
                concluidas: filteredData.filter(item => item.status === 'Concluído').length,
                atrasadas: filteredData.filter(item => {
                    if (!item.previsao || item.status === 'Concluído') return false;
                    const previsao = new Date(item.previsao);
                    return previsao < hoje;
                }).length
            };
        }

        function updateMetrics() {
            const metrics = calculateMetrics();
            
            document.getElementById('totalEquipamentos').textContent = metrics.total;
            document.getElementById('emAndamento').textContent = metrics.emAndamento;
            document.getElementById('concluidas').textContent = metrics.concluidas;
            document.getElementById('atrasadas').textContent = metrics.atrasadas;
            
            document.getElementById('statusEmAndamento').textContent = metrics.emAndamento;
            document.getElementById('statusConcluido').textContent = metrics.concluidas;
            document.getElementById('statusAtrasado').textContent = metrics.atrasadas;
        }

        function formatDate(dateString) {
            if (!dateString) return 'N/A';
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return 'Data inválida';
                return date.toLocaleDateString('pt-BR');
            } catch (e) {
                return 'Data inválida';
            }
        }

        function updateTable() {
            const filteredData = getFilteredData();
            const tbody = document.getElementById('equipmentTable');
            
            tbody.innerHTML = filteredData.map(item => `
                <tr>
                    <td><strong>${item.tag || 'N/A'}</strong></td>
                    <td>${formatDate(item.entrada)}</td>
                    <td>${formatDate(item.previsao)}</td>
                    <td>${item.motivo || 'Não informado'}</td>
                    <td><span class="badge badge-blue">Turma ${item.turma || 'N/A'}</span></td>
                    <td>
                        <span class="badge ${
                            item.status === 'Concluído' ? 'badge-green' :
                            item.status === 'Em Andamento' ? 'badge-yellow' :
                            'badge-red'
                        }">${item.status || 'N/A'}</span>
                    </td>
                </tr>
            `).join('');
        }

        function updateCharts() {
            updateTurmaChart();
            updateMotivoChart();
        }

        function updateTurmaChart() {
            const turmaData = ['A', 'B', 'C', 'D'].map(turma => {
                const turmaItems = maintenanceData.filter(item => item.turma === turma);
                return {
                    turma: `Turma ${turma}`,
                    total: turmaItems.length,
                    emAndamento: turmaItems.filter(item => item.status === 'Em Andamento').length
                };
            });

            const ctx = document.getElementById('turmaChart').getContext('2d');
            if (turmaChart) turmaChart.destroy();

            turmaChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: turmaData.map(item => item.turma),
                    datasets: [
                        {
                            label: 'Total',
                            data: turmaData.map(item => item.total),
                            backgroundColor: '#8884d8',
                            borderRadius: 4
                        },
                        {
                            label: 'Em Andamento',
                            data: turmaData.map(item => item.emAndamento),
                            backgroundColor: '#ffc658',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        }

        function updateMotivoChart() {
            const motivoCount = {};
            maintenanceData.forEach(item => {
                const motivo = item.motivo || 'Não informado';
                motivoCount[motivo] = (motivoCount[motivo] || 0) + 1;
            });

            const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];
            const pieData = Object.entries(motivoCount).map(([motivo, count], index) => ({
                label: motivo,
                value: count,
                color: colors[index % colors.length]
            }));

            const ctx = document.getElementById('motivoChart').getContext('2d');
            if (motivoChart) motivoChart.destroy();

            motivoChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: pieData.map(item => item.label),
                    datasets: [{
                        data: pieData.map(item => item.value),
                        backgroundColor: pieData.map(item => item.color),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        function updateDashboard() {
            updateMetrics();
            updateTable();
            updateCharts();
        }
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBQnJn4nA1mYvl5mLPTpNX9RuXYGlUDqFI",
  authDomain: "dadosmanutencao-f8eff.firebaseapp.com",
  projectId: "dadosmanutencao-f8eff",
  storageBucket: "dadosmanutencao-f8eff.firebasestorage.app",
  messagingSenderId: "371447178949",
  appId: "1:371447178949:web:d9c417481eee8d5c9bf2ac",
  measurementId: "G-J2Q8M53TL6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);