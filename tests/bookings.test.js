import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, signup, futureWeekday, db } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const publicBooking = (slug, serviceId, date, time, extra = {}) => client(srv.base).post(`/public/company/${slug}/bookings`, {
  service_id: serviceId, date, time, address: 'Main Street 1', city: 'Amsterdam',
  name: 'Pat Customer', email: `pat-${Math.random().toString(36).slice(2)}@example.com`, phone: '+31 6 12345678', privacy_consent: true, ...extra,
});

async function setup() {
  const owner = await signup(srv.base, { plan: 'business' });
  const services = (await owner.c.get('/services')).data.services;
  const regular = services.find((s) => s.name === 'Reguliere huishoudelijke schoonmaak'); // 150 min
  return { ...owner, slug: owner.company.slug, regular };
}

test('customer booking flow: slots → request → pending booking + customer + notification', async () => {
  const { c, slug, regular } = await setup();
  const date = futureWeekday(3, 'tue');
  const pub = client(srv.base);
  const info = await pub.get(`/public/company/${slug}`);
  assert.equal(info.status, 200);
  assert.ok(info.data.services.some((s) => s.id === regular.id));
  const slots = (await pub.get(`/public/company/${slug}/slots?service_id=${regular.id}&date=${date}`)).data.slots;
  assert.equal(slots[0], '08:00');
  assert.equal(slots[slots.length - 1], '15:30', 'last slot must still finish by 18:00 closing');
  const res = await publicBooking(slug, regular.id, date, '10:00', { instructions: 'Ring twice' });
  assert.equal(res.status, 201);
  assert.match(res.data.booking.reference, /^CF-/);
  assert.equal(res.data.booking.status, 'pending');
  assert.equal(res.data.booking.ends_at, `${date} 12:30`);
  const list = await c.get('/bookings?status=pending');
  assert.equal(list.data.bookings.length, 1);
  assert.equal(list.data.bookings[0].instructions, 'Ring twice');
  assert.equal((await c.get('/customers')).data.customers.length, 1);
  const notes = await c.get('/notifications');
  assert.ok(notes.data.notifications.some((n) => n.type === 'booking_new'));
});

test('double bookings are prevented and availability updates (no employees → capacity 1)', async () => {
  const { slug, regular } = await setup();
  const date = futureWeekday(3, 'wed');
  assert.equal((await publicBooking(slug, regular.id, date, '09:00')).status, 201);
  const clash = await publicBooking(slug, regular.id, date, '10:00'); // overlaps 09:00–11:30
  assert.equal(clash.status, 409);
  const slots = (await client(srv.base).get(`/public/company/${slug}/slots?service_id=${regular.id}&date=${date}`)).data.slots;
  for (const t of ['06:30', '07:00', '08:00', '09:00', '10:00', '11:00']) assert.ok(!slots.includes(t), `${t} must not be offered`);
  assert.ok(slots.includes('11:30'), 'next free slot starts when the previous job ends');
});

test('concurrent requests for the last slot: exactly one succeeds', async () => {
  const { slug, regular } = await setup();
  const date = futureWeekday(3, 'thu');
  const results = await Promise.all([...Array(6)].map(() => publicBooking(slug, regular.id, date, '13:00')));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 5);
});

test('booking validation: outside opening hours, closed days, past dates, missing consent', async () => {
  const { slug, regular } = await setup();
  const date = futureWeekday(3, 'tue');
  assert.equal((await publicBooking(slug, regular.id, date, '17:00')).status, 409, 'would end after closing');
  assert.equal((await publicBooking(slug, regular.id, futureWeekday(3, 'sun'), '10:00')).status, 409, 'closed on Sunday');
  assert.equal((await publicBooking(slug, regular.id, '2020-01-07', '10:00')).status, 400);
  assert.equal((await publicBooking(slug, regular.id, date, '10:00', { privacy_consent: false })).status, 400);
  assert.equal((await publicBooking(slug, regular.id, date, '10:00', { email: 'not-an-email' })).status, 400);
});

