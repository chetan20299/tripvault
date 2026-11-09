import type { City, Entry, ImageMeta, Share, Visit, AnyRecord, SyncedTable } from '../types';
import type { DB } from './db';
import { DEMO_USERS, type DemoRemote } from '../sync/demoRemote';
import { DEFAULT_CATEGORIES } from './categories';

const DAY = 86_400_000;
const NOW = Date.now();
const ME = DEMO_USERS[0].uid;
const PRIYA = DEMO_USERS[1].uid;

const meta = (ownerId: string, id: string, ageDays: number) => ({
  id, ownerId, createdAt: NOW - ageDays * DAY, updatedAt: NOW - ageDays * DAY + 3600_000,
  deletedAt: null, version: 1, syncStatus: 'synced' as const, lastSyncedAt: NOW - DAY,
});

const city = (id: string, name: string, state: string, country: string, description: string, notes: string, lastVisitDays: number, owner = ME): City => ({
  ...meta(owner, id, lastVisitDays + 30), name, state, country, description, notes, coverImageId: null, lastVisitedAt: NOW - lastVisitDays * DAY,
});

let n = 0;
type E = Partial<Entry> & { title: string };
const entry = (cityId: string, categoryId: string, e: E, owner = ME): Entry => ({
  ...meta(owner, `demo-e${++n}`, 40 - n * 0.5),
  cityId, categoryId, description: '', address: '', contactName: '', phone: '', email: '', website: '', visitDate: '',
  rating: 0, priority: '', tags: [], customFields: [], imageIds: [], ...e,
});

const visit = (cityId: string, startDaysAgo: number, len: number, purpose: string, notes = '', owner = ME): Visit => ({
  ...meta(owner, `demo-v${++n}`, startDaysAgo), cityId, purpose, notes,
  startDate: new Date(NOW - startDaysAgo * DAY).toISOString().slice(0, 10),
  endDate: new Date(NOW - (startDaysAgo - len) * DAY).toISOString().slice(0, 10),
});

const d = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

