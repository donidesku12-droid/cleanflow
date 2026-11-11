/**
 * Loads (or reloads) the clearly-labelled DEMO workspace. Only the demo company
 * is removed and recreated; real companies in the database are left untouched.
 *
 *   Owner:    demo@cleanflow.app     / Demo1234
 *   Manager:  manager@cleanflow.app  / Demo1234
 *   Employee: employee@cleanflow.app / Demo1234
 */
import { one, run, all, tx } from './db.js';
import { hashPassword } from './lib/auth.js';
import { provisionCompany } from './routes/auth.js';
import { DEFAULT_WORK_SCHEDULE, addDays, addMinutes, todayIn, weekdayOf, bookingReference, nowIn, fmtShort } from './lib/core.js';

const DEMO_SLUG = 'sparkle-shine-demo';
const PASSWORD = 'Demo1234';

// Deterministic PRNG so the demo looks the same on every seed.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const FIRST = ['Emma', 'Liam', 'Sophie', 'Noah', 'Julia', 'Lucas', 'Mila', 'Daan', 'Sara', 'Finn', 'Anna', 'Levi', 'Eva', 'Sem', 'Lotte', 'Max', 'Isa', 'Jesse', 'Nina', 'Thomas', 'Fleur', 'Ruben', 'Lisa', 'Bram', 'Zoë', 'Tim', 'Femke', 'Lars', 'Roos', 'Jan'];
const LAST = ['de Vries', 'Jansen', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'de Boer', 'Bos', 'Vos', 'Peters', 'Hendriks', 'Dekker', 'Brouwer', 'Kok', 'Jacobs', 'van Dijk', 'Schouten', 'Willems', 'Maas'];
const STREETS = ['Keizersgracht', 'Prinsengracht', 'Herengracht', 'Vondelstraat', 'Overtoom', 'Ceintuurbaan', 'Javastraat', 'Haarlemmerweg', 'Kinkerstraat', 'Amstelveenseweg', 'Van Baerlestraat', 'Ferdinand Bolstraat'];
const CITIES = ['Amsterdam', 'Amsterdam', 'Amsterdam', 'Amstelveen', 'Diemen', 'Haarlem'];
const NOTES = [null, null, null, 'Heeft een lieve hond – graag het tuinhek dichtdoen.', 'Sleutel ligt bij de buren op nr. 12.', 'Liever milieuvriendelijke middelen.', 'Allergisch voor sterke geuren.', 'Parkeren kan voor de deur.', 'Graag schoenen uit in huis.'];

