(function(root) {
  'use strict';
  const DAY = 86400000;
  const RANGE_DAYS = { '30d': 30, '3m': 90, '6m': 180, '1y': 365 };
  const RANGE_LABELS = { '30d': '最近30天', '3m': '最近3个月（90天）', '6m': '最近6个月（180天）', '1y': '最近1年（365天）', all: '全部记录' };
  // Date-only values use UTC arithmetic to avoid time zone and daylight-saving drift.
  function dayNumber(date) { return Date.parse(date + 'T00:00:00Z') / DAY; }
  function shiftDate(date, days) { return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10); }
  function number(value) {
    if (value == null || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  function average(values) {
    const valid = values.map(number).filter(value => value != null);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }
  function ratio(row, field) {
    const value = number(row[field]);
    const weight = number(row.weight);
    return value != null && weight > 0 ? value / weight * 100 : null;
  }
  function inWindow(data, start, end) { return data.filter(row => row.date >= start && row.date <= end); }
  function filterRange(data, range, today) {
    return inWindow(data, range === 'all' ? '0000-01-01' : shiftDate(today, 1 - RANGE_DAYS[range]), today);
  }
  function weightWeek(data, end) {
    const rows = inWindow(data, shiftDate(end, -6), end).filter(row => number(row.weight) != null);
    return { value: average(rows.map(row => row.weight)), count: rows.length };
  }
  function weeklyWeight(data, end) {
    const current = weightWeek(data, end);
    const previous = weightWeek(data, shiftDate(end, -7));
    return { current, previous, change: current.value != null && previous.value != null ? current.value - previous.value : null };
  }
  function movingWeight(data) {
    const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date));
    let start = 0, sum = 0, count = 0;
    return sorted.map((row, index) => {
      const value = number(row.weight);
      if (value != null) { sum += value; count++; }
      const cutoff = shiftDate(row.date, -6);
      while (start < index && sorted[start].date < cutoff) {
        const expired = number(sorted[start++].weight);
        if (expired != null) { sum -= expired; count--; }
      }
      return { ...row, weight7d: count ? sum / count : null };
    });
  }
  function monthChange(data, latest, field) {
    const getValue = row => field === 'bf' ? ratio(row, 'fat') : number(row[field]);
    const value = getValue(latest);
    const target = shiftDate(latest.date, -30);
    // Prefer the 30-day baseline; allow at most seven days earlier, and disclose its date.
    const candidates = inWindow(data, shiftDate(target, -7), target)
      .filter(row => getValue(row) != null).sort((a, b) => b.date.localeCompare(a.date));
    const baseline = candidates[0];
    return value != null && baseline ? { change: value - getValue(baseline), date: baseline.date } : null;
  }
  function workoutMonth(data, month) {
    const types = ['有氧', '无氧'].map(type => ({
      type,
      count: new Set(data.filter(row => row.date.slice(0, 7) === month && row.type === type).map(row => row.date)).size
    }));
    return { count: types.reduce((sum, item) => sum + item.count, 0), types };
  }
  function csvCell(value) {
    let text = value == null ? '' : String(value);
    // Quoting alone does not stop spreadsheet formula execution in free-text fields.
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function toCsv(headers, rows) {
    return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  const api = { RANGE_LABELS, number, shiftDate, average, ratio, filterRange, weeklyWeight, movingWeight, monthChange, workoutMonth, toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HealthStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