export function buildDemoData() {
  n = 0;
  const cities: City[] = [
    city('demo-mumbai', 'Mumbai', 'Maharashtra', 'India', 'Financial capital — most of our BFSI and media clients are in BKC and Lower Parel.', 'Avoid scheduling meetings across the city on the same day; BKC ↔ Andheri can take 90 minutes at peak. Monsoon (Jun–Sep) causes frequent delays.', 6),
    city('demo-bengaluru', 'Bengaluru', 'Karnataka', 'India', 'Tech hub. Strong pipeline for SaaS partnerships around Whitefield, Koramangala and Outer Ring Road.', 'Book hotels near the meeting cluster — ORR traffic is unpredictable. Evenings are pleasant year-round.', 21),
    city('demo-dubai', 'Dubai', 'Dubai', 'United Arab Emirates', 'Gateway to GCC distribution partners. Most meetings in DIFC, Business Bay and JLT.', 'Work week is Monday–Friday. Friday afternoon meetings are rare. Carry a light blazer — offices are cold.', 48),
    city('demo-singapore', 'Singapore', 'Central Region', 'Singapore', 'APAC regional HQ conversations; trade fair at Marina Bay Sands each November.', 'MRT is the fastest way around. Grab works well. Tipping is not expected.', 95),
    city('demo-london', 'London', 'England', 'United Kingdom', 'Fintech partnerships in the City and Canary Wharf.', 'Use contactless on the Tube. Most meetings start on time — arrive 10 minutes early.', 160),
    city('demo-ahmedabad', 'Ahmedabad', 'Gujarat', 'India', 'Manufacturing and textile clients; GIFT City is emerging for fintech.', 'Gujarat is a dry state — plan client dinners accordingly. Excellent vegetarian food everywhere.', 12),
  ];
  const sharedCity = city('demo-pune', 'Pune', 'Maharashtra', 'India', 'Priya\'s notes from the Hinjewadi IT park visits — shared with the team.', 'Hinjewadi traffic peaks 9–11am. Prefer meetings after lunch.', 30, PRIYA);

  const entries: Entry[] = [
    // Mumbai
    entry('demo-mumbai', 'leads', { title: 'Kotak Digital — Procurement', contactName: 'Neha Kapoor', phone: '+91 98200 11223', email: 'neha.kapoor@example.com', website: 'kotak.example.com', address: 'C-27, G Block, BKC, Bandra East, Mumbai 400051', priority: 'high', description: 'Evaluating document-automation vendors for Q1. Wants a pilot proposal with pricing for 200 seats.', tags: ['bfsi', 'pilot', 'q1'], visitDate: d(6), customFields: [{ label: 'Deal size', value: '₹45 L' }, { label: 'Next step', value: 'Send proposal by Friday' }] }),
    entry('demo-mumbai', 'leads', { title: 'Zee Media — IT Head', contactName: 'Arvind Iyer', phone: '+91 98670 44556', email: 'arvind.iyer@example.com', address: 'Marathon Futurex, Lower Parel', priority: 'medium', description: 'Interested in media asset search. Budget cycle starts April.', tags: ['media'], visitDate: d(7) }),
    entry('demo-mumbai', 'food', { title: 'Trishna', address: '7 Sai Baba Marg, Kala Ghoda, Fort', phone: '+91 22 2270 3213', rating: 5, description: 'Butter garlic crab is a must. Great for client dinners — reserve 2 days ahead.', tags: ['seafood', 'client-dinner'] }),
    entry('demo-mumbai', 'food', { title: 'Swati Snacks', address: 'Tardeo Road, Opp. Bhatia Hospital', rating: 4, description: 'Quick Gujarati snacks; panki and sev puri. Expect a 20-minute wait at lunch.', tags: ['vegetarian', 'quick'] }),
    entry('demo-mumbai', 'shops', { title: 'Colaba Causeway Market', address: 'Colaba Causeway, Colaba', rating: 4, description: 'Good for gifts — bargain hard. Fabindia store nearby for quality souvenirs.', tags: ['gifts'] }),
    entry('demo-mumbai', 'places', { title: 'Gateway of India & Marine Drive', address: 'Apollo Bandar, Colaba', rating: 5, description: 'Evening walk along Marine Drive after meetings in South Mumbai.', visitDate: d(6) }),
    entry('demo-mumbai', 'contacts', { title: 'Reliable driver — Santosh', contactName: 'Santosh Patil', phone: '+91 98190 77889', description: 'Full-day car with driver, ₹3,200/day. Knows BKC well.' }),
    entry('demo-mumbai', 'hotels', { title: 'Trident BKC', address: 'C-56, G Block, BKC', phone: '+91 22 6672 7777', rating: 4, website: 'tridenthotels.com', description: 'Walking distance to most BKC clients. Corporate rate available.' }),
    // Bengaluru
    entry('demo-bengaluru', 'leads', { title: 'Flipkart — Seller Tools', contactName: 'Karthik Rao', phone: '+91 99001 22334', email: 'karthik.rao@example.com', address: 'Embassy Tech Village, ORR', priority: 'high', description: 'Wants an integration demo with their seller dashboard. Decision committee meets monthly.', tags: ['ecommerce', 'demo'], visitDate: d(21), customFields: [{ label: 'Stage', value: 'Technical evaluation' }] }),
    entry('demo-bengaluru', 'opportunities', { title: 'Partnership with local SI', description: 'TechNova Solutions (120 people) resells to mid-market. Could carry our product in South India.', priority: 'medium', contactName: 'Divya M', email: 'divya@example.com' }),
    entry('demo-bengaluru', 'food', { title: 'Vidyarthi Bhavan', address: '32, Gandhi Bazaar Main Rd, Basavanagudi', rating: 5, description: 'Legendary masala dosa. Go before 9 am to avoid queues.', tags: ['breakfast', 'iconic'] }),
    entry('demo-bengaluru', 'food', { title: 'Toit Brewpub', address: '298, 100 Feet Rd, Indiranagar', rating: 4, description: 'Relaxed spot for after-work drinks with the partner team.' }),
    entry('demo-bengaluru', 'places', { title: 'Cubbon Park', address: 'Kasturba Road', rating: 4, description: 'Morning run route; 3 km loop.' }),
    entry('demo-bengaluru', 'research', { title: 'SaaS buyer behaviour', description: 'Mid-market buyers expect INR pricing and local GST invoicing. Annual prepay discounts of 15–20% are standard.', tags: ['pricing'] }),
    // Dubai
    entry('demo-dubai', 'leads', { title: 'Al Futtaim Group — Digital', contactName: 'Omar Haddad', phone: '+971 50 123 4567', email: 'omar.haddad@example.com', address: 'Dubai Festival City', priority: 'high', description: 'Regional rollout across 6 brands. Requires Arabic UI and data residency in UAE.', tags: ['retail', 'gcc'], customFields: [{ label: 'Requirement', value: 'UAE data residency' }] }),
    entry('demo-dubai', 'food', { title: 'Ravi Restaurant', address: 'Al Satwa Road, Satwa', rating: 4, description: 'Famous Pakistani food, very affordable. Open late.' }),
    entry('demo-dubai', 'shops', { title: 'Gold Souk', address: 'Deira', rating: 4, description: 'Prices are by weight + making charge; compare 3 shops before buying.' }),
    entry('demo-dubai', 'transport', { title: 'Dubai Metro — Red Line', description: 'Connects airport T1/T3 to DIFC and Business Bay. Get a Nol card at the airport.' }),
    // Singapore
    entry('demo-singapore', 'leads', { title: 'DBS — Innovation Lab', contactName: 'Mei Lin Tan', email: 'meilin.tan@example.com', phone: '+65 9123 4567', address: 'Marina Bay Financial Centre Tower 3', priority: 'medium', description: 'Open to a co-innovation sprint in Q2.', tags: ['bank'] }),
    entry('demo-singapore', 'food', { title: 'Maxwell Food Centre', address: '1 Kadayanallur St', rating: 5, description: 'Tian Tian chicken rice. Hawker centre — cash and PayNow.' }),
    entry('demo-singapore', 'places', { title: 'Gardens by the Bay', address: '18 Marina Gardens Dr', rating: 5, description: 'Supertree light show at 7:45 pm and 8:45 pm.' }),
    // London
    entry('demo-london', 'leads', { title: 'Monzo — Partnerships', contactName: 'James Whitfield', email: 'james.w@example.com', address: 'Broadwalk House, 5 Appold St', priority: 'low', description: 'Exploratory. Follow up after their product roadmap is published.' }),
    entry('demo-london', 'food', { title: 'Dishoom Shoreditch', address: '7 Boundary St', rating: 5, description: 'Bombay café style. Black daal is excellent. Queue moves fast.' }),
    entry('demo-london', 'notes', { title: 'Visa & travel checklist', description: 'Standard Visitor visa — apply 6 weeks ahead. Carry invitation letter from host company.' }),
    // Ahmedabad
    entry('demo-ahmedabad', 'leads', { title: 'Arvind Mills — Digital Transformation', contactName: 'Hemant Shah', phone: '+91 98250 33445', email: 'hemant.shah@example.com', address: 'Naroda Road', priority: 'high', description: 'ERP integration for 3 plants. Site visit scheduled next month.', tags: ['manufacturing'], visitDate: d(12) }),
    entry('demo-ahmedabad', 'food', { title: 'Agashiye — The House of MG', address: 'Lal Darwaja', rating: 5, description: 'Rooftop Gujarati thali. Ideal for hosting clients.' }),
    entry('demo-ahmedabad', 'places', { title: 'Sabarmati Ashram', address: 'Ashram Rd', rating: 5, description: 'Allow 1.5 hours. Quiet and well maintained.' }),
    entry('demo-ahmedabad', 'opportunities', { title: 'GIFT City fintech cluster', description: 'Tax incentives for IFSC units. Three potential clients setting up offices this year.', priority: 'medium' }),
    // Pune (shared by Priya)
    entry('demo-pune', 'leads', { title: 'Persistent Systems — Alliances', contactName: 'Sameer Joshi', phone: '+91 98220 55667', address: 'Bhageerath, Senapati Bapat Rd', priority: 'medium', description: 'Joint go-to-market for healthcare vertical.' }, PRIYA),
    entry('demo-pune', 'food', { title: 'Vaishali', address: 'FC Road', rating: 5, description: 'Classic breakfast spot — SPDP and filter coffee.' }, PRIYA),
  ];

  const visits: Visit[] = [
    visit('demo-mumbai', 9, 3, 'Client meetings — BFSI', 'Met Kotak and Zee. Kotak pilot looks promising.'),
    visit('demo-mumbai', 70, 2, 'Industry conference'),
    visit('demo-bengaluru', 24, 3, 'Partner summit', 'Signed NDA with TechNova.'),
    visit('demo-dubai', 52, 4, 'GCC distributor meetings'),
    visit('demo-singapore', 100, 5, 'Trade fair'),
    visit('demo-london', 165, 5, 'Fintech week'),
    visit('demo-ahmedabad', 14, 2, 'Plant visit — Arvind Mills'),
    visit('demo-pune', 33, 2, 'Hinjewadi client visits', '', PRIYA),
  ];

  const share: Share = { id: `${PRIYA}_demo-pune_${ME}`, ownerId: PRIYA, cityId: 'demo-pune', granteeUid: ME, granteeEmail: DEMO_USERS[0].email, ownerName: DEMO_USERS[1].name, role: 'editor', createdAt: NOW - 20 * DAY };
  return { cities, sharedCity, entries, visits, share };
}

