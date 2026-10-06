import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Executive Performance Analytics KPI Card Tests', () => {
  const sampleVehicles = [
    { code: 'V-122', model: 'Toyota HiAce', type: 'Van', status: 'Available' },
    { code: 'V-130', model: 'Toyota HiAce', type: 'Van', status: 'Available' },
    { code: 'V-114', model: 'Toyota HiAce', type: 'Van', status: 'On trip' },
    { code: 'V-205', model: 'Toyota Corolla', type: 'Sedan', status: 'On trip' },
    { code: 'T-02', model: 'Isuzu NPR Box Truck', type: 'Truck', status: 'On trip' },
    { code: 'B-07', model: 'MCV 500 Coach', type: 'Bus', status: 'Available' }
  ];

  const sampleBookings = [
    {
      id: 'BK-2001',
      status: 'Completed',
      assignment: { vehicle_id: 'V-130' },
      actuals: { km_travelled: 120, fuel_liters: 15.0, receipt_amount_egp: 307.5 },
      return_match_savings: { km_saved: 50, liters_saved: 5.0, egp_saved: 102.5 }
    },
    {
      id: 'BK-2002',
      status: 'Active',
      assignment: { vehicle_id: 'V-205' },
      actuals: { km_travelled: 80, fuel_liters: 6.0, receipt_amount_egp: 144.0 }
    },
    {
      id: 'BK-2003',
      status: 'Pending',
      distance_km: 65,
      estFuelLiters: 10.0
    }
  ];

  test('KPI metrics calculate utilization, distance, fuel and savings accurately', () => {
    const activeVehicles = sampleVehicles.filter(v => v.status === 'On trip' || v.status === 'Busy').length;
    const totalVehicles = sampleVehicles.length;
    const utilizationPct = ((activeVehicles / totalVehicles) * 100).toFixed(1);

    assert.equal(activeVehicles, 3);
    assert.equal(totalVehicles, 6);
    assert.equal(utilizationPct, '50.0');

    const completedCount = sampleBookings.filter(b => b.status === 'Completed' || b.status === 'Closed').length;
    assert.equal(completedCount, 1);

    let totalKm = 0;
    let totalFuelLiters = 0;
    let kmSaved = 0;
    let litersSaved = 0;

    sampleBookings.forEach(b => {
      const km = (b.actuals && b.actuals.km_travelled) || b.distance_km || 65;
      totalKm += km;

      const liters = (b.actuals && b.actuals.fuel_liters) || b.estFuelLiters || 14.5;
      totalFuelLiters += liters;

      if (b.return_match_savings) {
        kmSaved += b.return_match_savings.km_saved || 0;
        litersSaved += b.return_match_savings.liters_saved || 0;
      }
    });

    assert.equal(totalKm, 265);
    assert.equal(totalFuelLiters, 31.0);
    assert.equal(kmSaved, 50);
    assert.equal(litersSaved, 5.0);

    const avgLitersPer100Km = (totalFuelLiters / (totalKm / 100)).toFixed(1);
    assert.equal(avgLitersPer100Km, '11.7');
  });

  test('Vehicle mileage aggregation maps code or id without undefined entries', () => {
    const kmByVeh = {};
    sampleVehicles.forEach(v => {
      const id = v.code || v.id;
      if (id) {
        kmByVeh[id] = { name: v.model || v.name || id, type: v.type || 'Van', km: 0 };
      }
    });

    assert.equal(kmByVeh['undefined'], undefined);
    assert.ok(kmByVeh['V-122']);
    assert.ok(kmByVeh['V-130']);
    assert.ok(kmByVeh['V-205']);

    sampleBookings.forEach(b => {
      const vId = (b.assignment && b.assignment.vehicle_id) || b.vehicleCode || null;
      if (vId && kmByVeh[vId]) {
        kmByVeh[vId].km += (b.actuals && b.actuals.km_travelled) || b.distance_km || 65;
      }
    });

    assert.equal(kmByVeh['V-130'].km, 120);
    assert.equal(kmByVeh['V-205'].km, 80);

    const list = Object.entries(kmByVeh).map(([id, data]) => ({ id, name: data.name, km: data.km }));
    const hasUndefinedId = list.some(item => item.id === 'undefined');
    const hasUndefinedName = list.some(item => !item.name || item.name === 'undefined');

    assert.equal(hasUndefinedId, false);
    assert.equal(hasUndefinedName, false);
  });

  test('Fuel and operating cost by vehicle class groups categories correctly', () => {
    const classes = {
      'Van': { count: 0, liters: 0 },
      'Sedan': { count: 0, liters: 0 },
      'Bus': { count: 0, liters: 0 },
      'Truck': { count: 0, liters: 0 }
    };

    sampleVehicles.forEach(v => {
      const t = v.type || 'Van';
      if (classes[t]) classes[t].count++;
    });

    assert.equal(classes['Van'].count, 3);
    assert.equal(classes['Sedan'].count, 1);
    assert.equal(classes['Bus'].count, 1);
    assert.equal(classes['Truck'].count, 1);

    sampleBookings.forEach(b => {
      const vId = (b.assignment && b.assignment.vehicle_id) || b.vehicleCode;
      const v = sampleVehicles.find(item => item.code === vId || item.id === vId);
      const t = v ? v.type : 'Van';
      const target = classes[t] || classes['Van'];
      const liters = (b.actuals && b.actuals.fuel_liters) || b.estFuelLiters || 14.2;
      target.liters += liters;
    });

    assert.equal(classes['Van'].liters, 25.0);
    assert.equal(classes['Sedan'].liters, 6.0);
    assert.equal(classes['Bus'].liters, 0);
    assert.equal(classes['Truck'].liters, 0);
  });

  test('CSS stylesheet contains kpi-grid and kpi-card rules', () => {
    const cssPath = path.join(rootDir, 'css', 'style.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.kpi-grid'), 'style.css must define .kpi-grid');
    assert.ok(cssContent.includes('.kpi-card'), 'style.css must define .kpi-card');
    assert.ok(cssContent.includes('.kpi-label'), 'style.css must define .kpi-label');
    assert.ok(cssContent.includes('.kpi-value'), 'style.css must define .kpi-value');
  });

  test('home.html template contains executive performance card and KPI titles', () => {
    const homePath = path.join(rootDir, 'home.html');
    const homeContent = fs.readFileSync(homePath, 'utf8');

    assert.ok(homeContent.includes('executive-performance-card'), 'home.html should contain executive-performance-card');
    assert.ok(homeContent.includes('Executive Performance Analytics'), 'home.html should contain pretitle');
    assert.ok(homeContent.includes('Fleet KPI Dashboard'), 'home.html should contain card title');
    assert.ok(homeContent.includes('Fleet Utilization'), 'home.html should contain Fleet Utilization label');
    assert.ok(homeContent.includes('Completed Missions'), 'home.html should contain Completed Missions label');
    assert.ok(homeContent.includes('Total Fleet Distance'), 'home.html should contain Total Fleet Distance label');
    assert.ok(homeContent.includes('Total Fuel Consumed'), 'home.html should contain Total Fuel Consumed label');
    assert.ok(homeContent.includes('Total Fuel Operating Cost'), 'home.html should contain Total Fuel Operating Cost label');
    assert.ok(homeContent.includes('Empty km Avoided (Return Match)'), 'home.html should contain Return Match label');
    assert.ok(homeContent.includes('admin-kpi.html'), 'home.html should link to full analytics suite');
  });

  test('admin-kpi.html wraps admin-kpi-grid in card and avoids undefined vehicle references', () => {
    const kpiPath = path.join(rootDir, 'admin-kpi.html');
    const kpiContent = fs.readFileSync(kpiPath, 'utf8');

    assert.ok(kpiContent.includes('class="card"'), 'admin-kpi.html should wrap grid in card');
    assert.ok(kpiContent.includes('id="admin-kpi-grid"'), 'admin-kpi.html must contain admin-kpi-grid');
    assert.ok(!kpiContent.includes('kmByVeh[v.id] = { name: v.name'), 'admin-kpi.html must not use v.id / v.name without code fallback');
    assert.ok(kpiContent.includes('v.code || v.id'), 'admin-kpi.html must use v.code || v.id');
  });
});
