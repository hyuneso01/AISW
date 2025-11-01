(function () {
  const STORAGE_KEY = 'fra_records';

  /** DOM refs */
  const form = document.getElementById('company-form');
  const recordIdEl = document.getElementById('record-id');
  const nameEl = document.getElementById('company-name');
  const caEl = document.getElementById('current-assets');
  const clEl = document.getElementById('current-liabilities');
  const tdEl = document.getElementById('total-debt');
  const eqEl = document.getElementById('equity');
  const currentRatioEl = document.getElementById('current-ratio');
  const debtRatioEl = document.getElementById('debt-ratio');
  const resetBtn = document.getElementById('reset-btn');
  const tbody = document.getElementById('records-body');

  /** Chart refs */
  let currentRatioChart;
  let debtRatioChart;

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function calcCurrentRatio(currentAssets, currentLiabilities) {
    if (currentLiabilities === 0) return currentAssets > 0 ? 999.9 : 0.0; // avoid div-by-zero
    return round1((currentAssets / currentLiabilities) * 100);
  }

  function calcDebtRatio(totalDebt, equity) {
    if (equity === 0) return totalDebt > 0 ? 999.9 : 0.0;
    return round1((totalDebt / equity) * 100);
  }

  function readFormValues() {
    const currentAssets = toNumber(caEl.value);
    const currentLiabilities = toNumber(clEl.value);
    const totalDebt = toNumber(tdEl.value);
    const equity = toNumber(eqEl.value);
    const currentRatio = calcCurrentRatio(currentAssets, currentLiabilities);
    const debtRatio = calcDebtRatio(totalDebt, equity);
    return {
      id: recordIdEl.value || undefined,
      name: nameEl.value.trim(),
      currentAssets,
      currentLiabilities,
      totalDebt,
      equity,
      currentRatio,
      debtRatio,
    };
  }

  function setFormValues(record) {
    recordIdEl.value = record?.id || '';
    nameEl.value = record?.name || '';
    caEl.value = record?.currentAssets ?? '';
    clEl.value = record?.currentLiabilities ?? '';
    tdEl.value = record?.totalDebt ?? '';
    eqEl.value = record?.equity ?? '';
    updateDerived();
  }

  function updateDerived() {
    const { currentAssets, currentLiabilities, totalDebt, equity, currentRatio, debtRatio } = readFormValues();
    currentRatioEl.textContent = currentRatio.toFixed(1);
    debtRatioEl.textContent = debtRatio.toFixed(1);
    updateCharts({ currentAssets, currentLiabilities, totalDebt, equity });
  }

  function getAll() {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return [];
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveAll(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function upsert(record) {
    const records = getAll();
    if (record.id) {
      const idx = records.findIndex(r => r.id === record.id);
      if (idx >= 0) {
        records[idx] = record;
      } else {
        records.push(record);
      }
    } else {
      record.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      records.push(record);
    }
    saveAll(records);
    return record.id;
  }

  function removeById(id) {
    const records = getAll();
    const next = records.filter(r => r.id !== id);
    saveAll(next);
  }

  function renderTable() {
    const records = getAll();
    if (records.length === 0) {
      tbody.innerHTML = '<tr><td class="empty" colspan="11">데이터가 없습니다. 상단 폼에서 추가하세요.</td></tr>';
      return;
    }

    tbody.innerHTML = records.map(r => `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.name)}</td>
        <td class="num">${fmtNum(r.currentAssets)}</td>
        <td class="num">${fmtNum(r.currentLiabilities)}</td>
        <td class="num">${fmtNum(r.totalDebt)}</td>
        <td class="num">${fmtNum(r.equity)}</td>
        <td class="num">${r.currentRatio.toFixed(1)}%</td>
        <td class="num">${r.debtRatio.toFixed(1)}%</td>
        <td>${investmentDecision(r.currentRatio, r.debtRatio)}</td>
        <td>${shortTermInvestment(r.currentRatio, r.debtRatio)}</td>
        <td>${longTermInvestment(r.currentRatio, r.debtRatio)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="edit" class="primary">수정</button>
            <button type="button" data-action="delete" class="danger">삭제</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function investmentDecision(currentRatio, debtRatio) {
    // 위험-투자 부적합 : 유동비율 ≤ 100%
    if (currentRatio <= 100) return '위험-투자 부적합';
    // 주의-투자 신중 : 유동비율 > 200% AND 부채비율 > 100%
    if (currentRatio > 200 && debtRatio > 100) return '주의-투자 신중';
    // 주의-투자 신중 : 유동비율 > 100% AND 부채비율 > 50%
    if (currentRatio > 100 && debtRatio > 50) return '주의-투자 신중';
    // 가능-투자 적합 : 유동비율 > 200% AND 부채비율 ≤ 100%
    if (currentRatio > 200 && debtRatio <= 100) return '가능-투자 적합';
    // 가능-투자 적합 : 유동비율 > 100% AND 부채비율 ≤ 50%
    if (currentRatio > 100 && debtRatio <= 50) return '가능-투자 적합';
    return '';
  }

  // Helper: 유동비율 위험/보통/안정
  function liquidityLevel(currentRatio) {
    if (currentRatio <= 100) return '위험';
    if (currentRatio <= 200) return '보통';
    return '안정';
  }
  // Helper: 부채비율 위험/보통/안정
  function debtLevel(debtRatio) {
    if (debtRatio > 100) return '위험';
    if (debtRatio > 50) return '보통';
    return '안정';
  }

  // 표 기반으로 판단 문자열/아이콘
  function shortTermInvestment(currentRatio, debtRatio) {
    const l = liquidityLevel(currentRatio);
    const d = debtLevel(debtRatio);
    // 매칭 표
    if (l === '위험' && d === '위험') return '❌ 불가';
    if (l === '위험' && d === '보통') return '❌ 불가';
    if (l === '위험' && d === '안정') return '❌ 불가';
    if (l === '보통' && d === '위험') return '⚠️ 신중';
    if (l === '보통' && d === '보통') return '⚠️ 신중';
    if (l === '보통' && d === '안정') return '✅ 가능';
    if (l === '안정' && d === '위험') return '✅ 가능';
    if (l === '안정' && d === '보통') return '✅ 가능';
    if (l === '안정' && d === '안정') return '✅ 가능';
    return '';
  }

  function longTermInvestment(currentRatio, debtRatio) {
    const l = liquidityLevel(currentRatio);
    const d = debtLevel(debtRatio);
    if (l === '위험' && d === '위험') return '❌ 불가';
    if (l === '위험' && d === '보통') return '⚠️ 신중';
    if (l === '위험' && d === '안정') return '⚠️ 신중';
    if (l === '보통' && d === '위험') return '⚠️ 신중';
    if (l === '보통' && d === '보통') return '⚠️ 신중';
    if (l === '보통' && d === '안정') return '⚠️ 신중';
    if (l === '안정' && d === '위험') return '⚠️ 신중';
    if (l === '안정' && d === '보통') return '✅ 가능';
    if (l === '안정' && d === '안정') return '✅ 가능';
    return '';
  }

  function fmtNum(n) {
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n ?? 0);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]+/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function initCharts() {
    const crx = document.getElementById('currentRatioChart');
    const drx = document.getElementById('debtRatioChart');

    currentRatioChart = new Chart(crx, {
      type: 'doughnut',
      data: {
        labels: ['유동자산', '유동부채'],
        datasets: [{ data: [0, 0], backgroundColor: ['#22c55e', '#ef4444'] }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } } }
    });

    debtRatioChart = new Chart(drx, {
      type: 'doughnut',
      data: {
        labels: ['총부채', '자본'],
        datasets: [{ data: [0, 0], backgroundColor: ['#f59e0b', '#3b82f6'] }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } } }
    });
  }

  function updateCharts({ currentAssets, currentLiabilities, totalDebt, equity }) {
    if (currentRatioChart) {
      currentRatioChart.data.datasets[0].data = [currentAssets, currentLiabilities];
      currentRatioChart.update();
    }
    if (debtRatioChart) {
      debtRatioChart.data.datasets[0].data = [totalDebt, equity];
      debtRatioChart.update();
    }
  }

  function clearForm() {
    setFormValues({
      id: '', name: '', currentAssets: '', currentLiabilities: '', totalDebt: '', equity: ''
    });
  }

  // Event bindings
  ['input', 'change'].forEach(evt => {
    [caEl, clEl, tdEl, eqEl, nameEl].forEach(el => el.addEventListener(evt, updateDerived));
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const record = readFormValues();
    if (!record.name) {
      alert('회사명을 입력하세요.');
      return;
    }
    record.id = record.id || undefined;
    const id = upsert(record);
    recordIdEl.value = id;
    renderTable();
  });

  resetBtn.addEventListener('click', function () {
    clearForm();
  });

  tbody.addEventListener('click', function (e) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // Handle clicks on the row itself
    const tr = target.closest('tr');
    if (!tr) return;
    const id = tr.getAttribute('data-id');
    if (!id) return;

    // If a row is clicked, treat it as an edit action
    if (target === tr || tr.contains(target) && !target.hasAttribute('data-action')) { // Added condition to check if target is tr or child, but not an action button
      editRecord(id);
      return;
    }

    const action = target.getAttribute('data-action');
    if (!action) return;

    if (action === 'edit') {
      editRecord(id);
    } else if (action === 'delete') {
      if (confirm('삭제하시겠습니까?')) {
        removeById(id);
        if (recordIdEl.value === id) clearForm();
        renderTable();
      }
    }
  });

  function editRecord(id) {
    const records = getAll();
    const found = records.find(r => r.id === id);
    if (found) setFormValues(found);
  }

  // init
  initCharts();
  renderTable();
  const initialRecords = getAll();
  if (initialRecords.length > 0) {
    setFormValues(initialRecords[0]);
  } else {
    updateDerived();
  }
})();