async function seed() {
  const existing = one('SELECT id FROM companies WHERE slug = ?', DEMO_SLUG);
  const hash = await hashPassword(PASSWORD);

  tx(() => {
    if (existing) run('DELETE FROM companies WHERE id = ?', existing.id);
    run(`DELETE FROM users WHERE email IN ('demo@cleanflow.app','manager@cleanflow.app','employee@cleanflow.app')`);

    const cid = provisionCompany({ companyName: 'Sparkle & Shine Schoonmaak (Demo)', plan: 'business', isDemo: true });
    run(`UPDATE companies SET slug = ?, email = 'hello@sparkle-shine.example', phone = '+31 20 555 0142', website = 'https://sparkle-shine.example',
         address = 'Overtoom 120', city = 'Amsterdam', postal_code = '1054 HN', country = 'Netherlands', min_notice_hours = 12 WHERE id = ?`, DEMO_SLUG, cid);
    run(`UPDATE subscriptions SET trial_ends_at = ? WHERE company_id = ?`, new Date(Date.now() + 365 * 864e5).toISOString(), cid);
    const tz = 'Europe/Amsterdam';
    const today = todayIn(tz);
    const now = nowIn(tz);

    // --- Employees
    const team = [
      ['Maria Santos', 'Teamleider', '#10b981'], ['Jonas de Wit', 'Senior schoonmaker', '#0ea5e9'], ['Aisha Bakr', 'Schoonmaker', '#8b5cf6'],
      ['Pieter Kramer', 'Glazenwasser', '#f59e0b'], ['Lena Vogel', 'Schoonmaker', '#ec4899'],
    ];
    const employees = team.map(([name, title, color], i) => {
      const sched = structuredClone(DEFAULT_WORK_SCHEDULE);
      if (i === 4) { sched.mon.off = true; sched.sat.off = false; }
      if (i === 3) { sched.fri.off = true; }
      const id = Number(run(`INSERT INTO employees (company_id, name, email, phone, job_title, color, work_schedule, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        cid, name, `${name.split(' ')[0].toLowerCase()}@sparkle-shine.example`, `+31 6 ${String(10000000 + i * 1234567).slice(0, 8)}`, title, color,
        JSON.stringify(sched), `${addDays(today, -240)} 09:00:00`).lastInsertRowid);
      return { id, name, sched };
    });

    // --- Users
    run(`INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, 'demo@cleanflow.app', ?, 'Sofia van Leeuwen', 'owner')`, cid, hash);
    run(`INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, 'manager@cleanflow.app', ?, 'Daniel Okafor', 'manager')`, cid, hash);
    run(`INSERT INTO users (company_id, employee_id, email, password_hash, name, role) VALUES (?, ?, 'employee@cleanflow.app', ?, ?, 'employee')`, cid, employees[0].id, hash, employees[0].name);

    // --- Services (provisioned) – tweak the demo descriptions slightly
    const services = all('SELECT * FROM services WHERE company_id = ? ORDER BY sort_order', cid);
    const weights = [0.42, 0.16, 0.14, 0.14, 0.07, 0.07];
    const pickService = () => { let r = rand(); for (let i = 0; i < services.length; i++) { r -= weights[i]; if (r <= 0) return services[i]; } return services[0]; };

    // --- Customers
    const customers = [];
    for (let i = 0; i < 64; i++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const city = pick(CITIES);
      const created = addDays(today, -Math.floor(rand() * 230) - 1);
      const id = Number(run(`INSERT INTO customers (company_id, name, email, phone, address, city, postal_code, notes, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cid, name, `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com`, `+31 6 ${String(20000000 + Math.floor(rand() * 7e7)).slice(0, 8)}`,
        `${pick(STREETS)} ${1 + Math.floor(rand() * 300)}`, city, `10${10 + Math.floor(rand() * 89)} ${'AB'[i % 2]}${'KLMN'[i % 4]}`, pick(NOTES),
        chance(0.5) ? 'online' : 'manual', `${created} 10:00:00`).lastInsertRowid);
      customers.push({ id, created });
    }

    // --- Bookings: 210 days back, 21 days forward. Per employee per day, sequential non-overlapping jobs.
    const instructions = [null, null, 'Graag extra aandacht voor de keuken.', 'Neem extra microvezeldoekjes mee.', 'Twee keer aanbellen.', 'Deze keer alleen de ramen binnen.'];
    const insertBooking = (b) => Number(run(`INSERT INTO bookings (company_id, reference, customer_id, service_id, employee_id, starts_at, ends_at, address, instructions, status, price_cents, source, cancel_reason, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, cid, bookingReference(), b.customer, b.service.id, b.employee, b.start, b.end, b.address, b.instructions, b.status,
    b.price, b.source, b.cancel ?? null, b.completed ?? null, b.created).lastInsertRowid);

    for (let d = -210; d <= 21; d++) {
      const date = addDays(today, d);
      const day = weekdayOf(date);
      if (day === 'sun') continue;
      const growth = 0.45 + 0.55 * ((d + 210) / 231); // business grows over time
      for (const emp of employees) {
        const sh = emp.sched[day];
        if (sh.off || !chance(0.78 * growth)) continue;
        let t = sh.start;
        const jobs = 1 + Math.floor(rand() * 3);
        for (let j = 0; j < jobs; j++) {
          const service = pickService();
          const start = `${date} ${t}`;
          const end = addMinutes(start, service.duration_min);
          if (end.slice(11) > sh.end || end.slice(0, 10) !== date) break;
          const eligible = customers.filter((c) => c.created <= date);
          if (!eligible.length) break;
          const cust = pick(eligible);
          const addr = one('SELECT address, city FROM customers WHERE id = ?', cust.id);
          const price = service.price_unit === 'per_hour' ? Math.round(service.price_cents * service.duration_min / 60) : service.price_cents;
          let status; let source = pick(['online', 'manual', 'online']);
          if (end <= now) status = chance(0.07) ? 'cancelled' : 'completed';
          else if (start <= now) status = 'in_progress';
          else status = chance(0.05) ? 'cancelled' : 'confirmed';
          const id = insertBooking({
            customer: cust.id, service, employee: emp.id, start, end, address: `${addr.address}, ${addr.city}`, instructions: pick(instructions),
            status, price, source, cancel: status === 'cancelled' ? pick(['Op verzoek van klant', 'Klant is ziek', 'Telefonisch verzet']) : null,
            completed: status === 'completed' ? `${date} ${end.slice(11)}:00` : null, created: `${addDays(date, -Math.floor(rand() * 10) - 1)} 12:00:00`,
          });
          if (status === 'completed' && chance(0.96)) {
            run(`INSERT INTO payments (company_id, booking_id, customer_id, amount_cents, method, paid_at) VALUES (?, ?, ?, ?, ?, ?)`,
              cid, id, cust.id, price, pick(['card', 'card', 'bank_transfer', 'cash']), `${date} ${end.slice(11)}`);
          }
          t = addMinutes(end, 30).slice(11);
        }
      }
    }

    // A handful of pending online requests, unassigned, in the coming days (only where capacity exists).
    let added = 0;
    for (let d = 2; d <= 12 && added < 6; d++) {
      const date = addDays(today, d);
      if (['sun', 'sat'].includes(weekdayOf(date))) continue;
      const service = pick(services.slice(0, 4));
      const start = `${date} 15:00`;
      const end = addMinutes(start, service.duration_min);
      if (end.slice(11) > '18:00') continue;
      const busy = one(`SELECT COUNT(DISTINCT employee_id) n FROM bookings WHERE company_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ?`, cid, end, start).n;
      const working = employees.filter((e) => !e.sched[weekdayOf(date)].off && e.sched[weekdayOf(date)].end >= end.slice(11)).length;
      if (working - busy < 1) continue;
      const cust = pick(customers);
      const addr = one('SELECT address, city FROM customers WHERE id = ?', cust.id);
      const id = insertBooking({ customer: cust.id, service, employee: null, start, end, address: `${addr.address}, ${addr.city}`,
        instructions: pick(instructions), status: 'pending', price: service.price_cents, source: 'online', created: `${today} 08:${String(10 + added).padStart(2, '0')}:00` });
      const ref = one('SELECT reference FROM bookings WHERE id = ?', id).reference;
      run(`INSERT INTO notifications (company_id, type, title, body, link, created_at) VALUES (?, 'booking_new', ?, ?, ?, datetime('now', ?))`,
        cid, `Nieuwe aanvraag: ${service.name}`, `${ref} · ${fmtShort(start)}`, `/app/bookings?open=${id}`, `-${added * 47 + 5} minutes`);
      run(`INSERT INTO activity_log (company_id, action, entity, entity_id, summary, created_at) VALUES (?, 'requested', 'booking', ?, ?, datetime('now', ?))`,
        cid, id, `Een klant heeft online ${service.name} aangevraagd voor ${fmtShort(start)}`, `-${added * 47 + 5} minutes`);
      added++;
    }

    // --- Activity & notifications from recent completions
    const recent = all(`SELECT b.id, b.reference, b.status, b.starts_at, c.name cn, s.name sn, e.name en FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN services s ON s.id=b.service_id
      LEFT JOIN employees e ON e.id=b.employee_id WHERE b.company_id = ? AND b.status IN ('completed','cancelled') ORDER BY b.starts_at DESC LIMIT 8`, cid);
    recent.forEach((b, i) => {
      const offset = `-${(i + 1) * 3} hours`;
      if (b.status === 'completed') {
        run(`INSERT INTO activity_log (company_id, action, entity, entity_id, summary, created_at) VALUES (?, 'completed', 'booking', ?, ?, datetime('now', ?))`,
          cid, b.id, `${b.en} heeft ${b.sn} voor ${b.cn} afgerond`, offset);
        if (i < 3) run(`INSERT INTO notifications (company_id, type, title, body, link, created_at) VALUES (?, 'job_completed', ?, ?, ?, datetime('now', ?))`,
          cid, `Klus afgerond: ${b.reference}`, `${b.en} heeft ${b.sn} voor ${b.cn} afgerond`, `/app/bookings?open=${b.id}`, offset);
      } else {
        run(`INSERT INTO activity_log (company_id, action, entity, entity_id, summary, created_at) VALUES (?, 'cancelled', 'booking', ?, ?, datetime('now', ?))`,
          cid, b.id, `Boeking ${b.reference} van ${b.cn} is geannuleerd`, offset);
      }
    });

    // --- AI assistant knowledge
    run(`UPDATE ai_settings SET assistant_name = 'Flo', languages = '["nl","en","de"]',
      welcome_message = 'Hoi! Ik ben Flo, de virtuele assistent van Sparkle & Shine Schoonmaak. Vraag me naar onze diensten, prijzen en openingstijden, of vraag een afspraak aan.',
      company_info = 'Sparkle & Shine Schoonmaak is een familiebedrijf, opgericht in 2016 in Amsterdam. Al onze schoonmakers zijn bij ons in dienst (geen onderaannemers), gescreend en verzekerd. We nemen ons eigen professionele materiaal en milieukeur-schoonmaakmiddelen mee.',
      policies = 'Annuleren: gratis tot 24 uur voor de afspraak; bij later annuleren rekenen we 50% van de prijs.\nBetalen: met pin of per overboeking na de klus; contant mag ook.\nTevredenheid: is er iets vergeten? Laat het binnen 24 uur weten, dan komen we het gratis herstellen.',
      service_area = 'Amsterdam, Amstelveen, Diemen en Haarlem.',
      escalation_message = 'Een collega reageert binnen één werkdag. Je kunt ons ook bellen op +31 20 555 0142.'
      WHERE company_id = ?`, cid);
    const faqs = [
      ['Moet ik thuis zijn tijdens de schoonmaak?', 'Nee. Veel klanten geven ons een sleutel of toegangscode. Sleutels bewaren we veilig, met een code erop en nooit je adres.'],
      ['Nemen jullie zelf schoonmaakmiddelen mee?', 'Ja. We nemen al het materiaal en milieukeur-schoonmaakmiddelen mee. Wil je dat we jouw middelen gebruiken? Zet het dan bij de bijzonderheden van je boeking.'],
      ['Zijn jullie schoonmakers verzekerd?', 'Ja. Al onze schoonmakers zijn in dienst bij Sparkle & Shine, gescreend en gedekt door onze aansprakelijkheidsverzekering.'],
      ['Hoe kan ik annuleren of verzetten?', 'Annuleren of verzetten is gratis tot 24 uur voor je afspraak. Reageer op je bevestigingsmail of bel ons op +31 20 555 0142.'],
      ['In welke plaatsen werken jullie?', 'We maken schoon in Amsterdam, Amstelveen, Diemen en Haarlem.'],
    ];
    for (const [q, a] of faqs) run('INSERT INTO faqs (company_id, question, answer) VALUES (?, ?, ?)', cid, q, a);

    // --- Example escalated conversation in the inbox
    const conv = Number(run(`INSERT INTO chat_conversations (company_id, public_token, visitor_name, visitor_email, contact_consent, status, escalation_reason, created_at, updated_at)
      VALUES (?, ?, 'Robin', 'robin@example.com', 1, 'escalated', 'Offerte op maat gevraagd', datetime('now','-2 hours'), datetime('now','-2 hours'))`, cid, `demo-${Date.now()}`).lastInsertRowid);
    for (const [role, content] of [
      ['visitor', 'Hoi, kunnen jullie een kantoor van 300 m² elke doordeweekse avond schoonmaken? Wat kost dat?'],
      ['assistant', 'Kantoorschoonmaak kost € 45,00 per uur. Voor een vaste prijs voor 300 m² op doordeweekse avonden is ons team nodig, dus ik heb je vraag doorgestuurd. Een collega reageert binnen één werkdag.'],
      ['assistant', 'Bedankt Robin! Ik heb je contactgegevens doorgegeven aan het team, zodat ze contact met je kunnen opnemen.'],
    ]) run(`INSERT INTO chat_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, datetime('now','-2 hours'))`, conv, role, content);
    run(`INSERT INTO notifications (company_id, type, title, body, link, created_at) VALUES (?, 'chat_escalated', 'Chat wacht op antwoord van een mens', 'Offerte op maat gevraagd – “Hoi, kunnen jullie een kantoor van 300 m²…”', ?, datetime('now','-2 hours'))`,
      cid, `/app/assistant?tab=inbox&open=${conv}`);
  });
  const c = one('SELECT id FROM companies WHERE slug = ?', DEMO_SLUG);
  const counts = one(`SELECT (SELECT COUNT(*) FROM bookings WHERE company_id = ?) b, (SELECT COUNT(*) FROM customers WHERE company_id = ?) c`, c.id, c.id);
  console.log(`Demo-omgeving klaar: ${counts.c} klanten, ${counts.b} boekingen.`);
  console.log(`Log in met demo@cleanflow.app / ${PASSWORD} (eigenaar), manager@cleanflow.app of employee@cleanflow.app.`);
  console.log(`Openbare boekingspagina: /book/${DEMO_SLUG}`);
}

seed().catch((err) => { console.error(err); process.exit(1); });