/** Placeholder photo: abstract gradient, generated on device (no network needed). */
async function placeholder(seed: string, color: string): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 960; c.height = 640;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 960, 640);
  grad.addColorStop(0, color); grad.addColorStop(1, '#06293A');
  g.fillStyle = grad; g.fillRect(0, 0, 960, 640);
  g.globalAlpha = 0.12; g.fillStyle = '#fff';
  const k = [...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0); // vary the pattern per item
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(((i * 137 + k) % 1000), 120 + ((i * 89 + k * 3) % 480), 60 + ((i + k) % 5) * 28, 0, Math.PI * 2); g.fill(); }
  return new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.8));
}

/** Seeds local + simulated server with identical, already-synced data. */
export async function seedDemo(db: DB, remote: DemoRemote) {
  const { cities, sharedCity, entries, visits, share } = buildDemoData();
  const images: ImageMeta[] = [];
  const blobs: Record<string, Blob> = {};
  const colorOf = (cat: string) => DEFAULT_CATEGORIES.find((c) => c.id === cat)?.color ?? '#0B4F6C';
  for (const e of entries.filter((e) => ['food', 'places', 'hotels', 'shops'].includes(e.categoryId)).slice(0, 12)) {
    const blob = await placeholder(e.title, colorOf(e.categoryId));
    if (!blob) break;
    const id = `${e.id}-img`;
    blobs[id] = blob;
    images.push({ ...meta(e.ownerId, id, 30), cityId: e.cityId, parentId: e.id, mime: 'image/jpeg', width: 960, height: 640, size: blob.size, remoteRef: `demo:${id}` });
    e.imageIds = [id];
  }
  for (const c of [...cities, sharedCity]) {
    const blob = await placeholder(c.name, '#167A9C');
    if (!blob) break;
    const id = `${c.id}-cover`;
    blobs[id] = blob;
    images.push({ ...meta(c.ownerId, id, 30), cityId: c.id, parentId: c.id, mime: 'image/jpeg', width: 960, height: 640, size: blob.size, remoteRef: `demo:${id}` });
    c.coverImageId = id;
  }

  const mine = <T extends AnyRecord>(rs: T[]) => rs.filter((r) => r.ownerId === ME);
  const seeds: [SyncedTable, AnyRecord[]][] = [['cities', [...cities, sharedCity]], ['entries', entries], ['visits', visits], ['images', images]];
  for (const [t, rs] of seeds) await remote.seed(t, rs, blobs);
  await remote.seedShare(share);

  // Local copy: own data only — the shared city arrives through the first sync, like in production.
  await db.tx(seeds.map(([table, rs]) => ({ table, put: mine(rs) })));
  for (const img of mine(images)) await db.store.putBlob(img.id, blobs[img.id]);
}
