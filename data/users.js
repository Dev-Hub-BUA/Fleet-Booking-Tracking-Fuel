(function () {
  'use strict';

  const DEMO_USERS = {
    requesters: [
      {
        id: 'USR-REQ-101',
        name: 'Demo Requester 1',
        role: 'Requester',
        dept: 'Faculty of Pharmacy',
        cost_center: 'CC-101',
        email: 'demo.requester1@example.com',
        phone: '+20 000 000 0000',
        initials: 'DR'
      },
      {
        id: 'USR-REQ-102',
        name: 'Demo Requester 2',
        role: 'Requester',
        dept: 'Faculty of Physical Therapy',
        cost_center: 'CC-102',
        email: 'demo.requester2@example.com',
        phone: '+20 000 000 0000',
        initials: 'DR'
      },
      {
        id: 'USR-REQ-103',
        name: 'Demo Requester 3',
        role: 'Requester',
        dept: 'Faculty of Engineering',
        cost_center: 'CC-103',
        email: 'demo.requester3@example.com',
        phone: '+20 000 000 0000',
        initials: 'DR'
      }
    ],
    dispatchers: [
      {
        id: 'USR-DSP-204',
        name: 'Demo Ops Manager',
        role: 'Dispatcher',
        dept: 'Logistics Command Desk',
        cost_center: 'CC-201',
        email: 'demo.ops@example.com',
        phone: '+20 000 000 0000',
        initials: 'DO'
      }
    ],
    drivers: [
      {
        id: 'D-101',
        name: 'Demo Driver 01',
        role: 'Driver',
        home_site_id: 'SITE-BUA',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0001',
        expires: '2028-03-15',
        status: 'Available',
        totalTrips: 412,
        allowedVehicles: ['Sedan', 'Van', 'Minibus'],
        phone: '+20 000 000 0000',
        email: 'demo.driver01@example.com',
        initials: 'DD'
      },
      {
        id: 'D-102',
        name: 'Demo Driver 02',
        role: 'Driver',
        home_site_id: 'SITE-BUC',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0002',
        expires: '2027-11-20',
        status: 'Available',
        totalTrips: 345,
        allowedVehicles: ['Sedan', 'Van', 'Minibus'],
        phone: '+20 000 000 0000',
        email: 'demo.driver02@example.com',
        initials: 'DD'
      },
      {
        id: 'D-103',
        name: 'Demo Driver 03',
        role: 'Driver',
        home_site_id: 'SITE-BUC',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0003',
        expires: '2027-08-10',
        status: 'Available',
        totalTrips: 520,
        allowedVehicles: ['Sedan', 'Van', 'Minibus'],
        phone: '+20 000 000 0000',
        email: 'demo.driver03@example.com',
        initials: 'DD'
      },
      {
        id: 'D-104',
        name: 'Demo Driver 04',
        role: 'Driver',
        home_site_id: 'SITE-BUC',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0004',
        expires: '2026-09-15',
        status: 'Off Duty (Expired)',
        totalTrips: 288,
        allowedVehicles: ['Sedan', 'Van'],
        phone: '+20 000 000 0000',
        email: 'demo.driver04@example.com',
        initials: 'DD'
      },
      {
        id: 'D-105',
        name: 'Demo Driver 05',
        role: 'Driver',
        home_site_id: 'SITE-BUA',
        licenseClass: 'Class 3 (Private)',
        licenseNo: 'LIC-DEMO-0005',
        expires: '2029-01-18',
        status: 'Available',
        totalTrips: 180,
        allowedVehicles: ['Sedan only'],
        phone: '+20 000 000 0000',
        email: 'demo.driver05@example.com',
        initials: 'DD'
      },
      {
        id: 'D-106',
        name: 'Demo Driver 06',
        role: 'Driver',
        home_site_id: 'SITE-HQ',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0006',
        expires: '2027-05-30',
        status: 'Available',
        totalTrips: 390,
        allowedVehicles: ['Sedan', 'Van', 'Minibus'],
        phone: '+20 000 000 0000',
        email: 'demo.driver06@example.com',
        initials: 'DD'
      },
      {
        id: 'D-107',
        name: 'Demo Driver 07',
        role: 'Driver',
        home_site_id: 'SITE-ALEX',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0007',
        expires: '2028-09-12',
        status: 'Available',
        totalTrips: 210,
        allowedVehicles: ['Sedan', 'Van', 'CNG'],
        phone: '+20 000 000 0000',
        email: 'demo.driver07@example.com',
        initials: 'DD'
      },
      {
        id: 'D-108',
        name: 'Demo Driver 08',
        role: 'Driver',
        home_site_id: 'SITE-BUC',
        licenseClass: 'Class 1 (Professional 1st)',
        licenseNo: 'LIC-DEMO-0008',
        expires: '2027-12-05',
        status: 'Available',
        totalTrips: 640,
        allowedVehicles: ['Bus', 'Heavy Coach', 'Van', 'Sedan'],
        phone: '+20 000 000 0000',
        email: 'demo.driver08@example.com',
        initials: 'DD'
      },
      {
        id: 'D-109',
        name: 'Demo Driver 09',
        role: 'Driver',
        home_site_id: 'SITE-BUC',
        licenseClass: 'Class 1 (Professional 1st)',
        licenseNo: 'LIC-DEMO-0009',
        expires: '2028-04-22',
        status: 'Available',
        totalTrips: 480,
        allowedVehicles: ['Truck', 'Van', 'Heavy Cargo'],
        phone: '+20 000 000 0000',
        email: 'demo.driver09@example.com',
        initials: 'DD'
      },
      {
        id: 'D-110',
        name: 'Demo Driver 10',
        role: 'Driver',
        home_site_id: 'SITE-BUC',
        licenseClass: 'Class 1 (Professional 1st)',
        licenseNo: 'LIC-DEMO-0010',
        expires: '2028-07-14',
        status: 'Suspended: Incident Triage',
        totalTrips: 310,
        allowedVehicles: ['Bus', 'Van'],
        phone: '+20 000 000 0000',
        email: 'demo.driver10@example.com',
        initials: 'DD'
      },
      {
        id: 'D-111',
        name: 'Demo Driver 11',
        role: 'Driver',
        home_site_id: 'SITE-BUA',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0011',
        expires: '2028-10-10',
        status: 'Available',
        totalTrips: 150,
        allowedVehicles: ['Sedan', 'Van'],
        phone: '+20 000 000 0000',
        email: 'demo.driver11@example.com',
        initials: 'DD'
      },
      {
        id: 'D-112',
        name: 'Demo Driver 12',
        role: 'Driver',
        home_site_id: 'SITE-ALEX',
        licenseClass: 'Class 2 (Professional 2nd)',
        licenseNo: 'LIC-DEMO-0012',
        expires: '2029-04-01',
        status: 'Available',
        totalTrips: 195,
        allowedVehicles: ['Sedan', 'Van'],
        phone: '+20 000 000 0000',
        email: 'demo.driver12@example.com',
        initials: 'DD'
      }
    ],
    fleetAdmins: [
      {
        id: 'USR-ADM-401',
        name: 'Demo Fleet Admin',
        role: 'Fleet admin',
        dept: 'Fleet Operations Directorate',
        cost_center: 'CC-301',
        email: 'demo.admin@example.com',
        phone: '+20 000 000 0000',
        initials: 'DF'
      }
    ],
    auditors: [
      {
        id: 'USR-AUD-505',
        name: 'Demo Auditor',
        role: 'Auditor',
        dept: 'Financial Compliance Bureau',
        cost_center: 'CC-401',
        email: 'demo.auditor@example.com',
        phone: '+20 000 000 0000',
        initials: 'DA'
      }
    ]
  };

  if (typeof window !== 'undefined') {
    window.DEMO_USERS = DEMO_USERS;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DEMO_USERS;
  }
})();