test('capacity follows employee schedules; owner manages the full lifecycle', async () => {
  const { c, slug, regular } = await setup();
  const date = futureWeekday(4, 'tue');
  const mk = (name) => c.post('/employees', { name, job_title: 'Cleaner' });
  const e1 = (await mk('Ann')).data.employee;
  const e2 = (await mk('Ben')).data.employee;
  const b1 = await publicBooking(slug, regular.id, date, '09:00');
  const b2 = await publicBooking(slug, regular.id, date, '09:00');
  assert.equal(b1.status, 201); assert.equal(b2.status, 201);
  assert.equal((await publicBooking(slug, regular.id, date, '09:00')).status, 409, 'two employees → two parallel jobs');

  const [p1, p2] = (await c.get(`/bookings?status=pending&from=${date}&to=${date}`)).data.bookings;
  // Accept + assign
  assert.equal((await c.post(`/bookings/${p1.id}/status`, { status: 'confirmed' })).data.booking.status, 'confirmed');
  assert.equal((await c.patch(`/bookings/${p1.id}`, { employee_id: e1.id })).status, 200);
  const conflict = await c.patch(`/bookings/${p2.id}`, { employee_id: e1.id });
  assert.equal(conflict.status, 409, 'same employee cannot be double-booked');
  assert.match(conflict.data.error, /heeft op dat moment al een klus/);
  assert.equal((await c.patch(`/bookings/${p2.id}`, { employee_id: e2.id })).status, 200);

  // Employee on leave: their schedule no longer counts.
  const later = futureWeekday(5, 'wed');
  await c.patch(`/employees/${e2.id}`, { status: 'on_leave' });
  assert.equal((await publicBooking(slug, regular.id, later, '09:00')).status, 201);
  assert.equal((await publicBooking(slug, regular.id, later, '09:00')).status, 409);

  // Reschedule into a free slot works, into an occupied one fails
  assert.equal((await c.patch(`/bookings/${p1.id}`, { time: '14:00' })).data.booking.starts_at, `${date} 14:00`);

  // Reject pending, invalid transitions, completion and payment
  const rej = await c.post(`/bookings/${p2.id}/status`, { status: 'cancelled', reason: 'Fully booked' });
  assert.equal(rej.data.booking.status, 'cancelled');
  assert.equal((await c.post(`/bookings/${p2.id}/status`, { status: 'confirmed' })).status, 400, 'cancelled is final');
  assert.equal((await c.post(`/bookings/${p1.id}/status`, { status: 'in_progress' })).status, 200);
  assert.equal((await c.post(`/bookings/${p1.id}/status`, { status: 'completed' })).data.booking.status, 'completed');
  assert.equal((await c.post(`/bookings/${p1.id}/status`, { status: 'pending' })).status, 400);
  const pay = await c.post(`/bookings/${p1.id}/payments`, { amount: 85, method: 'card' });
  assert.equal(pay.status, 201);
  assert.equal(pay.data.booking.paid_cents, 8500);
});

test('cancelling a booking frees its slot again', async () => {
  const { c, slug, regular } = await setup();
  const date = futureWeekday(3, 'fri');
  await publicBooking(slug, regular.id, date, '09:00');
  assert.equal((await publicBooking(slug, regular.id, date, '09:00')).status, 409);
  const [b] = (await c.get('/bookings?status=pending')).data.bookings;
  await c.post(`/bookings/${b.id}/status`, { status: 'cancelled' });
  assert.equal((await publicBooking(slug, regular.id, date, '09:00')).status, 201);
});

test('manual booking by owner with a new customer, and customer management', async () => {
  const { c, regular } = await setup();
  const date = futureWeekday(3, 'mon');
  const res = await c.post('/bookings', { new_customer: { name: 'Walk In', email: 'walkin@example.com', phone: '+31 6 99999999' },
    service_id: regular.id, date, time: '08:00', address: 'Canal 5', status: 'confirmed' });
  assert.equal(res.status, 201);
  const cust = (await c.get('/customers?q=walk')).data.customers;
  assert.equal(cust.length, 1);
  const upd = await c.patch(`/customers/${cust[0].id}`, { notes: 'Has a cat', phone: '+31 6 11111111' });
  assert.equal(upd.data.customer.notes, 'Has a cat');
  const detail = await c.get(`/customers/${cust[0].id}`);
  assert.equal(detail.data.bookings.length, 1);
  assert.equal((await c.del(`/customers/${cust[0].id}`)).status, 400, 'customer with history is protected');
  const lone = await c.post('/customers', { name: 'No Bookings', email: 'nb@example.com' });
  assert.equal((await c.post('/customers', { name: 'Dup', email: 'nb@example.com' })).status, 400, 'duplicate email in same company');
  assert.equal((await c.get('/customers?segment=no_bookings')).data.customers.length, 1);
  assert.equal((await c.del(`/customers/${lone.data.customer.id}`)).status, 200);
  assert.equal((await c.post('/customers', { name: '' })).status, 400);
});

test('services: CRUD, deactivation hides from booking page, prices validated', async () => {
  const { c, slug } = await setup();
  const created = await c.post('/services', { name: 'Tapijtreiniging', price: 99.5, duration_min: 90, price_unit: 'fixed' });
  assert.equal(created.data.service.price_cents, 9950);
  assert.equal((await c.post('/services', { name: 'Bad', price: -1, duration_min: 60 })).status, 400);
  await c.patch(`/services/${created.data.service.id}`, { active: false });
  const pub = (await client(srv.base).get(`/public/company/${slug}`)).data.services;
  assert.ok(!pub.some((s) => s.name === 'Tapijtreiniging'));
  assert.equal((await client(srv.base).get(`/public/company/${slug}/slots?service_id=${created.data.service.id}&date=${futureWeekday(3)}`)).status, 404);
  assert.equal((await c.del(`/services/${created.data.service.id}`)).status, 200);
  assert.ok(db.one('SELECT COUNT(*) n FROM services').n > 0);
});
